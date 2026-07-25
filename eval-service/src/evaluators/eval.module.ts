import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeminiJudge } from './gemini-judge';
import { HallucinationEvaluator } from './hallucination.evaluator';
import { ToxicityEvaluator } from './toxicity.evaluator';
import { FaithfulnessEvaluator } from './faithfulness.evaluator';
import { EvalOrchestrator } from './eval.orchestrator';
import { Trace } from '../trace/trace.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Trace])],
  providers: [
    GeminiJudge,
    HallucinationEvaluator,
    ToxicityEvaluator,
    FaithfulnessEvaluator,
    EvalOrchestrator,
  ],
  exports: [EvalOrchestrator],
})
export class EvalModule {}
