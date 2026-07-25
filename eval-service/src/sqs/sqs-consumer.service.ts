import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { EvalOrchestrator, EvalJob } from '../evaluators/eval.orchestrator';

@Injectable()
export class SqsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerService.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;
  private polling = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly orchestrator: EvalOrchestrator,
  ) {
    this.client = new SQSClient({
      region: config.get<string>('AWS_REGION') ?? 'ap-south-1',
    });
    this.queueUrl = config.get<string>('AWS_SQS_TRACE_QUEUE_URL') ?? '';
  }

  onModuleInit() {
    if (!this.queueUrl) {
      this.logger.warn('SQS queue URL not configured — eval consumer not started');
      return;
    }
    this.polling = true;
    this.poll();
  }

  onModuleDestroy() {
    this.polling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  private async poll(): Promise<void> {
    if (!this.polling) return;

    try {
      const result = await this.client.send(
        new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // long-polling — reduces empty receives
        }),
      );

      const messages = result.Messages ?? [];
      if (messages.length > 0) {
        // Process all messages in this batch concurrently
        await Promise.allSettled(messages.map((msg) => this.process(msg)));
      }
    } catch (err) {
      this.logger.error('SQS poll error', err);
    }

    // Immediately poll again — long-polling handles the wait
    this.pollTimer = setTimeout(() => this.poll(), 0);
  }

  private async process(message: Message): Promise<void> {
    if (!message.Body || !message.ReceiptHandle) return;

    let job: EvalJob;
    try {
      job = JSON.parse(message.Body) as EvalJob;
    } catch {
      this.logger.error(`Failed to parse SQS message: ${message.Body}`);
      await this.delete(message.ReceiptHandle);
      return;
    }

    try {
      await this.orchestrator.run(job);
      await this.delete(message.ReceiptHandle);
    } catch (err) {
      // Leave message in queue for retry — SQS visibility timeout will re-deliver
      this.logger.error(`Eval failed for trace ${job.traceId}`, err);
    }
  }

  private async delete(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}
