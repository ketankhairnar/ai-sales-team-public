import { SCORE_RUBRIC } from '../../rubrics/score'
import { DRAFT_RUBRIC } from '../../rubrics/draft'
import type { RubricDim } from '../../prompts/checker'

const RUBRICS: Record<string, RubricDim[]> = {
  score: SCORE_RUBRIC,
  draft: DRAFT_RUBRIC
}

export function loadRubric(ref: string): RubricDim[] {
  const r = RUBRICS[ref]
  if (!r) throw new Error(`unknown rubric: ${ref}`)
  return r
}
