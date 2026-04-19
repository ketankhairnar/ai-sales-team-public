import type { PipelineSpec } from './types'

export const DEFAULT_PIPELINE: PipelineSpec = {
  name: 'outbound-v1',
  version: '0.1',
  icp_schema: {
    role: 'string',
    company_size: 'string',
    industry: 'string',
    pain: 'string',
    geography: 'string'
  },
  stages: [
    {
      id: 'discovered', label: 'Discovered',
      maker: 'VPSales-Vikram',
      tools: ['linkedin_search_icp'],
      on_reject: 'drop',
      human_gate: { kind: 'edit', blocking: false }
    },
    {
      id: 'scored', label: 'Scored',
      maker: 'SDR-Siddharth',
      checker: 'Skeptic-Shruti',
      arbiter: 'VPSales-Vikram',
      rubric: 'score',
      max_iterations: 2,
      pass_threshold: 6,
      task: 'Score this prospect 1-10 against the ICP based on role fit, company fit, seniority, and signals visible in the headline. Headline-based directional signals are sufficient — no enrichment data required at this stage. Output JSON {"score": N, "reasons": ["..."]}.',
      on_reject: 'drop'
    },
    {
      id: 'researched', label: 'Researched',
      maker: 'SDR-Siddharth',
      tools: ['linkedin_research', 'xresearch', 'basalt_research'],
      on_reject: 'park',
      human_gate: { kind: 'edit', blocking: false }
    },
    {
      id: 'drafted', label: 'Drafted',
      maker: 'SDR-Siddharth',
      checker: 'Editor-Esha',
      arbiter: 'VPSales-Vikram',
      rubric: 'draft',
      max_iterations: 2,
      pass_threshold: 6,
      task: `Write a cold email + AI opportunity map. Follow this skeleton EXACTLY:

BODY skeleton (≤ 6 lines):
  [specific observation from prospect's OWN words] →
  [reframe as problem they haven't publicly articulated] →
  [one clear low-friction ask] →
  [exit ramp: "if not useful, no hard feelings"]
Subject line uses the prospect's OWN words (quote from their post/tweet/bio). NOT your pitch language.
Body ≤ 6 lines. No pitch. No product claims. No "hope this finds you well". No "circle back".

OPPORTUNITY MAP — exactly 3 bullets. Each bullet is a specific, concrete AI use case tailored to THIS prospect's role + company + signals visible in their profile/posts. NOT generic ("AI for sales"). Each bullet:
  [signal observed] → [AI pattern that fits] → [outcome in their language]
Examples of good bullets (DO NOT COPY — generate fresh per prospect):
  "3 open PE roles → agent-driven screening reducing resume-to-shortlist from 2wks to 2days → hiring velocity 4×"
  "$120M Series C announced → CAC payback modeling with agents simulating 50 GTM configs → board-ready scenarios in hours not weeks"
Keep each bullet ≤ 25 words. No jargon. No "leverage" or "synergize".

Output JSON: {"subject": "...", "body": "...", "opportunity_map": ["bullet 1", "bullet 2", "bullet 3"]}.`,
      human_gate: { kind: 'approve', blocking: true },
      on_reject: 'park'
    },
    {
      id: 'sent', label: 'Sent',
      maker: 'SDR-Siddharth',
      tools: ['resend_send'],
      on_reject: 'park'
    }
  ],
  fanout: [{ after_stage: 'scored', top_n: 3, sort_by: 'score desc' }]
}
