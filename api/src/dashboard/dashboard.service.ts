import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trace } from '@llm-sentinel/tracing';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Trace)
    private readonly repo: Repository<Trace>,
  ) {}

  async getOverview(tenantId: string) {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalToday, blockedToday, recentTraces] = await Promise.all([
      this.repo.count({ where: { tenantId } }),

      this.repo.count({ where: { tenantId, blocked: true } }),

      this.repo.find({
        where: { tenantId },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const costBurn = await this.repo
      .createQueryBuilder('t')
      .select('SUM(t.cost_usd)', 'total')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.created_at >= :from', { from: last24h })
      .getRawOne();

    const hallucinationTrend = await this.repo
      .createQueryBuilder('t')
      .select("DATE_TRUNC('hour', t.created_at)", 'hour')
      .addSelect('AVG(t.hallucination_score)', 'avgScore')
      .where('t.tenant_id = :tenantId', { tenantId })
      .andWhere('t.created_at >= :from', { from: last24h })
      .andWhere('t.hallucination_score IS NOT NULL')
      .groupBy("DATE_TRUNC('hour', t.created_at)")
      .orderBy("DATE_TRUNC('hour', t.created_at)", 'ASC')
      .getRawMany();

    return {
      totalToday,
      blockedToday,
      costBurn24h: Number(costBurn?.total ?? 0),
      recentTraces,
      hallucinationTrend,
    };
  }

  async getCostBreakdown(tenantId: string) {
    return this.repo
      .createQueryBuilder('t')
      .select('t.model', 'model')
      .addSelect('SUM(t.cost_usd)', 'totalCost')
      .addSelect('COUNT(*)', 'requestCount')
      .where('t.tenant_id = :tenantId', { tenantId })
      .groupBy('t.model')
      .orderBy('totalCost', 'DESC')
      .getRawMany();
  }
}
