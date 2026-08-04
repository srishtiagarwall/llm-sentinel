import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trace, writeTraceWithChainHash } from '@llm-sentinel/tracing';

type CreateTraceDto = Partial<Trace>;

@Injectable()
export class TraceService {
  constructor(
    @InjectRepository(Trace)
    private readonly repo: Repository<Trace>,
  ) {}

  async save(dto: CreateTraceDto): Promise<Trace> {
    return writeTraceWithChainHash(this.repo, dto);
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
