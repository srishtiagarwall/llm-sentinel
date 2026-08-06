import { MigrationInterface, QueryRunner } from 'typeorm';

// The traces table (backing libs/tracing's Trace entity) was previously
// created ad hoc and never captured as a migration — this reproduces its
// exact live shape, including the tenant_id+created_at index the dashboard's
// hot-path queries rely on.
export class CreateTraces1754000003000 implements MigrationInterface {
  name = 'CreateTraces1754000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS traces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR NOT NULL,
        user_id VARCHAR,
        session_id VARCHAR,
        model VARCHAR NOT NULL,
        provider VARCHAR NOT NULL,
        prompt_hash VARCHAR NOT NULL,
        response_hash VARCHAR,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
        latency_ms INTEGER NOT NULL DEFAULT 0,
        ttft_ms INTEGER NOT NULL DEFAULT 0,
        pii_detected_input BOOLEAN NOT NULL DEFAULT false,
        pii_types TEXT,
        injection_detected BOOLEAN NOT NULL DEFAULT false,
        hallucination_score DECIMAL(4, 3),
        toxicity_score DECIMAL(4, 3),
        faithfulness_score DECIMAL(4, 3),
        policy_violations TEXT,
        blocked BOOLEAN NOT NULL DEFAULT false,
        block_reason VARCHAR,
        chain_hash VARCHAR,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_traces_tenant_created" ON traces (tenant_id, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS traces`);
  }
}
