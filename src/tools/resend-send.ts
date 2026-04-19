import { Resend } from 'resend'

let _client: Resend | null = null
function client(): Resend {
  if (_client) return _client
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY missing')
  _client = new Resend(key)
  return _client
}

export type SendInput = {
  from?: string
  to: string
  subject: string
  body: string                    // plain text (fallback)
  html?: string                   // optional rich HTML body
  replyTo?: string
  bcc?: string
}

export async function sendEmail(input: SendInput) {
  const from = input.from ?? process.env.FROM_EMAIL ?? 'support@tacit.sh'
  const replyTo = input.replyTo ?? process.env.REPLY_TO_EMAIL ?? undefined
  const bcc = input.bcc ?? process.env.OUTREACH_BCC ?? undefined
  const { data, error } = await client().emails.send({
    from,
    to: input.to,
    bcc: bcc ? [bcc] : undefined,
    replyTo,
    subject: input.subject,
    html: input.html,
    text: input.body,
  } as any)
  if (error) throw new Error(`resend error: ${JSON.stringify(error)}`)
  return data
}
