// scripts/worker.ts
// Laptop polling worker: claims researched/drafted stages from Fly, executes
// locally (LinkedIn scrape + M/C/A draft), submits back.
//
// Env:
//   WORKER_BASE_URL  — Fly base URL (default: prod)
//   WORKER_TOKEN     — shared auth token (required)
//   WORKER_POLL_MS   — idle poll interval (default 5000)
//   WORKER_ID        — identifier for claim tracking
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

/** Researched stage: scrape -> extract basics -> submit. Matches tool-only shape. */
async function doResearched(c: Claim) {
  // If no LinkedIn URL (apollo-mock-people), skip scrape, emit stub so drafted can proceed.
  if (!c.linkedin_url) {
    console.log(`[worker] ${c.prospect_id} has no linkedin_url — submitting stub researched`)
    await submit(c.prospect_id, c.claim_id, c.stage, {
      title: c.prospect.title || null,
      company: c.prospect.company || null,
      headline: `${c.prospect.title ?? ''} at ${c.prospect.company ?? ''}`.trim(),
      location: null,
      current_tenure: null,
      prior_company: null,
      source: 'laptop-worker-stub',
    })
    return
  }
  await linkedinResearch(c.linkedin_url, { light: true })
  const slug = slugFromUrl(c.linkedin_url)
  const basics = await extractProfileBasics(rpath('prospects', slug, 'linkedin_raw_data.json'))
  const output = {
    title: basics.title || c.prospect.title || null,
    company: basics.company || c.prospect.company || null,
    headline: basics.headline || null,
    location: basics.location || null,
    current_tenure: basics.current_tenure || null,
    prior_company: basics.prior_company || null,
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
    ...(c.prior_stages.researched as Record<string, unknown> | undefined ?? {}),
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
        const detail = 'iters' in e ? `iters=${e.iters}` : ('reason' in e ? e.reason : '')
        console.log(`[worker][drafted] ${e.kind}`, detail)
      }
    },
  })

  if ('rejected' in result) {
    throw new Error(`mca rejected: ${result.rejected}`)
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
          await fail(c.prospect_id, c.claim_id, stage, String(err.message ?? 'unknown').slice(0, 500))
        }
      } catch (err: any) {
        console.error(`[worker] claim loop err (${stage}): ${err.message}`)
      }
    }
    if (!didWork) await new Promise(r => setTimeout(r, POLL_MS))
  }
}

loop().catch(e => { console.error(e); process.exit(1) })
