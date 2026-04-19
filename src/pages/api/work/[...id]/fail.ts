import type { APIRoute } from 'astro'
import { Store } from '../../../../db/store'
import { failStage } from '../../../../db/worker-queries'
import { checkWorkerToken } from '../_auth'
import { sendEmail } from '../../../../tools/resend-send'

export const POST: APIRoute = async ({ request, params }) => {
  const authErr = checkWorkerToken(request); if (authErr) return authErr
  const prospectId = params.id; if (!prospectId) return new Response('missing id', { status: 400 })

  let body: any
  try { body = await request.json() } catch { return new Response('bad json', { status: 400 }) }
  const { claim_id, stage, reason } = body ?? {}
  if (!claim_id || !stage || !reason) return new Response('missing fields', { status: 400 })

  const store = new Store()
  const reasonClipped = String(reason).slice(0, 500)
  try {
    const res = failStage(store.rawDb(), prospectId, stage, claim_id, reasonClipped, new Date().toISOString())
    if (res === 'stale_claim') return new Response('stale claim', { status: 409 })
  } finally {
    store.close()
  }

  // Fire rejection notice email (fire-and-forget)
  void fireRejectionNotice(prospectId, stage, reasonClipped).catch(err => console.error('[reject-notice]', err))

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

async function fireRejectionNotice(prospectId: string, stage: string, reason: string) {
  const store = new Store()
  try {
    const prospect = store.getProspect(prospectId)
    if (!prospect) return
    const draft = prospect.stages.drafted?.final_output as any
    const research = prospect.stages.researched?.final_output as any

    const html = renderRejectionHtml({
      prospect: {
        name: prospect.name,
        title: prospect.title,
        company: prospect.company,
        linkedin_url: prospect.linkedin_url,
      },
      stage,
      reason,
      draft,
      research,
    })

    await sendEmail({
      to: process.env.REJECT_NOTICE_EMAIL ?? process.env.OUTREACH_BCC ?? 'ketan.khairnar@gmail.com',
      subject: `[rejected@${stage}] ${prospect.name} · ${prospect.company ?? ''}`.slice(0, 120),
      body: `Prospect ${prospect.name} rejected at ${stage}.\n\nReason: ${reason}`,
      html,
      from: process.env.FROM_EMAIL ?? 'support@tacit.sh',
      replyTo: process.env.REPLY_TO_EMAIL ?? 'ketan.khairnar@gmail.com',
    })
  } finally {
    store.close()
  }
}

function esc(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function renderRejectionHtml(o: {
  prospect: { name: string; title?: string; company?: string; linkedin_url?: string }
  stage: string
  reason: string
  draft?: any
  research?: any
}): string {
  const draftBlock = o.draft?.subject ? `
    <tr><td style="padding:16px 28px 0;">
      <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888;">last attempted draft</div>
      <div style="font-family:Georgia,serif;font-size:16px;margin-top:6px;font-weight:600;">${esc(o.draft.subject)}</div>
      <div style="font-family:Georgia,serif;font-size:13px;color:#555;margin-top:8px;line-height:1.6;white-space:pre-wrap;">${esc(o.draft.body ?? '')}</div>
    </td></tr>` : ''

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>rejected: ${esc(o.prospect.name)}</title></head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:Georgia,serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafaf7;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:32px 16px;background:#ffffff;border:2px solid #c00;">
        <tr><td style="padding:20px 28px;border-bottom:2px solid #c00;background:#fff5f5;">
          <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#c00;">
            dispatch · rejected at ${esc(o.stage)}
          </div>
          <div style="font-family:Georgia,serif;font-size:22px;line-height:1.15;font-weight:600;margin-top:6px;">
            ${esc(o.prospect.name)} — not sent
          </div>
        </td></tr>

        <tr><td style="padding:20px 28px 8px;">
          <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888;">prospect</div>
          <div style="font-family:Georgia,serif;font-size:15px;margin-top:4px;">
            ${esc(o.prospect.title ?? '')}${o.prospect.company ? ` · ${esc(o.prospect.company)}` : ''}
          </div>
          ${o.prospect.linkedin_url ? `<a href="${esc(o.prospect.linkedin_url)}" style="font-family:Menlo,monospace;font-size:11px;color:#666;">${esc(o.prospect.linkedin_url)}</a>` : ''}
        </td></tr>

        <tr><td style="padding:12px 28px 0;">
          <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888;">rejection reason</div>
          <div style="font-family:Georgia,serif;font-size:14px;line-height:1.55;color:#333;margin-top:6px;padding:12px;background:#fff5f5;border-left:3px solid #c00;">
            ${esc(o.reason)}
          </div>
        </td></tr>

        ${draftBlock}

        <tr><td style="padding:16px 28px 20px;border-top:1px solid #eee;margin-top:12px;">
          <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888;">
            outtro.tacit.sh · m/c/a council · no email sent
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
