import * as crypto from 'crypto';
import { Repository } from 'typeorm';
import { Trace } from './trace.entity';

type CreateTraceDto = Partial<Trace>;

// EU AI Act Article 12 tamper-evidence: each trace hashes itself + the tenant's previous hash.
// The hash input must be fully reconstructable from persisted columns (prevHash, promptHash,
// responseHash, createdAt) so verifyHashChain can recompute — not just check presence — of
// each link. Callers must not pass `id`/`chainHash` in `dto`; both are assigned here.
function computeChainHash(prevHash: string, promptHash: string, responseHash: string, createdAt: Date): string {
  const chainInput = `${prevHash}:${promptHash}:${responseHash}:${createdAt.toISOString()}`;
  return crypto.createHash('sha256').update(chainInput).digest('hex');
}

export async function writeTraceWithChainHash(
  repo: Repository<Trace>,
  dto: CreateTraceDto,
): Promise<Trace> {
  const lastTrace = await repo.findOne({
    where: { tenantId: dto.tenantId },
    order: { createdAt: 'DESC' },
  });

  const prevHash = lastTrace?.chainHash ?? '0';
  const createdAt = new Date();
  const chainHash = computeChainHash(prevHash, dto.promptHash ?? '', dto.responseHash ?? '', createdAt);

  const trace = repo.create({ ...dto, createdAt, chainHash });
  return repo.save(trace);
}

export interface HashChainVerification {
  verified: boolean;
  totalTraces: number;
  brokenAt: string | null; // id of the first trace whose chainHash doesn't recompute, if any
}

// Recomputes each trace's chainHash from (prevHash, promptHash, responseHash, createdAt) and
// compares against the stored value — a missing or unrelated non-empty chainHash no longer
// passes. `traces` must be the tenant's full trace history in ascending createdAt order,
// otherwise prevHash linkage can't be reconstructed and this returns `verified: false`.
export function verifyHashChain(traces: Trace[]): HashChainVerification {
  let prevHash = '0';
  for (const t of traces) {
    const expected = computeChainHash(prevHash, t.promptHash ?? '', t.responseHash ?? '', t.createdAt);
    if (t.chainHash !== expected) {
      return { verified: false, totalTraces: traces.length, brokenAt: t.id };
    }
    prevHash = t.chainHash;
  }
  return { verified: true, totalTraces: traces.length, brokenAt: null };
}
