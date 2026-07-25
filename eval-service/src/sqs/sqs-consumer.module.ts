import { Module } from '@nestjs/common';
import { SqsConsumerService } from './sqs-consumer.service';
import { EvalModule } from '../evaluators/eval.module';

@Module({
  imports: [EvalModule],
  providers: [SqsConsumerService],
})
export class SqsConsumerModule {}
