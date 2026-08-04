import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeminiJudge, HallucinationEvaluator, ToxicityEvaluator, FaithfulnessEvaluator } from '@llm-sentinel/evaluators';
import { EvalOrchestrator } from './eval.orchestrator';
import { Trace } from '@llm-sentinel/tracing';

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
