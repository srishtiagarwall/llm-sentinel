import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Trace, writeTraceWithChainHash, notifyTraceEvent } from '@llm-sentinel/tracing';

type CreateTraceDto = Partial<Trace>;

@Injectable()
export class TraceService {
  constructor(
    @InjectRepository(Trace)
    private readonly repo: Repository<Trace>,
    private readonly http: HttpService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async save(dto: CreateTraceDto): Promise<Trace> {
    const trace = await writeTraceWithChainHash(this.repo, dto);

    const apiUrl = this.config.get<string>('API_SERVICE_URL') ?? 'http://localhost:3001';
    notifyTraceEvent(this.http, this.jwtService, apiUrl, trace.tenantId, trace.id).catch(() => {
      // notifyTraceEvent already logs internally — this catch only guards
      // against the fire-and-forget promise being unhandled.
    });

    return trace;
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
