/**
 * SerpApi (Google search) → clean LinkedIn profile URLs.
 * Cost: 1 SerpApi credit per company. Free tier: 100/mo.
 * Returns structured {name, slug, profile_url} — snippet text sometimes noisy but URL is always clean.
 *
 * NOTE: SerpApi-sourced data is "name + URL" only. Real title/company must still come from
 * a profile scrape (linkedin_research light mode).
 */
import axios from 'axios'

export type SerpApiInput = {
  company: string
  role: string
  max_results?: number   // default 5
  extra_keywords?: string[]
}

export type SerpApiResult = {
  name: string
  slug: string
  profile_url: string
  snippet: string        // raw Google snippet — carry through in case useful
}

export type SerpApiOutput = {
  meta: { query: string; total_found: number; duration_seconds: number; credits_used: number }
  prospects: SerpApiResult[]
}

const LINKEDIN_IN_RE = /linkedin\.com\/in\/([a-zA-Z0-9\-_%]+)/i

function parseName(title: string): string {
  // Google title format: "Name - Headline | LinkedIn" or "Name | LinkedIn"
  const cleaned = title.replace(/\s*\|\s*LinkedIn.*$/i, '').trim()
  // Name is usually before first " - " or the whole thing if no dash
  const parts = cleaned.split(/\s+[-–—]\s+/)
  return parts[0]?.trim() ?? cleaned
}

export async function serpApiLinkedInSearch(input: SerpApiInput): Promise<SerpApiOutput> {
  const apiKey = process.env.SERPAPI_KEY
  if (!apiKey) throw new Error('SERPAPI_KEY not set')

  const extras = input.extra_keywords?.join(' ') ?? ''
  const query = `site:linkedin.com/in "${input.role}" "${input.company}" ${extras}`.trim()
  const max = input.max_results ?? 5

  const t0 = Date.now()
  const res = await axios.get('https://serpapi.com/search.json', {
    params: {
      engine: 'google',
      q: query,
      api_key: apiKey,
      num: Math.min(max * 2, 20), // over-fetch, filter to valid /in/ URLs
    },
    timeout: 20_000,
  })

  const organic = (res.data?.organic_results ?? []) as any[]
  const seen = new Set<string>()
  const prospects: SerpApiResult[] = []
  for (const r of organic) {
    const link = String(r?.link ?? '')
    const m = LINKEDIN_IN_RE.exec(link)
    if (!m) continue
    const slug = decodeURIComponent(m[1])
    if (seen.has(slug)) continue
    seen.add(slug)
    const name = parseName(String(r?.title ?? ''))
    prospects.push({
      name,
      slug,
      profile_url: `https://www.linkedin.com/in/${slug}`,
      snippet: String(r?.snippet ?? ''),
    })
    if (prospects.length >= max) break
  }

  return {
    meta: {
      query,
      total_found: prospects.length,
      duration_seconds: (Date.now() - t0) / 1000,
      credits_used: 1,
    },
    prospects,
  }
}
