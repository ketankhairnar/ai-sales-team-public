# xresearcher — Architecture

**Status:** Phase 1 (scraper) DONE, Phase 2 (slash command) DONE
**Last updated:** 2026-03-08

---

## Architecture

```
INPUT:  /xresearch @handle

STEP 1: Parse @handle → create slug → create prospects/{slug}/ directory

STEP 2: Run Playwright scraper
        $ python plugins/xresearch/xresearch.py {handle} {output_path} --cookies {cookie_path}
        → Output: twitter_raw_data.json
           - profile (name, bio, location, website, join date, followers, following count)
           - pinned_tweet (text + metrics)
           - tweets (last 100 or 3 months: text, timestamp, type, metrics, URLs, mentions)
           - following (up to 300: handle, name, bio)
           - links (all URLs from bio + tweets, expanded from t.co)
           - scraped_links (top 10 link content: title, excerpt, meta)

STEP 3: Claude Pass A — Profile Analysis
        → Input: twitter_raw_data.json + embedded intake template
        → Output: fills Profile, Key Threads, Following List, Pain Points, Phase 2 Q1-Q7
        → Rules: quote verbatim, triangulate pain points, no buzzwords

STEP 4: Claude Pass B — Strategy & Scoring
        → Input: Pass A output
        → Output: appends Discovery Call Strategy + Prospect Fit + Gaps
        → Rules: open with their words, peer cred > pitch, honest scoring

STEP 5: Write Output
        → prospects/{slug}/notes/xresearcher-intake.md

STEP 6: Print next command
        → /basalt-research "{Name}" --prework prospects/{slug}/notes/xresearcher-intake.md
```

---

## File Map

```
plugins/xresearch/
├── ARCHITECTURE.md                          ← this file
├── xresearch.py                             ← Playwright-based scraper (~1000 lines)
├── twitter-research-agent-design-v2.md      ← original design (reference only)
├── xresearcher-intake-template.md           ← output format contract (reference)
├── prompts/
│   ├── pass-a-profile-analysis.md           ← Pass A prompt (reference — embedded in slash cmd)
│   └── pass-b-strategy-scoring.md           ← Pass B prompt (reference — embedded in slash cmd)
├── .cookies.json                            ← browser cookies (gitignored)
├── .env                                     ← X creds (gitignored)
└── .browser-profile/                        ← Playwright profile (gitignored)

~/.claude/commands/
└── xresearch.md                             ← slash command orchestrator (~300 lines)
```

---

## Integration Contract

**xresearcher output** → **basalt-research input**

The contract is `xresearcher-intake-template.md`. If xresearcher produces a markdown file matching that template structure, basalt-research's `--prework` flag will:
1. Read the file
2. Extract Q1-Q7 answers
3. Pre-fill 00-intake.md + 01-research.md
4. Jump to Gate 1 (human still reviews + approves)
5. Pre-fill Phase 2 questions (human confirms each one)

---

## Auth Setup

- Cookies exported from Chrome via EditThisCookie/DevTools (Netscape format)
- Converted to Playwright JSON format (filter x.com/.twitter.com lines)
- Key cookies needed: auth_token, ct0, twid
- Re-export when cookies expire (~30 seconds)

---

## Error Handling

| Failure | Response |
|---------|----------|
| Handle doesn't exist | Exit code 1, stderr message |
| Profile is private | Exit code 1, stderr message |
| Cookies expired mid-scrape | Attempt login fallback if creds available |
| Tweet scrape gets < 20 | Warn, proceed, set scrape_status = "partial" |
| Following list scroll stalls | Proceed with partial, flag in status |
| t.co expansion fails | Keep shortened URL |
| Link scrape timeout/fail | Set status per-link, skip content |

---

## What's NOT in v1

- Caching across runs
- MCP server wrapper (add after 20+ successful runs)
- HTML report (basalt-research Phase 4 handles this)
- Multi-handle batch mode
- Rate limiting / request throttling
