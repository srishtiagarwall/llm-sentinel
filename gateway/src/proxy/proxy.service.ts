import { Injectable, ForbiddenException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { ChatCompletionRequest, ProxyRequestMeta } from './proxy.dto';
import { scanForPii } from '../guardrails/pii-detector';
import { scanForInjection } from '../guardrails/injection-scanner';
import { enforcePolicy } from '../guardrails/policy-enforcer';
import { estimateTokens, estimateCost } from '../guardrails/token-estimator';
import { TraceService } from './trace.service';
import { SqsEmitter } from './sqs-emitter';

const PROVIDER_URLS: Record<string, string> = {
  openai: 'https://api.openai.com/v1/chat/completions',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
};

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly traceService: TraceService,
    private readonly sqsEmitter: SqsEmitter,
  ) {}

  async handleChatCompletion(body: ChatCompletionRequest, meta: ProxyRequestMeta) {
    const startTime = Date.now();
    const promptText = body.messages.map((m) => m.content).join('\n');

    // --- PRE-LLM GUARDRAIL PIPELINE ---
    const pii = scanForPii(promptText);
    const injection = scanForInjection(promptText);
    const policy = enforcePolicy({ tenantId: meta.tenantId, provider: meta.provider, pii, injection });

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

    // --- FORWARD TO UPSTREAM LLM ---
    const upstreamUrl = PROVIDER_URLS[meta.provider] ?? PROVIDER_URLS['openai'];
    const apiKey = this.resolveApiKey(meta.provider);

    let ttftMs = 0;
    const forwardStart = Date.now();

    const response = await firstValueFrom(
      this.http.post(upstreamUrl, body, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }),
    );

    ttftMs = Date.now() - forwardStart;
    const latencyMs = Date.now() - startTime;

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
      provider: meta.provider,
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

  private resolveApiKey(provider: string): string {
    if (provider === 'gemini') return this.config.get<string>('GEMINI_API_KEY') ?? '';
    return this.config.get<string>('OPENAI_API_KEY') ?? '';
  }
}
