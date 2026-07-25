import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Trace } from '../trace/trace.entity';

type CreateTraceDto = Partial<Trace>;

@Injectable()
export class TraceService {
  constructor(
    @InjectRepository(Trace)
    private readonly repo: Repository<Trace>,
  ) {}

  async save(dto: CreateTraceDto): Promise<Trace> {
    const lastTrace = await this.repo.findOne({
      where: { tenantId: dto.tenantId },
      order: { createdAt: 'DESC' },
    });

    // Hash chain for EU AI Act tamper-evidence: each trace hashes itself + previous hash
    const prevHash = lastTrace?.chainHash ?? '0';
    const chainInput = `${prevHash}:${dto.promptHash}:${dto.responseHash ?? ''}:${Date.now()}`;
    const chainHash = crypto.createHash('sha256').update(chainInput).digest('hex');

    const trace = this.repo.create({ ...dto, chainHash });
    return this.repo.save(trace);
  }

  async updateScores(
    traceId: string,
    scores: {
      hallucinationScore?: number;
      toxicityScore?: number;
      faithfulnessScore?: number;
    },
  ): Promise<void> {
    await this.repo.update(traceId, scores);
  }
}
