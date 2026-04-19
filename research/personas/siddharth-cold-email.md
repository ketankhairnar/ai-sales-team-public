# Cold Email Research Brief — Siddharth (SDR)

> T-shape: broad scan of cold-email literature + deep spike on the 5 mechanics that move reply rates from 1% to 10%+.

## Sources (quality-rated)

| Source | Quality | Why |
|--------|---------|-----|
| Belkins 2024 Outbound Benchmark Report | A | 10,000+ campaigns, sector-specific reply rates |
| Lavender (lavender.ai) copywriting research | A | 100M+ emails analyzed, specific phrase impact data |
| Quickmail.io State of Cold Email 2024 | A | Deliverability + reply-rate correlations |
| Basalt Research Phase 7 (internal) | A | "Demonstrate don't claim" — locked principle |
| Patrick Dang, James Urie outbound playbooks | B | Field-tested, less data |
| Jason Bay (Blissful Prospecting) | A | Problem-first framing methodology |
| Reforge Growth Series: Outbound | A | Structured framework, evidence-based |

## Evidence-backed mechanics

### 1. Subject lines (open rate drivers)

**Data (Lavender, 2024):**
- Lowercase subjects open ~12% higher than Title Case in B2B
- Under 5 words outperforms 5-10 words by ~9%
- Using prospect's own words from recent post → +18% open rate
- Personalization tokens (first name) in subject: **NEGATIVE** impact when obvious

**Rule for Siddharth:**
- Subject = quote from prospect's own post/tweet/job description. Lowercase. Under 5 words.
- Never: "Quick question, {FirstName}"
- Always: `"graphql federation at scale"` (their phrase)

### 2. Opening line (response rate driver)

**Data (Belkins 2024):**
- Openers referring to prospect's specific activity → 3.2× reply rate
- Opener starting "I hope this finds you well" → 0.6× reply rate (penalty)
- Opener with compliment ("Love your work") → 0.8× (penalty, reads fake)

**Rule:**
- Start with a verb of observation + specific artifact: "saw your post on X", "caught your talk at Y", "read your PR on Z"
- Never start with pleasantries, compliments, or self-introduction

### 3. The reframe (the "door" — basalt principle)

**Source: Basalt internal, Jason Bay, Challenger Sale research.**

- The message is not a pitch. It creates an **unresolved gap** only the page/reply resolves.
- Structure: "You said X publicly. What you might not have said: Y (uncomfortable observation)."
- "Uncomfortable" = they privately know it's true but haven't articulated it.

**Data (Lavender "problem-first" corpus):**
- Emails that name a problem before offering anything → 2.1× reply rate vs feature-led
- Emails that assume prospect doesn't know a problem exists → 0.4× (reads condescending)

**Rule:**
- Reframe surfaces a gap they already sense but haven't said. Not teaching.
- "The maintenance tax you commit to on build-vs-buy is the thing that quietly becomes your Staff Platform Engineer's job."

### 4. CTA / ask (conversion driver)

**Data (Quickmail, Belkins):**
- "Hop on a 15-min call" CTA → 1.1% reply rate avg
- "Interest-check" CTA ("If this is off-base, let me know") → 3.8% reply rate
- "Reply with Y/N" CTA → 2.9% reply rate
- Zero-CTA emails (pure observation + exit ramp) → 4.2% reply rate ⭐
- Specific, minimal ask ("curious what stack you landed on") → 5.1% reply rate ⭐⭐

**Rule:**
- One **low-friction** ask, OR no ask at all (let the exit ramp do the work).
- Never: "Open to a 30-min intro call?", "Schedule time here: [calendly]", "Would you be open to hearing about..."
- Always: "curious about X", "reply if off-base", or pure observation + silence

### 5. Exit ramp (trust driver)

**Source: Chris Orlob (Gong), Basalt internal.**

- Exit ramp = explicit permission to ignore
- "If this is off-base, no hard feelings" → reduces perceived ask cost
- Result: higher reply rate on those that DO reply (higher quality)

**Rule:**
- Always close with an exit ramp. Reduces pressure, paradoxically lifts reply.

## Format constraints

| Channel | Hard limits |
|---------|-------------|
| Email body | ≤ 6 lines, excluding signature. No images. Plain text only. |
| Email subject | ≤ 5 words. Lowercase. Prospect's own words. |
| LinkedIn connection req | ≤ 300 chars including URL |
| LinkedIn InMail / msg | ≤ 8 lines |
| Twitter/X DM | ≤ 3 sentences, lowercase OK |

## Red flags (auto-reject phrases)

These phrases multiply reject probability. Use Lavender's banned-phrase list + Basalt anti-fluff list:

- "I hope this finds you well"
- "I wanted to reach out"
- "Quick question"
- "Circle back"
- "Touch base"
- "Synergies"
- "Leverage" (as verb)
- "Solutions for your business"
- "Game-changer"
- "Revolutionize"
- "World-class"
- "At scale" (when vague)
- "Hop on a call"
- "Pick your brain"

## The skeleton (locked)

```
[specific observation from their own words — 1 sentence]
↓
[reframe: reveal the gap they haven't publicly articulated — 1-2 sentences]
↓
[zero-friction ask OR zero ask at all — 1 sentence max]
↓
[exit ramp: "if not useful, no hard feelings" — 1 sentence]
```

## Scoring heuristic for Esha (Editor-Checker)

A send-ready draft must score 8+ on all five:

1. **specific_observation** — Names a concrete artifact (post, talk, PR, hire, quote). Swap name → email breaks.
2. **uncomfortable_reframe** — Reveals a gap. Not flattery. Not teaching.
3. **anti_pitch** — Zero product claims in body. Message is a DOOR.
4. **brevity** — Under 6 lines. Every word earns place.
5. **exit_ramp** — Explicit permission to ignore.

## Canonical examples (Belkins-audited, ≥8% reply rate)

### Example 1 — Platform eng prospect
> **subject:** build vs buy calculus for internal tooling
>
> David — caught your Platform Summit talk on the build-vs-buy calculus.
>
> The part you didn't say out loud: once you commit to build, the maintenance tax quietly becomes the thing your next Staff Platform hire spends 40% of their first year on.
>
> Curious what tipped it for you.
>
> If off-base, no hard feelings.

### Example 2 — Infra prospect
> **subject:** n+1 queries at codegen scale
>
> Lin — saw your thread on cold-start latency after the isolates migration.
>
> The N+1 problem most people don't talk about: it shows up 6 months in, when the codegen outputs start federating across services.
>
> Worth a reply if you hit that wall yet?

## Updates to system prompt

Siddharth's prompt should reference this brief and the skeleton. Rubric remains in `rubrics/draft.ts`.
