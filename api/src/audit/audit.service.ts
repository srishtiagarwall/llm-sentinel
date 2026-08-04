import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trace } from '@llm-sentinel/tracing';
import { AuditReport, generateAuditReport, renderAuditReportPdf } from '@llm-sentinel/audit';

export type { AuditReport } from '@llm-sentinel/audit';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(Trace)
    private readonly repo: Repository<Trace>,
  ) {}

  async generateReport(tenantId: string, from: Date, to: Date): Promise<AuditReport> {
    return generateAuditReport(this.repo, tenantId, from, to);
  }

  async generateReportPdf(tenantId: string, from: Date, to: Date): Promise<Uint8Array> {
    const report = await this.generateReport(tenantId, from, to);
    return renderAuditReportPdf(report);
  }
}
