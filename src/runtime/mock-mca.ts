/**
 * Mock M/C/A — no Anthropic calls. For dry-run demos.
 * Fakes maker/checker/arbiter outputs based on stage.
 */
import type { MCAConfig } from '../mca-loop'

export async function runMCAMock(cfg: MCAConfig): Promise<{ output: unknown; iterations: number } | { rejected: string }> {
  const emit = cfg.onEvent ?? (() => {})

  if (cfg.stage === 'scored') {
    const prospect: any = (cfg.context as any).prospect ?? {}
    const score = deterministicScore(prospect)
    const output = { score, reasons: [`${prospect.title ?? 'role'} aligns`, 'recent signal'] }
    emit({ kind: 'maker_start', persona: cfg.maker, iter: 1 })
    emit({ kind: 'maker_done', output, iter: 1 })
    emit({ kind: 'checker_done', result: { overall_score: score, dimension_scores: {}, issues: [], suggestions: [], pass: score >= 7 }, iter: 1 })
    if (score < 7) {
      emit({ kind: 'stage_reject', reason: `score ${score} below threshold` })
      return { rejected: `score ${score}` }
    }
    emit({ kind: 'stage_pass', output, iters: 1 })
    return { output, iterations: 1 }
  }

  if (cfg.stage === 'drafted') {
    const prospect: any = (cfg.context as any).prospect ?? {}
    const dossier: any = (cfg.context as any).prospect?.stages?.researched?.final_output ?? {}
    const hook = dossier?.hook ?? 'your recent work'
    const output = {
      subject: `quick note re: ${hook}`,
      body: `${firstName(prospect.name)} — saw ${hook}. we built something that solves exactly that. 2min reply with your current stack and i'll send a specific demo. ${(cfg.context as any).icp ? '' : ''}`
    }
    emit({ kind: 'maker_start', persona: cfg.maker, iter: 1 })
    emit({ kind: 'maker_done', output, iter: 1 })
    emit({ kind: 'checker_done', result: { overall_score: 9, dimension_scores: {}, issues: [], suggestions: [], pass: true }, iter: 1 })
    emit({ kind: 'stage_pass', output, iters: 1 })
    return { output, iterations: 1 }
  }

  const output = { stage: cfg.stage, mocked: true }
  emit({ kind: 'maker_start', persona: cfg.maker, iter: 1 })
  emit({ kind: 'maker_done', output, iter: 1 })
  emit({ kind: 'stage_pass', output, iters: 1 })
  return { output, iterations: 1 }
}

function deterministicScore(p: any): number {
  const s = JSON.stringify(p ?? {}).length
  return 6 + (s % 4)
}

function firstName(name?: string): string {
  return (name ?? 'there').split(' ')[0]
}
