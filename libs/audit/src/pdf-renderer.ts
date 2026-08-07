import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from 'pdf-lib';
import { AuditReport } from './report-generator';

const PAGE_MARGIN = 50;
const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4

class PageCursor {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.page = doc.addPage(PAGE_SIZE);
    this.y = PAGE_SIZE[1] - PAGE_MARGIN;
  }

  private ensureSpace(lineHeight: number): void {
    if (this.y - lineHeight < PAGE_MARGIN) {
      this.page = this.doc.addPage(PAGE_SIZE);
      this.y = PAGE_SIZE[1] - PAGE_MARGIN;
    }
  }

  heading(text: string, size = 16): void {
    this.ensureSpace(size + 12);
    this.page.drawText(text, { x: PAGE_MARGIN, y: this.y, size, font: this.bold, color: rgb(0.1, 0.1, 0.1) });
    this.y -= size + 12;
  }

  subheading(text: string, size = 12): void {
    this.ensureSpace(size + 10);
    this.page.drawText(text, { x: PAGE_MARGIN, y: this.y, size, font: this.bold, color: rgb(0.2, 0.2, 0.2) });
    this.y -= size + 10;
  }

  line(text: string, size = 10): void {
    this.ensureSpace(size + 6);
    this.page.drawText(text, { x: PAGE_MARGIN, y: this.y, size, font: this.regular, color: rgb(0.15, 0.15, 0.15) });
    this.y -= size + 6;
  }

  spacer(height = 10): void {
    this.y -= height;
  }
}

export async function renderAuditReportPdf(report: AuditReport): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cursor = new PageCursor(doc, regular, bold);

  cursor.heading('LLM Sentinel — Audit Report');
  cursor.line(`Standard: ${report.meta.standard}`);
  cursor.line(`Tenant: ${report.meta.tenantId}`);
  cursor.line(`Period: ${report.meta.period.from} to ${report.meta.period.to}`);
  cursor.line(`Generated: ${report.meta.generatedAt}`);
  cursor.spacer(14);

  cursor.subheading('Summary');
  const s = report.summary;
  cursor.line(`Total requests: ${s.totalRequests}`);
  cursor.line(`Blocked requests: ${s.blockedRequests}`);
  cursor.line(`PII incidents: ${s.piiIncidents}`);
  cursor.line(`Injection attempts: ${s.injectionAttempts}`);
  cursor.line(`Total cost (USD): ${s.totalCostUsd}`);
  cursor.line(`Avg latency (ms): ${s.avgLatencyMs}`);
  cursor.line(`Avg hallucination score: ${s.avgHallucinationScore}`);
  cursor.line(`Avg toxicity score: ${s.avgToxicityScore}`);
  cursor.line(`Avg faithfulness score: ${s.avgFaithfulnessScore}`);
  cursor.spacer(14);

  cursor.subheading('Hash Chain Integrity (EU AI Act Article 12 Tamper-Evidence)');
  cursor.line(`Verified: ${report.hashChainIntegrity.verified ? 'YES' : 'NO'}`);
  cursor.line(`Total traces in chain: ${report.hashChainIntegrity.totalTraces}`);
  if (!report.hashChainIntegrity.verified) {
    cursor.line(`Chain broken at trace: ${report.hashChainIntegrity.brokenAt}`);
  }
  cursor.spacer(14);

  cursor.subheading('Policy Violations');
  if (report.policyViolations.length === 0) {
    cursor.line('No policy violations in this period.');
  } else {
    for (const v of report.policyViolations) {
      cursor.line(`${v.violation}: ${v.count}`);
    }
  }
  cursor.spacer(14);

  cursor.subheading(`Trace Log (${report.traces.length} traces)`);
  for (const t of report.traces) {
    cursor.line(
      `${t.createdAt}  ${t.model}/${t.provider}  blocked=${t.blocked}  pii=${t.piiDetected}  injection=${t.injectionDetected}  cost=$${t.costUsd}`,
      8,
    );
  }

  return doc.save();
}
