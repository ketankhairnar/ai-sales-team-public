import type { APIRoute } from 'astro'
import crypto from 'node:crypto'
import { Store } from '../../db/store'

const ALLOWED_REASONS = new Set(['not_icp', 'wrong_timing', 'no_reply', 'budget_freeze', 'duplicate', 'other'])
const ALLOWED_OUTCOMES = ['won', 'lost', 'parked'] as const
type Outcome = typeof ALLOWED_OUTCOMES[number]

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData()
  // Clip lengths + whitelist outcome/reason to prevent DB bloat or free-text in enum cols.
  const clip = (v: unknown, n: number) => String(v ?? '').slice(0, n)
  const prospectId = clip(form.get('prospect_id'), 200)
  const outcomeRaw = clip(form.get('outcome'), 16)
  const reasonCode = clip(form.get('reason_code'), 32)
  const reasonNote = clip(form.get('reason_note'), 1000) || null
  const campaignId = clip(form.get('campaign_id'), 40)

  const outcome = outcomeRaw as Outcome
  if (!prospectId || !ALLOWED_OUTCOMES.includes(outcome) || !ALLOWED_REASONS.has(reasonCode)) {
    return new Response('bad request', { status: 400 })
  }

  const store = new Store()
  const at = new Date().toISOString()
  store.setOutcome(prospectId, outcome, reasonCode, reasonNote, at)
  store.appendHumanInput(campaignId, {
    id: `h_${crypto.randomBytes(4).toString('hex')}`,
    prospect_id: prospectId,
    stage_id: 'outcome',
    author: { id: 'web', name: 'user' },
    kind: outcome === 'won' ? 'approve' : 'reject',
    payload: { outcome, reason_code: reasonCode, reason_note: reasonNote },
    blocking: false,
    at,
  } as any)
  store.close()

  const loc = campaignId
    ? `/campaign/${encodeURIComponent(campaignId)}?p=${encodeURIComponent(prospectId)}`
    : `/prospect/${encodeURIComponent(prospectId)}`
  return new Response(null, { status: 303, headers: { Location: loc } })
}
