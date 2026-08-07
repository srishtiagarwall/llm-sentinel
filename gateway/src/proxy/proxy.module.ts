import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { TraceService } from './trace.service';
import { SqsEmitter } from './sqs-emitter';
import { CircuitBreakerService } from './circuit-breaker.service';
import { Trace } from '@llm-sentinel/tracing';
import { PolicyEnforcer } from '../guardrails/policy-enforcer';
import { PolicyCacheService } from '../guardrails/policy-cache.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trace]),
    HttpModule,
    AuthModule,
  ],
  controllers: [ProxyController],
  providers: [
    ProxyService,
    TraceService,
    SqsEmitter,
    PolicyEnforcer,
    PolicyCacheService,
    CircuitBreakerService,
  ],
})
export class ProxyModule {}
