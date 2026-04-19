/**
 * Outreach email HTML — brutalist/editorial, matches waitlist confirmation visual.
 * Renders subject + body + AI opportunity map in a single email.
 */

export type DraftOutput = {
  subject: string
  body: string
  opportunity_map?: string[]
}

export type OutreachProspect = {
  name: string
  title?: string
  company?: string
}

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function renderOutreachHtml(draft: DraftOutput, prospect: OutreachProspect): string {
  const bullets = (draft.opportunity_map ?? []).slice(0, 3)
  const bodyLines = esc(draft.body)
    .split(/\n\n+/)
    .map(p => `<p style="margin:0 0 16px 0;line-height:1.6;">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('')

  const mapHtml = bullets.length === 0 ? '' : `
        <tr><td style="padding:0 28px 6px;">
          <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#888;border-top:1px solid #1a1a1a;padding-top:16px;margin-top:8px;">
            ai opportunity map · for ${esc(prospect.company ?? 'your team')}
          </div>
        </td></tr>
        <tr><td style="padding:0 28px 24px;">
          <ol style="margin:12px 0 0 0;padding:0;list-style:none;">
            ${bullets.map((b, i) => `
              <li style="display:flex;gap:12px;margin-bottom:12px;">
                <span style="font-family:Menlo,monospace;font-size:11px;color:#888;flex-shrink:0;width:24px;padding-top:2px;">0${i + 1}</span>
                <span style="font-family:Georgia,serif;font-size:14px;line-height:1.5;color:#333;">${esc(b)}</span>
              </li>`).join('')}
          </ol>
        </td></tr>`

  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${esc(draft.subject)}</title></head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:Georgia,serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafaf7;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:32px 16px;background:#ffffff;border:2px solid #1a1a1a;">
        <tr><td style="padding:20px 28px;border-bottom:2px solid #1a1a1a;">
          <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#666;">
            dispatch · outbound
          </div>
          <div style="font-family:Georgia,serif;font-size:24px;line-height:1.15;font-weight:600;margin-top:6px;">
            ${esc(draft.subject)}
          </div>
        </td></tr>
        <tr><td style="padding:24px 28px 8px;font-size:15px;color:#333;">
          ${bodyLines}
        </td></tr>
        ${mapHtml}
        <tr><td style="padding:12px 28px;border-top:2px solid #1a1a1a;background:#f5f5ef;">
          <div style="font-family:Menlo,monospace;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888;">
            — ketan khairnar · tacit.sh · reply to chat
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
