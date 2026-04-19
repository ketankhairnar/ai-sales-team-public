# Drafted-stage M/C/A loop: mixed-outcome demo fix

**Date**: 2026-04-19
**Context**: Outtro (AI sales team demo)
**Status**: Fixed locally; Fly redeploy pending for server-side executor path

---

## Problem

During the Outtro demo walkthrough the `drafted` stage's Maker/Checker/Arbiter loop
was rejecting **100% of drafts**. The user observed:

> "we're still rejecting them"

This broke the demo narrative. The M/C/A loop is meant to be *visible* — some
drafts pass, some fail, and the audience sees the critique-and-revise flow in
action. A flat 100% reject rate makes the loop look broken (or worse, makes it
look like the Arbiter is just a rubber-stamp rejecter).

---

## Root causes

Three interacting bugs, each masking the others:

### 1. Hardcoded threshold in arbiter prompt

`prompts/arbiter.ts` had a hardcoded rule: `score<7 must reject`. The DSL's
`pass_threshold` config value was never threaded into the prompt, so the arbiter
always compared against 7 regardless of stage configuration.

See `prompts/arbiter.ts:20-32` (the `arbiterPrompt` template).

### 2. DSL threshold was meaningless (`pass_threshold: 1`)

`src/dsl/default-pipeline.ts` had `pass_threshold: 1` on the `drafted` stage.
Even if the prompt *had* read this value, a threshold of 1 means "anything
passes" — nothing would ever fail, so the whole loop is theatre.

### 3. Worker log lied on rejection

`scripts/worker.ts` had `doDrafted` call the outer-loop `submit()` only on
success, but its rejection path threw inside the try — which was fine — **except
the outer loop's success log `submitted ${c.claim_id}` would fire for the
`researched` stage then the drafted-stage throw would surface as a generic
"fail" without a clean rejection event.** The net effect: rejections looked like
silent noise rather than a deliberate `stage_reject`.

See `scripts/worker.ts:124-135` (the `doDrafted` rejection handling) and
`scripts/worker.ts:148-155` (outer try/catch with success log).

---

## Fixes

### `prompts/arbiter.ts` — thread threshold through

Added `passThreshold` to `ArbiterInput` and replaced the hardcoded `7` with a
template variable. Default still 7 if unspecified, so existing call sites are
safe.

```ts
export type ArbiterInput = {
  persona: PersonaDef
  makerOutput: unknown
  checkerResult: CheckerResult
  stage: string
  iteration: number
  maxIterations: number
  passThreshold?: number
}

export const arbiterPrompt = ({ ..., passThreshold }: ArbiterInput) => {
  const threshold = passThreshold ?? 7
  return `...
If iter>=${maxIterations} and score<${threshold}, must reject.
...`
}
```

### `src/mca-loop.ts` — pass `cfg.passThreshold` through

The checker call already received `passThreshold`; the arbiter call did not.
Added it:

```ts
const arbiterP_text = arbiterPrompt({
  persona: arbiterP, makerOutput: lastOutput, checkerResult: check,
  stage: cfg.stage, iteration: iter, maxIterations: max,
  passThreshold: cfg.passThreshold,
})
```

See `src/mca-loop.ts:97-101`.

### `src/dsl/default-pipeline.ts` — raise threshold to 5

```diff
-      pass_threshold: 1,
+      pass_threshold: 5,
```

Middle ground. Produces roughly 50/50 pass/reject on the current prospect mix,
which is what the demo needs.

See `src/dsl/default-pipeline.ts:46`.

### `scripts/worker.ts` — throw on rejection

`doDrafted` now throws on rejection so the outer loop's `fail()` path + "fail"
log fire correctly, instead of the misleading "submitted" log:

```ts
if ('rejected' in result) {
  throw new Error(`mca rejected: ${result.rejected}`)
}
await submit(c.prospect_id, c.claim_id, 'drafted', result.output)
```

See `scripts/worker.ts:132-135`.

---

## Demo tuning

The threshold dials how strict the Arbiter is on the final iteration.
**Checker and Arbiter now share the same threshold** (both read `passThreshold`
from MCAConfig), so their scoring stays consistent — no more "checker says 6/10
pass, arbiter says 6/10 reject" split-brain.

| Threshold | Behaviour                               | Use when                           |
|-----------|-----------------------------------------|------------------------------------|
| `3`       | Almost everything passes                | Wide-funnel demos, smoke test      |
| `5`       | ~50/50 pass/reject (current default)    | **Outtro demo — mixed outcomes**   |
| `7`       | Strict; most drafts fail at least once  | Quality-bar showcase, cherry-picked prospects |

To change the demo feel, edit `pass_threshold` on the `drafted` stage in
`src/dsl/default-pipeline.ts`. No redeploy needed locally — the worker reads the
DSL on startup.

---

## Verification steps

1. Restart the laptop worker:

   ```bash
   rtk proxy npx tsx scripts/worker.ts
   ```

2. Watch for both event kinds in the log, in mixed ratio:

   ```
   [worker][drafted] stage_pass iters=1
   [worker][drafted] stage_pass iters=2
   [worker][drafted] stage_reject <reason>
   [worker][drafted] stage_pass iters=1
   [worker][drafted] stage_reject <reason>
   ```

3. Confirm rejections now surface as `[worker] fail <claim_id>: mca rejected: ...`
   rather than being silently dropped after a bogus "submitted" line.

4. Sanity-check the Outtro UI: the `drafted` column should show some items
   advancing to `sent` and some parked — not all parked.

---

## Follow-ups

- **Fly deploy**: the same M/C/A loop also runs server-side via `executor.ts` on
  Fly. The local `prompts/arbiter.ts` fix needs to be deployed there to keep
  worker-executed and server-executed drafted stages consistent. Ship a deploy
  before the next demo that exercises the server path.
- **Audit for other hardcoded `7`s**: grep `prompts/` for the literal `7` — the
  same anti-pattern may exist in the checker prompt or elsewhere. If so, thread
  `passThreshold` through the same way.
- **Email enrichment still unresolved**: the upstream problem (Apollo paid vs
  Hunter vs demo-only mock data) is orthogonal to this fix but still blocks
  real sends. Pick a path before the next customer demo.
