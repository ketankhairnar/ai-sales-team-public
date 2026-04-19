/**
 * People-at-org discovery via LinkedIn search.
 * Takes a company name + target role, queries LinkedIn people-search, returns candidates.
 * Cost: 1 hit per page of search results (default 1 page). Hit-capped.
 */
import { spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { consumeLinkedInHits } from './linkedin-hitcap'

const VENV_PY = resolve('tools/linkedin-intel/.venv/bin/python3')
const SYSTEM_PY = 'python3'
const SCRIPT = resolve('tools/linkedin-intel/linkedin-scraper.py')
const COOKIES = resolve('tools/linkedin-intel/.cookies.json')

export type PeopleSearchResult = {
  name: string
  title: string
  company: string
  headline: string
  location: string
  profile_url: string
  slug: string
}

export type PeopleAtOrgInput = {
  company: string
  role: string
  pages?: number          // default 1, cost = pages hits
  max_results?: number    // cap returned results
  cache_key?: string      // override the auto slug for caching
}

export type PeopleAtOrgOutput = {
  meta: { query: string; total_raw: number; total_unique: number; scrape_duration_seconds: number }
  prospects: PeopleSearchResult[]
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function linkedinPeopleAtOrg(input: PeopleAtOrgInput): Promise<PeopleAtOrgOutput> {
  const pages = input.pages ?? 1
  const cacheKey = input.cache_key ?? `${slug(input.role)}-at-${slug(input.company)}`
  const outPath = resolve('prospects', '_search', cacheKey, 'linkedin_search.json')
  mkdirSync(dirname(outPath), { recursive: true })

  if (existsSync(outPath)) {
    const cached = JSON.parse(readFileSync(outPath, 'utf8'))
    return filterAndCap(cached, input.max_results)
  }

  consumeLinkedInHits(pages, `linkedin-people-at-org:${cacheKey}`)

  const query = `"${input.role}" "${input.company}"`
  const py = existsSync(VENV_PY) ? VENV_PY : SYSTEM_PY
  await runPython(py, [SCRIPT, '--mode', 'search', query, outPath, '--cookies', COOKIES, '--pages', String(pages)])

  if (!existsSync(outPath)) throw new Error(`linkedin search produced no output for ${cacheKey}`)
  const data = JSON.parse(readFileSync(outPath, 'utf8'))
  return filterAndCap(data, input.max_results)
}

function filterAndCap(data: any, maxResults?: number): PeopleAtOrgOutput {
  const prospects: PeopleSearchResult[] = (data.prospects ?? []).filter((p: any) => p.slug && p.name)
  return {
    meta: {
      query: data.meta?.query ?? '',
      total_raw: data.meta?.total_raw ?? prospects.length,
      total_unique: data.meta?.total_unique ?? prospects.length,
      scrape_duration_seconds: data.meta?.scrape_duration_seconds ?? 0,
    },
    prospects: maxResults ? prospects.slice(0, maxResults) : prospects,
  }
}

function runPython(bin: string, args: string[]): Promise<void> {
  return new Promise((ok, err) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    p.on('exit', code => (code === 0 ? ok() : err(new Error(`${bin} exit ${code}`))))
    p.on('error', err)
  })
}
