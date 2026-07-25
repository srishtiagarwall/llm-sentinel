import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { Trace } from '../trace/trace.entity';

export interface TraceFilter {
  tenantId: string;
  from?: Date;
  to?: Date;
  model?: string;
  blocked?: boolean;
  page?: number;
  limit?: number;
}

@Injectable()
export class TracesService {
  constructor(
    @InjectRepository(Trace)
    private readonly repo: Repository<Trace>,
  ) {}

  async findAll(filter: TraceFilter): Promise<{ data: Trace[]; total: number }> {
    const { tenantId, from, to, model, blocked, page = 1, limit = 50 } = filter;

    const where: FindOptionsWhere<Trace> = { tenantId };
    if (model) where.model = model;
    if (blocked !== undefined) where.blocked = blocked;
    if (from && to) where.createdAt = Between(from, to);

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }

  async findOne(id: string, tenantId: string): Promise<Trace | null> {
    return this.repo.findOne({ where: { id, tenantId } });
  }

  async getStats(tenantId: string, from: Date, to: Date) {
    const result = await this.repo
      .createQueryBuilder('t')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(t.cost_usd)', 'totalCost')
      .addSelect('AVG(t.latency_ms)', 'avgLatency')
      .addSelect('AVG(t.hallucination_score)', 'avgHallucination')
      .addSelect('AVG(t.toxicity_score)', 'avgToxicity')
      .addSelect('AVG(t.faithfulness_score)', 'avgFaithfulness')
      .addSelect('SUM(CASE WHEN t.blocked THEN 1 ELSE 0 END)', 'blockedCount')
      .addSelect('SUM(CASE WHEN t.pii_detected_input THEN 1 ELSE 0 END)', 'piiCount')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.created_at BETWEEN :from AND :to', { from, to })
      .getRawOne();

    return result;
  }
}
