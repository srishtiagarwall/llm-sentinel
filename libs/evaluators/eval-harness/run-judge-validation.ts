// Standalone judge-validation run: calls the real Gemini-as-judge evaluators
// against the hand-labeled dataset in labeled-dataset.ts and reports how well
// the judge tracks a human's own scores. Makes real Gemini API calls — needs
// GEMINI_API_KEY set. Not part of `npm test` (network-dependent, costs
// tokens); run manually or from the "eval-harness" CI job (see
// .github/workflows/ci.yml), which is allowed to fail without blocking PRs.
//
// Usage: GEMINI_API_KEY=... npx ts-node eval-harness/run-judge-validation.ts
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { GeminiJudge } from '../src/gemini-judge';
import { HallucinationEvaluator } from '../src/hallucination.evaluator';
import { ToxicityEvaluator } from '../src/toxicity.evaluator';
import { FaithfulnessEvaluator } from '../src/faithfulness.evaluator';
import { hallucinationCases, toxicityCases, faithfulnessCases } from './labeled-dataset';

// A judge score within this distance of the human label counts as "agreeing."
// 0-1 continuous scores from an LLM judge are inherently noisy (see
// docs/adr/0002-llm-judge-validation.md); this is a looser bar than an exact
// match on purpose — it flags real judge failures without flagging normal
// scoring jitter.
const AGREEMENT_TOLERANCE = 0.25;

interface CaseResult {
  id: string;
  expected: number;
  actual: number;
  diff: number;
  agrees: boolean;
  note: string;
}

function report(evaluatorName: string, results: CaseResult[]): void {
  const agreeing = results.filter((r) => r.agrees).length;
  const meanAbsError = results.reduce((sum, r) => sum + r.diff, 0) / results.length;

  console.log(`\n=== ${evaluatorName} ===`);
  for (const r of results) {
    const flag = r.agrees ? 'OK  ' : 'MISS';
    console.log(
      `  [${flag}] ${r.id}: expected=${r.expected.toFixed(2)} actual=${r.actual.toFixed(2)} diff=${r.diff.toFixed(2)} — ${r.note}`,
    );
  }
  console.log(
    `  Agreement: ${agreeing}/${results.length} (${((agreeing / results.length) * 100).toFixed(0)}%) | Mean abs error: ${meanAbsError.toFixed(3)}`,
  );
}

async function main() {
  const config = new ConfigService({ GEMINI_API_KEY: process.env.GEMINI_API_KEY });
  const judge = new GeminiJudge(config);

  const hallucination = new HallucinationEvaluator(judge);
  const hallucinationResults: CaseResult[] = [];
  for (const c of hallucinationCases) {
    const actual = await hallucination.evaluate(c.prompt, c.response);
    const diff = Math.abs(actual - c.expected);
    hallucinationResults.push({ id: c.id, expected: c.expected, actual, diff, agrees: diff <= AGREEMENT_TOLERANCE, note: c.note });
  }
  report('Hallucination Evaluator', hallucinationResults);

  const toxicity = new ToxicityEvaluator(judge);
  const toxicityResults: CaseResult[] = [];
  for (const c of toxicityCases) {
    const actual = await toxicity.evaluate(c.response);
    const diff = Math.abs(actual - c.expected);
    toxicityResults.push({ id: c.id, expected: c.expected, actual, diff, agrees: diff <= AGREEMENT_TOLERANCE, note: c.note });
  }
  report('Toxicity Evaluator', toxicityResults);

  const faithfulness = new FaithfulnessEvaluator(judge);
  const faithfulnessResults: CaseResult[] = [];
  for (const c of faithfulnessCases) {
    const actual = await faithfulness.evaluate(c.prompt, c.response);
    const diff = Math.abs(actual - c.expected);
    faithfulnessResults.push({ id: c.id, expected: c.expected, actual, diff, agrees: diff <= AGREEMENT_TOLERANCE, note: c.note });
  }
  report('Faithfulness Evaluator', faithfulnessResults);

  const all = [...hallucinationResults, ...toxicityResults, ...faithfulnessResults];
  const totalAgreeing = all.filter((r) => r.agrees).length;
  console.log(
    `\n=== Overall: ${totalAgreeing}/${all.length} (${((totalAgreeing / all.length) * 100).toFixed(0)}%) judge-vs-human agreement, tolerance ±${AGREEMENT_TOLERANCE} ===\n`,
  );
}

main().catch((err) => {
  console.error('Judge validation run failed:', err);
  process.exit(1);
});
