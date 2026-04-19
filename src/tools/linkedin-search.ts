import { spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import crypto from 'node:crypto'

const VENV_PY = resolve('tools/linkedin-intel/.venv/bin/python3')
const SYSTEM_PY = 'python3'
const SCRIPT = resolve('tools/linkedin-intel/linkedin-scraper.py')
const COOKIES = resolve('tools/linkedin-intel/.cookies.json')

export type Prospect = {
  name: string
  title: string
  company: string
  headline: string
  location: string
  profile_url: string
  slug: string
}

export type SearchResult = {
  meta: {
    mode: 'search'
    query: string
    pages_fetched: number
    total_raw: number
    total_unique: number
    scrape_date: string
    scrape_duration_seconds: number
  }
  prospects: Prospect[]
}

export type ICP = {
  role?: string             // "VP engineering", "CTO"
  company_stage?: string    // "Series A", "Series B", "Seed"
  company_size?: string     // "50-200 employees"
  industry?: string         // "B2B SaaS", "fintech"
  pain?: string             // free text
  geography?: string        // "United States", "India"
  keywords?: string[]       // free-form adds
}

/** Build LinkedIn people-search query from structured ICP. */
export function icpToQuery(icp: ICP): string {
  const parts: string[] = []
  if (icp.role) parts.push(`"${icp.role}"`)
  if (icp.industry) parts.push(`"${icp.industry}"`)
  if (icp.company_stage) parts.push(icp.company_stage)
  if (icp.keywords?.length) parts.push(...icp.keywords)
  return parts.join(' ')
}

/** Build a direct LinkedIn people-search URL — LI honors the geoUrn/keywords params when present. */
export function icpToSearchUrl(icp: ICP): string {
  const kw = icpToQuery(icp)
  const base = new URL('https://www.linkedin.com/search/results/people/')
  base.searchParams.set('keywords', kw)
  base.searchParams.set('origin', 'GLOBAL_SEARCH_HEADER')
  return base.toString()
}

export async function searchProspects(
  icp: ICP,
  opts: { pages?: number; cache?: boolean } = {}
): Promise<SearchResult> {
  const pages = opts.pages ?? 2
  const query = icpToQuery(icp)
  const hash = crypto.createHash('sha1').update(query).digest('hex').slice(0, 10)
  const outPath = resolve('prospects', '_search', `${hash}.json`)
  mkdirSync(dirname(outPath), { recursive: true })

  if (opts.cache !== false && existsSync(outPath)) {
    return JSON.parse(readFileSync(outPath, 'utf8'))
  }

  const py = existsSync(VENV_PY) ? VENV_PY : SYSTEM_PY
  await runPython(py, [SCRIPT, '--mode', 'search', query, outPath, '--cookies', COOKIES, '--pages', String(pages)])

  if (!existsSync(outPath)) throw new Error('linkedin search produced no output')
  return JSON.parse(readFileSync(outPath, 'utf8')) as SearchResult
}

function runPython(bin: string, args: string[]): Promise<void> {
  return new Promise((ok, err) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    p.on('exit', code => (code === 0 ? ok() : err(new Error(`${bin} exit ${code}`))))
    p.on('error', err)
  })
}
