# ICP Scoring Research Brief — Shruti (Skeptic)

> T-shape: broad scan of B2B ICP-fit frameworks + deep spike on top-of-funnel scoring where research data is sparse.

## Sources (quality-rated)

| Source | Quality | Why |
|--------|---------|-----|
| HubSpot "ICP Framework" (2023-2024) | A | Widely-adopted definition of ICP dimensions |
| Lenny Rachitsky — Product/Market Fit essays | A | Pre-ICP fit vs ICP fit separation |
| Winning by Design — SPICED framework | A | Situation/Pain/Impact/Critical Event/Decision |
| Brian Chesky / Geoffrey Moore — Early customer targeting | B | Foundational |
| Predictable Revenue (Aaron Ross) | A | Lead qualification data, 3-stage funnel |
| Gong.io State of Sales 2024 | A | Empirical data: what scores actually correlate with revenue |
| BANT vs MEDDIC vs GPCT | A | Comparative framework analysis |
| Internal: Basalt Phase 4 (practitioner-led ICP validation) | A | Problem-first, not technology-first |

## The core principle

**Scoring at top-of-funnel is directional signal, not verification.**

Shruti's failure mode (observed in live runs): demanding enrichment-level verification at scoring stage. That's wrong. At scoring stage the input is ONE line — a LinkedIn headline. The right skeptic asks: "Does this headline, as-is, match ICP signal?" Not: "Can I verify series stage from a headline?" (No — nobody can. Move on.)

## The scoring dimensions (4, each 1-10)

### 1. role_fit (weight: 30%)

**What it measures:** Does the title map to the ICP role spec?

**Evidence checklist:**
- [ ] Title contains role keyword (VP/Director/CTO/Head) ✓ = 8+
- [ ] Title contains domain keyword (Platform/Engineering/Infrastructure) ✓ = 8+
- [ ] Exact match (e.g. "VP Platform Engineering" vs ICP "VP Engineering or Platform") = 9+
- [ ] Subset match (e.g. "Director of Platform" when ICP is "VP Engineering") = 6-7 (directionally right, seniority gap)

**Skeptic's job:** Don't reject "VP Platform Engineering" as "not VP Engineering." That's ICP pedantry. Title is directional — credit subset matches.

### 2. company_fit (weight: 30%)

**What it measures:** Does the company match the ICP industry + stage + size signals *visible in headline*?

**Evidence checklist:**
- [ ] Industry keyword in headline/bio ("B2B SaaS", "payments", "dev tools") = 8+
- [ ] Well-known company brand matches ICP category (Razorpay, Vercel, Retool) = 8+ (directional)
- [ ] Explicit stage mention ("Series B", "post-Series C") = 9+
- [ ] No stage info but recognizable mid-stage company = 7 (directional)

**Skeptic's job:** If company is a known brand matching category, credit it even without explicit stage. "Vercel" is recognizable enough to score directionally. Demanding "find me Series B investment data" at scoring stage = wrong.

### 3. seniority (weight: 20%)

**What it measures:** Does the role imply budget/decision authority?

**Evidence checklist:**
- [ ] C-level (CTO/CEO/CRO) = 9-10
- [ ] VP = 8-9
- [ ] Director = 7-8
- [ ] Head of X (varies by company size) = 6-8
- [ ] Senior IC = 4-5
- [ ] IC = 2-3

**Skeptic's job:** Penalize "senior dev" claiming they can buy enterprise software. Credit C-level even if company is smaller.

### 4. signal (weight: 20%)

**What it measures:** Is there evidence of buying intent *visible in headline*?

**Evidence checklist:**
- [ ] Headline mentions active initiative matching ICP keyword ("scaling payment infra", "building platform for 30M dev") = 9+
- [ ] Headline mentions recent move (Ex-Stripe, newly joined) = 7 (signal of change → possible buying window)
- [ ] Generic headline, no specific initiative = 5-6
- [ ] Purely status-quo headline = 4

**Skeptic's job:** Don't demand "post dated within 7 days" at scoring stage. Headline-level signal is enough.

## Scoring composition

**overall_score = min(role_fit, company_fit)** weighted against seniority/signal.

Why min of role+company: both matter. A perfect role at wrong company = useless. Wrong role at right company = useless. The bottleneck controls the score.

Then weight in seniority + signal as modifiers (up to ±1).

## Pass threshold

**pass = overall_score ≥ 6**

Not 8. Not 7. Six.

**Rationale:**
- Scoring is triage, not validation
- Top-of-funnel of 20 prospects → want to carry top 3-5 into research
- 8+ threshold would reject everyone at triage stage (observed: 0/5 pass in early runs)
- Research stage (post-scoring) has enrichment budget to validate; scoring stage does not

## Framework alignment

| Framework | This brief's alignment |
|-----------|------------------------|
| **BANT** | Budget (implied by seniority), Authority (seniority), Need (signal), Timing (signal) |
| **MEDDIC** | Metrics, Economic buyer (seniority), Decision criteria (future), Decision process (future), Identify pain, Champion (future) |
| **GPCT** | Goals, Plans, Challenges, Timeline — all future-stage, not scoring-stage |

Scoring = BANT's "A" + "N" at directional level. MEDDIC/GPCT live in post-scoring research + discovery.

## Anti-patterns Shruti must avoid

1. **Demanding verifiable enrichment at scoring stage.** "Can't confirm Series B from headline" — right, that's research-stage work.
2. **Penalizing directional signal.** "VP Platform Engineering" ≈ "VP Engineering" for ICP purposes.
3. **Rejecting for single-dimension weakness.** Low seniority alone doesn't kill; it's a modifier.
4. **Scoring in isolation.** Shruti should ask: "Is this prospect directionally more promising than rejecting them?" If yes, pass through to research.
5. **Overweighting perfection.** 6 = research-worthy. 8 = research-ready. 10 = already qualified.

## Updated rubric guides (to replace current terse guides)

```ts
[
  { dim: 'role_fit',    guide: 'Title matches ICP role or is a clear subset. Credit directional matches (e.g. "VP Platform" for "VP Engineering"). Score 6+ if the role would plausibly care about this ICP pain.' },
  { dim: 'company_fit', guide: 'Company industry/stage/size match ICP. Credit recognizable brands in the right category even without explicit stage. Do not demand verification — headline signal is enough.' },
  { dim: 'seniority',   guide: 'Does role imply budget/decision authority? C-level 9-10, VP 8-9, Director 7-8, Head 6-8, Senior IC 4-5, IC 2-3.' },
  { dim: 'signal',      guide: 'Is there visible buying intent in headline? Active initiatives + ICP keywords = 9+. Recent moves = 7. Status-quo headline = 5.' }
]
```

## Updated system prompt for Shruti

```
You are Shruti, Skeptic. At the scoring stage, flag WEAK EVIDENCE and OVERCLAIMS.
But: scoring is triage, not verification. Headline-level signal is enough.
Credit directional matches. Penalize overclaim, not optimism.
Do not demand enrichment data the scoring stage doesn't have.
Score strictly by the rubric. If rubric signal is visibly present, credit it.
A 6 means "research-worthy." 8 means "research-ready." Do not withhold 6s.
```
