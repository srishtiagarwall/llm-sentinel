import { Pool } from 'pg';
import { PostgresQueue } from './postgres-queue';

// Runs against a real local Postgres — set TEST_DATABASE_URL to point at one
// with a `queue_messages` table (see api/src/migrations/1754000004000-CreateQueueMessages.ts
// for the schema). Skipped automatically if the env var isn't set, so this
// doesn't block `npm test` for anyone without a local Postgres running.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = TEST_DATABASE_URL ? describe : describe.skip;

describeIfDb('PostgresQueue', () => {
  let pool: Pool;
  let queue: PostgresQueue<{ value: string }>;
  const queueName = `test-queue-${Date.now()}`;

  beforeAll(() => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL });
  });

  afterAll(async () => {
    await pool.query('DELETE FROM queue_messages WHERE queue_name = $1', [queueName]);
    await pool.end();
  });

  beforeEach(() => {
    queue = new PostgresQueue(pool, queueName);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM queue_messages WHERE queue_name = $1', [queueName]);
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

  it('does not redeliver a claimed-but-not-yet-deleted message to a concurrent receiver', async () => {
    await queue.send({ value: 'claimed' });
    const first = await queue.receive();
    expect(first).toHaveLength(1);

    // A second receive before delete() should see nothing — this is the
    // FOR UPDATE SKIP LOCKED behavior that keeps two eval-service instances
    // from double-processing the same row.
    const second = await queue.receive();
    expect(second).toHaveLength(0);
  });

  it('requeueStale releases a claim older than the threshold back to the pool', async () => {
    await queue.send({ value: 'stuck' });
    await queue.receive(); // claims it, never deletes — simulates a crashed consumer

    await queue.requeueStale(0); // 0ms threshold — everything claimed counts as stale
    const messages = await queue.receive();
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toEqual({ value: 'stuck' });
  });

  it('does not requeue a claim younger than the threshold', async () => {
    await queue.send({ value: 'fresh-claim' });
    await queue.receive();

    await queue.requeueStale(60_000); // nothing this recent should be released
    const messages = await queue.receive();
    expect(messages).toHaveLength(0);
  });

  it('keeps separate queue names from seeing each other\'s messages', async () => {
    const otherQueue = new PostgresQueue<{ value: string }>(pool, `${queueName}-other`);
    await otherQueue.send({ value: 'not-mine' });

    const messages = await queue.receive();
    expect(messages).toHaveLength(0);

    await pool.query('DELETE FROM queue_messages WHERE queue_name = $1', [`${queueName}-other`]);
  });
});
