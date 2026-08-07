import * as zlib from 'zlib';
import { PDFDocument, PDFName, PDFRawStream, PDFArray, PDFRef } from 'pdf-lib';
import { renderAuditReportPdf } from './pdf-renderer';
import { AuditReport } from './report-generator';

function makeReport(traceCount = 2, overrides: Partial<AuditReport> = {}): AuditReport {
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
    hashChainIntegrity: { verified: true, totalTraces: traceCount, brokenAt: null },
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
    ...overrides,
  };
}

// pdf-lib has no built-in text extraction. Content streams draw text via Tj/TJ operators
// with the literal string in parentheses, so a plain regex pull is enough to assert
// "this string was actually drawn on the page" without adding a new dependency.
function decodeStream(stream: PDFRawStream): string {
  let raw = stream.contents;
  const filter = stream.dict.get(PDFName.of('Filter'));
  if (filter && filter.toString() === '/FlateDecode') {
    raw = zlib.inflateSync(Buffer.from(raw));
  }
  return Buffer.from(raw).toString('latin1');
}

async function extractText(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  let all = '';
  for (const page of doc.getPages()) {
    const contentsRef = page.node.get(PDFName.of('Contents'));
    const contents = doc.context.lookup(contentsRef);
    const streams: PDFRawStream[] = [];
    if (contents instanceof PDFRawStream) {
      streams.push(contents);
    } else if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const entry = contents.get(i);
        const resolved = entry instanceof PDFRef ? doc.context.lookup(entry) : entry;
        if (resolved instanceof PDFRawStream) streams.push(resolved);
      }
    }
    for (const stream of streams) {
      const content = decodeStream(stream);
      // pdf-lib's WinAnsi-encoded drawText emits hex strings, e.g. <48656C6C6F> Tj
      for (const match of content.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
        all += Buffer.from(match[1], 'hex').toString('latin1') + '\n';
      }
    }
  }
  return all;
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

  it('renders the tenant id, standard, and summary figures as actual page text', async () => {
    const bytes = await renderAuditReportPdf(makeReport(1));
    const text = await extractText(bytes);

    expect(text).toContain('t1');
    expect(text).toContain('EU AI Act Article 12');
    expect(text).toContain('0.0042');
    expect(text).toContain('320');
  });

  it('renders each policy violation and its count as text', async () => {
    const bytes = await renderAuditReportPdf(
      makeReport(1, { policyViolations: [{ violation: 'PROMPT_INJECTION:jailbreak_dan', count: 3 }] }),
    );
    const text = await extractText(bytes);
    expect(text).toContain('PROMPT_INJECTION:jailbreak_dan');
    expect(text).toContain('3');
  });

  it('renders a "no violations" line when policyViolations is empty', async () => {
    const bytes = await renderAuditReportPdf(makeReport(1, { policyViolations: [] }));
    const text = await extractText(bytes);
    expect(text).toContain('No policy violations in this period.');
  });

  it('renders a zero-trace report without crashing', async () => {
    const bytes = await renderAuditReportPdf(makeReport(0));
    const text = await extractText(bytes);
    expect(text).toContain('Trace Log (0 traces)');
  });

  it('renders "NO" and the broken trace id when the hash chain fails verification', async () => {
    const bytes = await renderAuditReportPdf(
      makeReport(1, { hashChainIntegrity: { verified: false, totalTraces: 5, brokenAt: 'trace-3' } }),
    );
    const text = await extractText(bytes);
    expect(text).toContain('NO');
    expect(text).toContain('trace-3');
  });

  it('does not include a broken-trace line when the hash chain verifies', async () => {
    const bytes = await renderAuditReportPdf(
      makeReport(1, { hashChainIntegrity: { verified: true, totalTraces: 5, brokenAt: null } }),
    );
    const text = await extractText(bytes);
    expect(text).not.toContain('Chain broken at trace');
  });

  it('renders a trace with a null score without crashing (per-trace lines do not print scores)', async () => {
    const report = makeReport(1);
    report.traces[0].hallucinationScore = null;
    const bytes = await renderAuditReportPdf(report);
    const text = await extractText(bytes);
    // per-trace lines only show model/provider/blocked/pii/injection/cost — scores aren't
    // interpolated there, so a null score can't corrupt the trace log line.
    expect(text).toContain('gpt-4o/openai');
  });
});
