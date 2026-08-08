import { MigrationInterface, QueryRunner } from 'typeorm';

// Backs libs/queue's PostgresQueue — the cross-machine substitute for
// LocalFileQueue used when gateway and eval-service run as separate
// processes with no shared disk (e.g. two Render services). Both already
// depend on the same Postgres, so this needs no new infrastructure.
export class CreateQueueMessages1754000004000 implements MigrationInterface {
  name = 'CreateQueueMessages1754000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS queue_messages (
        id BIGSERIAL PRIMARY KEY,
        queue_name VARCHAR NOT NULL,
        body JSONB NOT NULL,
        claimed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    // Two indexes matching PostgresQueue's two query shapes: receive() scans
    // unclaimed rows for a given queue ordered by age; requeueStale() scans
    // claimed rows for a given queue by claim age.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_queue_messages_unclaimed"
      ON queue_messages (queue_name, created_at)
      WHERE claimed_at IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_queue_messages_claimed"
      ON queue_messages (queue_name, claimed_at)
      WHERE claimed_at IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS queue_messages`);
  }
}
