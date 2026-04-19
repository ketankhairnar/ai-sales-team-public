import { defineMiddleware } from 'astro:middleware'

const COOKIE = 'outtro_app'
const ONE_WEEK = 60 * 60 * 24 * 7

const PUBLIC_PATHS = new Set<string>([
  '/',                 // waitlist landing
  '/live',             // gate entry — sets cookie when ?k= matches
  '/favicon.ico',
  '/robots.txt',
])
// Admin paths that require authed cookie (default behavior handles this, but listed for clarity)
// '/admin/waitlist' is NOT public — middleware below will 302 unauthed to /
const PUBLIC_API = new Set<string>([
  '/api/waitlist',
])

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true
  if (PUBLIC_API.has(pathname)) return true
  // Worker API: /api/work/* has its own x-worker-token auth — bypass session gate
  if (pathname.startsWith('/api/work/') || pathname === '/api/work') return true
  if (pathname.startsWith('/_astro/')) return true   // Astro assets
  if (pathname.startsWith('/assets/')) return true
  return false
}

function hasAuthCookie(request: Request): boolean {
  const cookie = request.headers.get('cookie') ?? ''
  const expected = process.env.APP_KEY
  if (!expected) return false
  // cookie value equals APP_KEY (simple, demo-grade)
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return m?.[1] === expected
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const url = new URL(ctx.request.url)
  const path = url.pathname

  // /live?k=... (GET) or POST {k} sets the cookie, then redirects to /
  if (path === '/live') {
    let k = url.searchParams.get('k')
    if (!k && ctx.request.method === 'POST') {
      try {
        const form = await ctx.request.clone().formData()
        k = String(form.get('k') ?? '')
      } catch { /* ignore */ }
    }
    const expected = process.env.APP_KEY
    if (expected && k === expected) {
      return new Response(null, {
        status: 302,
        headers: {
          'Location': '/',
          'Set-Cookie': `${COOKIE}=${expected}; Path=/; Max-Age=${ONE_WEEK}; HttpOnly; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`,
        },
      })
    }
    return new Response(null, { status: 302, headers: { 'Location': '/?bad=1' } })
  }

  const authed = hasAuthCookie(ctx.request)
  ;(ctx.locals as any).authed = authed

  if (authed) return next()

  // Not authed. Public routes → fall through. Else redirect/401.
  if (isPublic(path)) return next()
  if (path.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    })
  }
  return new Response(null, { status: 302, headers: { 'Location': '/' } })
})
