import type { APIRoute } from 'astro'
import crypto from 'node:crypto'
import { Resend } from 'resend'
import { Store } from '../../db/store'

const HTML_TEMPLATE = (email: string) => `<!doctype html>
<html>
<head><meta charset="utf-8"><title>you're on the list</title></head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:Georgia,serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafaf7;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:40px 20px;background:#ffffff;border:2px solid #1a1a1a;">
        <tr><td style="padding:24px 28px;border-bottom:2px solid #1a1a1a;">
          <div style="font-family:Menlo,monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#666;">
            dispatch · waitlist confirmation
          </div>
          <div style="font-family:Georgia,serif;font-size:28px;line-height:1.1;font-weight:600;margin-top:8px;">
            you're on the list.
          </div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.6;color:#333;">
          <p style="margin:0 0 16px 0;">Thanks for signing up for <strong>Outtro</strong> — the AI sales team that reads the room before it knocks.</p>
          <p style="margin:0 0 16px 0;">Currently in private trial. Four agents — Siddharth, Shruti, Vikram, Esha — argue over your prospects before drafting cold emails that don't read like cold emails.</p>
          <p style="margin:0 0 16px 0;">I'll email you when access opens. Reply to this note with what problem you'd use it for — those people get access sooner.</p>
          <p style="margin:0;font-family:Menlo,monospace;font-size:12px;color:#666;">— ketan khairnar · tacit.sh</p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #1a1a1a;background:#f5f5ef;">
          <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">
            outtro.tacit.sh · brutalist · editorial
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function hashIp(ip: string): string {
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

async function sendHtml(opts: { to: string; replyTo?: string; bcc?: string; subject: string; html: string; from: string }) {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY missing')
  const resend = new Resend(key)
  const { data, error } = await resend.emails.send({
    from: opts.from,
    to: opts.to,
    bcc: opts.bcc ? [opts.bcc] : undefined,
    replyTo: opts.replyTo,
    subject: opts.subject,
    html: opts.html,
  } as any)
  if (error) throw new Error(`resend: ${JSON.stringify(error)}`)
  return data
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let email = ''
  let note = ''

  const ct = request.headers.get('content-type') ?? ''
  try {
    if (ct.includes('application/json')) {
      const body = await request.json() as any
      email = String(body?.email ?? '').trim().toLowerCase()
      note = String(body?.note ?? '').trim().slice(0, 200)
    } else {
      const fd = await request.formData()
      email = String(fd.get('email') ?? '').trim().toLowerCase()
      note = String(fd.get('note') ?? '').trim().slice(0, 200)
    }
  } catch {
    return new Response(JSON.stringify({ error: 'bad request' }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  if (!EMAIL_RE.test(email) || email.length > 200) {
    return new Response(JSON.stringify({ error: 'invalid email' }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  const store = new Store()
  let dbResult: 'inserted' | 'exists'
  try {
    dbResult = store.addWaitlist({
      email,
      note: note || undefined,
      source: 'landing',
      user_agent: (request.headers.get('user-agent') ?? '').slice(0, 300),
      ip_hash: clientAddress ? hashIp(clientAddress) : undefined,
      created_at: new Date().toISOString(),
    })
  } finally {
    store.close()
  }

  // Fire confirmation + BCC (don't fail the request if email fails)
  const from = process.env.WAITLIST_FROM_EMAIL ?? 'onboarding@resend.dev'
  const bcc = process.env.WAITLIST_BCC ?? 'ketan.khairnar@gmail.com'
  const replyTo = process.env.WAITLIST_REPLY_TO ?? 'ketan.khairnar@gmail.com'

  sendHtml({
    from,
    to: email,
    bcc,
    replyTo,
    subject: dbResult === 'exists' ? 'still on the list — outtro' : "you're on the list — outtro",
    html: HTML_TEMPLATE(email) + (note ? `<!-- note: ${note.replace(/-->/g, '')} -->` : ''),
  }).catch((err) => console.error('[waitlist] email failed:', err.message))

  return new Response(JSON.stringify({ ok: true, existed: dbResult === 'exists' }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}
