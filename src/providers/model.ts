/**
 * Model-agnostic completion interface.
 * Backs: Groq (OpenAI-compat), Anthropic.
 * Add a provider by implementing `complete(prompt, opts) -> string`.
 */
import Anthropic from '@anthropic-ai/sdk'

export type Provider = 'groq' | 'anthropic'

export type ModelSpec = {
  provider: Provider
  model: string       // provider-specific model id
  maxTokens?: number
}

export type CompleteOpts = {
  system?: string
  maxTokens?: number
}

/** Provider registry — lazy singletons. */
let _anthropic: Anthropic | null = null
function anthropic(): Anthropic {
  if (_anthropic) return _anthropic
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new Error('ANTHROPIC_API_KEY missing')
  return (_anthropic = new Anthropic({ apiKey: key }))
}

/** One-shot completion — returns the assistant text. */
export async function complete(spec: ModelSpec, prompt: string, opts: CompleteOpts = {}): Promise<string> {
  const max = opts.maxTokens ?? spec.maxTokens ?? 2048
  if (spec.provider === 'groq') return groqComplete(spec.model, prompt, max, opts.system)
  if (spec.provider === 'anthropic') return anthropicComplete(spec.model, prompt, max, opts.system)
  throw new Error(`unknown provider: ${spec.provider}`)
}

async function groqComplete(model: string, prompt: string, max: number, system?: string): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY missing')
  const messages: any[] = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: prompt })

  for (let attempt = 1; attempt <= 4; attempt++) {
    // First attempt enforces json_object; retries drop it (Groq validator over-strict)
    const useJsonMode = attempt === 1
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: max, messages,
        ...(useJsonMode ? { response_format: { type: 'json_object' } } : {})
      })
    })
    if (resp.ok) {
      const data: any = await resp.json()
      return data.choices?.[0]?.message?.content ?? ''
    }
    const bodyText = await resp.text()
    if (resp.status === 400 && /json_validate_failed/.test(bodyText) && attempt < 4) {
      // Return the failed_generation text if we can extract it
      try {
        const err = JSON.parse(bodyText)
        const failed = err?.error?.failed_generation
        if (failed) {
          console.error(`  [groq json_fail] using failed_generation as-is (attempt ${attempt})`)
          return failed
        }
      } catch {}
      console.error(`  [groq json_fail] retry ${attempt}/3 without json mode`)
      continue
    }
    if (resp.status === 429 && attempt < 4) {
      const retryAfter = parseFloat(resp.headers.get('retry-after') ?? '')
      const match = bodyText.match(/try again in ([\d.]+)s/)
      const waitS = retryAfter || (match ? parseFloat(match[1]) + 1 : 5 * attempt)
      console.error(`  [groq 429] retry ${attempt}/3 in ${waitS}s`)
      await new Promise(r => setTimeout(r, waitS * 1000))
      continue
    }
    throw new Error(`groq ${resp.status}: ${bodyText.slice(0, 300)}`)
  }
  throw new Error('groq: exhausted retries')
}

async function anthropicComplete(model: string, prompt: string, max: number, system?: string): Promise<string> {
  const resp = await anthropic().messages.create({
    model,
    max_tokens: max,
    system,
    messages: [{ role: 'user', content: prompt }]
  })
  const block = resp.content[0]
  return block.type === 'text' ? block.text : ''
}

/** Provider from env. PROVIDER wins; else first available key. */
export function defaultProvider(): Provider {
  const pref = (process.env.PROVIDER ?? '').toLowerCase()
  if (pref === 'groq' || pref === 'anthropic') return pref as Provider
  if (process.env.GROQ_API_KEY) return 'groq'
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic'
  throw new Error('No provider keys set (GROQ_API_KEY or ANTHROPIC_API_KEY)')
}

/** Map logical persona tier to a concrete ModelSpec for the chosen provider. */
export function modelFor(tier: 'fast' | 'smart' | 'top', provider: Provider = defaultProvider()): ModelSpec {
  if (provider === 'groq') {
    if (tier === 'fast') return { provider, model: 'llama-3.1-8b-instant' }
    if (tier === 'smart') return { provider, model: 'llama-3.3-70b-versatile' }
    return { provider, model: 'llama-3.3-70b-versatile' }
  }
  // anthropic
  if (tier === 'fast') return { provider, model: 'claude-haiku-4-5-20251001' }
  if (tier === 'smart') return { provider, model: 'claude-sonnet-4-6' }
  return { provider, model: 'claude-opus-4-7' }
}
