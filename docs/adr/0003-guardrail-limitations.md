# ADR 0003: Pre-LLM guardrails are pattern-based and have known, documented bypasses

## Status
Accepted (documented limitation, layered mitigation planned but not built)

## Context
`libs/guardrails`'s `scanForPii` and `scanForInjection`
(`libs/guardrails/src/pii-detector.ts`, `libs/guardrails/src/injection-scanner.ts`)
are both regex/keyword pattern-matchers. This is a deliberate, reasonable choice for
the hot path — dependency-free, sub-millisecond, no external API call, no added
latency or cost on every request. It is also, by construction, defeatable by anyone
who knows the patterns being matched.

Published research against commercial pattern/classifier-based guardrails (Azure
Prompt Shield, Meta Prompt Guard) shows adversarial bypass rates approaching 100%
using simple techniques: character-level obfuscation, spacing insertion, encoding,
and synonym substitution. This isn't a flaw specific to this implementation — it's
the general failure mode of any guardrail that pattern-matches literal text.

## What's documented
`libs/guardrails/src/adversarial.spec.ts` is a checked-in, currently-passing test
file that asserts the *actual* (bypassed) behavior of both scanners against known
technique classes:

- **PII detector bypasses**: inserted spacing (`jane . doe @ example . com`),
  non-standard separators in an SSN, mixed separators in a credit card number,
  PII spelled out in prose instead of a matching numeric/format pattern.
- **Injection scanner bypasses**: synonym substitution (`disregard` vs. `ignore`),
  whitespace/newline injection splitting a matched phrase, base64-encoded payloads,
  hypothetical/roleplay framing.

These tests exist specifically so the guardrails' blind spots are asserted and
visible in CI, not silently true and undiscovered. A regex improvement that closes
one of these gaps should also flip its corresponding test from "BYPASSED" to
failing — that failure is the desired outcome and the test should then be rewritten
to assert the fix, not skipped.

## Why the fix isn't "write a better regex"
Every technique in `adversarial.spec.ts` can be patched individually (add a
whitespace-tolerant regex, decode base64 before scanning, expand the synonym list),
but pattern-matching is fundamentally chasing a combinatorially large space of
paraphrase and encoding — the research findings above describe this exact arms race
losing against a motivated adversary, commercial guardrails included.

## What a layered defense would add
1. **A second, independent classifier pass** — not a bigger regex, but a small
   model (or the eval-service's existing Gemini access, budget permitting) doing
   semantic classification on inputs the regex pass didn't flag, catching paraphrased
   attempts the literal patterns miss.
2. **Output-side scanning, not just input-side.** The current pipeline only scans the
   *prompt*. An injection that succeeds despite the input scanner would still show up
   in the response — a symmetric output-side scan (already partially covered by
   `ToxicityEvaluator` in the async eval pipeline, but that runs after the response is
   already returned to the client) would catch it, just not in time to block the
   response synchronously.
3. **Privilege separation between the classifier and the content generator** — per
   the "same model, different hat" research finding (a single crafted prompt can
   compromise both a generation model and a same-family safety judge
   simultaneously), an ideal guardrail classifier should not be the same model family
   as whatever's generating the traffic it's screening. This project's guardrails are
   pattern-based (not model-based) specifically on the input side, so this risk
   doesn't apply there — but it does apply to `libs/evaluators`' judge-based scoring,
   see ADR 0002.
4. **Rate-of-novel-pattern monitoring** — if a tenant's blocked-request rate suddenly
   drops for a category that historically triggers often, that's a weak signal
   they've found a bypass, worth alerting on even without knowing which technique.

None of these are implemented; this ADR exists so the gap is a documented, known
tradeoff rather than an implicit assumption that pattern-matching is sufficient.

## Consequences
- The guardrail layer should be described (in interviews, in docs) as "a fast,
  cheap first filter," not as a security boundary on its own.
- `adversarial.spec.ts` is a living document — new bypass techniques discovered
  later should be added there before being fixed, so the before/after is visible in
  git history.
