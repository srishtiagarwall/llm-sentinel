import { Injectable } from '@nestjs/common';
import { GeminiJudge } from './gemini-judge';

@Injectable()
export class HallucinationEvaluator {
  constructor(private readonly judge: GeminiJudge) {}

  /**
   * Returns a score 0–1 where 1 = fully grounded, 0 = hallucinated.
   * Uses Gemini as an LLM judge comparing the response against the original prompt context.
   */
  async evaluate(prompt: string, response: string): Promise<number> {
    const judgePrompt = `
You are an expert AI evaluator assessing whether an AI response contains hallucinations.

ORIGINAL PROMPT:
"""
${prompt}
"""

AI RESPONSE:
"""
${response}
"""

Evaluate the response for factual accuracy and groundedness relative to the prompt context.
Score the response on a scale of 0.0 to 1.0 where:
- 1.0 = completely grounded, no hallucinations, all claims are accurate or appropriately uncertain
- 0.5 = some unverifiable claims but nothing clearly false
- 0.0 = contains clear fabrications, false facts, or invented information

Respond ONLY with JSON in this exact format: { "score": <float between 0 and 1> }
`.trim();

    return this.judge.score(judgePrompt);
  }
}
