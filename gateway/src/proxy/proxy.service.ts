import { Injectable, ForbiddenException, BadGatewayException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { ChatCompletionRequest, ProxyRequestMeta, UpstreamAttempt } from './proxy.dto';
import { scanForPii, scanForInjection, estimateTokens, estimateCost } from '@llm-sentinel/guardrails';
import { PolicyEnforcer } from '../guardrails/policy-enforcer';
import { TraceService } from './trace.service';
import { SqsEmitter } from './sqs-emitter';
import { CircuitBreakerService } from './circuit-breaker.service';

const PROVIDER_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
};

// Ordered fallback chain per requested provider: if the primary is down (or
// its circuit is open), try the next entry. Chains stay within providers we
// hold API keys for; there's no useful fallback target for a provider that
// isn't itself configured.
const FALLBACK_CHAINS: Record<string, string[]> = {
  openai: ['openai', 'gemini'],
  gemini: ['gemini', 'openai'],
};

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly traceService: TraceService,
    private readonly sqsEmitter: SqsEmitter,
    private readonly policyEnforcer: PolicyEnforcer,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {}

  async handleChatCompletion(body: ChatCompletionRequest, meta: ProxyRequestMeta) {
    const startTime = Date.now();
    const promptText = body.messages.map((m) => m.content).join('\n');

    // --- PRE-LLM GUARDRAIL PIPELINE ---
    const pii = scanForPii(promptText);
    const injection = scanForInjection(promptText);
    const policy = await this.policyEnforcer.enforce({
      tenantId: meta.tenantId,
      provider: meta.provider,
      model: body.model,
      userId: meta.userId,
      pii,
      injection,
    });

    const promptHash = crypto.createHash('sha256').update(promptText).digest('hex');
    const inputTokens = estimateTokens(promptText);

    if (!policy.allowed) {
      // Save blocked trace and throw
      await this.traceService.save({
        tenantId: meta.tenantId,
        userId: meta.userId,
        sessionId: meta.sessionId,
        model: body.model,
        provider: meta.provider,
        promptHash,
        inputTokens,
        piiDetectedInput: pii.detected,
        piiTypes: pii.types,
        injectionDetected: injection.detected,
        policyViolations: policy.violations,
        blocked: true,
        blockReason: policy.violations.join('; '),
        latencyMs: Date.now() - startTime,
      });

      throw new ForbiddenException({
        blocked: true,
        reasons: policy.violations,
      });
    }

    // --- FORWARD TO UPSTREAM LLM (with provider fallback + circuit breaker) ---
    const forwardStart = Date.now();
    const { response, provider: servedBy, attempts } = await this.forwardWithFallback(meta.provider, body);
    const ttftMs = Date.now() - forwardStart;
    const latencyMs = Date.now() - startTime;

    if (attempts.length > 1) {
      this.logger.warn(
        `Request served by fallback provider "${servedBy}" after ${attempts.length - 1} failed attempt(s): ` +
          attempts.map((a) => `${a.provider}=${a.ok ? 'ok' : a.error}`).join(', '),
      );
    }

    const responseText = response.data?.choices?.[0]?.message?.content ?? '';
    const outputTokens = response.data?.usage?.completion_tokens ?? estimateTokens(responseText);
    const actualInputTokens = response.data?.usage?.prompt_tokens ?? inputTokens;
    const responseHash = crypto.createHash('sha256').update(responseText).digest('hex');
    const costUsd = estimateCost(body.model, actualInputTokens, outputTokens);

    // --- SAVE TRACE (sync — lightweight, no scores yet) ---
    const trace = await this.traceService.save({
      tenantId: meta.tenantId,
      userId: meta.userId,
      sessionId: meta.sessionId,
      model: body.model,
      provider: servedBy,
      promptHash,
      responseHash,
      inputTokens: actualInputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      ttftMs,
      piiDetectedInput: pii.detected,
      piiTypes: pii.types,
      injectionDetected: false,
      policyViolations: [],
      blocked: false,
    });

    // --- EMIT TO SQS FOR ASYNC EVALUATION (non-blocking) ---
    this.sqsEmitter.emit({
      traceId: trace.id,
      prompt: promptText,
      response: responseText,
      model: body.model,
      tenantId: meta.tenantId,
    }).catch((err) => this.logger.error('SQS emit failed', err));

    return response.data;
  }

  // Tries each provider in the requested provider's fallback chain in order,
  // skipping any whose circuit breaker is currently OPEN. Returns the first
  // successful response. Throws BadGatewayException only if every provider
  // in the chain fails or is breaker-blocked — callers see one combined error
  // rather than the last attempt's error, since any attempt could be the
  // interesting one to debug.
  private async forwardWithFallback(
    requestedProvider: string,
    body: ChatCompletionRequest,
  ): Promise<{ response: { data: any }; provider: string; attempts: UpstreamAttempt[] }> {
    const chain = FALLBACK_CHAINS[requestedProvider] ?? [requestedProvider];
    const attempts: UpstreamAttempt[] = [];

    for (const provider of chain) {
      if (!this.circuitBreaker.canAttempt(provider)) {
        attempts.push({ provider, ok: false, latencyMs: 0, error: 'circuit_open' });
        continue;
      }

      const attemptStart = Date.now();
      try {
        this.injectFaultIfConfigured(provider);

        const upstreamUrl = PROVIDER_URLS[provider] ?? PROVIDER_URLS['openai'];
        const apiKey = this.resolveApiKey(provider);
        const response = await firstValueFrom(
          this.http.post(upstreamUrl, body, {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          }),
        );

        this.circuitBreaker.recordSuccess(provider);
        attempts.push({ provider, ok: true, latencyMs: Date.now() - attemptStart });
        return { response, provider, attempts };
      } catch (err) {
        this.circuitBreaker.recordFailure(provider);
        const message = err instanceof Error ? err.message : String(err);
        attempts.push({ provider, ok: false, latencyMs: Date.now() - attemptStart, error: message });
      }
    }

    throw new BadGatewayException({
      message: 'All providers in fallback chain failed or are circuit-broken',
      attempts,
    });
  }

  // Lets a demo/test force a provider to fail without needing to actually
  // take a real upstream down — set FORCE_PROVIDER_FAILURE=openai (or a
  // comma-separated list) to make forwardWithFallback throw for that
  // provider before it makes a network call. Used to demonstrate the
  // fallback chain and circuit breaker tripping live; never set in production.
  private injectFaultIfConfigured(provider: string): void {
    const forced = (this.config.get<string>('FORCE_PROVIDER_FAILURE') ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (forced.includes(provider)) {
      throw new Error(`Injected failure for provider "${provider}" (FORCE_PROVIDER_FAILURE)`);
    }
  }

  private resolveApiKey(provider: string): string {
    if (provider === 'gemini') return this.config.get<string>('GEMINI_API_KEY') ?? '';
    return this.config.get<string>('OPENAI_API_KEY') ?? '';
  }
}
