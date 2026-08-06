import { randomUUID } from 'crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface QueueMessage<T> {
  receiptHandle: string;
  body: T;
}

// Drop-in local substitute for the AWS SQS emit/poll/delete cycle used in
// production. Each message is a file in queueDir; the filename's leading
// timestamp gives FIFO ordering across processes without a broker. Meant for
// local dev only (USE_LOCAL_QUEUE=true) — swap back to SqsEmitter/consumer
// for anything that needs real durability or cross-machine delivery.
export class LocalFileQueue<T> {
  constructor(private readonly queueDir: string) {
    mkdirSync(this.queueDir, { recursive: true });
  }

  async send(body: T): Promise<void> {
    const filename = `${Date.now().toString().padStart(15, '0')}-${randomUUID()}.json`;
    const tmpPath = join(this.queueDir, `.${filename}.tmp`);
    const finalPath = join(this.queueDir, filename);
    // Write to a temp file then rename — avoids a reader seeing a partial write.
    writeFileSync(tmpPath, JSON.stringify(body));
    renameSync(tmpPath, finalPath);
  }

  async receive(maxMessages = 10): Promise<QueueMessage<T>[]> {
    const files = readdirSync(this.queueDir)
      .filter((f) => f.endsWith('.json') && !f.startsWith('.'))
      .sort()
      .slice(0, maxMessages);

    const messages: QueueMessage<T>[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(this.queueDir, file), 'utf-8');
        messages.push({ receiptHandle: file, body: JSON.parse(raw) as T });
      } catch {
        // File may have been deleted/renamed by a concurrent reader — skip it.
      }
    }
    return messages;
  }

  async delete(receiptHandle: string): Promise<void> {
    try {
      unlinkSync(join(this.queueDir, receiptHandle));
    } catch {
      // Already deleted — fine, delete is idempotent.
    }
  }
}
