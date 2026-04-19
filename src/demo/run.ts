/**
 * End-to-end demo runner.
 *
 *   MODE=mock       — no API calls, canned data, runs in <2s
 *   MODE=live       — real scrapers + Anthropic + Resend (cookies/keys required)
 *
 * Run: MODE=mock ./node_modules/.bin/tsx src/demo/run.ts
 */
import { DEFAULT_PIPELINE } from '../dsl/default-pipeline'
import type { Prospect, PipelineEvent } from '../dsl/envelope'
import { runPipeline, type ExecutorDeps } from '../runtime/executor'
import { loadRubric } from '../runtime/rubric-loader'
import { runTool as realTool } from '../runtime/tool-registry'
import { MOCK_TOOLS } from '../runtime/mock-tools'
import { runMCAMock } from '../runtime/mock-mca'
import { runMCA } from '../mca-loop'
import { PERSONAS } from '../../personas/registry'
import { Store } from '../db/store'
import { resolveGate } from '../runtime/human-gate'
import crypto from 'node:crypto'

const MODE = (process.env.MODE ?? 'mock') as 'mock' | 'live' | 'hybrid'
const GATE_MODE = (process.env.GATE ?? (MODE === 'mock' ? 'auto' : 'cli')) as 'auto' | 'cli' | 'http'
// hybrid = real M/C/A via Groq/Anthropic, mock tools (no scrapers)
const nowIso = () => new Date().toISOString()
const shortTime = () => new Date().toISOString().slice(11, 19)

function personaTag(id: string): string {
  const p = PERSONAS[id as keyof typeof PERSONAS]
  if (!p) return id
  return `${p.name}·${p.designation}`
}

function eventToLine(e: PipelineEvent): string {
  const t = shortTime()
  switch (e.kind) {
    case 'stage_advance': return `${t} [system]         ${e.prospect_id} → ${e.to}`
    case 'stage_start':   return `${t} [system]         ${e.prospect_id} starting ${e.stage_id}`
    case 'attempt':       return `${t} [${personaTag(e.attempt.maker.persona).padEnd(18)}] ${e.prospect_id} ${e.stage_id} iter ${e.attempt.iter}`
    case 'stage_pass':    return `${t} [system]         ${e.prospect_id} ${e.stage_id} ✓`
    case 'stage_reject':  return `${t} [system]         ${e.prospect_id} ${e.stage_id} ✗ ${e.reason}`
    case 'human_input':   return `${t} [${e.input.author.name.padEnd(18)}] ${e.input.kind}`
  }
}

async function main() {
  console.log(`\n== AI SALES TEAM :: MODE=${MODE} · GATE=${GATE_MODE} ==\n`)

  const icp = {
    role: 'VP/Director Engineering or Platform',
    industry: 'Developer tools / B2B SaaS / Platform companies',
    company_stage: 'Series B through Series D',
    company_size: '100-1000 employees',
    keywords: ['platform', 'infrastructure', 'developer tools']
  }
  console.log('ICP:', JSON.stringify(icp))
  console.log('')

  const useMockTools = MODE === 'mock' || MODE === 'hybrid'
  const useMockMCA = MODE === 'mock'

  // Hybrid: use mock scrapers but ACTUALLY send via Resend
  const hybridTools: Record<string, (i: any) => Promise<unknown>> = { ...MOCK_TOOLS, resend_send: (await import('../tools/resend-send')).sendEmail }
  const tools = MODE === 'hybrid' ? hybridTools : MOCK_TOOLS
  const runToolFn = useMockTools
    ? (id: string, input: unknown) => (tools![id] ? tools![id](input) : Promise.reject(new Error(`mock miss: ${id}`)))
    : realTool

  const runMCAFn = useMockMCA ? runMCAMock : runMCA

  const store = new Store()
  const campaignId = `c_${crypto.randomBytes(4).toString('hex')}`
  store.upsertCampaign({
    id: campaignId,
    pipeline: `${DEFAULT_PIPELINE.name}@${DEFAULT_PIPELINE.version}`,
    icp,
    prospects: [],
    created_at: nowIso(),
    created_by: 'cli'
  })
  console.log(`campaign: ${campaignId}\n`)

  const events: PipelineEvent[] = []
  const emit = (e: PipelineEvent) => {
    events.push(e)
    store.appendEvent(campaignId, e)
    console.log(eventToLine(e))
  }

  const awaitHuman = resolveGate(GATE_MODE, { store, campaignId })

  const deps: ExecutorDeps = {
    loadRubric,
    runTool: runToolFn,
    runMCA: runMCAFn,
    awaitHuman,
    emit,
    now: nowIso
  }

  // Stage 1: discover (pipeline's first stage is tool-only)
  const discoverStage = DEFAULT_PIPELINE.stages[0]
  console.log(`-- DISCOVER --`)
  const discoverOut: any = await runToolFn(discoverStage.tools![0], { icp, pages: 1 })
  const prospects: Prospect[] = (discoverOut.prospects ?? []).slice(0, 5).map((p: any) => {
    const pr: Prospect = {
    id: `${campaignId}/${p.slug}`,
    name: p.name,
    linkedin_url: p.profile_url,
    company: p.company,
    title: p.title,
    current_stage: 'discovered',
    stages: {
      discovered: {
        stage_id: 'discovered', status: 'passed', attempts: [], human_inputs: [],
        final_output: p, started_at: nowIso(), ended_at: nowIso()
      }
    },
    created_at: nowIso(),
    updated_at: nowIso()
    }
    store.upsertProspect(campaignId, pr)
    return pr
  })
  console.log(`  ${prospects.length} prospects discovered\n`)

  // Stage 2: score (M/C/A) — run on all
  console.log(`-- SCORE --`)
  const scoreStage = DEFAULT_PIPELINE.stages.find(s => s.id === 'scored')!
  for (const p of prospects) {
    const env = await (await import('../runtime/executor')).runStage(p, scoreStage, { icp }, deps)
    p.stages.scored = env
    if (env.status === 'passed') p.current_stage = 'scored'
    p.updated_at = nowIso()
    store.upsertProspect(campaignId, p)
  }
  const scored = prospects.filter(p => p.stages.scored?.status === 'passed')
  console.log(`  ${scored.length}/${prospects.length} passed scoring\n`)

  // Fan-out: top N by score
  const fanout = DEFAULT_PIPELINE.fanout?.[0]
  const topN = fanout?.top_n ?? 3
  const top = scored
    .map(p => ({ p, score: ((p.stages.scored?.final_output as any)?.score ?? 0) as number }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(x => x.p)
  console.log(`-- TOP ${topN} --`)
  top.forEach(p => console.log(`  ${p.name.padEnd(22)} ${(p.stages.scored!.final_output as any).score}/10`))
  console.log('')

  // Remaining stages (research → draft → send) for each top prospect
  const remaining = DEFAULT_PIPELINE.stages.filter(s => ['researched', 'drafted', 'sent'].includes(s.id))
  const pipelineTail = { ...DEFAULT_PIPELINE, stages: remaining }

  for (const p of top) {
    console.log(`-- ${p.name} --`)
    await runPipeline(p, pipelineTail, icp, deps)
    p.updated_at = nowIso()
    store.upsertProspect(campaignId, p)
    console.log('')
  }

  // Summary
  console.log('== SUMMARY ==')
  const sent = top.filter(p => p.stages.sent?.status === 'passed').length
  console.log(`discovered: ${prospects.length}`)
  console.log(`scored:     ${scored.length}`)
  console.log(`top N:      ${top.length}`)
  console.log(`sent:       ${sent}`)
  console.log(`events:     ${events.length}`)
  console.log(`db:         data/app.db`)
  console.log(`campaign:   ${campaignId}`)
  console.log('')

  store.close()
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
