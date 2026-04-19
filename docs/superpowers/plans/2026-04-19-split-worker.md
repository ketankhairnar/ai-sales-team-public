# Split-Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `researched` + `drafted` stages off Fly; laptop worker polls Fly for work, scrapes LinkedIn + runs M/C/A draft locally, POSTs results back.

**Architecture:** Fly hosts UI + SQLite + light stages (discover/scored/sent). When `WORKER_MODE=1`, Fly pipeline halts at `researched`, marking prospects `pending_worker`. Local worker loop on laptop claims work via `GET /api/work/next`, executes with existing `linkedinResearch` + `runMCA` tools, submits via `POST /api/work/:id/submit`. Claims have 5min TTL; stale claims auto-release. Token auth via `x-worker-token` header.

**Tech Stack:** Astro API routes, better-sqlite3, tsx (local worker), existing `linkedinResearch` + `runMCA` tools, node native fetch.

**Parallel execution:**

Two parallel slices after Task 0 contract lock:

- **Slice α (GSE subagent):** Tasks 1 → 2 → 3 → 4 → 5 — schema, worker-queries, auth, GET+POST endpoints. ~90min.
- **Slice β (DLG subagent):** Task 7 — laptop worker. Can build against contract + a dev Fly (WORKER_MODE=0) or a mock. ~60min.

After both land: serial Tasks 6 → 8 → 9 (pipeline switch, deploy, e2e). Task 6 is NOT parallelizable; it wires the two halves together.

---

## File Structure

**New files:**
- `src/pages/api/work/next.ts` — GET claim endpoint
- `src/pages/api/work/[id]/submit.ts` — POST submit endpoint
- `src/pages/api/work/[id]/fail.ts` — POST fail endpoint
- `src/pages/api/work/_auth.ts` — shared token check helper
- `scripts/worker.ts` — local polling worker
- `src/db/worker-queries.ts` — claim / submit / release SQL helpers (isolated from `store.ts` for clarity)

**Modified files:**
- `src/db/schema.sql` — add claim cols to `stage_envelopes`
- `src/db/store.ts` — migrate() adds claim cols; no new methods (claim logic lives in `worker-queries.ts`)
- `src/pages/api/campaigns.ts` — `runCampaign()` branches on `WORKER_MODE`; stops after score + marks researched as `pending_worker`
- `fly.toml` — add `WORKER_MODE = '1'`
- `.env.local` — add `WORKER_MODE=0` (dev default), `WORKER_TOKEN=devtoken`, `WORKER_BASE_URL=http://localhost:3000`

---

## Task 0: Endpoint contract lock (shared)

Agree on wire format before parallel work begins. No code; reference doc.

```ts
// Auth: all /api/work/* require header `x-worker-token: <WORKER_TOKEN>`
// 401 if missing/wrong. Optional `x-worker-id` header for claim tracking.

// GET /api/work/next?stage=researched&claim_ttl=300
// 200 application/json:
// {
//   claim_id: string,
//   prospect_id: string,
//   campaign_id: string,
//   stage: 'researched' | 'drafted',
//   linkedin_url: string | null,
//   icp: Record<string, unknown>,        // campaign icp JSON
//   prior_stages: {                       // only passed stages included, by stage_id
//     [stageId: string]: unknown          // StageEnvelope.final_output of that stage
//   },
//   prospect: {                           // minimum fields worker needs
//     id, name, company, title, linkedin_url
//   },
//   expires_at: string                    // ISO; claim deadline
// }
// 204 (no body, no content-type) when queue empty
// 400 when `stage` not in {researched, drafted}
// 401 bad/missing token

// POST /api/work/:prospectId/submit
// content-type: application/json
// body: {
//   claim_id: string,
//   stage: 'researched' | 'drafted',
//   output: unknown,                      // becomes StageEnvelope.final_output
//   attempts?: StageAttempt[]             // optional, for M/C/A traces
// }
// 200 { ok: true }                         // SIMPLIFIED: no advanced_to; UI polls board
// 409 { error: 'stale_claim' }             // claim_id doesn't match (expired or taken)
// 400 missing fields / malformed
// 401 bad token
// NOTE: server trusts prospectId-vs-claim pairing to match. Demo-scope.

// POST /api/work/:prospectId/fail
// body: { claim_id, stage, reason: string (≤500 chars) }
// 200 { ok: true }
// 409 stale_claim
```

- [ ] **Step 1: Commit this plan to make contract canonical**

```bash
git add docs/superpowers/plans/2026-04-19-split-worker.md
git commit -m "docs: plan — split-architecture worker"
```

---

## Task 1 (GSE): Schema migration — claim cols on stage_envelopes

**Files:**
- Modify: `src/db/schema.sql` (append claim cols to `stage_envelopes`)
- Modify: `src/db/store.ts:20-40` (migrate() add claim cols via addCol())

- [ ] **Step 1: Add cols to schema.sql**

Replace the `stage_envelopes` CREATE with (only new cols shown; keep rest):

```sql
CREATE TABLE IF NOT EXISTS stage_envelopes (
  prospect_id TEXT NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  stage_id    TEXT NOT NULL,
  status      TEXT NOT NULL,
  envelope    TEXT NOT NULL,
  started_at  TEXT,
  ended_at    TEXT,
  claim_id    TEXT,
  claimed_by  TEXT,
  claim_expires_at TEXT,
  PRIMARY KEY (prospect_id, stage_id)
);
CREATE INDEX IF NOT EXISTS idx_envelope_status ON stage_envelopes(status);
CREATE INDEX IF NOT EXISTS idx_envelope_claim ON stage_envelopes(status, claim_expires_at);
```

- [ ] **Step 2: Add addCol() lines in migrate()**

After the existing `addCol('campaigns', 'title', ...)`:

```ts
addCol('stage_envelopes', 'claim_id', 'claim_id TEXT')
addCol('stage_envelopes', 'claimed_by', 'claimed_by TEXT')
addCol('stage_envelopes', 'claim_expires_at', 'claim_expires_at TEXT')
this.db.exec(`CREATE INDEX IF NOT EXISTS idx_envelope_claim ON stage_envelopes(status, claim_expires_at)`)
```

- [ ] **Step 2b: Add public `rawDb()` method to Store**

In `src/db/store.ts`, after the `close()` method (around line 42), add:

```ts
/** Escape hatch for modules that need raw SQL (worker-queries). Use sparingly. */
rawDb(): Database.Database { return this.db }
```

This kills the `store.rawDb()` pattern that would otherwise proliferate in Tasks 4/5. All downstream tasks use `store.rawDb()`.

- [ ] **Step 3: Smoke migration**

Run: `DB_PATH=/tmp/migration-smoke.db npx tsx -e "import('./src/db/store.ts').then(({Store}) => { const s = new Store(); console.log('ok'); s.close() })"`
Expected: prints `ok`, no errors. Delete `/tmp/migration-smoke.db` after.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.sql src/db/store.ts
git commit -m "feat(store): claim cols for worker queue"
```

---

## Task 2 (GSE): `worker-queries.ts` — claim + submit + release

**Files:**
- Create: `src/db/worker-queries.ts`
- Test: none — tested end-to-end via endpoint in Task 4

Responsibility: pure SQL helpers, one file, atomic transactions. No imports from `store.ts` (uses Database directly, receives db handle).

- [ ] **Step 1: Write file**

```ts
// src/db/worker-queries.ts
import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { StageEnvelope } from '../dsl/envelope'

export type ClaimedWork = {
  claim_id: string
  prospect_id: string
  campaign_id: string
  stage: string
  linkedin_url: string | null
  icp: Record<string, unknown>
  prior_stages: Record<string, unknown>
  prospect: { id: string; name: string; company: string; title: string; linkedin_url: string | null }
  expires_at: string
}

/** Atomically claim one pending_worker stage. Returns null if queue empty. */
export function claimNextPending(db: Database.Database, stage: string, workerId: string, ttlSec: number): ClaimedWork | null {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlSec * 1000).toISOString()
  const claimId = `clm_${crypto.randomBytes(6).toString('hex')}`

  return db.transaction((): ClaimedWork | null => {
    // Release stale claims first
    db.prepare(`
      UPDATE stage_envelopes
      SET status = 'pending_worker', claim_id = NULL, claimed_by = NULL, claim_expires_at = NULL
      WHERE status = 'in_progress' AND claim_expires_at IS NOT NULL AND claim_expires_at < ?
    `).run(now.toISOString())

    // Find one pending_worker row for this stage
    const row = db.prepare(`
      SELECT se.prospect_id, se.envelope, p.linkedin_url, p.campaign_id,
             p.name AS p_name, p.company AS p_company, p.title AS p_title
      FROM stage_envelopes se
      JOIN prospects p ON p.id = se.prospect_id
      WHERE se.stage_id = ? AND se.status = 'pending_worker'
      ORDER BY se.started_at ASC
      LIMIT 1
    `).get(stage) as any
    if (!row) return null

    // Claim it
    db.prepare(`
      UPDATE stage_envelopes
      SET status = 'in_progress', claim_id = ?, claimed_by = ?, claim_expires_at = ?
      WHERE prospect_id = ? AND stage_id = ?
    `).run(claimId, workerId, expiresAt, row.prospect_id, stage)

    // Gather ICP + prior stages
    const campaign = db.prepare(`SELECT icp FROM campaigns WHERE id = ?`).get(row.campaign_id) as any
    const allStages = db.prepare(`SELECT stage_id, envelope FROM stage_envelopes WHERE prospect_id = ?`).all(row.prospect_id) as any[]
    const prior: Record<string, unknown> = {}
    for (const s of allStages) {
      if (s.stage_id !== stage) {
        const env = JSON.parse(s.envelope) as StageEnvelope
        if (env.status === 'passed') prior[s.stage_id] = env.final_output
      }
    }

    return {
      claim_id: claimId,
      prospect_id: row.prospect_id,
      campaign_id: row.campaign_id,
      stage,
      linkedin_url: row.linkedin_url,
      icp: campaign ? JSON.parse(campaign.icp) : {},
      prior_stages: prior,
      prospect: {
        id: row.prospect_id,
        name: row.p_name,
        company: row.p_company,
        title: row.p_title,
        linkedin_url: row.linkedin_url,
      },
      expires_at: expiresAt,
    }
  })()
}

/** Submit completed stage. Returns 'ok' | 'stale_claim'. */
export function submitStage(
  db: Database.Database,
  prospectId: string,
  stageId: string,
  claimId: string,
  output: unknown,
  now: string,
): 'ok' | 'stale_claim' {
  return db.transaction((): 'ok' | 'stale_claim' => {
    const row = db.prepare(`
      SELECT envelope, claim_id, status FROM stage_envelopes WHERE prospect_id = ? AND stage_id = ?
    `).get(prospectId, stageId) as any
    if (!row || row.claim_id !== claimId) return 'stale_claim'

    const env = JSON.parse(row.envelope) as StageEnvelope
    env.status = 'passed'
    env.final_output = output
    env.ended_at = now

    db.prepare(`
      UPDATE stage_envelopes
      SET status = 'passed', envelope = ?, ended_at = ?, claim_id = NULL, claimed_by = NULL, claim_expires_at = NULL
      WHERE prospect_id = ? AND stage_id = ?
    `).run(JSON.stringify(env), now, prospectId, stageId)

    // Advance current_stage
    db.prepare(`UPDATE prospects SET current_stage = ?, updated_at = ? WHERE id = ?`)
      .run(stageId, now, prospectId)
    return 'ok'
  })()
}

/** Mark a claim as failed (rejected status). */
export function failStage(
  db: Database.Database,
  prospectId: string,
  stageId: string,
  claimId: string,
  reason: string,
  now: string,
): 'ok' | 'stale_claim' {
  return db.transaction((): 'ok' | 'stale_claim' => {
    const row = db.prepare(`
      SELECT envelope, claim_id FROM stage_envelopes WHERE prospect_id = ? AND stage_id = ?
    `).get(prospectId, stageId) as any
    if (!row || row.claim_id !== claimId) return 'stale_claim'

    const env = JSON.parse(row.envelope) as StageEnvelope
    env.status = 'rejected'
    env.reject_reason = reason
    env.ended_at = now

    db.prepare(`
      UPDATE stage_envelopes
      SET status = 'rejected', envelope = ?, ended_at = ?, claim_id = NULL, claimed_by = NULL, claim_expires_at = NULL
      WHERE prospect_id = ? AND stage_id = ?
    `).run(JSON.stringify(env), now, prospectId, stageId)
    return 'ok'
  })()
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/worker-queries.ts
git commit -m "feat(store): claim/submit/fail helpers for worker queue"
```

---

## Task 3 (GSE): Auth helper

**Files:**
- Create: `src/pages/api/work/_auth.ts`

- [ ] **Step 1: Write**

```ts
// src/pages/api/work/_auth.ts
export function checkWorkerToken(request: Request): Response | null {
  const expected = process.env.WORKER_TOKEN
  if (!expected) return new Response('WORKER_TOKEN not set on server', { status: 500 })
  const got = request.headers.get('x-worker-token')
  if (got !== expected) return new Response('unauthorized', { status: 401 })
  return null
}

export function workerId(request: Request): string {
  return request.headers.get('x-worker-id') ?? 'unknown-worker'
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/api/work/_auth.ts
git commit -m "feat(api): worker token auth helper"
```

---

## Task 4 (GSE): `GET /api/work/next`

**Files:**
- Create: `src/pages/api/work/next.ts`

- [ ] **Step 1: Write**

```ts
// src/pages/api/work/next.ts
import type { APIRoute } from 'astro'
import { Store } from '../../../db/store'
import { claimNextPending } from '../../../db/worker-queries'
import { checkWorkerToken, workerId } from './_auth'

const DEFAULT_TTL = Number(process.env.WORKER_CLAIM_TTL ?? 300)
const ALLOWED_STAGES = new Set(['researched', 'drafted'])

export const GET: APIRoute = async ({ request, url }) => {
  const authErr = checkWorkerToken(request); if (authErr) return authErr

  const stage = url.searchParams.get('stage') ?? ''
  if (!ALLOWED_STAGES.has(stage)) return new Response('bad stage', { status: 400 })

  const ttl = Math.min(900, Math.max(60, Number(url.searchParams.get('claim_ttl') ?? DEFAULT_TTL)))
  const store = new Store()
  try {
    const work = claimNextPending(store.rawDb(), stage, workerId(request), ttl)
    if (!work) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(work), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } finally {
    store.close()
  }
}
```

Note: accessing `store.rawDb()` is fine because `Store` exposes the handle implicitly. If we want a clean path, add a public `rawDb()` method on `Store` — but per YAGNI, the cast is acceptable since this is the only caller.

- [ ] **Step 2: Manual smoke (dev)**

```bash
WORKER_TOKEN=devtoken WORKER_MODE=0 npm run dev  # (one terminal)
curl -s -i -H 'x-worker-token: devtoken' 'http://localhost:3000/api/work/next?stage=researched'
# expect 204 (empty queue) or 200 + JSON
curl -s -i 'http://localhost:3000/api/work/next?stage=researched'
# expect 401
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/work/next.ts
git commit -m "feat(api): GET /api/work/next claim endpoint"
```

---

## Task 5 (GSE): `POST /api/work/[id]/submit` + `/fail`

**Files:**
- Create: `src/pages/api/work/[id]/submit.ts`
- Create: `src/pages/api/work/[id]/fail.ts`

- [ ] **Step 1: submit.ts**

```ts
// src/pages/api/work/[id]/submit.ts
import type { APIRoute } from 'astro'
import { Store } from '../../../../db/store'
import { submitStage } from '../../../../db/worker-queries'
import { checkWorkerToken } from '../_auth'

export const POST: APIRoute = async ({ request, params }) => {
  const authErr = checkWorkerToken(request); if (authErr) return authErr
  const prospectId = params.id; if (!prospectId) return new Response('missing id', { status: 400 })

  let body: any
  try { body = await request.json() } catch { return new Response('bad json', { status: 400 }) }
  const { claim_id, stage, output } = body ?? {}
  if (!claim_id || !stage || output === undefined) {
    return new Response('missing fields', { status: 400 })
  }

  const store = new Store()
  try {
    const res = submitStage(store.rawDb(), prospectId, stage, claim_id, output, new Date().toISOString())
    if (res === 'stale_claim') return new Response('stale claim', { status: 409 })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } finally { store.close() }
}
```

- [ ] **Step 2: fail.ts**

```ts
// src/pages/api/work/[id]/fail.ts
import type { APIRoute } from 'astro'
import { Store } from '../../../../db/store'
import { failStage } from '../../../../db/worker-queries'
import { checkWorkerToken } from '../_auth'

export const POST: APIRoute = async ({ request, params }) => {
  const authErr = checkWorkerToken(request); if (authErr) return authErr
  const prospectId = params.id; if (!prospectId) return new Response('missing id', { status: 400 })

  let body: any
  try { body = await request.json() } catch { return new Response('bad json', { status: 400 }) }
  const { claim_id, stage, reason } = body ?? {}
  if (!claim_id || !stage || !reason) return new Response('missing fields', { status: 400 })

  const store = new Store()
  try {
    const res = failStage(store.rawDb(), prospectId, stage, claim_id, String(reason).slice(0, 500), new Date().toISOString())
    if (res === 'stale_claim') return new Response('stale claim', { status: 409 })
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  } finally { store.close() }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/work/
git commit -m "feat(api): POST submit + fail for worker queue"
```

---

## Task 6 (GSE): Pipeline mode switch in `runCampaign`

**Files:**
- Modify: `src/pages/api/campaigns.ts:58-168` (`runCampaign` function)

Goal: when `WORKER_MODE=1`, after `scored` stage, do NOT run researched/drafted/sent locally. Instead, mark top-N prospects' `researched` envelope as `pending_worker`. The `sent` stage (email) still runs on Fly — but only after worker submits `drafted`. That trigger needs extending too: on submit, if stage is `drafted`, kick `sent` stage in background.

- [ ] **Step 1: Replace tail loop**

Find the tail loop in `runCampaign` (around lines 158-167):

```ts
const tail = DEFAULT_PIPELINE.stages.filter(s => ['researched', 'drafted', 'sent'].includes(s.id))
const tailPipeline = { ...DEFAULT_PIPELINE, stages: tail }

for (const p of top) {
  await runPipeline(p, tailPipeline, icp, deps)
  p.updated_at = nowIso()
  store.upsertProspect(campaignId, p)
}
```

Replace with:

```ts
const workerMode = process.env.WORKER_MODE === '1'

if (workerMode) {
  // Hand researched to worker queue; skip rest of pipeline locally.
  for (const p of top) {
    p.stages.researched = {
      stage_id: 'researched',
      status: 'pending_worker',
      attempts: [],
      human_inputs: [],
      started_at: nowIso(),
    }
    p.current_stage = 'scored'  // still showing scored until worker picks up
    p.updated_at = nowIso()
    store.upsertProspect(campaignId, p)
  }
  console.log(`[campaign ${campaignId}] worker-mode: ${top.length} prospects queued for researched`)
} else {
  const tail = DEFAULT_PIPELINE.stages.filter(s => ['researched', 'drafted', 'sent'].includes(s.id))
  const tailPipeline = { ...DEFAULT_PIPELINE, stages: tail }
  for (const p of top) {
    await runPipeline(p, tailPipeline, icp, deps)
    p.updated_at = nowIso()
    store.upsertProspect(campaignId, p)
  }
}
```

- [ ] **Step 2: After drafted submit, queue drafted→sent**

In `src/pages/api/work/[id]/submit.ts` after successful submit:

```ts
// after submitStage result === 'ok':
if (stage === 'drafted') {
  // queue sent stage as pending_worker too — keeps the send off Fly. OR run locally.
  // For now (hackathon): if DRAFTED_THEN_SEND_ON_FLY=1 (default), run sent in-process here.
  if (process.env.DRAFTED_THEN_SEND_ON_FLY !== '0') {
    // fire-and-forget server-side send
    void fireSentStage(prospectId).catch(err => console.error('[sent]', err))
  } else {
    // mark sent as pending_worker
    const s2 = new Store()
    try {
      ;(s2 as any).db.prepare(`INSERT INTO stage_envelopes (prospect_id, stage_id, status, envelope, started_at) VALUES (?, 'sent', 'pending_worker', ?, ?) ON CONFLICT(prospect_id, stage_id) DO UPDATE SET status='pending_worker', envelope=excluded.envelope, started_at=excluded.started_at`)
        .run(prospectId, JSON.stringify({ stage_id: 'sent', status: 'pending_worker', attempts: [], human_inputs: [], started_at: new Date().toISOString() }), new Date().toISOString())
    } finally { s2.close() }
  }
}
```

Implement `fireSentStage(prospectId)` helper in submit.ts (or extract later):

```ts
async function fireSentStage(prospectId: string) {
  const { sendEmail } = await import('../../../../tools/resend-send')
  const s = new Store()
  try {
    const prospect = s.getProspect(prospectId)
    if (!prospect) return
    const draft = prospect.stages.drafted?.final_output as any
    if (!draft?.subject || !draft?.body) return
    const result = await sendEmail({
      to: process.env.TO_EMAIL ?? '',
      subject: draft.subject,
      body: draft.body,
    })
    const now = new Date().toISOString()
    const env = {
      stage_id: 'sent', status: 'passed' as const, attempts: [], human_inputs: [],
      final_output: result, started_at: now, ended_at: now,
    }
    ;(s as any).db.prepare(`INSERT INTO stage_envelopes (prospect_id, stage_id, status, envelope, started_at, ended_at) VALUES (?, 'sent', 'passed', ?, ?, ?) ON CONFLICT(prospect_id, stage_id) DO UPDATE SET status='passed', envelope=excluded.envelope, ended_at=excluded.ended_at`)
      .run(prospectId, JSON.stringify(env), now, now)
    ;(s as any).db.prepare(`UPDATE prospects SET current_stage = 'sent', updated_at = ? WHERE id = ?`).run(now, prospectId)
  } finally { s.close() }
}
```

- [ ] **Step 3: Manual smoke (dev, WORKER_MODE=1)**

```bash
WORKER_MODE=1 DISCOVER_MODE=apollo-mock-people WORKER_TOKEN=devtoken npm run dev
# Create a campaign via UI or curl, wait ~10s, then:
curl -s -H 'x-worker-token: devtoken' 'http://localhost:3000/api/work/next?stage=researched' | jq
# expect: a prospect object, not 204
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/api/campaigns.ts src/pages/api/work/[id]/submit.ts
git commit -m "feat(pipeline): WORKER_MODE=1 halts after scored, hands researched to queue"
```

---

## Task 7 (DLG): `scripts/worker.ts` — poll loop

**Files:**
- Create: `scripts/worker.ts`

**Key facts DLG must know (pre-resolved so subagent doesn't stall):**

1. **Pipeline spec lives at** `src/dsl/default-pipeline.ts` export `DEFAULT_PIPELINE`. For stage `drafted`, the spec provides: `maker: 'SDR-Siddharth'`, `checker: 'Editor-Esha'`, `arbiter: 'VPSales-Vikram'`, `rubric: 'draft'`, a `task` string, `max_iterations: 2`, `pass_threshold: 7`.

2. **`runMCA` signature** (from `src/mca-loop.ts:15-26`): takes `MCAConfig { stage, maker, checker, arbiter, task, context, rubric, maxIterations?, passThreshold?, onEvent? }` and returns `{ output, iterations } | { rejected: string }`.

3. **`loadRubric` signature** (from `src/runtime/rubric-loader.ts`): synchronous, `loadRubric(ref: string): RubricDim[]`. Not async.

4. **`linkedinResearch(url, { light: true })`** writes raw profile JSON to `prospects/<slug>/linkedin_raw_data.json` where `<slug>` is derived from the URL path after `/in/` (take everything up to next `/` or `?`).

5. **`extractProfileBasics(filePath)`** returns `{ headline?, title?, company?, location?, current_tenure?, prior_company? }`.

6. **The `researched` stage in the pipeline has `tools: ['linkedin_research', ...]` and NO checker/arbiter.** The executor's tool-only branch (`executor.ts:36-47`) just puts the tool output into `final_output`. So for worker researched submission, the output shape = tool output (the extracted basics). No M/C/A needed.

- [ ] **Step 1: Write `scripts/worker.ts`**

```ts
// scripts/worker.ts
import 'dotenv/config'
import { linkedinResearch } from '../src/tools/linkedin-research'
import { extractProfileBasics } from '../src/tools/extract-profile-basics'
import { runMCA } from '../src/mca-loop'
import { loadRubric } from '../src/runtime/rubric-loader'
import { DEFAULT_PIPELINE } from '../src/dsl/default-pipeline'
import { resolve as rpath } from 'node:path'

const BASE = process.env.WORKER_BASE_URL ?? 'https://ai-sales-team-33831.fly.dev'
const TOKEN = process.env.WORKER_TOKEN ?? ''
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000)
const WORKER_ID = process.env.WORKER_ID ?? `laptop-${process.pid}`

if (!TOKEN) { console.error('WORKER_TOKEN missing'); process.exit(1) }

type Claim = {
  claim_id: string
  prospect_id: string
  campaign_id: string
  stage: 'researched' | 'drafted'
  linkedin_url: string | null
  icp: Record<string, unknown>
  prior_stages: Record<string, unknown>
  prospect: { id: string; name: string; company: string; title: string; linkedin_url: string | null }
  expires_at: string
}

function slugFromUrl(url: string): string {
  const m = url.match(/\/in\/([^/?#]+)/)
  return m?.[1] ?? url.replace(/[^a-z0-9]/gi, '-').slice(-40)
}

async function claimNext(stage: 'researched' | 'drafted'): Promise<Claim | null> {
  const r = await fetch(`${BASE}/api/work/next?stage=${stage}`, {
    headers: { 'x-worker-token': TOKEN, 'x-worker-id': WORKER_ID },
  })
  if (r.status === 204) return null
  if (!r.ok) throw new Error(`claim ${stage} failed: ${r.status} ${await r.text()}`)
  return r.json() as Promise<Claim>
}

async function submit(prospectId: string, claimId: string, stage: string, output: unknown) {
  const r = await fetch(`${BASE}/api/work/${prospectId}/submit`, {
    method: 'POST',
    headers: { 'x-worker-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ claim_id: claimId, stage, output }),
  })
  if (!r.ok) throw new Error(`submit failed: ${r.status} ${await r.text()}`)
}

async function fail(prospectId: string, claimId: string, stage: string, reason: string) {
  await fetch(`${BASE}/api/work/${prospectId}/fail`, {
    method: 'POST',
    headers: { 'x-worker-token': TOKEN, 'content-type': 'application/json' },
    body: JSON.stringify({ claim_id: claimId, stage, reason }),
  }).catch(() => {})
}

/** Researched stage: scrape → extract basics → submit. Matches tool-only shape. */
async function doResearched(c: Claim) {
  if (!c.linkedin_url) throw new Error('no linkedin_url on prospect')
  await linkedinResearch(c.linkedin_url, { light: true })
  const slug = slugFromUrl(c.linkedin_url)
  const basics = await extractProfileBasics(rpath('prospects', slug, 'linkedin_raw_data.json'))
  const output = {
    title: basics.title ?? c.prospect.title ?? null,
    company: basics.company ?? c.prospect.company ?? null,
    headline: basics.headline ?? null,
    location: basics.location ?? null,
    current_tenure: basics.current_tenure ?? null,
    prior_company: basics.prior_company ?? null,
    source: 'laptop-worker',
  }
  await submit(c.prospect_id, c.claim_id, c.stage, output)
}

/** Drafted stage: run M/C/A locally using DEFAULT_PIPELINE spec for 'drafted'. */
async function doDrafted(c: Claim) {
  const stageSpec = DEFAULT_PIPELINE.stages.find(s => s.id === 'drafted')
  if (!stageSpec) throw new Error('drafted stage spec missing')
  if (!stageSpec.checker || !stageSpec.arbiter || !stageSpec.rubric) {
    throw new Error('drafted stage missing M/C/A config')
  }

  const rubric = loadRubric(stageSpec.rubric)

  // Mirror executor.ts runStage: build context the same way.
  const prospectCtx = {
    ...c.prospect,
    ...(c.prior_stages.researched ?? {}),   // merged profile basics
  }

  const result = await runMCA({
    stage: 'drafted',
    maker: stageSpec.maker,
    checker: stageSpec.checker,
    arbiter: stageSpec.arbiter,
    task: stageSpec.task ?? 'Write a cold email per the rubric.',
    context: { prospect: prospectCtx, icp: c.icp },
    rubric,
    maxIterations: stageSpec.max_iterations ?? 2,
    passThreshold: stageSpec.pass_threshold ?? 7,
    onEvent: (e) => {
      if (e.kind === 'stage_pass' || e.kind === 'stage_reject') {
        console.log(`[worker][drafted] ${e.kind}`, 'iters' in e ? `iters=${e.iters}` : ('reason' in e ? e.reason : ''))
      }
    },
  })

  if ('rejected' in result) {
    await fail(c.prospect_id, c.claim_id, 'drafted', `mca rejected: ${result.rejected}`)
    return
  }
  await submit(c.prospect_id, c.claim_id, 'drafted', result.output)
}

async function loop() {
  console.log(`[worker ${WORKER_ID}] polling ${BASE} every ${POLL_MS}ms`)
  while (true) {
    let didWork = false
    for (const stage of ['researched', 'drafted'] as const) {
      try {
        const c = await claimNext(stage)
        if (!c) continue
        didWork = true
        console.log(`[worker] claim ${c.claim_id} stage=${stage} prospect=${c.prospect_id}`)
        try {
          if (stage === 'researched') await doResearched(c)
          else await doDrafted(c)
          console.log(`[worker] submitted ${c.claim_id}`)
        } catch (err: any) {
          console.warn(`[worker] fail ${c.claim_id}: ${err.message}`)
          await fail(c.prospect_id, c.claim_id, stage, (err.message ?? 'unknown').slice(0, 500))
        }
      } catch (err: any) {
        console.error(`[worker] claim loop err (${stage}): ${err.message}`)
      }
    }
    if (!didWork) await new Promise(r => setTimeout(r, POLL_MS))
  }
}

loop().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: npm script**

Add to `package.json` scripts:
```json
"worker": "bash -c 'set -a && source .env.local && set +a && tsx scripts/worker.ts'"
```
(Follows existing `demo:hybrid` pattern — sources `.env.local` for API keys.)

- [ ] **Step 3: Auth smoke**

```bash
WORKER_TOKEN=wrong npm run worker &
# expect: claim researched failed: 401
# kill after one line
kill %1 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
git add scripts/worker.ts package.json
git commit -m "feat(worker): laptop polling worker for researched + drafted stages"
```

- [ ] **Step 2: npm script**

In `package.json` scripts, add:

```json
"worker": "tsx scripts/worker.ts"
```

- [ ] **Step 3: Dry smoke**

```bash
WORKER_BASE_URL=https://ai-sales-team-33831.fly.dev WORKER_TOKEN=devtoken-wrong npm run worker
# expect: claim failed: 401
# Ctrl+C
```

- [ ] **Step 4: Commit**

```bash
git add scripts/worker.ts package.json
git commit -m "feat(worker): laptop polling worker for researched + drafted stages"
```

---

## Task 8 (GSE): Env + fly.toml

**Files:**
- Modify: `fly.toml` (add `WORKER_MODE = '1'`)
- Modify: `.env.local` (add `WORKER_MODE=0`, `WORKER_TOKEN=devtoken`, `WORKER_BASE_URL=http://localhost:3000`)
- Fly secret: `WORKER_TOKEN`

- [ ] **Step 1: Edit fly.toml env block**

Add to `[env]`:
```toml
  WORKER_MODE = '1'
```

- [ ] **Step 2: Edit .env.local**

Append:
```
WORKER_MODE=0
WORKER_TOKEN=devtoken
WORKER_BASE_URL=http://localhost:3000
WORKER_ID=laptop-dev
```

- [ ] **Step 3: Set Fly secret**

```bash
WORKER_TOKEN_VALUE=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
echo "WORKER_TOKEN=$WORKER_TOKEN_VALUE"  # save this for local worker too
fly secrets set WORKER_TOKEN=$WORKER_TOKEN_VALUE --stage -a ai-sales-team-33831
```

- [ ] **Step 4: Deploy**

```bash
fly deploy --remote-only --ha=false -a ai-sales-team-33831
```

- [ ] **Step 5: Commit toml change**

```bash
git add fly.toml
git commit -m "feat(fly): WORKER_MODE=1 on Fly"
```

---

## Task 9 (Integration): End-to-end smoke

Both subagents joined back. Verify full pipeline.

- [ ] **Step 1: Start worker locally pointing at Fly**

```bash
WORKER_BASE_URL=https://ai-sales-team-33831.fly.dev \
WORKER_TOKEN=<the real token> \
npm run worker
# leave running in terminal 1
```

- [ ] **Step 2: Create a campaign on Fly**

```bash
curl -s -i -X POST https://ai-sales-team-33831.fly.dev/api/campaigns \
  -F "title=split-worker smoke" -F "role=VP Eng" -F "industry=Fintech" \
  -F "company_stage=B" -F "keywords=platform"
# expect: 303 Location: /campaign/c_xxx
```

- [ ] **Step 3: Watch board progression**

Hit `https://ai-sales-team-33831.fly.dev/campaign/c_xxx` in browser. Should see:
- Prospects appear in Scored within ~30s (Fly-side)
- Worker terminal prints `claim ... stage=researched` within 10s
- Researched column gets prospects after worker submits
- Drafted column gets prospects after second worker pass
- Sent column gets prospects after `fireSentStage` fires on Fly

- [ ] **Step 4: Verify email received**

Check `ketan@basaltconsulting.in` inbox — one new email from Resend.

- [ ] **Step 5: Commit integration notes**

```bash
# Update handoff
git add docs/HANDOFF-NEXT-SESSION.md
git commit -m "docs: handoff — split-worker integration notes"
```

---

## Risks & mitigations (hackathon-scoped)

- **Playwright on laptop requires cookies/venv** — existing state from prior work. If cookies stale, worker gets 0 LinkedIn hits → mark stage `rejected`. Move on.
- **Concurrent workers race** — claim TTL + atomic transaction covers. Not tested for N>1.
- **Worker offline** — stages sit `pending_worker` forever. User can park from UI. Acceptable.
- **`runMCA` arg shape drift** — plan's call may not compile. DLG subagent reads current signatures before writing.

---

## Out of scope (deferred, per user)

- Password gate + waitlist (Priority 2, starts after this ships)
- Worker heartbeat/pause/resume
- Admin UI for queue inspection
- Multi-worker coordination beyond atomic claim
