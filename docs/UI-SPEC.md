# UI Spec — Brutalist Kanban + Deal CRM

Inherits tacit-web tokens: mono, black/white/orange, radius 0, density over air.

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ AI SALES TEAM · outbound-v1 · campaign #042        [NEW CAMPAIGN]│   ← header (mono, 14px)
├─────────────────────────────────────────────────────────────────┤
│ ICP: B2B SaaS · Series A-B · 50-200 FTE · Platform Eng VP      │   ← one-line ICP echo
├─────────────────────────────────────────────────────────────────┤
│ DISCOVERED   SCORED       RESEARCHED   DRAFTED      SENT        │
│    20           20              3           3          1        │
│ ─────────── ─────────── ─────────── ─────────── ───────────     │
│ [card]       [card s:9] [card ✦]    [card ✦]    [card ✓]       │
│ [card]       [card s:8] [card ✦]    [card ⚠]                   │
│ [card]       [card s:4]             [card  ?]                   │
│ [card 17→]   [card 17→] ← more                                  │
├─────────────────────────────────────────────────────────────────┤
│ ACTIVITY  (live)                                                 │
│ 14:02:33 [Vera·VP]     scored 20 prospects                      │
│ 14:02:41 [Skylar·Skep] scored Maria 9/10 — clear ICP match      │
│ 14:02:45 [Vera·VP]     → Sam: research top 3                    │
│ 14:03:12 [Sam·SDR]     fetching LI for Maria (acme.com)         │
│ 14:03:44 [Sam·SDR]     drafted email for Maria                  │
│ 14:03:46 [Ellie·Edit]  6/10 — hook too generic                  │
│ 14:03:49 [Vera·VP]     revise. lead with GraphQL migration.     │
│ 14:03:58 [Sam·SDR]     retry                                    │
│ 14:04:02 [Ellie·Edit]  9/10 ✓ ship it                           │
│ 14:04:05 [ketan]       [approved] send                          │
│ 14:04:06 [system]      resend → inbox (id:re_xxx)               │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Header bar
- 1px black border bottom
- Mono, tracking-tight
- `NEW CAMPAIGN` button: black fill, white text, 0 radius, orange underline on hover

### Stage columns
- `grid-cols-5` at md+, stack at sm
- Each column: 1px border, header in caps + count in orange
- Fixed height, internal scroll
- No card shadows. Card = 1px border, padding 10px.

### Prospect card (COMPACT — fits in column)

```
┌──────────────────────────────┐
│ MARIA CHEN            9/10 ● │  ← name + score (orange dot if hot)
│ vp platform eng · acme       │  ← designation lowercase, muted
│ ──────────────────────────── │
│ stage: drafted · iter 2/2    │  ← stage + attempt
│ ✓ scored  ✓ research  ✦ draft│  ← stage badges (✓ pass · ✦ in · · · future)
│ hook: graphql migration       │
│                    [OPEN] →  │  ← orange underline
└──────────────────────────────┘
```

### Prospect card (EXPANDED — deal-CRM view, modal or side pane)

```
┌──────────────────────────────────────────────────────────────┐
│ MARIA CHEN · VP PLATFORM ENG · ACME                    [×]  │
│ linkedin.com/in/maria-chen · x.com/mchen                    │
├──────────────────────────────────────────────────────────────┤
│ PIPELINE                                                     │
│ ✓ discovered ───▶ ✓ scored (9) ───▶ ✓ researched            │
│   ───▶ ✦ drafted (iter 2/2, 9/10) ───▶ · sent               │
├──────────────────────────────────────────────────────────────┤
│ ATTEMPTS                                                     │
│ ── drafted                                                   │
│   iter 1: Sam wrote · Ellie 6/10 · Vera: revise              │
│     "saw your post — interesting thoughts on graphql"        │
│     issues: hook generic; cta weak                           │
│   iter 2: Sam wrote · Ellie 9/10 · pass                      │
│     "the graphql migration gotcha you hit last week..."      │
│     [edit] [regenerate] [approve & send]                     │
├──────────────────────────────────────────────────────────────┤
│ DOSSIER                                                      │
│ · hired 4 platform engs in q1                                │
│ · recent li post: graphql federation rollout                 │
│ · x: complained about n+1 queries in codegen                 │
│ · company: series b, 140 FTE, recent safety audit            │
├──────────────────────────────────────────────────────────────┤
│ HUMAN INPUTS                                                 │
│ ketan · 14:03 · note: "met at KubeCon"                       │
│ [+ add comment] [+ approve & send]                           │
└──────────────────────────────────────────────────────────────┘
```

## Color rules

- `--accent` (#ff6b35): approval CTAs, active stage header, hot score dot (>=8), hook underline
- `--fg` (#000): all text, all borders
- `--muted-fg` (#666): secondary text only
- Checker scores:
  - <5: plain black, no decoration
  - 5-7: plain black with `underline decoration-dotted`
  - ≥8: orange dot inline (●)

No red, no green, no traffic lights. Scores speak.

## Typography scale

```
h1 24px / bold / mono / uppercase / tracking-tight
h2 18px / bold / mono / uppercase
h3 14px / bold / mono
body 13px / mono
small 11px / mono / muted-fg
```

## Motion

- Stage transition: instant (no animation for the card move)
- New card enters column: 1-frame fade in only
- Activity log: new line highlights with orange left-border 2px for 1.5s then fades to none
- No scroll-jacking, no parallax

## Pages

### `/` — Campaign board (above layout)

### `/new` — Campaign create

```
NEW CAMPAIGN

PIPELINE  [outbound-v1 ▾]
ICP       role          ________________
          company size  ________________
          industry      ________________
          pain          ________________
          geography     ________________

PROSPECTS  [paste linkedin urls, one per line]
           [or]  [run search: query ___________]

                                          [START →]
```

### `/campaign/:id` — Board (default)

### `/prospect/:id` — Detail pane (can also open as modal)

### `/activity` — Full activity log with filters (persona, stage, prospect)

### `/personas` — Show the team (static)

```
VERA   · VP SALES   · sonnet · arbiter on all
SAM    · SDR        · sonnet · researches, drafts, sends
ELLIE  · EDITOR     · haiku  · checks drafts
SKYLAR · SKEPTIC    · haiku  · checks scores
ALEX   · AE         · sonnet · [v2 — replies, proposals]
SAGE   · SE         · sonnet · [v2 — demos]
CASEY  · CSM        · haiku  · [v2 — onboarding]
```

## Tech

- Astro SSR (server routes) + React islands for live columns
- SSE from `/api/stream/:campaignId` → updates columns + activity feed
- Tailwind with custom config matching tacit-web tokens
- One component per concept, no prop drilling, no state lib (useState + server state)

## Accessibility

- Keyboard nav across columns: `[`/`]` move between columns, `↑↓` within column, `Enter` opens card
- All color conveys secondary info (shape/text always carries primary signal)
- `aria-live=polite` on activity feed
