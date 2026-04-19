import type { PersonaDef } from '../personas/registry'

export type RubricDim = { dim: string; guide: string }

export type CheckerInput = {
  persona: PersonaDef
  artifact: unknown
  rubric: RubricDim[]
  stage: string
  stageContext: Record<string, unknown>
  passThreshold?: number
}

export type CheckerResult = {
  overall_score: number
  dimension_scores: Record<string, number>
  issues: string[]
  suggestions: string[]
  pass: boolean
}

export const checkerPrompt = ({ persona, artifact, rubric, stage, stageContext, passThreshold }: CheckerInput) => {
  const threshold = passThreshold ?? 8
  return `${persona.name}, ${persona.designation}. Critique only. ${persona.system}

Stage: ${stage}
Context: ${JSON.stringify(stageContext)}
Artifact: ${typeof artifact === 'string' ? artifact : JSON.stringify(artifact)}

Rubric (1-10 each):
${rubric.map(r => `- ${r.dim}: ${r.guide}`).join('\n')}

overall_score = min of dims. pass = overall >= ${threshold}.

JSON (use double quotes only): {"overall_score":N,"dimension_scores":{${rubric.map(r => `"${r.dim}":N`).join(',')}},"issues":["..."],"suggestions":["..."],"pass":true|false}. JSON only.`
}
