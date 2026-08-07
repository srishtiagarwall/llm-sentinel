# ADR 0002: LLM-as-judge validation approach and its limits

## Status
Accepted (lightweight validation in place, documented as non-rigorous)

## Context
`libs/evaluators` scores every trace's hallucination, toxicity, and faithfulness
using `GeminiJudge` (`libs/evaluators/src/gemini-judge.ts`) — a single call to
Gemini 2.5 Flash per dimension, asked to return a 0-1 float. This is the same
"LLM-as-judge" pattern used across the industry (Braintrust, Confident AI/DeepEval,
and others), and it has well-documented reliability problems:

- **Position/verbosity/self-enhancement bias** — judges can be swayed by answer
  ordering, response length, or a preference for outputs that resemble their own
  style, independent of actual quality.
- **No ground truth for hallucination scoring.** `HallucinationEvaluator.evaluate`
  (`libs/evaluators/src/hallucination.evaluator.ts`) compares the response only
  against the original prompt — there's no retrieved/source document to check claims
  against. A response can be internally consistent and confidently wrong, and the
  judge has no way to catch that without external grounding.
- **Same model family judging its own category of content.** The judge and (in a
  real deployment) the models being evaluated may both be Gemini. This isn't a
  security bypass concern the way it is for guardrails (see ADR 0003), but it's a
  known source of correlated bias — a judge can be systematically lenient or harsh in
  ways that track the model family's own tendencies rather than the actual quality
  of the response.
- **Fixed 0.5 fallback on judge failure.** `GeminiJudge.score()` catches any API
  error and returns `0.5` (a neutral score) rather than surfacing the failure. This
  is a deliberate choice — an eval-pipeline outage shouldn't block or corrupt the
  trace — but it means a spike in judge API errors is invisible in the score data
  itself; it would need to be caught via API error logs/metrics, not via score
  trends.

## What's in place
`libs/evaluators/eval-harness/` contains a small hand-labeled dataset
(`labeled-dataset.ts`, 13 cases across all three evaluators) and a runner
(`run-judge-validation.ts`) that calls the real evaluators against it and reports
judge-vs-human agreement within a ±0.25 tolerance. Latest run: **11/13 (85%)
agreement** — see `eval-harness/RESULTS.md` for the full breakdown, including the two
specific misses and why they happened.

This is checked in and runnable (`npm run validate-judge -w @llm-sentinel/evaluators`,
needs `GEMINI_API_KEY`), and wired as an allowed-to-fail CI job (see
`.github/workflows/ci.yml`) so a judge-prompt change that regresses agreement is
visible without blocking every PR on a network-dependent, token-costing call.

## What this does NOT prove
- **13 examples is not a statistically powered sample.** It catches gross
  regressions (e.g. a prompt-template edit that breaks JSON parsing, or a change that
  flips scoring direction) — it does not establish a confidence interval on judge
  accuracy in general.
- **Single-rater labels.** The `expected` scores in `labeled-dataset.ts` are one
  person's judgment, not an inter-rater-agreement-checked consensus. A production
  version would need multiple independent human raters per example and would report
  human-vs-human agreement as a baseline to compare judge-vs-human agreement against
  (if humans only agree with each other 80% of the time on a fuzzy dimension like
  "faithfulness," 85% judge agreement isn't actually below the noise floor).
- **One run, one judge model, one point in time.** Model updates on Gemini's side can
  silently shift scoring behavior; there's no scheduled re-run or drift alerting.

## What a production-grade version would add
1. A larger dataset (100+ examples per dimension), stratified across difficulty
   (clear-cut cases and genuinely ambiguous ones).
2. Multiple human raters per example, with inter-rater agreement reported alongside
   judge agreement, so "85%" has a baseline to be judged against.
3. Scheduled re-runs (e.g. weekly) with the results tracked over time, alerting on a
   meaningful drop rather than only checking at prompt-change time.
4. For hallucination specifically: retrieved source documents to ground claims
   against, rather than judging groundedness from the prompt alone.

## Consequences
The 85% number is real and checked in, not claimed. It's explicitly scoped as a
regression guard and an honest starting point, not a statistical validation — the gap
to a rigorous version is documented above rather than left implicit.
