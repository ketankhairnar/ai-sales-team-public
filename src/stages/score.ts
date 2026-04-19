import { runMCA } from '../mca-loop'
import { SCORE_RUBRIC } from '../../rubrics/score'

export async function scoreStage(prospect: { name: string; title: string; company: string; snippet: string }, icp: unknown, onEvent?: any) {
  return runMCA({
    stage: 'score',
    maker: 'SDR-Siddharth',
    checker: 'Skeptic-Shruti',
    arbiter: 'VPSales-Vikram',
    task: `Score this prospect against the ICP. Output { score: 1-10, reasons: [...] }.`,
    context: { prospect, icp },
    rubric: SCORE_RUBRIC,
    maxIterations: 1,
    onEvent
  })
}
