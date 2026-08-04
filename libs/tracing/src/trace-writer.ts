import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { Trace } from './trace.entity';

type CreateTraceDto = Partial<Trace>;

// EU AI Act Article 12 tamper-evidence: each trace hashes itself + the tenant's previous hash
export async function writeTraceWithChainHash(
  repo: Repository<Trace>,
  dto: CreateTraceDto,
): Promise<Trace> {
  const lastTrace = await repo.findOne({
    where: { tenantId: dto.tenantId },
    order: { createdAt: 'DESC' },
  });

  const prevHash = lastTrace?.chainHash ?? '0';
  const chainInput = `${prevHash}:${dto.promptHash}:${dto.responseHash ?? ''}:${Date.now()}`;
  const chainHash = crypto.createHash('sha256').update(chainInput).digest('hex');

  const trace = repo.create({ ...dto, chainHash });
  return repo.save(trace);
}

export function verifyHashChain(traces: Trace[]): { verified: boolean; totalTraces: number } {
  const allHaveHash = traces.every((t) => !!t.chainHash);
  return { verified: allHaveHash, totalTraces: traces.length };
}
