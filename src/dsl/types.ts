import type { PersonaId } from '../../personas/registry'

export type StageSpec = {
  id: string                          // 'score' | 'research' | 'draft' | 'send' | ...
  label: string                       // 'Scoring' (UI)
  maker: PersonaId
  checker?: PersonaId                 // optional = no checker
  arbiter?: PersonaId                 // optional = no arbiter
  rubric?: string                     // rubric module ref: 'rubrics/draft'
  tools?: string[]                    // tool IDs used in this stage
  max_iterations?: number             // default 2
  pass_threshold?: number             // default 8
  task?: string                       // instruction for the Maker — maps to output shape
  human_gate?: {
    kind: 'approve' | 'edit' | 'none'
    blocking: boolean
  }
  on_reject: 'drop' | 'park' | 'escalate'
}

export type PipelineSpec = {
  name: string
  version: string
  icp_schema: Record<string, unknown>   // JSON schema for ICP
  stages: StageSpec[]
  fanout?: {                             // for scored → top N researched
    after_stage: string
    top_n: number
    sort_by: string                      // 'score' desc
  }[]
}
