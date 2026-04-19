/**
 * HTTP gate smoke test — simulates a UI writing approve to the DB
 * while the gate is polling. Proves the resume-from-UI path works.
 *
 * Run: ./node_modules/.bin/tsx src/demo/http-gate-smoke.ts
 */
import { Store } from '../db/store'
import { httpGate } from '../runtime/human-gate'
import crypto from 'node:crypto'

async function main() {
  const store = new Store()
  const campaignId = `c_${crypto.randomBytes(4).toString('hex')}`
  store.upsertCampaign({
    id: campaignId,
    pipeline: 'test',
    icp: {},
    prospects: [],
    created_at: new Date().toISOString(),
    created_by: 'smoke'
  })

  const prospectId = 'mock-prospect'
  const stageId = 'drafted'
  const gate = httpGate({ store, campaignId, pollMs: 200, timeoutMs: 5000 })

  console.log('Starting gate... (will poll until approve appears)')
  const gatePromise = gate(prospectId, stageId, 'approve', { subject: 'test', body: 'test' })

  // Simulate UI pressing approve after 600ms
  setTimeout(() => {
    console.log('[UI] posting approve')
    store.appendHumanInput(campaignId, {
      id: `h_${crypto.randomBytes(4).toString('hex')}`,
      author: { id: 'ui-user', name: 'ketan' },
      kind: 'approve',
      payload: {},
      at: new Date().toISOString(),
      prospect_id: prospectId,
      stage_id: stageId,
      blocking: true
    } as any)
  }, 600)

  const decision = await gatePromise
  console.log('Gate resolved:', decision)
  console.log(decision.approved ? '✅ HTTP gate resume works' : '❌ HTTP gate failed')
  store.close()
}

main().catch(err => { console.error(err); process.exit(1) })
