import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GeminiJudge, HallucinationEvaluator, ToxicityEvaluator, FaithfulnessEvaluator } from '@llm-sentinel/evaluators';
import { EvalOrchestrator } from './eval.orchestrator';
import { Trace } from '@llm-sentinel/tracing';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trace]),
    HttpModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '5m' },
      }),
    }),
  ],
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
