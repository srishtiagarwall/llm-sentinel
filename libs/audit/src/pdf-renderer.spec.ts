import { PDFDocument } from 'pdf-lib';
import { renderAuditReportPdf } from './pdf-renderer';
import { AuditReport } from './report-generator';

function makeReport(traceCount = 2): AuditReport {
  return {
    meta: {
      tenantId: 't1',
      generatedAt: new Date().toISOString(),
      period: { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
      standard: 'EU AI Act Article 12',
    },
    summary: {
      totalRequests: traceCount,
      blockedRequests: 1,
      piiIncidents: 1,
      injectionAttempts: 0,
      totalCostUsd: 0.0042,
      avgLatencyMs: 320,
      avgHallucinationScore: 0.92,
      avgToxicityScore: 0.99,
      avgFaithfulnessScore: 0.87,
    },
    policyViolations: [{ violation: 'PII_TO_EXTERNAL_PROVIDER:EMAIL', count: 1 }],
    hashChainIntegrity: { verified: true, totalTraces: traceCount },
    traces: Array.from({ length: traceCount }, (_, i) => ({
      id: `trace-${i}`,
      createdAt: new Date().toISOString(),
      model: 'gpt-4o',
      provider: 'openai',
      blocked: i === 0,
      piiDetected: i === 0,
      injectionDetected: false,
      hallucinationScore: 0.9,
      toxicityScore: 0.99,
      faithfulnessScore: 0.85,
      costUsd: 0.0021,
      chainHash: `hash-${i}`,
    })),
  };
}

describe('renderAuditReportPdf', () => {
  it('produces a valid PDF byte stream', async () => {
    const bytes = await renderAuditReportPdf(makeReport());
    expect(bytes.length).toBeGreaterThan(0);
    const header = Buffer.from(bytes.slice(0, 5)).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('paginates when the trace log is long enough to overflow a page', async () => {
    const bytes = await renderAuditReportPdf(makeReport(200));
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBeGreaterThan(1);
  });
});
