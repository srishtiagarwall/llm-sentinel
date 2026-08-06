import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalFileQueue } from './local-file-queue';

describe('LocalFileQueue', () => {
  let dir: string;
  let queue: LocalFileQueue<{ value: string }>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'llm-sentinel-queue-test-'));
    queue = new LocalFileQueue(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('receives a message after it is sent', async () => {
    await queue.send({ value: 'hello' });
    const messages = await queue.receive();
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toEqual({ value: 'hello' });
  });

  it('preserves FIFO order across multiple sends', async () => {
    await queue.send({ value: 'first' });
    await queue.send({ value: 'second' });
    await queue.send({ value: 'third' });

    const messages = await queue.receive();
    expect(messages.map((m) => m.body.value)).toEqual(['first', 'second', 'third']);
  });

  it('does not redeliver a deleted message', async () => {
    await queue.send({ value: 'once' });
    const [msg] = await queue.receive();
    await queue.delete(msg.receiptHandle);

    const messages = await queue.receive();
    expect(messages).toHaveLength(0);
  });

  it('delete is idempotent for an already-deleted message', async () => {
    await queue.send({ value: 'x' });
    const [msg] = await queue.receive();
    await queue.delete(msg.receiptHandle);
    await expect(queue.delete(msg.receiptHandle)).resolves.toBeUndefined();
  });

  it('respects maxMessages when receiving', async () => {
    await queue.send({ value: 'a' });
    await queue.send({ value: 'b' });
    await queue.send({ value: 'c' });

    const messages = await queue.receive(2);
    expect(messages).toHaveLength(2);
  });
});
