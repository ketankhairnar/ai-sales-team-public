import { spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const VENV_PY = resolve('tools/linkedin-intel/.venv/bin/python3')
const SYSTEM_PY = 'python3'
const SCRIPT = resolve('tools/linkedin-intel/linkedin-scraper.py')
const COOKIES = resolve('tools/linkedin-intel/.cookies.json')

export type Mode = 'profile' | 'post' | 'company' | 'search'

export async function linkedinIntel(mode: Mode, target: string, outPath: string): Promise<unknown> {
  mkdirSync(dirname(outPath), { recursive: true })
  if (existsSync(outPath)) return JSON.parse(readFileSync(outPath, 'utf8'))
  const py = existsSync(VENV_PY) ? VENV_PY : SYSTEM_PY
  await runPython(py, [SCRIPT, '--mode', mode, target, outPath, '--cookies', COOKIES])
  if (!existsSync(outPath)) throw new Error(`linkedin-intel ${mode} produced no output`)
  return JSON.parse(readFileSync(outPath, 'utf8'))
}

function runPython(bin: string, args: string[]): Promise<void> {
  return new Promise((ok, err) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    p.on('exit', code => (code === 0 ? ok() : err(new Error(`${bin} exit ${code}`))))
    p.on('error', err)
  })
}
