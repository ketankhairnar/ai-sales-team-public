/**
 * Dry-run test of M/C/A loop shape (no API call).
 * Validates imports + types only.
 * Run: npx tsx src/demo/mca-smoke.ts
 */
import { PERSONAS } from '../../personas/registry'
import { makerPrompt } from '../../prompts/maker'
import { checkerPrompt } from '../../prompts/checker'
import { arbiterPrompt } from '../../prompts/arbiter'
import { SCORE_RUBRIC } from '../../rubrics/score'
import { DEFAULT_PIPELINE } from '../dsl/default-pipeline'
import { TOOLS } from '../runtime/tool-registry'
import { loadRubric } from '../runtime/rubric-loader'

const mockProspect = { name: 'Maria Chen', title: 'VP Platform Eng', company: 'Acme', snippet: 'hired 4 platform engs q1, recent post on graphql federation' }
const mockIcp = { role: 'VP Eng', company_size: '50-200', industry: 'SaaS' }

console.log('== SMOKE TEST: imports + templates ==')
console.log('')

console.log('PERSONAS:', Object.keys(PERSONAS).length)
console.log('PIPELINE stages:', DEFAULT_PIPELINE.stages.map(s => s.id).join(' → '))
console.log('TOOLS registered:', Object.keys(TOOLS).join(', '))
console.log('')

const mp = makerPrompt({
  persona: PERSONAS['SDR-Siddharth'],
  task: 'Score this prospect',
  context: { prospect: mockProspect, icp: mockIcp }
})
console.log('MAKER PROMPT (', mp.length, 'chars):')
console.log(mp.slice(0, 200) + '...')
console.log('')

const cp = checkerPrompt({
  persona: PERSONAS['Skeptic-Shruti'],
  artifact: { score: 9, reasons: ['vp eng match', 'series b'] },
  rubric: loadRubric('score'),
  stage: 'score',
  stageContext: { icp: mockIcp }
})
console.log('CHECKER PROMPT (', cp.length, 'chars):')
console.log(cp.slice(0, 200) + '...')
console.log('')

const ap = arbiterPrompt({
  persona: PERSONAS['VPSales-Vikram'],
  makerOutput: { score: 9 },
  checkerResult: { overall_score: 6, dimension_scores: {}, issues: ['weak evidence'], suggestions: [], pass: false },
  stage: 'score',
  iteration: 1,
  maxIterations: 2
})
console.log('ARBITER PROMPT (', ap.length, 'chars):')
console.log(ap.slice(0, 200) + '...')
console.log('')

console.log('== MOCK TOOL CALL ==')
const { mock_echo } = TOOLS
const out = await mock_echo({ hello: 'world' })
console.log('mock_echo →', out)
console.log('')

console.log('✅ All imports resolve. Templates render. Tools dispatch.')
console.log('Next: set ANTHROPIC_API_KEY + run live M/C/A (src/demo/run.ts — pending)')
