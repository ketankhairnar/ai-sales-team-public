import type { ExecutorDeps } from './executor'
import { Store } from '../db/store'
import crypto from 'node:crypto'

export type GateDecision = { approved: boolean; edits?: unknown; note?: string }

export type HumanGate = ExecutorDeps['awaitHuman']

// --- Auto: mock mode, always approves ---
export const autoApproveGate: HumanGate = async () => ({ approved: true })

// --- CLI: interactive terminal prompt with edit support ---
export const cliGate = (opts: { store?: Store; campaignId?: string } = {}): HumanGate => {
  return async (prospectId, stageId, kind, artifact) => {
    const { default: readlinePkg } = await import('node:readline/promises')
    const rl = readlinePkg.createInterface({ input: process.stdin, output: process.stdout })
    try {
      console.log(`\n  [HUMAN GATE] ${stageId} (${kind}) for ${prospectId}`)
      console.log('  ' + JSON.stringify(artifact, null, 2).split('\n').join('\n  '))
      const answer = (await rl.question('\n  action [a]pprove · [e]dit · [r]eject > ')).trim().toLowerCase()

      if (answer.startsWith('r')) {
        const note = (await rl.question('  reason: ')).trim()
        recordInput(opts, prospectId, stageId, 'reject', { note }, true)
        return { approved: false, note }
      }
      if (answer.startsWith('e')) {
        const field = (await rl.question('  edit field (e.g. subject/body): ')).trim()
        const value = (await rl.question('  new value: ')).trim()
        const edits = { ...(artifact as any), [field]: value }
        recordInput(opts, prospectId, stageId, 'edit', edits, true)
        return { approved: true, edits }
      }
      recordInput(opts, prospectId, stageId, 'approve', artifact, true)
      return { approved: true }
    } finally {
      rl.close()
    }
  }
}

// --- HTTP: UI polls the store until human_inputs row appears for this gate ---
export const httpGate = (opts: { store: Store; campaignId: string; pollMs?: number; timeoutMs?: number }): HumanGate => {
  return async (prospectId, stageId, _kind, _artifact) => {
    const pollMs = opts.pollMs ?? 1000
    const timeoutMs = opts.timeoutMs ?? 15 * 60_000
    const started = Date.now()
    let lastSeen = 0
    while (Date.now() - started < timeoutMs) {
      const inputs = opts.store.listHumanInputs(prospectId)
      const relevant = inputs.filter(i => (i as any).kind && lastSeen === 0 ? true : new Date(i.at).getTime() > lastSeen)
      for (const i of relevant) {
        if (i.kind === 'approve') return { approved: true }
        if (i.kind === 'reject') return { approved: false, note: (i.payload as any)?.note }
        if (i.kind === 'edit')   return { approved: true, edits: i.payload }
      }
      lastSeen = Date.now()
      await new Promise(r => setTimeout(r, pollMs))
    }
    return { approved: false, note: 'human gate timeout' }
  }
}

function recordInput(
  opts: { store?: Store; campaignId?: string },
  prospectId: string,
  stageId: string,
  kind: 'approve' | 'reject' | 'edit',
  payload: unknown,
  blocking: boolean
) {
  if (!opts.store || !opts.campaignId) return
  opts.store.appendHumanInput(opts.campaignId, {
    id: `h_${crypto.randomBytes(4).toString('hex')}`,
    author: { id: 'cli', name: 'cli' },
    kind,
    payload,
    at: new Date().toISOString(),
    prospect_id: prospectId,
    stage_id: stageId,
    blocking
  } as any)
}

// --- Resolver: pick gate from mode ---
export function resolveGate(
  mode: 'auto' | 'cli' | 'http',
  opts: { store?: Store; campaignId?: string } = {}
): HumanGate {
  if (mode === 'auto') return autoApproveGate
  if (mode === 'cli') return cliGate(opts)
  if (mode === 'http') return httpGate(opts as any)
  throw new Error(`unknown gate mode: ${mode}`)
}
