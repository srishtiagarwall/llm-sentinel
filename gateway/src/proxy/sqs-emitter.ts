import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

export interface TracePayload {
  traceId: string;
  prompt: string;
  response: string;
  model: string;
  tenantId: string;
}

@Injectable()
export class SqsEmitter {
  private readonly logger = new Logger(SqsEmitter.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(private readonly config: ConfigService) {
    this.client = new SQSClient({ region: config.get<string>('AWS_REGION') ?? 'ap-south-1' });
    this.queueUrl = config.get<string>('AWS_SQS_TRACE_QUEUE_URL') ?? '';
  }

  async emit(payload: TracePayload): Promise<void> {
    if (!this.queueUrl) {
      this.logger.warn('SQS queue URL not configured — skipping async eval emit');
      return;
    }

    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(payload),
        MessageGroupId: payload.tenantId, // FIFO queue grouping per tenant
      }),
    );
  }
}
