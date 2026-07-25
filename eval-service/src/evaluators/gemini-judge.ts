import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class GeminiJudge {
  private readonly logger = new Logger(GeminiJudge.name);
  private readonly model;

  constructor(config: ConfigService) {
    const genAI = new GoogleGenerativeAI(config.get<string>('GEMINI_API_KEY') ?? '');
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  async score(prompt: string): Promise<number> {
    try {
      const result = await this.model.generateContent(prompt);
      const text = result.response.text().trim();
      // Expect model to return a JSON object like { "score": 0.87 }
      const match = text.match(/\{[\s\S]*?"score"\s*:\s*([0-9.]+)[\s\S]*?\}/);
      if (match) return Math.min(1, Math.max(0, parseFloat(match[1])));
      // Fallback: try parsing raw float
      const raw = parseFloat(text);
      return isNaN(raw) ? 0.5 : Math.min(1, Math.max(0, raw));
    } catch (err) {
      this.logger.error('Gemini judge call failed', err);
      return 0.5; // neutral score on failure — never block on eval errors
    }
  }
}
