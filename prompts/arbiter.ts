import type { PersonaDef } from '../personas/registry'
import type { CheckerResult } from './checker'

export type ArbiterInput = {
  persona: PersonaDef
  makerOutput: unknown
  checkerResult: CheckerResult
  stage: string
  iteration: number
  maxIterations: number
  passThreshold?: number
}

export type ArbiterDecision = {
  decision: 'pass' | 'revise' | 'reject'
  reason: string
  feedback_for_maker?: string[]
}

export const arbiterPrompt = ({ persona, makerOutput, checkerResult, stage, iteration, maxIterations, passThreshold }: ArbiterInput) => {
  const threshold = passThreshold ?? 7
  return `${persona.name}, ${persona.designation}. Final call on ${stage}.

Maker: ${typeof makerOutput === 'string' ? makerOutput : JSON.stringify(makerOutput)}
Checker: ${checkerResult.overall_score}/10. Issues: ${checkerResult.issues.join(' | ')}
Iter ${iteration}/${maxIterations}.

Decide: pass | revise (if iter<${maxIterations}) | reject.
Rule: score>=${threshold} → pass. score<${threshold} AND iter<${maxIterations} → revise. score<${threshold} AND iter>=${maxIterations} → reject.

JSON: {"decision":"pass|revise|reject","reason":"...","feedback_for_maker":[...]}. JSON only.`
}
