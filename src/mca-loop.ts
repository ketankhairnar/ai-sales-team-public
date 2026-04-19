import { PERSONAS, type PersonaId } from '../personas/registry'
import { makerPrompt } from '../prompts/maker'
import { checkerPrompt, type CheckerResult, type RubricDim } from '../prompts/checker'
import { arbiterPrompt, type ArbiterDecision } from '../prompts/arbiter'
import { complete, modelFor, defaultProvider } from './providers/model'

export type StageEvent =
  | { kind: 'maker_start'; persona: PersonaId; iter: number }
  | { kind: 'maker_done'; output: unknown; iter: number; prompt?: string; raw?: string }
  | { kind: 'checker_done'; result: CheckerResult; iter: number; prompt?: string; raw?: string }
  | { kind: 'arbiter_done'; decision: ArbiterDecision; iter: number; prompt?: string; raw?: string }
  | { kind: 'stage_pass'; output: unknown; iters: number }
  | { kind: 'stage_reject'; reason: string }

export type MCAConfig = {
  stage: string
  maker: PersonaId
  checker: PersonaId
  arbiter: PersonaId
  task: string
  context: Record<string, unknown>
  rubric: RubricDim[]
  maxIterations?: number
  passThreshold?: number
  onEvent?: (e: StageEvent) => void
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  try {
    return JSON.parse(slice) as T
  } catch {}

  // Attempt 2: smart-quote + single-quote repair
  const repaired = slice
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/'([^']*?)':/g, '"$1":')
    .replace(/:\s*'([^']*?)'/g, ': "$1"')
  try {
    return JSON.parse(repaired) as T
  } catch {}

  // Attempt 3: progressive truncation — find longest valid JSON prefix
  for (let i = slice.length; i > 10; i--) {
    const sub = slice.slice(0, i).replace(/,\s*$/, '') + '}'.repeat((slice.slice(0, i).match(/\{/g) ?? []).length - (slice.slice(0, i).match(/\}/g) ?? []).length)
    try {
      return JSON.parse(sub) as T
    } catch {}
  }

  throw new Error(`JSON parse failed\nRAW: ${raw.slice(0, 400)}`)
}

function tierForPersona(personaModel: string): 'fast' | 'smart' | 'top' {
  if (personaModel.includes('haiku')) return 'fast'
  if (personaModel.includes('opus')) return 'top'
  return 'smart'
}

export async function runMCA(cfg: MCAConfig): Promise<{ output: unknown; iterations: number } | { rejected: string }> {
  const max = cfg.maxIterations ?? 2
  const emit = cfg.onEvent ?? (() => {})
  const makerP = PERSONAS[cfg.maker]
  const checkerP = PERSONAS[cfg.checker]
  const arbiterP = PERSONAS[cfg.arbiter]
  const prov = defaultProvider()

  const makerSpec = modelFor(tierForPersona(makerP.model), prov)
  const checkerSpec = modelFor(tierForPersona(checkerP.model), prov)
  const arbiterSpec = modelFor(tierForPersona(arbiterP.model), prov)

  let priorFeedback: string[] | undefined
  let lastOutput: unknown

  for (let iter = 1; iter <= max; iter++) {
    emit({ kind: 'maker_start', persona: cfg.maker, iter })
    const makerP_text = makerPrompt({ persona: makerP, task: cfg.task, context: cfg.context, priorFeedback })
    const makerText = await complete(makerSpec, makerP_text)
    const makerResp = parseJson<{ output: unknown; reasoning: string }>(makerText)
    lastOutput = makerResp.output
    emit({ kind: 'maker_done', output: lastOutput, iter, prompt: makerP_text, raw: makerText })

    const checkerP_text = checkerPrompt({
      persona: checkerP, artifact: lastOutput, rubric: cfg.rubric, stage: cfg.stage, stageContext: cfg.context,
      passThreshold: cfg.passThreshold
    })
    const checkText = await complete(checkerSpec, checkerP_text)
    const check = parseJson<CheckerResult>(checkText)
    emit({ kind: 'checker_done', result: check, iter, prompt: checkerP_text, raw: checkText })

    // ALWAYS invoke Arbiter for commentary — even on checker pass.
    // Gives the user a transparent "why did this pass/fail" trail per iteration.
    const arbiterP_text = arbiterPrompt({
      persona: arbiterP, makerOutput: lastOutput, checkerResult: check,
      stage: cfg.stage, iteration: iter, maxIterations: max,
      passThreshold: cfg.passThreshold
    })
    const arbText = await complete(arbiterSpec, arbiterP_text)
    const arb = parseJson<ArbiterDecision>(arbText)
    emit({ kind: 'arbiter_done', decision: arb, iter, prompt: arbiterP_text, raw: arbText })

    // Pass if EITHER checker says pass OR arbiter says pass on disagreement
    if (check.pass || arb.decision === 'pass') {
      emit({ kind: 'stage_pass', output: lastOutput, iters: iter })
      return { output: lastOutput, iterations: iter }
    }
    if (arb.decision === 'reject') {
      emit({ kind: 'stage_reject', reason: arb.reason })
      return { rejected: arb.reason }
    }
    // revise: loop back with Maker feedback
    priorFeedback = arb.feedback_for_maker ?? check.suggestions
  }

  emit({ kind: 'stage_reject', reason: `exhausted ${max} iterations` })
  return { rejected: `exhausted ${max} iterations` }
}
