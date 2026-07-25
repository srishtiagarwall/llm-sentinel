import { Injectable } from '@nestjs/common';
import { GeminiJudge } from './gemini-judge';

@Injectable()
export class FaithfulnessEvaluator {
  constructor(private readonly judge: GeminiJudge) {}

  /**
   * Returns a score 0–1 where 1 = response fully addresses what the prompt asked,
   * 0 = response is off-topic or ignores the question entirely.
   */
  async evaluate(prompt: string, response: string): Promise<number> {
    const judgePrompt = `
You are an expert AI evaluator assessing whether an AI response faithfully addresses the user's question.

ORIGINAL PROMPT:
"""
${prompt}
"""

AI RESPONSE:
"""
${response}
"""

Evaluate how well the response answers what was actually asked. Consider:
- Does it directly address the question or instruction?
- Is it relevant to the topic?
- Does it complete the requested task?

Score on a scale of 0.0 to 1.0 where:
- 1.0 = perfectly answers the question, fully on-topic and complete
- 0.5 = partially addresses the question or somewhat relevant
- 0.0 = completely ignores the question, off-topic, or refuses without reason

Respond ONLY with JSON in this exact format: { "score": <float between 0 and 1> }
`.trim();

    return this.judge.score(judgePrompt);
  }
}
