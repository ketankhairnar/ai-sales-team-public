import { spawn } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const VENV_PY = resolve('tools/xresearch/.venv/bin/python3')
const SYSTEM_PY = 'python3'
const SCRIPT = resolve('tools/xresearch/xresearch.py')
const COOKIES = resolve('tools/xresearch/.cookies.json')

export async function xresearch(handle: string, outDir = 'prospects'): Promise<unknown> {
  const clean = handle.replace(/^@/, '')
  const outPath = resolve(outDir, clean, 'twitter_raw_data.json')
  mkdirSync(dirname(outPath), { recursive: true })
  if (existsSync(outPath)) return JSON.parse(readFileSync(outPath, 'utf8'))
  const py = existsSync(VENV_PY) ? VENV_PY : SYSTEM_PY
  await runPython(py, [SCRIPT, clean, outPath, '--cookies', COOKIES])
  if (!existsSync(outPath)) throw new Error(`xresearch produced no output for ${clean}`)
  return JSON.parse(readFileSync(outPath, 'utf8'))
}

function runPython(bin: string, args: string[]): Promise<void> {
  return new Promise((ok, err) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'inherit', 'inherit'] })
    p.on('exit', code => (code === 0 ? ok() : err(new Error(`${bin} exit ${code}`))))
    p.on('error', err)
  })
}
