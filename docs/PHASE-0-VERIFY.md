# Phase 0: Local Tool Verification

Run each before writing any glue code. All must pass before Phase 1.

## Setup

```bash
cd /Users/ketankhairnar/scratch/ai-sales-team

# Python envs (each tool has own requirements)
cd tools/linkedin-research && pip install -r requirements.txt && cd ../..
cd tools/linkedin-intel && pip install -r requirements.txt && cd ../..
cd tools/xresearch && pip install -r requirements.txt 2>/dev/null; cd ../..  # may not exist
playwright install chromium
```

## Checks

| # | Check | Command | Pass |
|---|-------|---------|------|
| 1 | Python 3 | `python3 --version` | ≥ 3.10 |
| 2 | Node | `node --version` | ≥ 20 |
| 3 | Playwright | `playwright --version` | prints |
| 4 | LI cookies valid | `cat tools/linkedin-research/.cookies.json \| head -c 50` | not empty |
| 5 | X cookies valid | `cat tools/xresearch/.cookies.json \| head -c 50` | not empty |
| 6 | linkedin-research run | `python3 tools/linkedin-research/linkedin-research.py <url> /tmp/li.json --cookies tools/linkedin-research/.cookies.json` | exit 0, json has profile_text_length ≥ 200 |
| 7 | linkedin-intel profile | `python3 tools/linkedin-intel/linkedin-scraper.py --mode profile <url> /tmp/lii.json --cookies tools/linkedin-intel/.cookies.json` | json valid |
| 8 | linkedin-intel search | `python3 tools/linkedin-intel/linkedin-scraper.py --mode search "<query>" /tmp/lisearch.json --cookies tools/linkedin-intel/.cookies.json` | returns results OR confirm not impl |
| 9 | xresearch run | `python3 tools/xresearch/xresearch.py <handle> /tmp/x.json --cookies tools/xresearch/.cookies.json` | json valid |
| 10 | Anthropic key | `curl -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" https://api.anthropic.com/v1/messages -d '{"model":"claude-haiku-4-5-20251001","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'` | 200 |
| 11 | Resend key | `curl -X POST https://api.resend.com/emails -H "Authorization: Bearer $RESEND_API_KEY" -H "Content-Type: application/json" -d '{"from":"onboarding@resend.dev","to":"ketan.khairnar@gmail.com","subject":"test","text":"hi"}'` | 200, email arrives |
| 12 | fly CLI | `fly auth whoami` | email |
| 13 | OpenCode CLI | `opencode --version` | prints |

## Results log

Fill in after each check. If any fails, fix before next phase.

- [ ] 1
- [ ] 2
- [ ] 3
- [ ] 4
- [ ] 5
- [ ] 6
- [ ] 7
- [ ] 8
- [ ] 9
- [ ] 10
- [ ] 11
- [ ] 12
- [ ] 13
