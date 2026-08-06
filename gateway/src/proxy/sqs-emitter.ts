import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { LocalFileQueue } from '@llm-sentinel/queue';
import { join } from 'path';

export interface TracePayload {
  traceId: string;
  prompt: string;
  response: string;
  model: string;
  tenantId: string;
}

// Shared with eval-service's SqsConsumerService — both must point at the same
// directory for the local queue to work. See LOCAL_QUEUE_DIR in each .env.
// Resolved from cwd (each service's own dir, e.g. gateway/) rather than
// __dirname, since __dirname behaves inconsistently between ts-node's
// in-memory transpile and a compiled dist/ run.
const DEFAULT_LOCAL_QUEUE_DIR = join(process.cwd(), '..', '.local-queue', 'trace-eval');

@Injectable()
export class SqsEmitter {
  private readonly logger = new Logger(SqsEmitter.name);
  private readonly client: SQSClient | null = null;
  private readonly queueUrl: string;
  private readonly localQueue: LocalFileQueue<TracePayload> | null = null;

  constructor(private readonly config: ConfigService) {
    const useLocalQueue = this.config.get<string>('USE_LOCAL_QUEUE') === 'true';
    if (useLocalQueue) {
      const dir = this.config.get<string>('LOCAL_QUEUE_DIR') || DEFAULT_LOCAL_QUEUE_DIR;
      this.localQueue = new LocalFileQueue<TracePayload>(dir);
      this.logger.log(`Using local file queue for trace eval emit (dir: ${dir})`);
    } else {
      this.client = new SQSClient({ region: config.get<string>('AWS_REGION') ?? 'ap-south-1' });
      this.queueUrl = config.get<string>('AWS_SQS_TRACE_QUEUE_URL') ?? '';
    }
  }

  async emit(payload: TracePayload): Promise<void> {
    if (this.localQueue) {
      await this.localQueue.send(payload);
      return;
    }

    if (!this.queueUrl) {
      this.logger.warn('SQS queue URL not configured — skipping async eval emit');
      return;
    }

    await this.client!.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
        MessageGroupId: payload.tenantId, // FIFO queue grouping per tenant
      }),
    );
  }
}
