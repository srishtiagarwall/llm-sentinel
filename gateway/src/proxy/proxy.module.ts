import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { TraceService } from './trace.service';
import { SqsEmitter } from './sqs-emitter';
import { Trace } from '@llm-sentinel/tracing';

@Module({
  imports: [
    TypeOrmModule.forFeature([Trace]),
    HttpModule,
  ],
  controllers: [ProxyController],
  providers: [ProxyService, TraceService, SqsEmitter],
})
export class ProxyModule {}
