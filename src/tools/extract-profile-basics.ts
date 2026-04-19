/**
 * Extract structured basics from a LinkedIn profile page text using Claude Haiku.
 * Replaces fragile regex parsing with an LLM that understands the messy text.
 *
 * Cached alongside the raw data file to avoid re-calling per run.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { complete, modelFor } from '../providers/model'

export type ProfileBasics = {
  name: string
  title: string
  company: string
  headline: string
  location: string
  // Soft signals — optional. Empty strings when LLM can't confidently extract.
  seniority: string        // vp | head | director | manager | ...
  current_tenure: string   // "since 2022" or ""
  prior_company: string    // Most recent previous employer, if visible
}

const SYSTEM = `You extract structured data from LinkedIn profile page text.
Output ONLY valid JSON. No prose, no markdown.
Fields marked "" when the profile text doesn't state them clearly.
NEVER hallucinate — if unclear, emit "".`

const USER_TEMPLATE = (text: string) => `From the LinkedIn profile text below, extract:
- name: full name
- title: current role title (e.g. "Director of Engineering")
- company: current employer (e.g. "Razorpay")
- headline: full headline line as shown
- location: city/country as shown
- seniority: one of [founder, c_suite, vp, head, director, manager, senior, other] based on current title
- current_tenure: short phrase like "since 2022" or "" if unclear
- prior_company: most recent previous employer, or ""

Profile text (truncated to first 3000 chars):
"""
${text.slice(0, 3000)}
"""

Output JSON only, shape: {"name":"","title":"","company":"","headline":"","location":"","seniority":"","current_tenure":"","prior_company":""}`

export async function extractProfileBasics(profileTextOrPath: string, cachePath?: string): Promise<ProfileBasics> {
  // cachePath optional — when provided, cache alongside raw data
  let text: string
  let cacheFile = cachePath
  if (existsSync(profileTextOrPath) && profileTextOrPath.endsWith('.json')) {
    const raw = JSON.parse(readFileSync(profileTextOrPath, 'utf8'))
    text = String(raw?.profile_text ?? '')
    // Default cache: same dir, filename profile_basics.json
    if (!cacheFile) {
      cacheFile = resolve(dirname(profileTextOrPath), 'profile_basics.json')
    }
  } else {
    text = profileTextOrPath
  }

  if (cacheFile && existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, 'utf8'))
  }
  if (!text || text.length < 200) {
    return { name: '', title: '', company: '', headline: '', location: '', seniority: '', current_tenure: '', prior_company: '' }
  }

  const model = modelFor('fast')   // Haiku (anthropic) or llama-instant (groq)
  const raw = await complete(model, USER_TEMPLATE(text), { system: SYSTEM, maxTokens: 400 })
  const parsed = tryParseJson(raw)
  if (!parsed) {
    console.warn('[extract-profile-basics] JSON parse failed, raw:', raw.slice(0, 200))
    return { name: '', title: '', company: '', headline: '', location: '', seniority: '', current_tenure: '', prior_company: '' }
  }

  const out: ProfileBasics = {
    name: String(parsed.name ?? ''),
    title: String(parsed.title ?? ''),
    company: String(parsed.company ?? ''),
    headline: String(parsed.headline ?? ''),
    location: String(parsed.location ?? ''),
    seniority: String(parsed.seniority ?? ''),
    current_tenure: String(parsed.current_tenure ?? ''),
    prior_company: String(parsed.prior_company ?? ''),
  }
  if (cacheFile) {
    try { writeFileSync(cacheFile, JSON.stringify(out, null, 2)) } catch {}
  }
  return out
}

function tryParseJson(raw: string): any {
  // Models sometimes wrap in ```json ... ``` — strip
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try { return JSON.parse(cleaned) } catch {}
  // Fallback: find first { ... } block
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (m) {
    try { return JSON.parse(m[0]) } catch {}
  }
  return null
}
