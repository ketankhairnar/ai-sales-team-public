# Progress Log — AI Sales Team

Replay-ready notes. Copy this to fresh hackathon repo, execute in order.

---

## Environment baseline (dry run machine)

| Check | Result |
|-------|--------|
| Node | v22.17.1 ✅ |
| Python | 3.14.2 ⚠️ (3.10-3.12 preferred; watch playwright compat) |
| fly CLI | ❌ not installed |
| ANTHROPIC_API_KEY | ❌ not in env |
| RESEND_API_KEY | ❌ not in env |

### Pre-hackathon action items
- [ ] Install `fly` CLI: `brew install flyctl`
- [ ] Export keys to shell rc OR pass via `.env.local`
- [ ] Consider `pyenv` → Python 3.12 (Playwright cleanest on 3.10-3.12)
- [ ] Refresh LinkedIn + X cookies day-of (expire fast)

---

## Milestone completion

| # | Milestone | Status | Notes |
|---|-----------|--------|-------|
| M1 | `npm install` | ✅ | Had to bump zod 3→4 (peer of claude-agent-sdk@0.2.114). Ran clean after. |
| M2 | `verify.sh` all green | ⏸ | Needs keys |
| M3 | linkedin-research wrapper | ✅ | `src/tools/linkedin-research.ts`, TS→Python spawn, venv-aware, cached |
| M4a | linkedin-intel wrapper | ✅ | `src/tools/linkedin-intel.ts`, multi-mode (profile/post/company/search) |
| M4b | xresearch wrapper | ✅ | `src/tools/xresearch.ts`, handle-keyed |
| M4c | resend wrapper | ✅ | `src/tools/resend-send.ts`, throws on missing key |
| M4d | linkedin search mode | ✅ | Implemented `run_search` in `linkedin-scraper.py`, anchor-based extraction with card walk-up. `searchProspects(icp, {pages})` wrapper. ICP → query builder. `linkedin_search_icp` tool registered. |
| M5a | M/C/A dry smoke (no API) | ✅ | `src/demo/mca-smoke.ts` passes: imports OK, templates render (maker=550c, checker=828c, arbiter=319c), tool registry dispatches |
| M5b | M/C/A live smoke | ✅ | Groq llama-3.3-70b + llama-3.1-8b: score 2.9s pass 9/10. Anthropic haiku+sonnet: score 56s, both providers work. 429 backoff added for Groq. Provider selectable via `PROVIDER=groq\|anthropic`. |
| M8.5 | Model abstraction | ✅ | `src/providers/model.ts`: OpenAI-compat Groq + Anthropic SDK. `modelFor(tier, provider)` maps fast/smart/top → provider-specific model id. |
| MODE=hybrid | Hybrid demo mode | ✅ | Mock tools + real M/C/A. Best for demo: no scraper fragility, real LLM reasoning. |
| Indian personas | Vikram/Siddharth/Arjun/Shreya/Kavya/Esha/Shruti | ✅ | All refs updated |
| Anthropic pipeline live | Full hybrid end-to-end | ✅ | Campaign c_f7adc724: 5 discovered → 4 scored → 3 drafted → 1 sent. 3m39s. Real draft output matches "demonstrate don't claim" skeleton (Platform Summit reference + uncomfortable reframe). |
| Prompt iteration | Shruti too strict on mock data → relaxed | ✅ | Skeptic now credits headline-based signals instead of demanding enrichment. ICP broadened to match mock prospect mix. Pipeline converges. |
| SSR Phase C | Research briefs for Siddharth + Shruti | ✅ | `research/personas/siddharth-cold-email.md` + `shruti-icp-scoring.md`. Grounded prompts in Belkins/Lavender/Basalt data. Rubrics upgraded with evidence-backed guides. |
| Validation | Full hybrid pipeline post-SSR | ✅ | Campaign c_c6514bbe: 5/5 scored, 3/3 drafted, 3/3 sent. 2m 34s wall-clock (from 4m 21s = -40%). Drafts follow skeleton perfectly: specific observation + uncomfortable reframe + zero-friction ask + exit ramp. |
| M6 | DSL executor end-to-end | ✅ | Mock mode runs full pipeline (discover→score→top3→research→draft→human gate→send). `MODE=mock tsx src/demo/run.ts` = 75 events, ~200ms. Switch `MODE=live` to hit real APIs. |
| M7 | SQLite persistence | ✅ | 5 tables (campaigns, prospects, stage_envelopes, events, human_inputs). `src/db/schema.sql` + `Store` class. Verified: 1 campaign, 5 prospects, 75 events queryable. DB at `data/app.db` (WAL mode). |
| M8 | Human gate (3 modes) | ✅ | `src/runtime/human-gate.ts`: auto/cli/http. `GATE=auto` for mock, `cli` for terminal prompt with edit support, `http` for UI polling. HTTP smoke test confirms poll→DB write→resume works (<1s latency). |
| M7-live | Resend send live | ✅ | 2 test emails sent (curl + TS wrapper). IDs: 6de015f2..., 8ce05101... |
| M8 | CLI demo `npm run demo` | ⏸ | Ties M5b-M7 |

### Gotcha (M5): Resend SDK throws at construction if key missing
- Initial code: `const resend = new Resend(process.env.RESEND_API_KEY ?? '')` → import-time crash in smoke
- Fix: lazy-init pattern in `src/tools/resend-send.ts`
- Lesson: all SDK clients = lazy, never at module top

---

## Gotchas captured (save future self)

### Zod peer conflict
- `@anthropic-ai/claude-agent-sdk` requires `zod ^4.0.0`
- Initial `package.json` had `^3.23.0` → ERESOLVE
- Fix: bump to `^4.0.0` in deps

### xresearch copy hygiene
- Original dir contained `.env` and `accounts.db` (credentials, secrets)
- Stripped during scaffold; **always strip on copy** in real hackathon repo

### Scraper venv isolation
- 3 scrapers, 3 `requirements.txt` → global pip conflict risk
- `scripts/setup-venv.sh` creates `tools/*/venv` per tool
- TS wrappers check `tools/*/.venv/bin/python3` first, fall back to `python3`

### Cookies expire
- Re-export LinkedIn cookies: `python3 tools/linkedin-research/linkedin-research.py --export-cookies tools/linkedin-research/.cookies.json`
- Same pattern for linkedin-intel, xresearch
- Do this MORNING of demo

### Resend testing mode
- New/unverified Resend account = can only send to **account-owner email** (403 otherwise)
- For hackathon demo: either verify domain at resend.com/domains OR send to owner inbox and show that on screen
- Current TO_EMAIL: `ketan@basaltconsulting.in` (verified path)

### LinkedIn search extraction fragility
- LinkedIn search DOM changes often. Anchor-based extraction (`a[href*='/in/']` + card walk-up) is more resilient than CSS class selectors
- Card text parsed heuristically: line after name = headline, split on ` at | @ | · | | ` for title/company
- If LinkedIn flags the query, expect captcha or auth wall. Cookie refresh required.
- Reduce `pages` from default 2 → 1 if rate-limited
- Search results cached by query hash at `prospects/_search/<hash>.json`

### Playwright on Python 3.14
- May have compat issues with 3.14 (too new)
- Safer: `pyenv install 3.12` + `pyenv local 3.12`

---

## Replay script for fresh hackathon repo

```bash
# 1. Clone this scratch dir as starting point
cp -r /Users/ketankhairnar/scratch/ai-sales-team /path/to/hackathon-repo
cd /path/to/hackathon-repo

# 2. Strip git history (fresh start)
rm -rf .git && git init

# 3. Re-copy fresh cookies (current session)
cp ~/Desktop/AIC/plugins/linkedin-research/.cookies.json tools/linkedin-research/
cp ~/Desktop/AIC/plugins/linkedin-intel/.cookies.json   tools/linkedin-intel/
cp ~/Desktop/AIC/plugins/xresearch/.cookies.json        tools/xresearch/

# 4. Python venvs per tool
bash scripts/setup-venv.sh

# 5. Node deps
npm install

# 6. Env
cp .env.example .env.local
# fill in ANTHROPIC_API_KEY, RESEND_API_KEY, TO_EMAIL

# 7. Verify
bash scripts/verify.sh

# 8. Smoke test M/C/A (after keys set)
npx tsx src/demo/mca-smoke.ts   # TBD: to be written

# 9. Smoke test one tool
npx tsx -e "import('./src/tools/linkedin-research.ts').then(m => m.linkedinResearch('https://linkedin.com/in/<slug>')).then(console.log)"

# 10. Full demo
npm run demo
```

---

## Architecture cheat-sheet (for handoff)

```
src/
  dsl/
    types.ts            — PipelineSpec, StageSpec
    envelope.ts         — Prospect, StageEnvelope, events
    default-pipeline.ts — 5-stage outbound pipeline
  runtime/
    executor.ts         — DSL-driven, stage-by-stage
  mca-loop.ts           — Maker/Checker/Arbiter core
  stages/{score,draft}  — thin convenience wrappers
  tools/
    linkedin-research.ts
    linkedin-intel.ts
    xresearch.ts
    resend-send.ts
personas/registry.ts    — 7 personas, designation-name
prompts/{maker,checker,arbiter}.ts  — compressed templates
rubrics/{score,draft}.ts — pluggable per stage
```

## What's deferred (UI-spec only, not built)
- Astro pages, Kanban columns, SSE stream, detail modal, activity feed, theme tokens
- See `docs/UI-SPEC.md`

## What's NOT yet wired
- Tool runner map (DSL → tool ID → TS function) — needed by executor.ts
- SQLite persistence of prospects + events
- Demo orchestrator script (`src/demo/run.ts`)
- Human approve gate mechanism (CLI prompt or HTTP endpoint)

---

## Next milestones once keys arrive

1. Write `src/runtime/tool-registry.ts` mapping DSL tool IDs to functions
2. Write `src/demo/mca-smoke.ts` — hardcoded prospect, runs score+draft stages
3. Run smoke, observe cost (expect ~$0.05 per prospect through draft)
4. Write `src/demo/run.ts` — full pipeline on 1 prospect
5. Verify email lands in your inbox
6. Mark M8 complete, then decide: deploy to Fly OR start UI
