import type { APIRoute } from 'astro'
import { Store } from '../../db/store'
import crypto from 'node:crypto'

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData()
  const prospectId = String(form.get('prospect_id') ?? '')
  const campaignId = String(form.get('campaign_id') ?? '')
  const action = String(form.get('action') ?? 'approve')
  if (!prospectId || !campaignId) return new Response('bad request', { status: 400 })

  const store = new Store()
  store.appendHumanInput(campaignId, {
    id: `h_${crypto.randomBytes(4).toString('hex')}`,
    author: { id: 'web', name: 'web-user' },
    kind: action === 'reject' ? 'reject' : 'approve',
    payload: {},
    at: new Date().toISOString(),
    prospect_id: prospectId,
    stage_id: 'drafted',
    blocking: true,
  } as any)
  store.close()

  return new Response(null, {
    status: 303,
    headers: { Location: `/prospect/${encodeURIComponent(prospectId)}` },
  })
}
