import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('traces')
@Index(['tenantId', 'createdAt'])
export class Trace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({ name: 'session_id', nullable: true })
  sessionId: string;

  @Column()
  model: string;

  @Column()
  provider: string;

  @Column({ name: 'prompt_hash' })
  promptHash: string;

  @Column({ name: 'response_hash', nullable: true })
  responseHash: string;

  @Column({ name: 'input_tokens', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', default: 0 })
  outputTokens: number;

  @Column({ name: 'cost_usd', type: 'decimal', precision: 10, scale: 6, default: 0 })
  costUsd: number;

  @Column({ name: 'latency_ms', default: 0 })
  latencyMs: number;

  @Column({ name: 'ttft_ms', default: 0 })
  ttftMs: number;

  @Column({ name: 'pii_detected_input', default: false })
  piiDetectedInput: boolean;

  @Column({ name: 'pii_types', type: 'simple-array', nullable: true })
  piiTypes: string[];

  @Column({ name: 'injection_detected', default: false })
  injectionDetected: boolean;

  @Column({ name: 'hallucination_score', type: 'decimal', precision: 4, scale: 3, nullable: true })
  hallucinationScore: number;

  @Column({ name: 'toxicity_score', type: 'decimal', precision: 4, scale: 3, nullable: true })
  toxicityScore: number;

  @Column({ name: 'faithfulness_score', type: 'decimal', precision: 4, scale: 3, nullable: true })
  faithfulnessScore: number;

  @Column({ name: 'policy_violations', type: 'simple-array', nullable: true })
  policyViolations: string[];

  @Column({ name: 'blocked', default: false })
  blocked: boolean;

  @Column({ name: 'block_reason', nullable: true })
  blockReason: string;

  @Column({ name: 'chain_hash', nullable: true })
  chainHash: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
