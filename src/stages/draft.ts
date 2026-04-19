import { runMCA } from '../mca-loop'
import { DRAFT_RUBRIC } from '../../rubrics/draft'

export async function draftStage(dossier: unknown, icp: unknown, onEvent?: any) {
  return runMCA({
    stage: 'draft',
    maker: 'SDR-Siddharth',
    checker: 'Editor-Esha',
    arbiter: 'VPSales-Vikram',
    task: `Write a 3-sentence cold email with ONE specific hook from the dossier. Output { subject: "...", body: "..." }.`,
    context: { dossier, icp },
    rubric: DRAFT_RUBRIC,
    maxIterations: 2,
    onEvent
  })
}
