// src/pages/api/work/_auth.ts
export function checkWorkerToken(request: Request): Response | null {
  const expected = process.env.WORKER_TOKEN
  if (!expected) return new Response('WORKER_TOKEN not set on server', { status: 500 })
  const got = request.headers.get('x-worker-token')
  if (got !== expected) return new Response('unauthorized', { status: 401 })
  return null
}

export function workerId(request: Request): string {
  return request.headers.get('x-worker-id') ?? 'unknown-worker'
}
