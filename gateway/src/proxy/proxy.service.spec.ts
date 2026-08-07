import { of, throwError } from 'rxjs';
import { BadGatewayException } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import type { ChatCompletionRequest, ProxyRequestMeta } from './proxy.dto';

function makeMeta(overrides: Partial<ProxyRequestMeta> = {}): ProxyRequestMeta {
  return { tenantId: 't1', userId: 'u1', provider: 'openai', ...overrides };
}

function makeBody(overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest {
  return { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hello' }], ...overrides };
}

function makeConfig(env: Record<string, string> = {}) {
  return { get: (key: string) => env[key] } as any;
}

function makeUpstreamResponse(content = 'hi there') {
  return {
    data: {
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    },
  };
}

describe('ProxyService fallback routing', () => {
  const policyEnforcerAllow = { enforce: jest.fn().mockResolvedValue({ allowed: true, violations: [], alerts: [] }) };
  const traceService = { save: jest.fn().mockResolvedValue({ id: 'trace-1', tenantId: 't1' }) };
  const sqsEmitter = { emit: jest.fn().mockResolvedValue(undefined) };

  beforeEach(() => {
    jest.clearAllMocks();
    policyEnforcerAllow.enforce.mockResolvedValue({ allowed: true, violations: [], alerts: [] });
    traceService.save.mockResolvedValue({ id: 'trace-1', tenantId: 't1' });
  });

  it('serves from the primary provider when the upstream call succeeds', async () => {
    const http = { post: jest.fn().mockReturnValue(of(makeUpstreamResponse())) };
    const service = new ProxyService(
      http as any,
      makeConfig({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' }),
      traceService as any,
      sqsEmitter as any,
      policyEnforcerAllow as any,
      new CircuitBreakerService(),
    );

    await service.handleChatCompletion(makeBody(), makeMeta({ provider: 'openai' }));

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(traceService.save).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openai' }));
  });

  it('falls back to the next provider in the chain when the primary throws', async () => {
    const http = {
      post: jest
        .fn()
        .mockReturnValueOnce(throwError(() => new Error('ECONNREFUSED')))
        .mockReturnValueOnce(of(makeUpstreamResponse())),
    };
    const service = new ProxyService(
      http as any,
      makeConfig({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' }),
      traceService as any,
      sqsEmitter as any,
      policyEnforcerAllow as any,
      new CircuitBreakerService(),
    );

    await service.handleChatCompletion(makeBody(), makeMeta({ provider: 'openai' }));

    expect(http.post).toHaveBeenCalledTimes(2);
    // openai -> gemini is the configured fallback chain for a requested "openai" call
    expect(traceService.save).toHaveBeenCalledWith(expect.objectContaining({ provider: 'gemini' }));
  });

  it('throws BadGatewayException when every provider in the chain fails', async () => {
    const http = { post: jest.fn().mockReturnValue(throwError(() => new Error('ECONNREFUSED'))) };
    const service = new ProxyService(
      http as any,
      makeConfig({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' }),
      traceService as any,
      sqsEmitter as any,
      policyEnforcerAllow as any,
      new CircuitBreakerService(),
    );

    await expect(service.handleChatCompletion(makeBody(), makeMeta({ provider: 'openai' }))).rejects.toThrow(
      BadGatewayException,
    );
    expect(http.post).toHaveBeenCalledTimes(2); // both chain entries attempted
  });

  it('skips a provider whose circuit is already OPEN without making a network call', async () => {
    const http = { post: jest.fn().mockReturnValue(of(makeUpstreamResponse())) };
    const breaker = new CircuitBreakerService({ failureThreshold: 1 });
    breaker.recordFailure('openai'); // trips it OPEN before the request even starts

    const service = new ProxyService(
      http as any,
      makeConfig({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' }),
      traceService as any,
      sqsEmitter as any,
      policyEnforcerAllow as any,
      breaker,
    );

    await service.handleChatCompletion(makeBody(), makeMeta({ provider: 'openai' }));

    // Only one call: gemini succeeds, openai was never attempted over the network.
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(traceService.save).toHaveBeenCalledWith(expect.objectContaining({ provider: 'gemini' }));
  });

  it('honors FORCE_PROVIDER_FAILURE to simulate an outage without a real network call', async () => {
    const http = { post: jest.fn().mockReturnValue(of(makeUpstreamResponse())) };
    const service = new ProxyService(
      http as any,
      makeConfig({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o', FORCE_PROVIDER_FAILURE: 'openai' }),
      traceService as any,
      sqsEmitter as any,
      policyEnforcerAllow as any,
      new CircuitBreakerService(),
    );

    await service.handleChatCompletion(makeBody(), makeMeta({ provider: 'openai' }));

    // openai is forced to fail before any HTTP call; gemini is the real (mocked) call.
    expect(http.post).toHaveBeenCalledTimes(1);
    expect(traceService.save).toHaveBeenCalledWith(expect.objectContaining({ provider: 'gemini' }));
  });
});
