import type { RubricDim } from '../prompts/checker'

/**
 * Scoring rubric — grounded in research/personas/shruti-icp-scoring.md.
 *
 * Scoring is TRIAGE at top-of-funnel. Input is a LinkedIn headline, nothing more.
 * Credit directional signal. Do not demand verification.
 */
export const SCORE_RUBRIC: RubricDim[] = [
  {
    dim: 'role_fit',
    guide: 'Title matches ICP role or is a CLEAR SUBSET. Credit directional matches (e.g. "VP Platform Engineering" for "VP Engineering"). Score 6+ if the role plausibly cares about this ICP pain. Perfect match = 9-10. Subset with seniority gap = 6-7.'
  },
  {
    dim: 'company_fit',
    guide: 'Company industry/stage/size match ICP. CREDIT recognizable brands in the right category (Razorpay/Vercel/Retool/Postman) even without explicit stage data. Do NOT demand verification — headline signal is sufficient at triage stage. Industry keyword in headline/bio = 8+.'
  },
  {
    dim: 'seniority',
    guide: 'Does role imply budget/decision authority? C-level 9-10, VP 8-9, Director 7-8, Head-of-X (depends on company size) 6-8, Senior IC 4-5, IC 2-3. No need to verify comp bands.'
  },
  {
    dim: 'signal',
    guide: 'Is there visible buying intent in the headline? Active initiative matching ICP keyword ("building platform", "scaling infra for X") = 9+. Recent move (Ex-Company, newly joined, co-founder) = 7. Generic role statement = 5-6. Pure status-quo = 4.'
  }
]
