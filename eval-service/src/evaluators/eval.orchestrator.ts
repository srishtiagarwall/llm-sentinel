import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HallucinationEvaluator } from './hallucination.evaluator';
import { ToxicityEvaluator } from './toxicity.evaluator';
import { FaithfulnessEvaluator } from './faithfulness.evaluator';
import { Trace } from '../trace/trace.entity';

export interface EvalJob {
  traceId: string;
  prompt: string;
  response: string;
  model: string;
  tenantId: string;
}

@Injectable()
export class EvalOrchestrator {
  private readonly logger = new Logger(EvalOrchestrator.name);

  constructor(
    @InjectRepository(Trace)
    private readonly traceRepo: Repository<Trace>,
    private readonly hallucination: HallucinationEvaluator,
    private readonly toxicity: ToxicityEvaluator,
    private readonly faithfulness: FaithfulnessEvaluator,
  ) {}

  async run(job: EvalJob): Promise<void> {
    this.logger.log(`Running evals for trace ${job.traceId}`);

    // Run all three evaluators in parallel — independent scores
    const [hallucinationScore, toxicityScore, faithfulnessScore] = await Promise.all([
      this.hallucination.evaluate(job.prompt, job.response),
      this.toxicity.evaluate(job.response),
      this.faithfulness.evaluate(job.prompt, job.response),
    ]);

    this.logger.log(
      `Scores for ${job.traceId} — hallucination: ${hallucinationScore}, toxicity: ${toxicityScore}, faithfulness: ${faithfulnessScore}`,
    );

    await this.traceRepo.update(job.traceId, {
      hallucinationScore,
      toxicityScore,
      faithfulnessScore,
    });
  }
}
