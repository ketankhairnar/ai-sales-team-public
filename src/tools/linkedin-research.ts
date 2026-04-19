import { spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { consumeLinkedInHits } from './linkedin-hitcap'

const VENV_PY = resolve('tools/linkedin-research/.venv/bin/python3')
const SYSTEM_PY = 'python3'
const SCRIPT = resolve('tools/linkedin-research/linkedin-research.py')
const COOKIES = resolve('tools/linkedin-research/.cookies.json')

export type LinkedInRaw = {
  profile_text_length?: number
  scrape_status?: { profile?: string; activity?: string; articles?: string }
  [k: string]: unknown
}

export type LinkedInOpts = { light?: boolean; outDir?: string }

export async function linkedinResearch(profileUrl: string, opts: LinkedInOpts = {}): Promise<LinkedInRaw> {
  const slug = profileUrl.replace(/\/$/, '').split('/in/')[1]?.split(/[/?]/)[0]
  if (!slug) throw new Error(`bad linkedin url: ${profileUrl}`)

  const outDir = opts.outDir ?? 'prospects'
  const outPath = resolve(outDir, slug, 'linkedin_raw_data.json')
  mkdirSync(dirname(outPath), { recursive: true })

  // Cache hit: no network call, no hit-cap consumed
  if (existsSync(outPath)) {
    return JSON.parse(readFileSync(outPath, 'utf8'))
  }

  // Rate limit: each run costs 1 (light) or 3 (full) page hits.
  const cost = opts.light ? 1 : 3
  consumeLinkedInHits(cost, `linkedin-research:${slug}${opts.light ? ':light' : ''}`)

  const py = existsSync(VENV_PY) ? VENV_PY : SYSTEM_PY
  const args = [SCRIPT, profileUrl, outPath, '--cookies', COOKIES]
  if (opts.light) args.push('--light')
  await runPython(py, args)

  if (!existsSync(outPath)) throw new Error(`scraper produced no output for ${slug}`)
  const data = JSON.parse(readFileSync(outPath, 'utf8')) as LinkedInRaw
  const plen = (data.profile_text_length as number | undefined)
    ?? ((data as any).meta?.profile_text_length as number | undefined)
    ?? 0
  if (plen < 200) {
    throw new Error(`scraper returned insufficient data for ${slug} (likely auth/captcha)`)
  }
  return data
}

function runPython(bin: string, args: string[]): Promise<void> {
  return new Promise((ok, err) => {
    // stderr inherited so scraper log lines stream to the server log for debugging.
    const p = spawn(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    p.on('exit', code => (code === 0 ? ok() : err(new Error(`linkedin-research.py exited with code ${code} (args: ${args.slice(1, 3).join(' ')})`))))
    p.on('error', err)
  })
}
