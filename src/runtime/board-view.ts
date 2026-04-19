// Pure view-layer derivations. No DB, no side effects.
import type { Prospect } from '../dsl/envelope'

export type ColumnId =
  | 'discovered' | 'scored' | 'qualified' | 'researched' | 'drafted' | 'sent' | 'lost' | 'parked'

export const COLUMNS: { id: ColumnId; label: string; width: string }[] = [
  { id: 'discovered', label: 'Discovered', width: '1fr' },
  { id: 'scored',     label: 'Scored',     width: '1fr' },
  { id: 'qualified',  label: 'Qualified',  width: '1fr' },
  { id: 'researched', label: 'Researched', width: '1.2fr' },
  { id: 'drafted',    label: 'Drafted',    width: '1.8fr' },
  { id: 'sent',       label: 'Sent',       width: '1fr' },
  { id: 'lost',       label: 'Lost',       width: '0.8fr' },
  { id: 'parked',     label: 'Parked',     width: '0.8fr' },
]

const QUALIFIED_THRESHOLD = 7

export function prospectScore(p: Prospect): number | undefined {
  const s = (p.stages.scored?.final_output as any)?.score
  return typeof s === 'number' ? s : undefined
}

/** Where a prospect belongs on the visual board. Outcome overrides all. */
export function columnFor(p: Prospect): ColumnId {
  if (p.outcome === 'lost') return 'lost'
  if (p.outcome === 'parked') return 'parked'
  // Between scored and researched, "Qualified" is derived from threshold
  if (p.current_stage === 'scored') {
    const s = prospectScore(p)
    if (typeof s === 'number' && s >= QUALIFIED_THRESHOLD) return 'qualified'
    return 'scored'
  }
  return (p.current_stage as ColumnId)
}

export function groupByColumn(prospects: Prospect[]): Map<ColumnId, Prospect[]> {
  const m = new Map<ColumnId, Prospect[]>()
  for (const c of COLUMNS) m.set(c.id, [])
  for (const p of prospects) {
    const col = columnFor(p)
    const arr = m.get(col) ?? []
    arr.push(p)
    m.set(col, arr)
  }
  return m
}

/** Human-readable stage age, e.g. "3m", "2h", "1d". */
export function stageAge(p: Prospect, now = Date.now()): string | null {
  const entered = p.stage_entered_at ?? p.updated_at
  if (!entered) return null
  const ms = now - new Date(entered).getTime()
  if (ms < 0) return null
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function whyQualifies(p: Prospect): string[] {
  const out: string[] = []
  const scored = p.stages.scored?.final_output as any
  if (scored?.reasons && Array.isArray(scored.reasons)) out.push(...scored.reasons)
  // Also surface last attempt's checker rationale if present
  const lastAttempt = p.stages.scored?.attempts?.at(-1)
  const checkerNotes = (lastAttempt?.checker?.result as any)?.notes
  if (typeof checkerNotes === 'string') out.push(`checker: ${checkerNotes}`)
  return out.slice(0, 5)
}
