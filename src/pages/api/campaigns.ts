import type { APIRoute } from 'astro'
import crypto from 'node:crypto'
import { Store } from '../../db/store'
import { DEFAULT_PIPELINE } from '../../dsl/default-pipeline'
import type { Prospect, PipelineEvent } from '../../dsl/envelope'
import { runPipeline, type ExecutorDeps } from '../../runtime/executor'
import { loadRubric } from '../../runtime/rubric-loader'
import { MOCK_TOOLS } from '../../runtime/mock-tools'
import { runMCA } from '../../mca-loop'
import { sendEmail } from '../../tools/resend-send'
import { renderOutreachHtml } from '../../tools/outreach-email'
import { autoApproveGate } from '../../runtime/human-gate'
import { apolloSearch } from '../../tools/apollo-search'
import { linkedinPeopleAtOrg } from '../../tools/linkedin-people-at-org'
import { linkedinResearch } from '../../tools/linkedin-research'
import { linkedinHitsUsed, linkedinHitLog } from '../../tools/linkedin-hitcap'
import { serpApiLinkedInSearch } from '../../tools/serpapi-linkedin'
import { extractProfileBasics } from '../../tools/extract-profile-basics'
import { resolve as rpath } from 'node:path'

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData()
  // All form fields are user-controlled: cap lengths before DB insert to prevent
  // accidental or malicious bloat. DB is SQLite on a small volume.
  const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n)
  const icp = {
    role: clip(form.get('role'), 120) || 'VP Engineering or Platform',
    industry: clip(form.get('industry'), 120) || 'B2B SaaS / Developer tools',
    company_stage: clip(form.get('company_stage'), 120) || 'Series B to Series D',
    keywords: clip(form.get('keywords'), 400).split(',').map(s => s.trim()).filter(Boolean).slice(0, 20),
  }

  const rawTitle = clip(form.get('title'), 120).trim()
  const title = rawTitle || `${icp.role} · ${icp.industry}`.slice(0, 80)

  const store = new Store()
  const campaignId = `c_${crypto.randomBytes(4).toString('hex')}`
  const nowIso = () => new Date().toISOString()
  store.upsertCampaign({
    id: campaignId,
    title,
    pipeline: `${DEFAULT_PIPELINE.name}@${DEFAULT_PIPELINE.version}`,
    icp,
    prospects: [],
    created_at: nowIso(),
    created_by: 'web',
  })
  store.close()

  // Fire pipeline in background, do not block response
  runCampaign(campaignId, icp).catch(err => console.error('[campaign error]', campaignId, err))

  return new Response(null, {
    status: 303,
    headers: { Location: `/campaign/${campaignId}` },
  })
}

async function runCampaign(campaignId: string, icp: Record<string, unknown>) {
  const store = new Store()
  const nowIso = () => new Date().toISOString()

  // Hybrid tools: mock scrapers + REAL Resend + live research if configured
  const mode = process.env.DISCOVER_MODE ?? 'apollo-mock-people'
  const useLiveResearch = process.env.LIVE_RESEARCH === '1'
  const hybridTools: Record<string, (i: any) => Promise<unknown>> = {
    ...MOCK_TOOLS,
    resend_send: async (i: any) => {
      const prospect = i.prospect ?? {}
      const draft = i.draft ?? { subject: i.subject, body: i.body, opportunity_map: i.opportunity_map }
      const html = renderOutreachHtml(draft, { name: prospect.name ?? '', title: prospect.title, company: prospect.company })
      return sendEmail({
        to: i.to,
        subject: i.subject,
        body: i.body,
        html,
        from: process.env.FROM_EMAIL ?? 'support@tacit.sh',
        replyTo: process.env.REPLY_TO_EMAIL ?? 'ketan.khairnar@gmail.com',
        bcc: process.env.OUTREACH_BCC ?? 'ketan.khairnar@gmail.com',
      })
    },
    ...(useLiveResearch ? { linkedin_research: (i: any) => linkedinResearch(i.profile_url, { light: true }) } : {}),
  }
  const runTool = (id: string, input: unknown) =>
    hybridTools[id] ? hybridTools[id](input) : Promise.reject(new Error(`tool miss: ${id}`))

  const deps: ExecutorDeps = {
    loadRubric,
    runTool,
    runMCA,
    awaitHuman: autoApproveGate,
    emit: (e: PipelineEvent) => store.appendEvent(campaignId, e),
    now: nowIso,
  }

  // Discover — chain Apollo orgs → LinkedIn people search
  const discoverProspects = await discoverWithChain(icp, mode, campaignId)

  // Post-discover enrichment: for apollo-linkedin-chain, spend 1 hit to fill real
  // company/title on the top-scoring candidate via light profile scrape.
  const isChainMode = mode === 'apollo-linkedin-chain' || mode === 'apollo-serp-chain'
  if (isChainMode && discoverProspects.length > 0) {
    // Enrich top-K candidates: run light research, then LLM-extract structured fields.
    // K capped by hit budget. Default K=1 (conservative).
    const K = Number(process.env.ENRICH_TOP_K ?? 1)
    for (let i = 0; i < Math.min(K, discoverProspects.length); i++) {
      const cand = discoverProspects[i]
      if (!cand.profile_url) continue
      try {
        await linkedinResearch(cand.profile_url, { light: true })
        const rawPath = rpath('prospects', cand.slug, 'linkedin_raw_data.json')
        const basics = await extractProfileBasics(rawPath)
        if (basics.headline) cand.headline = basics.headline
        if (basics.title) cand.title = basics.title
        if (basics.company) cand.company = basics.company
        if (basics.location) cand.location = basics.location
        console.log(`[enrich ${campaignId}] ${cand.name} → ${cand.title || '?'} @ ${cand.company || '?'} (${cand.location || '?'}) tenure=${basics.current_tenure || '?'} prior=${basics.prior_company || '?'}`)
      } catch (err: any) {
        console.warn(`[enrich ${campaignId}] ${cand.name} failed: ${err.message}`)
      }
    }
  }

  const prospects: Prospect[] = discoverProspects.slice(0, 5).map((p) => {
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
          final_output: p, started_at: nowIso(), ended_at: nowIso(),
        },
      },
      created_at: nowIso(),
      updated_at: nowIso(),
    }
    store.upsertProspect(campaignId, pr)
    // Persist Apollo's initial score as prior for the M/C/A scored stage to critique
    const apolloScore = (p as any).apollo_score as number | undefined
    if (typeof apolloScore === 'number') {
      store.appendScoreSnapshot(pr.id, apolloScore, (p as any).apollo_breakdown ?? null, nowIso())
    }
    return pr
  })
  console.log(`[campaign ${campaignId}] discover mode=${mode} produced=${prospects.length} li_hits=${linkedinHitsUsed()} log=${linkedinHitLog().join(',')}`)

  const { runStage } = await import('../../runtime/executor')
  const workerModePre = process.env.WORKER_MODE === '1'
  const scoreStage = DEFAULT_PIPELINE.stages.find(s => s.id === 'scored')!

  if (workerModePre) {
    // Hackathon: skip Fly-side scoring (slow Anthropic + silent hangs). Use Apollo prior.
    console.log(`[campaign ${campaignId}] worker-mode: skipping Fly scoring, using Apollo priors`)
    for (const p of prospects) {
      p.stages.scored = {
        stage_id: 'scored',
        status: 'passed',
        attempts: [],
        human_inputs: [],
        final_output: { score: (p as any).apollo_score ?? 5, reasons: ['apollo_prior'] },
        started_at: nowIso(),
        ended_at: nowIso(),
      }
      p.current_stage = 'scored'
      p.updated_at = nowIso()
      store.upsertProspect(campaignId, p)
    }
  } else {
    for (const p of prospects) {
      const env = await runStage(p, scoreStage, { icp }, deps)
      p.stages.scored = env
      if (env.status === 'passed') p.current_stage = 'scored'
      p.updated_at = nowIso()
      store.upsertProspect(campaignId, p)
    }
  }

  // Hackathon fix: if scoring rejects everyone, fall back to Apollo order so pipeline still flows.
  let scored = prospects.filter(p => p.stages.scored?.status === 'passed')
  if (scored.length === 0) {
    console.warn(`[campaign ${campaignId}] score passed 0 — falling back to discovered order`)
    scored = prospects
  }
  const fanout = DEFAULT_PIPELINE.fanout?.[0]
  const topN = fanout?.top_n ?? 3
  const top = scored
    .map(p => ({ p, score: ((p.stages.scored?.final_output as any)?.score ?? (p as any).apollo_score ?? 0) as number }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(x => x.p)

  const workerMode = process.env.WORKER_MODE === '1'

  if (workerMode) {
    // Hand researched to worker queue; skip remaining tail locally.
    // Worker will pick up researched, submit → server runs drafted if WORKER_MODE=1 also applies
    // (drafted still on worker). `sent` fires server-side via fireSentStage after drafted submit.
    for (const p of top) {
      p.stages.researched = {
        stage_id: 'researched',
        status: 'pending_worker',
        attempts: [],
        human_inputs: [],
        started_at: nowIso(),
      }
      p.current_stage = 'scored'
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

  store.close()
}

/**
 * Discovery chain. Modes:
 *   mock                  — old path, uses MOCK_TOOLS.linkedin_search_icp
 *   apollo-mock-people    — Apollo org search → synth "VP Eng @ Company" leads (no LI hits)
 *   apollo-linkedin-chain — Apollo orgs → LinkedIn people search per company (real hits, capped)
 */
type DiscoveredProspect = {
  name: string; title: string; company: string; headline: string; location: string;
  profile_url: string; slug: string; apollo_score?: number; apollo_breakdown?: string;
}

async function discoverWithChain(icp: any, mode: string, campaignId: string): Promise<DiscoveredProspect[]> {
  if (mode === 'mock') {
    const out: any = await MOCK_TOOLS.linkedin_search_icp({ icp, pages: 1 })
    return (out.prospects ?? []) as DiscoveredProspect[]
  }

  // Apollo search is the common discovery prior for every non-mock mode.
  const apollo = await runApolloDiscovery(icp)
  if (mode === 'apollo-mock-people') return apollo.prospects as DiscoveredProspect[]

  if (mode === 'apollo-serp-chain') {
    const people = await apolloSerpChain(apollo.prospects, icp, campaignId)
    return fallbackIfEmpty(people, apollo.prospects, campaignId, 'SerpApi')
  }
  // apollo-linkedin-chain
  const people = await apolloLinkedInChain(apollo.prospects, icp, campaignId)
  return fallbackIfEmpty(people, apollo.prospects, campaignId, 'LinkedIn')
}

/** Run Apollo discovery with defaults derived from ICP. */
async function runApolloDiscovery(icp: any) {
  return apolloSearch({
    icp,
    titles: [icp.role ?? 'VP Engineering'],
    top_n: 10,
    max: 50,
    preferred_countries: ['India', 'United States', 'Singapore'],
    title_keywords: icp.keywords,
    departments: ['engineering'],
  })
}

const DISCOVERY_FANOUT = 2   // Apollo orgs to chain through
const PER_ORG_MAX = 3        // people per org

/** Apollo orgs → SerpApi Google search → clean LinkedIn URLs. */
async function apolloSerpChain(orgs: DiscoveredProspect[], icp: any, campaignId: string): Promise<DiscoveredProspect[]> {
  const role = String(icp.role ?? 'VP Engineering')
  const people: DiscoveredProspect[] = []
  for (const o of orgs.slice(0, DISCOVERY_FANOUT)) {
    try {
      const sres = await serpApiLinkedInSearch({ company: o.company, role, max_results: PER_ORG_MAX, extra_keywords: icp.keywords })
      for (const p of sres.prospects) people.push(serpResultToProspect(p, o))
    } catch (err: any) {
      console.warn(`[discover ${campaignId}] SerpApi for "${o.company}" failed: ${err.message}`)
    }
  }
  return people
}

/** Apollo orgs → LinkedIn people-search scrape per org. */
async function apolloLinkedInChain(orgs: DiscoveredProspect[], icp: any, campaignId: string): Promise<DiscoveredProspect[]> {
  const role = String(icp.role ?? 'VP Engineering')
  const people: DiscoveredProspect[] = []
  for (const o of orgs.slice(0, DISCOVERY_FANOUT)) {
    try {
      const res = await linkedinPeopleAtOrg({ company: o.company, role, pages: 1, max_results: PER_ORG_MAX })
      for (const p of res.prospects) people.push(liSearchResultToProspect(p, o, role))
    } catch (err: any) {
      console.warn(`[discover ${campaignId}] LinkedIn search for "${o.company}" failed: ${err.message}`)
    }
  }
  return people
}

/** Shape SerpApi result to a chain-discovery prospect. */
function serpResultToProspect(p: any, org: DiscoveredProspect): DiscoveredProspect {
  return {
    name: p.name,
    title: 'tbd',        // filled later by light research + LLM extraction
    company: 'tbd',
    headline: p.snippet,
    location: '',
    profile_url: p.profile_url,
    slug: p.slug,
    apollo_score: org.apollo_score,
    apollo_breakdown: `${org.apollo_breakdown ?? ''}; discovery_context=${org.company}; source=serpapi`,
  }
}

/** Shape LinkedIn people-at-org result — note: LI search returns candidates matching the query globally,
 *  not strictly employees of the Apollo org. We keep the Apollo org as discovery_context and let
 *  the `researched` stage determine the real employer from profile text. */
function liSearchResultToProspect(p: any, org: DiscoveredProspect, role: string): DiscoveredProspect {
  return {
    name: p.name,
    title: p.title || 'tbd',
    company: p.company || 'tbd (fill on research)',
    headline: p.headline || `Found via search: "${role}" + "${org.company}"`,
    location: p.location,
    profile_url: p.profile_url,
    slug: p.slug,
    apollo_score: org.apollo_score,
    apollo_breakdown: `${org.apollo_breakdown ?? ''}; discovery_context=${org.company}`,
  }
}

/** If a chain returned no people (DOM change, captcha, 0 SerpApi hits), fall back to Apollo synth. */
function fallbackIfEmpty(people: DiscoveredProspect[], apolloProspects: any[], campaignId: string, chain: string): DiscoveredProspect[] {
  if (people.length > 0) return people
  console.warn(`[discover ${campaignId}] ${chain} chain empty; falling back to Apollo synth`)
  return apolloProspects as DiscoveredProspect[]
}
