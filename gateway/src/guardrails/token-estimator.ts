// Cost per 1M tokens (USD) — update as provider pricing changes
const PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.075, output: 0.30 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
};

export function estimateTokens(text: string): number {
  // ~4 chars per token is a reasonable heuristic
  return Math.ceil(text.length / 4);
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] ?? { input: 1.0, output: 3.0 };
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
