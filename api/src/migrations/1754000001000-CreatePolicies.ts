import { MigrationInterface, QueryRunner } from 'typeorm';

// Mirrors the original hand-run api/migrations/001_create_policies.sql.
export class CreatePolicies1754000001000 implements MigrationInterface {
  name = 'CreatePolicies1754000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS policies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        name VARCHAR NOT NULL,
        condition VARCHAR NOT NULL,
        action VARCHAR NOT NULL,
        alert BOOLEAN NOT NULL DEFAULT true,
        enabled BOOLEAN NOT NULL DEFAULT true,
        model VARCHAR,
        user_id VARCHAR,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_policies_tenant_enabled ON policies (tenant_id, enabled)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS policies`);
  }
}
