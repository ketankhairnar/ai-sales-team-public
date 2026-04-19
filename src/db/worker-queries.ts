// src/db/worker-queries.ts
import type Database from 'better-sqlite3'
import crypto from 'node:crypto'
import type { StageEnvelope } from '../dsl/envelope'

export type ClaimedWork = {
  claim_id: string
  prospect_id: string
  campaign_id: string
  stage: string
  linkedin_url: string | null
  icp: Record<string, unknown>
  prior_stages: Record<string, unknown>
  prospect: { id: string; name: string; company: string; title: string; linkedin_url: string | null }
  expires_at: string
}

/** Atomically claim one pending_worker stage. Returns null if queue empty. */
export function claimNextPending(db: Database.Database, stage: string, workerId: string, ttlSec: number): ClaimedWork | null {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlSec * 1000).toISOString()
  const claimId = `clm_${crypto.randomBytes(6).toString('hex')}`

  return db.transaction((): ClaimedWork | null => {
    // Release stale claims first
    db.prepare(`
      UPDATE stage_envelopes
      SET status = 'pending_worker', claim_id = NULL, claimed_by = NULL, claim_expires_at = NULL
      WHERE status = 'in_progress' AND claim_expires_at IS NOT NULL AND claim_expires_at < ?
    `).run(now.toISOString())

    // Find one pending_worker row for this stage
    const row = db.prepare(`
      SELECT se.prospect_id, se.envelope, p.linkedin_url, p.campaign_id,
             p.name AS p_name, p.company AS p_company, p.title AS p_title
      FROM stage_envelopes se
      JOIN prospects p ON p.id = se.prospect_id
      WHERE se.stage_id = ? AND se.status = 'pending_worker'
      ORDER BY se.started_at ASC
      LIMIT 1
    `).get(stage) as any
    if (!row) return null

    // Claim it
    db.prepare(`
      UPDATE stage_envelopes
      SET status = 'in_progress', claim_id = ?, claimed_by = ?, claim_expires_at = ?
      WHERE prospect_id = ? AND stage_id = ?
    `).run(claimId, workerId, expiresAt, row.prospect_id, stage)

    // Gather ICP + prior stages
    const campaign = db.prepare(`SELECT icp FROM campaigns WHERE id = ?`).get(row.campaign_id) as any
    const allStages = db.prepare(`SELECT stage_id, envelope FROM stage_envelopes WHERE prospect_id = ?`).all(row.prospect_id) as any[]
    const prior: Record<string, unknown> = {}
    for (const s of allStages) {
      if (s.stage_id !== stage) {
        const env = JSON.parse(s.envelope) as StageEnvelope
        if (env.status === 'passed') prior[s.stage_id] = env.final_output
      }
    }

    return {
      claim_id: claimId,
      prospect_id: row.prospect_id,
      campaign_id: row.campaign_id,
      stage,
      linkedin_url: row.linkedin_url,
      icp: campaign ? JSON.parse(campaign.icp) : {},
      prior_stages: prior,
      prospect: {
        id: row.prospect_id,
        name: row.p_name,
        company: row.p_company,
        title: row.p_title,
        linkedin_url: row.linkedin_url,
      },
      expires_at: expiresAt,
    }
  })()
}

/** Submit completed stage. Returns 'ok' | 'stale_claim'. */
export function submitStage(
  db: Database.Database,
  prospectId: string,
  stageId: string,
  claimId: string,
  output: unknown,
  now: string,
): 'ok' | 'stale_claim' {
  return db.transaction((): 'ok' | 'stale_claim' => {
    const row = db.prepare(`
      SELECT envelope, claim_id, status FROM stage_envelopes WHERE prospect_id = ? AND stage_id = ?
    `).get(prospectId, stageId) as any
    if (!row || row.claim_id !== claimId) return 'stale_claim'

    const env = JSON.parse(row.envelope) as StageEnvelope
    env.status = 'passed'
    env.final_output = output
    env.ended_at = now

    db.prepare(`
      UPDATE stage_envelopes
      SET status = 'passed', envelope = ?, ended_at = ?, claim_id = NULL, claimed_by = NULL, claim_expires_at = NULL
      WHERE prospect_id = ? AND stage_id = ?
    `).run(JSON.stringify(env), now, prospectId, stageId)

    // Advance current_stage
    db.prepare(`UPDATE prospects SET current_stage = ?, updated_at = ? WHERE id = ?`)
      .run(stageId, now, prospectId)
    return 'ok'
  })()
}

/** Mark a claim as failed (rejected status). */
export function failStage(
  db: Database.Database,
  prospectId: string,
  stageId: string,
  claimId: string,
  reason: string,
  now: string,
): 'ok' | 'stale_claim' {
  return db.transaction((): 'ok' | 'stale_claim' => {
    const row = db.prepare(`
      SELECT envelope, claim_id FROM stage_envelopes WHERE prospect_id = ? AND stage_id = ?
    `).get(prospectId, stageId) as any
    if (!row || row.claim_id !== claimId) return 'stale_claim'

    const env = JSON.parse(row.envelope) as StageEnvelope
    env.status = 'rejected'
    env.reject_reason = reason
    env.ended_at = now

    db.prepare(`
      UPDATE stage_envelopes
      SET status = 'rejected', envelope = ?, ended_at = ?, claim_id = NULL, claimed_by = NULL, claim_expires_at = NULL
      WHERE prospect_id = ? AND stage_id = ?
    `).run(JSON.stringify(env), now, prospectId, stageId)
    return 'ok'
  })()
}
