# AI Sales Team

OpenCode hackathon — **Revenue track**.

AI agents (VP Sales, SDR, Editor, Skeptic) score prospects, research them, draft cold emails, and send via Resend. Full maker/checker/arbiter loop per stage, human gate before send, SQLite event log.

## 60-Second Demo

```bash
# 1. Install
npm install
bash scripts/setup-venv.sh      # only if you want live scrapers

# 2. Configure
cp .env.example .env.local
# Add ANTHROPIC_API_KEY (or GROQ_API_KEY) + RESEND_API_KEY + TO_EMAIL

# 3. Run
npm run demo:mock        # instant, no keys needed
npm run demo:hybrid      # real M/C/A, mock scrapers (~3-4 min)
npm run demo:live        # everything real (needs cookies)
```

Watch the pipeline:
```
Discover → Score (M/C/A) → Top 3 → Research → Draft (M/C/A) → Human Gate → Send
```

## Stack

- **Agents**: Anthropic Claude (Opus/Sonnet/Haiku) via our provider abstraction. Groq also wired.
- **Runtime**: TypeScript + Astro (UI), Node adapter
- **Scrapers**: Playwright (Python) for LinkedIn + X
- **Email**: Resend
- **DB**: SQLite (WAL), 5 tables
- **Deploy**: Fly.io (planned)

## Personas (Designation-Name, Anthropic tier)

| Name | Role | Model |
|------|------|-------|
| **Vikram** · VP Sales | Arbiter (all stages) | Opus 4.7 |
| **Siddharth** · SDR | Maker (research, draft) | Sonnet 4.6 |
| **Esha** · Editor | Checker (drafts) | Haiku 4.5 |
| **Shruti** · Skeptic | Checker (scoring) | Haiku 4.5 |
| Arjun · AE | Reply, proposal (v2) | Sonnet 4.6 |
| Shreya · Sales Engineer | Demo, tech Q&A (v2) | Sonnet 4.6 |
| Kavya · CSM | Onboarding (v2) | Haiku 4.5 |

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run demo:mock` | Full pipeline, canned data, no API calls |
| `npm run demo:hybrid` | Real M/C/A + mock scrapers (demo-safe) |
| `npm run demo:live` | Real scrapers + real APIs (cookies required) |
| `npm run smoke` | Dry-check imports/templates |
| `npm run smoke:mca` | Live M/C/A on one prospect |
| `npm run smoke:gate` | HTTP human-gate resume test |
| `npm run smoke:search` | Dry-check LinkedIn search URL builder |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | Phase 0 env verification |
| `npm run venv` | Set up per-tool Python venvs |
| `npm run db:reset` | Drop app.db for a clean slate |

## Project Map

```
src/
  dsl/              — pipeline spec, stage envelopes, events
  runtime/          — executor, tool registry, rubric loader,
                       mock MCA, mock tools, human gate
  providers/        — Anthropic + Groq unified model interface
  tools/            — linkedin-*, xresearch, resend wrappers
  db/               — schema + Store class
  demo/             — runnable demos + smoke tests
  mca-loop.ts       — Maker/Checker/Arbiter core
personas/registry.ts — 7 personas
prompts/            — maker/checker/arbiter templates
rubrics/            — per-stage scoring criteria
tools/              — copied Python scrapers (LinkedIn, X)
commands/           — reference prompt docs (from ~/.claude)
docs/               — progress log, phase 0 checks, UI spec
```

## Demo modes (what's mocked where)

| Mode | Scrapers | M/C/A | Resend |
|------|----------|-------|--------|
| mock | mock | mock | mock |
| hybrid | mock | **real** | **real send to `TO_EMAIL`** |
| live | **real** | **real** | **real** |

Use `hybrid` for judge demo — no browser popups, full LLM reasoning visible.

## Env vars

```
ANTHROPIC_API_KEY=sk-ant-...          # required for M/C/A (default)
GROQ_API_KEY=gsk_...                   # optional, set PROVIDER=groq to use
PROVIDER=anthropic                     # anthropic|groq (default = first available key)
RESEND_API_KEY=re_...                  # required for sends
FROM_EMAIL=onboarding@resend.dev       # Resend sandbox default
TO_EMAIL=you@yourdomain.com            # Resend testing mode = must be account owner
```

## Pipeline DSL

Stages are data. Edit `src/dsl/default-pipeline.ts` to change flow.
Each stage: `{maker, checker?, arbiter?, rubric?, tools?, task?, max_iterations, pass_threshold, human_gate, on_reject}`

## Status

See `docs/PROGRESS-LOG.md` for milestone completions + gotchas captured.

## License

Hackathon artifact. Not yet open source.
