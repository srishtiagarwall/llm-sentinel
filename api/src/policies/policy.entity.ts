import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type PolicyAction = 'BLOCK' | 'ALERT';

@Entity('policies')
@Index(['tenantId', 'enabled'])
export class Policy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column()
  name: string;

  // e.g. "pii_detected == true AND provider != 'internal'"
  @Column()
  condition: string;

  @Column({ type: 'varchar' })
  action: PolicyAction;

  @Column({ default: true })
  alert: boolean;

  @Column({ default: true })
  enabled: boolean;

  // Optional scoping: null means "applies to all"
  @Column({ name: 'model', nullable: true })
  model: string | null;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
