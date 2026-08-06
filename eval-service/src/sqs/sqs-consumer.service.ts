import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  Message,
} from '@aws-sdk/client-sqs';
import { LocalFileQueue } from '@llm-sentinel/queue';
import { join } from 'path';
import { EvalOrchestrator, EvalJob } from '../evaluators/eval.orchestrator';

// Must match gateway's SqsEmitter default so both sides agree on a directory
// when LOCAL_QUEUE_DIR isn't set explicitly in either .env. Resolved from
// cwd (this service's own dir, e.g. eval-service/) rather than __dirname —
// see the matching comment in gateway/src/proxy/sqs-emitter.ts.
const DEFAULT_LOCAL_QUEUE_DIR = join(process.cwd(), '..', '.local-queue', 'trace-eval');
const LOCAL_POLL_INTERVAL_MS = 1000;

@Injectable()
export class SqsConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumerService.name);
  private readonly client: SQSClient | null = null;
  private readonly queueUrl: string = '';
  private readonly localQueue: LocalFileQueue<EvalJob> | null = null;
  private polling = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly orchestrator: EvalOrchestrator,
  ) {
    const useLocalQueue = this.config.get<string>('USE_LOCAL_QUEUE') === 'true';
    if (useLocalQueue) {
      const dir = this.config.get<string>('LOCAL_QUEUE_DIR') || DEFAULT_LOCAL_QUEUE_DIR;
      this.localQueue = new LocalFileQueue<EvalJob>(dir);
      this.logger.log(`Using local file queue for trace eval consume (dir: ${dir})`);
    } else {
      this.client = new SQSClient({
        region: config.get<string>('AWS_REGION') ?? 'ap-south-1',
      });
      this.queueUrl = config.get<string>('AWS_SQS_TRACE_QUEUE_URL') ?? '';
    }
  }

  onModuleInit() {
    if (!this.localQueue && !this.queueUrl) {
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
      if (this.localQueue) {
        const messages = await this.localQueue.receive(10);
        if (messages.length > 0) {
          await Promise.allSettled(
            messages.map(({ receiptHandle, body }) => this.runJob(body, () => this.localQueue!.delete(receiptHandle))),
          );
        }
      } else {
        const result = await this.client!.send(
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
      }
    } catch (err) {
      this.logger.error('Queue poll error', err);
    }

    // Real SQS uses long-polling so we can re-poll immediately; the local
    // queue has no such wait, so poll on a short interval instead.
    const delay = this.localQueue ? LOCAL_POLL_INTERVAL_MS : 0;
    this.pollTimer = setTimeout(() => this.poll(), delay);
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

    await this.runJob(job, () => this.delete(message.ReceiptHandle!));
  }

  private async runJob(job: EvalJob, ack: () => Promise<void>): Promise<void> {
    try {
      await this.orchestrator.run(job);
      await ack();
    } catch (err) {
      // Leave message in queue for retry — SQS visibility timeout (or the next
      // local poll, since we never deleted the file) will re-deliver it.
      this.logger.error(`Eval failed for trace ${job.traceId}`, err);
    }
  }

  private async delete(receiptHandle: string): Promise<void> {
    await this.client!.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}
