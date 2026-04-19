import type { PersonaDef } from '../personas/registry'

export type MakerInput = {
  persona: PersonaDef
  task: string
  context: Record<string, unknown>
  priorFeedback?: string[]
}

export const makerPrompt = ({ persona, task, context, priorFeedback }: MakerInput) => `${persona.name}, ${persona.designation}. ${persona.system}

Task: ${task}
Context: ${JSON.stringify(context)}
${priorFeedback?.length ? `\nFix: ${priorFeedback.join(' | ')}` : ''}

Return JSON: {"output": ..., "reasoning": "..."}. JSON only.`
