import type { PipelineSpec, StageSpec } from '../dsl/types'
import type { Prospect, StageEnvelope, StageAttempt, PipelineEvent } from '../dsl/envelope'
import type { MCAConfig } from '../mca-loop'
import type { RubricDim } from '../../prompts/checker'

type RubricLoader = (ref: string) => RubricDim[]
type ToolRunner = (toolId: string, input: unknown) => Promise<unknown>
type HumanWaiter = (prospectId: string, stageId: string, kind: string, artifact: unknown) => Promise<{ approved: boolean; edits?: unknown }>
type EventSink = (e: PipelineEvent) => void
type MCARunner = (cfg: MCAConfig) => Promise<{ output: unknown; iterations: number } | { rejected: string }>

export type ExecutorDeps = {
  loadRubric: RubricLoader
  runTool: ToolRunner
  runMCA: MCARunner
  awaitHuman: HumanWaiter
  emit: EventSink
  now: () => string
}

export async function runStage(
  prospect: Prospect,
  stage: StageSpec,
  pipelineCtx: { icp: unknown },
  deps: ExecutorDeps
): Promise<StageEnvelope> {
  const env: StageEnvelope = prospect.stages[stage.id] ?? {
    stage_id: stage.id,
    status: 'in_progress',
    attempts: [],
    human_inputs: [],
    started_at: deps.now()
  }
  deps.emit({ kind: 'stage_start', prospect_id: prospect.id, stage_id: stage.id, at: deps.now() })

  if (!stage.checker && stage.tools?.length) {
    const draft = prospect.stages.drafted?.final_output as any
    const toolInput = {
      prospect, icp: pipelineCtx.icp,
      profile_url: prospect.linkedin_url, handle: prospect.x_handle,
      to: (process.env.TO_EMAIL ?? ''),
      subject: draft?.subject,
      body: draft?.body,
      opportunity_map: draft?.opportunity_map,
      draft,
    }
    const out = await deps.runTool(stage.tools[0], toolInput)
    const attempt: StageAttempt = { iter: 1, maker: { persona: stage.maker, output: out, at: deps.now() } }
    env.attempts.push(attempt)
    env.final_output = out
    env.status = 'passed'
    env.ended_at = deps.now()
    deps.emit({ kind: 'attempt', prospect_id: prospect.id, stage_id: stage.id, attempt })
    deps.emit({ kind: 'stage_pass', prospect_id: prospect.id, stage_id: stage.id, output: out, at: deps.now() })
    return env
  }

  if (stage.checker && stage.arbiter && stage.rubric) {
    const rubric = deps.loadRubric(stage.rubric)
    let result: { output: unknown; iterations: number } | { rejected: string }
    // Buffer M/C/A events per iteration so we can emit rich attempts with all 3 roles present
    const attemptBuffer = new Map<number, any>()
    const flushAttempt = (iter: number) => {
      const a = attemptBuffer.get(iter)
      if (!a) return
      deps.emit({ kind: 'attempt', prospect_id: prospect.id, stage_id: stage.id, attempt: a })
      attemptBuffer.delete(iter)
    }
    try {
      result = await deps.runMCA({
      stage: stage.id,
      maker: stage.maker,
      checker: stage.checker,
      arbiter: stage.arbiter,
      task: stage.task ?? `Stage: ${stage.id}. Produce artifact per rubric.`,
      context: { prospect, icp: pipelineCtx.icp },
      rubric,
      maxIterations: stage.max_iterations ?? 2,
      passThreshold: stage.pass_threshold ?? 7,
      onEvent: (e: any) => {
        const iter: number = typeof e.iter === 'number' ? e.iter : 1
        const curr = attemptBuffer.get(iter) ?? { iter, maker: null, checker: null, arbiter: null }
        if (e.kind === 'maker_done') {
          curr.maker = { persona: stage.maker, output: e.output ?? null, at: deps.now(), prompt: e.prompt, raw: e.raw }
        } else if (e.kind === 'checker_done') {
          curr.checker = { persona: stage.checker, result: e.result, at: deps.now(), prompt: e.prompt, raw: e.raw }
        } else if (e.kind === 'arbiter_done') {
          curr.arbiter = { persona: stage.arbiter, decision: e.decision, at: deps.now(), prompt: e.prompt, raw: e.raw }
        }
        attemptBuffer.set(iter, curr)
        // Flush when iteration has all expected roles, or when we see the next iter start
        const shouldFlush = (curr.arbiter) ||                     // arbiter always ends iteration
          (curr.maker && curr.checker && !stage.arbiter) ||       // no arbiter configured
          (curr.maker && !stage.checker)                          // maker-only stage
        if (shouldFlush) flushAttempt(iter)
      }
    })
    } catch (err) {
      result = { rejected: `mca error: ${(err as Error).message.slice(0, 120)}` }
    }
    // Flush any remaining buffered iterations (e.g. final iter with no arbiter invoked)
    for (const iter of Array.from(attemptBuffer.keys())) flushAttempt(iter)
    if ('rejected' in result) {
      env.status = 'rejected'
      env.reject_reason = result.rejected
      env.ended_at = deps.now()
      deps.emit({ kind: 'stage_reject', prospect_id: prospect.id, stage_id: stage.id, reason: result.rejected, at: deps.now() })
      return env
    }
    env.final_output = result.output
    env.status = 'passed'
    env.ended_at = deps.now()
    deps.emit({ kind: 'stage_pass', prospect_id: prospect.id, stage_id: stage.id, output: result.output, at: deps.now() })
  }

  if (stage.human_gate && stage.human_gate.blocking) {
    env.status = 'awaiting_human'
    const decision = await deps.awaitHuman(prospect.id, stage.id, stage.human_gate.kind, env.final_output)
    if (!decision.approved) {
      env.status = 'rejected'
      env.reject_reason = 'human rejected'
      env.ended_at = deps.now()
      deps.emit({ kind: 'stage_reject', prospect_id: prospect.id, stage_id: stage.id, reason: 'human rejected', at: deps.now() })
      return env
    }
    if (decision.edits) env.final_output = decision.edits
    env.status = 'passed'
  }

  return env
}

export async function runPipeline(
  prospect: Prospect,
  pipeline: PipelineSpec,
  icp: unknown,
  deps: ExecutorDeps
) {
  for (const stage of pipeline.stages) {
    const prev = prospect.current_stage
    prospect.current_stage = stage.id
    deps.emit({ kind: 'stage_advance', prospect_id: prospect.id, from: prev, to: stage.id, at: deps.now() })
    const env = await runStage(prospect, stage, { icp }, deps)
    prospect.stages[stage.id] = env
    if (env.status === 'rejected') {
      return prospect
    }
  }
  return prospect
}
