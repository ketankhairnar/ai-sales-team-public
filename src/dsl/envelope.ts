import type { PersonaId } from '../../personas/registry'
import type { CheckerResult } from '../../prompts/checker'
import type { ArbiterDecision } from '../../prompts/arbiter'

export type HumanInput = {
  id: string
  author: { id: string; name: string }
  kind: 'approve' | 'reject' | 'edit' | 'comment' | 'nudge' | 'override'
  payload: unknown
  at: string   // ISO
}

export type StageAttempt = {
  iter: number
  maker: { persona: PersonaId; output: unknown; at: string; tokens?: number; cost?: number }
  checker?: { persona: PersonaId; result: CheckerResult; at: string }
  arbiter?: { persona: PersonaId; decision: ArbiterDecision; at: string }
}

export type StageEnvelope = {
  stage_id: string
  status: 'pending' | 'in_progress' | 'passed' | 'rejected' | 'awaiting_human' | 'pending_worker'
  attempts: StageAttempt[]
  final_output?: unknown
  reject_reason?: string
  human_inputs: HumanInput[]
  started_at?: string
  ended_at?: string
}

export type Prospect = {
  id: string
  name: string
  linkedin_url?: string
  x_handle?: string
  company: string
  title: string
  current_stage: string
  stages: Record<string, StageEnvelope>   // keyed by stage_id
  created_at: string
  updated_at: string
  stage_entered_at?: string
  outcome?: 'won' | 'lost' | 'parked'
  outcome_reason?: string
  outcome_note?: string
}

export type Campaign = {
  id: string
  title?: string                          // human-readable name
  pipeline: string                        // pipeline name+version
  icp: Record<string, unknown>
  prospects: string[]                     // prospect ids
  created_at: string
  created_by: string
}

export type PipelineEvent =
  | { kind: 'stage_start'; prospect_id: string; stage_id: string; at: string }
  | { kind: 'attempt'; prospect_id: string; stage_id: string; attempt: StageAttempt }
  | { kind: 'stage_pass'; prospect_id: string; stage_id: string; output: unknown; at: string }
  | { kind: 'stage_reject'; prospect_id: string; stage_id: string; reason: string; at: string }
  | { kind: 'human_input'; prospect_id: string; stage_id: string; input: HumanInput }
  | { kind: 'stage_advance'; prospect_id: string; from: string; to: string; at: string }
