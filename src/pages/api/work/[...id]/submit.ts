import type { APIRoute } from 'astro'
import { Store } from '../../../../db/store'
import { submitStage } from '../../../../db/worker-queries'
import { checkWorkerToken } from '../_auth'
import { sendEmail } from '../../../../tools/resend-send'
import { renderOutreachHtml } from '../../../../tools/outreach-email'

export const POST: APIRoute = async ({ request, params }) => {
  const authErr = checkWorkerToken(request); if (authErr) return authErr
  const prospectId = params.id; if (!prospectId) return new Response('missing id', { status: 400 })

  let body: any
  try { body = await request.json() } catch { return new Response('bad json', { status: 400 }) }
  const { claim_id, stage, output } = body ?? {}
  if (!claim_id || !stage || output === undefined) {
    return new Response('missing fields', { status: 400 })
  }

  const store = new Store()
  try {
    const res = submitStage(store.rawDb(), prospectId, stage, claim_id, output, new Date().toISOString())
    if (res === 'stale_claim') return new Response('stale claim', { status: 409 })
  } finally {
    store.close()
  }

  // Post-submit orchestration: queue next stage or fire send on Fly.
  try {
    if (stage === 'researched') {
      // Queue drafted for worker to pick up
      queueStage(prospectId, 'drafted')
    } else if (stage === 'drafted') {
      // Run send on Fly (keeps Resend server-side, no worker dependency for final email)
      void fireSentStage(prospectId).catch(err => console.error('[sent]', err))
    }
  } catch (err) {
    console.error('[post-submit]', err)
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

function queueStage(prospectId: string, stageId: string) {
  const store = new Store()
  try {
    const now = new Date().toISOString()
    const env = { stage_id: stageId, status: 'pending_worker', attempts: [], human_inputs: [], started_at: now }
    store.rawDb().prepare(`
      INSERT INTO stage_envelopes (prospect_id, stage_id, status, envelope, started_at)
      VALUES (?, ?, 'pending_worker', ?, ?)
      ON CONFLICT(prospect_id, stage_id) DO UPDATE SET
        status='pending_worker', envelope=excluded.envelope, started_at=excluded.started_at,
        claim_id=NULL, claimed_by=NULL, claim_expires_at=NULL, ended_at=NULL
    `).run(prospectId, stageId, JSON.stringify(env), now)
  } finally {
    store.close()
  }
}

async function fireSentStage(prospectId: string) {
  const store = new Store()
  try {
    const prospect = store.getProspect(prospectId)
    if (!prospect) return
    const draft = prospect.stages.drafted?.final_output as any
    if (!draft?.subject || !draft?.body) {
      console.warn(`[sent ${prospectId}] missing draft`)
      return
    }

    const html = renderOutreachHtml(draft, {
      name: prospect.name,
      title: prospect.title,
      company: prospect.company,
    })

    const result = await sendEmail({
      to: process.env.TO_EMAIL ?? 'ketan.khairnar@gmail.com',
      subject: draft.subject,
      body: draft.body,
      html,
      from: process.env.FROM_EMAIL ?? 'support@tacit.sh',
      replyTo: process.env.REPLY_TO_EMAIL ?? 'ketan.khairnar@gmail.com',
      bcc: process.env.OUTREACH_BCC ?? 'ketan.khairnar@gmail.com',
    })

    const now = new Date().toISOString()
    const env = {
      stage_id: 'sent', status: 'passed' as const, attempts: [], human_inputs: [],
      final_output: result, started_at: now, ended_at: now,
    }
    store.rawDb().prepare(`
      INSERT INTO stage_envelopes (prospect_id, stage_id, status, envelope, started_at, ended_at)
      VALUES (?, 'sent', 'passed', ?, ?, ?)
      ON CONFLICT(prospect_id, stage_id) DO UPDATE SET
        status='passed', envelope=excluded.envelope, ended_at=excluded.ended_at
    `).run(prospectId, JSON.stringify(env), now, now)
    store.rawDb().prepare(`UPDATE prospects SET current_stage = 'sent', updated_at = ? WHERE id = ?`)
      .run(now, prospectId)
  } finally {
    store.close()
  }
}
