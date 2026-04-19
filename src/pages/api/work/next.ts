// src/pages/api/work/next.ts
import type { APIRoute } from 'astro'
import { Store } from '../../../db/store'
import { claimNextPending } from '../../../db/worker-queries'
import { checkWorkerToken, workerId } from './_auth'

const DEFAULT_TTL = Number(process.env.WORKER_CLAIM_TTL ?? 300)
const ALLOWED_STAGES = new Set(['researched', 'drafted'])

export const GET: APIRoute = async ({ request, url }) => {
  const authErr = checkWorkerToken(request); if (authErr) return authErr

  const stage = url.searchParams.get('stage') ?? ''
  if (!ALLOWED_STAGES.has(stage)) return new Response('bad stage', { status: 400 })

  const ttl = Math.min(900, Math.max(60, Number(url.searchParams.get('claim_ttl') ?? DEFAULT_TTL)))
  const store = new Store()
  try {
    const work = claimNextPending(store.rawDb(), stage, workerId(request), ttl)
    if (!work) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(work), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } finally {
    store.close()
  }
}
