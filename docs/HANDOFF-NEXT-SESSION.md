# Handoff — Next Session

**Date written:** 2026-04-19 (IST)
**Project root:** `/Users/ketankhairnar/scratch/ai-sales-team`
**Current Fly URL:** https://ai-sales-team-33831.fly.dev/ (will be replaced — see Priority 1)
**Local dev DB:** `/tmp/ai-sales-full2.db` (active, 5 campaigns, 1 real email sent)

---

## TL;DR — Where We Are

Working end-to-end **locally**:

- ✅ Real email sent to Devadas Prabhu (Director of Engineering, Razorpay) via full pipeline
- ✅ Apollo orgs (free plan) → SerpApi Google search → clean LinkedIn URLs → light Playwright scrape → Haiku LLM extraction → real title/company
- ✅ M/C/A agent transcript with prompts, rubric guides, per-dim scores, ctrl+E to toggle prompt detail
- ✅ 8-col kanban (Discovered/Scored/Qualified/Researched/Drafted/Sent/Lost/Parked) with right-side sticky context panel, HTMX polling every 3s
- ✅ Campaign names, IST timestamps, outcome modal with reason codes, Apollo score persisted as M/C/A prior
- ✅ Hit cap enforced (MAX_LI_HITS=5 default), venvs + chromium installed, cookies fresh

**Fly is stale** — the last deploy predates all the v2 work. Priority 1 is a fresh deploy.

**Git state clean:**
```
3b36a7d  docs: ICP-to-Kanban spec
60e1f63  feat: agent transcript — M/C/A prompts + per-iter outcome
71f933e  feat: hit-capped LinkedIn research + light + DOM fix + auto-fill
518e144  feat: ICP discovery chain — Apollo + SerpApi + Haiku extract
3d19adb  feat: v2 kanban workspace — columns + panel + HTMX + titles
035b75c  chore: gitignore ref/ and _archive/
f1508e1  ← previous handoff (unchanged)
```

---

## Priority 1: Workable Fly deployment (fresh, correct env)

**Goal:** deploy current `main` to Fly with the right env vars so a public visitor sees the v2 UI with agent transcripts, and form submit actually works.

### Architectural decision (confirmed with GSE review)

Fly cannot run Playwright — the slim Docker image has no Chromium and the Node-only image is 252MB vs ~1.5GB for Playwright-ready. **So Fly uses a capped-hit path that does not require LinkedIn scraping.**

Mode matrix:

| Mode | Apollo | SerpApi | LinkedIn scrape | Works on Fly? |
|---|---|---|---|---|
| `mock` | — | — | — | yes |
| `apollo-mock-people` (Fly default) | yes (free) | — | — | yes |
| `apollo-serp-chain` | yes | yes | yes (cached or null) | **no** — needs Playwright |
| `apollo-linkedin-chain` | yes | — | yes | **no** |

**Fly gets `DISCOVER_MODE=apollo-mock-people` + `LIVE_RESEARCH=0` + `MAX_LI_HITS=0`.**

### Deploy steps

```bash
# 1. Secrets (one-time)
fly secrets set \
  ANTHROPIC_API_KEY=... \
  GROQ_API_KEY=... \
  RESEND_API_KEY=... \
  APOLLO_API_KEY=... \
  SERPAPI_KEY=... \
  APP_PASSWORD=... \
  WAITLIST_FROM_EMAIL=ketan.khairnar@gmail.com \
  -a ai-sales-team-33831

# 2. fly.toml env block — ensure these are set:
#   DISCOVER_MODE = 'apollo-mock-people'
#   LIVE_RESEARCH = '0'
#   MAX_LI_HITS   = '0'
#   TO_EMAIL      = 'ketan@basaltconsulting.in'
#   FROM_EMAIL    = 'onboarding@resend.dev'

# 3. Local docker smoke before deploy (this is now the RULE)
docker build -t ai-sales-team:local .
docker run --rm -p 3000:3000 --env-file .env.local ai-sales-team:local
# Hit localhost:3000, create a campaign, verify: 5 Apollo-synth prospects,
# at least 1 reaches 'sent'. If anything fails locally, do NOT fly deploy.

# 4. Deploy
fly deploy --remote-only --ha=false -a ai-sales-team-33831

# 5. Verify live
curl -s -i -X POST https://ai-sales-team-33831.fly.dev/api/campaigns \
  -F "title=Fly smoke" -F "role=VP Eng" -F "industry=Fintech" \
  -F "company_stage=B" -F "keywords=platform"
# expect: 303 with relative Location
```

### Known risks

- **Background pipeline survival:** fly.toml has `auto_stop_machines=off` and `min_machines_running=1`. Pipeline runs 2-4 min per campaign; machine must stay hot. Verify after deploy.
- **Resend rate limits:** Resend free tier = 100 emails/day. Fine for waitlist + occasional demo sends.
- **SQLite volume:** mounted at `/data`, `DB_PATH=/data/app.db`. Already configured.

---

## Priority 2: Password-gate + waitlist landing page

Public Fly URL should not expose the app. Behind password, the app works as today. Without password, visitor sees a brutalist waitlist page that collects email → writes to SQLite → sends "thanks for signing up" HTML email via Resend.

### Design

**Route matrix:**

| Path | Logged in | Logged out |
|---|---|---|
| `/` | campaigns list | waitlist landing page |
| `/login` | redirect to `/` | password form |
| `/api/login` | POST, sets cookie | POST, sets cookie |
| `/api/logout` | POST, clears cookie | POST, clears cookie |
| `/api/waitlist` | POST, adds email | POST, adds email |
| `/campaign/*`, `/prospect/*`, `/new`, `/personas` | normal | redirect to `/` (waitlist) |
| `/api/campaigns`, `/api/approve`, `/api/outcome` | normal | 401 |

**Password model:** single shared password from `APP_PASSWORD` env. On correct entry, set signed cookie `app_session=<hmac>` with 7-day expiry. No user accounts. **This is a demo gate, not real auth** — for anything beyond demo, swap to real auth.

Minimal auth — don't over-engineer. Use Web Crypto HMAC with a per-deploy `APP_SECRET` (auto-generate if missing at boot, log to /data for persistence).

### Schema addition

```sql
-- migration in store.ts migrate()
CREATE TABLE IF NOT EXISTS waitlist (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT NOT NULL UNIQUE,
  source       TEXT,                    -- 'landing' | 'invite'
  note         TEXT,                    -- optional "why interested"
  created_at   TEXT NOT NULL,
  notified_at  TEXT,                    -- when we sent confirmation
  status       TEXT DEFAULT 'pending'   -- pending | notified | invited | blocked
);
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
```

### Waitlist page design (brutalist + editorial to match app)

```
┌───────────────────────────────────────────────────────────┐
│  AI SALES TEAM · outbound · v0.1              WAITLIST    │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  The sales team                                           │
│  that reads the room                                      │
│  before it knocks.                                        │
│                                                           │
│  Four agents — Siddharth, Shruti, Vikram, Esha —          │
│  discover, score, research, draft, and send. They argue   │
│  with each other before they argue with your prospects.   │
│                                                           │
│  Currently in private trial. Drop your email, we'll       │
│  tell you when it's open.                                 │
│                                                           │
│  ┌─────────────────────────────────────────┐              │
│  │ your@email.com                          │              │
│  └─────────────────────────────────────────┘              │
│  ┌─────────────────────────────────────────┐              │
│  │ what you'd use it for (optional, short) │              │
│  └─────────────────────────────────────────┘              │
│                                                           │
│  [  join waitlist  ]                                      │
│                                                           │
│  — built by ketankhairnar · basalt consulting             │
│                                                           │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ALREADY HAVE ACCESS? [ login ]                           │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

Same typographic system as the app (Source Serif 4 / Literata / Geist Mono, OKLCH colors, zero border-radius).

### Confirmation email (brutal theme HTML)

```
From:    ketan.khairnar@gmail.com  (set WAITLIST_FROM_EMAIL + verify domain on Resend)
Subject: you're on the list — ai sales team
Body:    HTML with the same monospace + serif brutalist look
```

Template (literal, no frameworks):

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>you're on the list</title></head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:'Source Serif 4',Georgia,serif;color:#1a1a1a;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafaf7;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:40px 20px;background:#ffffff;border:2px solid #1a1a1a;">
        <tr><td style="padding:24px 28px;border-bottom:2px solid #1a1a1a;">
          <div style="font-family:'Geist Mono',Menlo,monospace;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#666;">
            dispatch · waitlist confirmation
          </div>
          <div style="font-family:'Source Serif 4',Georgia,serif;font-size:28px;line-height:1.1;font-weight:600;margin-top:8px;">
            you're on the list.
          </div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.6;color:#333;">
          <p style="margin:0 0 16px 0;">Thanks for signing up for <strong>AI Sales Team</strong>.</p>
          <p style="margin:0 0 16px 0;">Currently in private trial — four agents (Siddharth, Shruti, Vikram, Esha) argue over your prospects before drafting cold emails that don't read like cold emails.</p>
          <p style="margin:0 0 16px 0;">I'll email you when access opens. Probably sooner for people who reply to this with what problem they'd use it for.</p>
          <p style="margin:0;font-family:'Geist Mono',Menlo,monospace;font-size:12px;color:#666;">— ketan khairnar · basalt consulting</p>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #1a1a1a;background:#f5f5ef;">
          <div style="font-family:'Geist Mono',Menlo,monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#888;">
            brutalist · editorial · oklch · radius 0
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
```

### Implementation plan (order)

1. **Migration** — add `waitlist` table to `src/db/schema.sql` + `store.migrate()` ALTER-safe block
2. **Store methods** — `addWaitlist({email, note, source})`, `markWaitlistNotified(id, at)`, `listWaitlist()`
3. **Middleware** — `src/middleware.ts` (Astro middleware). Before each request:
   - Extract `app_session` cookie, verify HMAC
   - If missing/invalid and path not in `{'/', '/login', '/api/login', '/api/logout', '/api/waitlist'}` → redirect to `/`
   - Attach `locals.authed = true/false`
4. **New routes:**
   - `src/pages/login.astro` — password form
   - `src/pages/api/login.ts` — POST, verify `APP_PASSWORD`, set HMAC cookie, 303 to `/`
   - `src/pages/api/logout.ts` — POST, clear cookie
   - `src/pages/api/waitlist.ts` — POST `{email, note}`, insert row, fire Resend, 303 to `/?signed=1`
5. **Refactor `/`:**
   - If `locals.authed` → current campaigns list
   - Else → waitlist landing page
6. **Base.astro nav:**
   - If `locals.authed` → existing nav + "logout"
   - Else → "login" only (waitlist page has no nav chrome)
7. **Email template** — `src/emails/waitlist-confirmation.ts` (function returning HTML string), reuse `sendEmail` from `src/tools/resend-send.ts`
8. **From-address:**
   - Ideal: verify domain on Resend so `from=ketan.khairnar@gmail.com` works. Gmail sending domains require DKIM/SPF — Resend docs: https://resend.com/docs/send-with-domains
   - Fallback (immediately usable): `from=ketan@basaltconsulting.in` if that domain is already verified
   - Last resort: `from=onboarding@resend.dev` with `reply_to=ketan.khairnar@gmail.com`
9. **Build + local docker smoke** — try logged-in + logged-out flows, signup hits DB, email sends
10. **Fly deploy**

### New env vars for Fly

```
APP_PASSWORD=<strong demo password>
APP_SECRET=<random 32-byte hex>         # for HMAC cookie signing
WAITLIST_FROM_EMAIL=ketan@basaltconsulting.in   # or whatever verifies on Resend
WAITLIST_REPLY_TO=ketan.khairnar@gmail.com      # gets replies to gmail
```

### Estimated effort

- Migration + store methods: 20 min
- Middleware + auth cookie: 45 min
- Waitlist page + login page (brutalist): 1 hour
- Email template + API route: 30 min
- Routing refactor in `/`, `Base.astro`, nav: 30 min
- Docker smoke + Fly deploy: 30 min

**Total: ~3.5 hours focused.**

---

## What NOT to touch (still locked)

- Personas (Siddharth/Shruti/Vikram/Esha) and their prompts
- Rubrics (`rubrics/score.ts`, `rubrics/draft.ts`)
- M/C/A loop core (`src/mca-loop.ts`) except for the prompt-capture pattern already in place
- Persona registry + `.impeccable.md` design direction
- OKLCH color tokens in `src/styles/global.css`

---

## Open questions for the next session

1. **Resend sender domain** — do we have a verified domain ready, or do we need DNS setup first? This blocks the "from ketan.khairnar@gmail.com" ask. If gmail isn't verifiable on Resend, pick a subdomain on `basaltconsulting.in` (e.g. `hello@basaltconsulting.in`) and `reply_to: ketan.khairnar@gmail.com`.
2. **Rate limiting on waitlist POST** — single IP floods the DB with signups. Add a simple 1-per-minute-per-IP throttle in waitlist API? Or accept and dedupe on email.
3. **Admin view of waitlist** — once authed, want a `/admin/waitlist` page to see who signed up and one-click invite (= pre-provision a login token and email them)?

---

## Fast path to demo-ready

If the waitlist work gets hairy, minimum-viable Fly deploy without waitlist:

1. fly.toml env vars as documented above
2. Fly secrets set
3. Docker build locally first, verify campaign submit → prospects → M/C/A transcript works
4. `fly deploy`
5. Share URL behind BASIC AUTH at the load balancer instead — `fly.toml [http_service]` can't do basic auth natively, but you can add a simple middleware that checks a hardcoded header or URL param (`?k=<secret>`) as an 80/20 gate

That gets you "Fly demo works, password-ish" in 30 min instead of 3.5 hours.

---

## State on disk

```
/tmp/ai-sales-full2.db                # active dev DB, 5 campaigns
_archive/test-dbs/                    # 7 archived test DBs (gitignored)
ref/icp-search/                       # Apollo CLI source ref (gitignored)
prospects/                            # raw LinkedIn scrape data (gitignored)
tools/linkedin-{research,intel}/.cookies.json  # fresh cookies (gitignored)
tools/linkedin-{research,intel}/.venv          # Python venvs (gitignored)
.env.local                            # all API keys (gitignored)
```

**Don't commit any of these.** Already covered by `.gitignore`.

---

## Rule reminder

**Every Fly deploy preceded by `docker build -t ai-sales-team:local . && docker run --rm -p 3000:3000 --env-file .env.local ai-sales-team:local` and a full form-submit smoke test.** Non-negotiable after the last Fly-submission-broken incident.
