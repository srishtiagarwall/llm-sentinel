import { Pool } from 'pg';
import type { QueueMessage } from './local-file-queue';

// Cross-machine substitute for LocalFileQueue — same purpose (skip AWS for a
// demo/local deployment) but works when the producer (gateway) and consumer
// (eval-service) are separate processes on separate machines with no shared
// disk, which is the case on Render (see render.yaml) and any other
// multi-instance deployment. Both sides already depend on the same Postgres,
// so this adds no new infrastructure.
//
// `receive` uses `FOR UPDATE SKIP LOCKED` so concurrent pollers (e.g. two
// eval-service instances) never claim the same row twice, and a row that's
// mid-processing doesn't block others from being picked up. A message stays
// claimed (but undeleted) if the consumer crashes before ack — see
// `requeueStale` for recovering those; this queue does not auto-expire
// claims the way SQS's visibility timeout does, so the consumer must call it.
export class PostgresQueue<T> {
  constructor(
    private readonly pool: Pool,
    private readonly queueName: string,
  ) {}

  async send(body: T): Promise<void> {
    await this.pool.query(
      `INSERT INTO queue_messages (queue_name, body) VALUES ($1, $2)`,
      [this.queueName, JSON.stringify(body)],
    );
  }

  async receive(maxMessages = 10): Promise<QueueMessage<T>[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // RETURNING from an UPDATE ... WHERE id IN (subquery) does not preserve
      // the subquery's ORDER BY — Postgres makes no ordering guarantee across
      // that join, so FIFO order has to be re-applied in the outer SELECT,
      // not assumed from the CTE that picks which rows to claim.
      const { rows } = await client.query(
        `WITH claimed AS (
           UPDATE queue_messages
           SET claimed_at = now()
           WHERE id IN (
             SELECT id FROM queue_messages
             WHERE queue_name = $1 AND claimed_at IS NULL
             ORDER BY created_at ASC, id ASC
             LIMIT $2
             FOR UPDATE SKIP LOCKED
           )
           RETURNING id, body, created_at
         )
         SELECT id, body FROM claimed ORDER BY created_at ASC, id ASC`,
        [this.queueName, maxMessages],
      );
      await client.query('COMMIT');
      return rows.map((r) => ({ receiptHandle: String(r.id), body: r.body as T }));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async delete(receiptHandle: string): Promise<void> {
    await this.pool.query(`DELETE FROM queue_messages WHERE id = $1`, [receiptHandle]);
  }

  // A message claimed by receive() but never deleted (consumer crashed
  // mid-job) stays claimed forever otherwise — unlike SQS's visibility
  // timeout, there's no automatic requeue. Call this periodically (the
  // consumer's poll loop does, on each cycle) to release claims older than
  // `staleAfterMs` back to the pool.
  async requeueStale(staleAfterMs = 60_000): Promise<void> {
    await this.pool.query(
      `UPDATE queue_messages
       SET claimed_at = NULL
       WHERE queue_name = $1 AND claimed_at IS NOT NULL AND claimed_at < now() - ($2 || ' milliseconds')::interval`,
      [this.queueName, staleAfterMs],
    );
  }
}
