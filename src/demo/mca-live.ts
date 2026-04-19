/**
 * Live M/C/A smoke test — hits Groq.
 * Run: export $(grep -v '^#' .env.local | xargs) && ./node_modules/.bin/tsx src/demo/mca-live.ts
 */
import { runMCA } from '../mca-loop'
import { SCORE_RUBRIC } from '../../rubrics/score'
import { DRAFT_RUBRIC } from '../../rubrics/draft'
import { defaultProvider } from '../providers/model'

async function main() {
  console.log(`Provider: ${defaultProvider()}\n`)

  const prospect = {
    name: 'Maria Chen',
    title: 'VP Platform Engineering',
    company: 'Acme Data',
    snippet: 'hired 4 platform engs in Q1, recent LinkedIn post on GraphQL federation rollout'
  }
  const icp = { role: 'VP Engineering', industry: 'B2B SaaS', company_stage: 'Series B' }

  console.log('== STAGE 1: SCORE ==')
  const scoreStart = Date.now()
  const scoreResult = await runMCA({
    stage: 'scored',
    maker: 'SDR-Siddharth',
    checker: 'Skeptic-Shruti',
    arbiter: 'VPSales-Vikram',
    task: 'Score this prospect 1-10 against the ICP. Output { score: number, reasons: string[] }.',
    context: { prospect, icp },
    rubric: SCORE_RUBRIC,
    maxIterations: 2,
    onEvent: (e) => console.log(`  [${e.kind}]`, 'iter' in e ? `iter ${e.iter}` : '', 'output' in e ? JSON.stringify(e.output).slice(0, 100) : '', 'result' in e ? `score=${(e.result as any).overall_score}` : '')
  })
  console.log(`score in ${Date.now() - scoreStart}ms:`, JSON.stringify(scoreResult).slice(0, 200), '\n')

  console.log('== STAGE 2: DRAFT ==')
  const draftStart = Date.now()
  const dossier = { hook: 'the GraphQL federation rollout you posted last week', signals: ['hired 4 platform engs Q1', 'complained about N+1 queries in codegen'] }
  const draftResult = await runMCA({
    stage: 'drafted',
    maker: 'SDR-Siddharth',
    checker: 'Editor-Esha',
    arbiter: 'VPSales-Vikram',
    task: 'Write a 3-sentence cold email with ONE specific hook. Output { subject: string, body: string }.',
    context: { prospect, icp, dossier },
    rubric: DRAFT_RUBRIC,
    maxIterations: 2,
    onEvent: (e) => console.log(`  [${e.kind}]`, 'iter' in e ? `iter ${e.iter}` : '', 'output' in e ? JSON.stringify(e.output).slice(0, 120) : '', 'result' in e ? `score=${(e.result as any).overall_score}` : '')
  })
  console.log(`draft in ${Date.now() - draftStart}ms:`)
  console.log(JSON.stringify(draftResult, null, 2))
}

main().catch(err => { console.error('FATAL:', err); process.exit(1) })
