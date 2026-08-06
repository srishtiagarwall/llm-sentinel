import { MigrationInterface, QueryRunner } from 'typeorm';

// Mirrors the original hand-run api/migrations/002_create_users.sql.
export class CreateUsers1754000002000 implements MigrationInterface {
  name = 'CreateUsers1754000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        email VARCHAR NOT NULL,
        password_hash VARCHAR NOT NULL,
        role VARCHAR NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_email UNIQUE (email)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_users_tenant ON users (tenant_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
  }
}
