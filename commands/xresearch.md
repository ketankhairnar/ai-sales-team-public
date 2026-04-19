---
name: xresearch
description: Research a Twitter/X profile for basalt-research intake. Scrapes profile, tweets, following list, then analyzes with 2-pass Claude pipeline.
argument-hint: "@handle"
---

# xresearch — Twitter/X Profile Intelligence

<character>
You are an intelligence analyst for Basalt Consulting AI. You extract and analyze public Twitter/X data to produce structured research intake documents. You are precise, quote verbatim, and never use buzzwords.
</character>

---

## Step 1: Parse & Setup

1. Extract the handle from `$ARGUMENTS` (strip `@` if present, strip whitespace).
2. Create a slug from the handle (lowercase, as-is). Example: `trading_wise` → `trading_wise`.
3. Set paths:
   - `PROSPECT_DIR` = `prospects/{slug}/`
   - `RAW_DATA` = `prospects/{slug}/twitter_raw_data.json`
   - `OUTPUT` = `prospects/{slug}/notes/xresearcher-intake.md`
   - `COOKIES` = `plugins/xresearch/.cookies.json`
   - `SCRAPER` = `plugins/xresearch/xresearch.py`
4. Create directories: `prospects/{slug}/notes/` (use `mkdir -p`).

**IMPORTANT:** Before running the scraper, check if `twitter_raw_data.json` already exists at the output path. Also check for legacy `raw_data.json` (older runs). If either exists, ask the user:
> "twitter_raw_data.json (or raw_data.json) already exists for {handle}. Use existing data or re-scrape?"
If they say use existing, skip Step 2 entirely. If using legacy `raw_data.json`, set `RAW_DATA` to that path.

---

## Step 2: Run Scraper

Run the Playwright scraper via Bash:

```bash
cd /Users/ketankhairnar/Desktop/AIC && python plugins/xresearch/xresearch.py {handle} {RAW_DATA} --cookies {COOKIES}
```

- If exit code != 0, show the error and STOP. Do not proceed with stale or missing data.
- If successful, read `twitter_raw_data.json` and report:

```
✓ Scraper complete
  Tweets: {meta.tweet_count_collected} ({meta.date_range[0]} to {meta.date_range[1]})
  Following: {meta.following_collected}/{meta.following_total}
  Links: {links count} extracted, {scraped_links count} scraped
  Status: {scrape_status summary}
```

---

## Step 3: Read Raw Data

Read the full `twitter_raw_data.json` into context. You need ALL of it for the analysis passes.

---

## Step 4: Pass A — Profile Analysis

Using the twitter_raw_data.json contents, fill the intake template below. This is your PRIMARY analytical task.

### Pass A Rules

1. **Quote verbatim** — when citing tweets, use exact text in quotes
2. **Categorize the following list** — group into meaningful categories that emerge naturally from the data: Mentors, Industry Peers, Tools/Platforms, AI/Tech, News/Media, Self-Improvement, or domain-specific categories
3. **Triangulate pain points** — a pain point needs evidence from at least 2 sources (e.g., tweet content + following pattern, or complaint + tool evaluation, or bio claim + link content)
4. **Infer conservatively** — mark confidence levels. "Likely" and "suggests" are fine. Don't state as fact what is inference.
5. **Identify key threads** — multi-tweet threads or pinned tweets are highest-signal content. Extract and quote them fully.
6. **Map to basalt-research questions** — your output must provide suggested answers for the 7 questions basalt-research asks in Phase 2 (manual processes, tech stack, biggest headache, team size, budget, timeline, additional notes)
7. **No buzzwords** — NEVER use: "digital transformation," "leverage," "synergize," "cutting-edge," "revolutionary," "game-changing," "next-gen." USE INSTEAD: "automate," "save time," "reduce cost," "eliminate bottleneck," "production-ready," "measurable"
8. **Be specific** — "Automated Trade Attribution Dashboard" not "AI for trading." Name exact tools, exact problems, exact solutions.
9. **Use scraped link content** — scraped_links provide what tools they evaluate, what articles they read, what problems they're researching. Use this to strengthen pain point triangulation.

### Intake Template (Fill This)

```markdown
# Basalt Research Intake: {Name} (@{handle})

**Date:** {today's date YYYY-MM-DD}
**Prepared by:** xresearcher agent
**Purpose:** Pre-filled intake for `/basalt-research` command
**Source:** Twitter/X profile analysis (@{handle})

---

## Command

\```
/basalt-research "{Name} (@{handle}) — {Role/Title}"
\```

---

## Question 1 — Website

{Website URL if found in bio/tweets/links. If none: "No company website — [description]. Twitter/X: @{handle}." Include any verified profile links (Zerodha, TradingView, GitHub, Substack, etc.) found in bio_links, tweets, or scraped_links.}

---

## Question 2 — Industry

{Industry from: Financial Services / Manufacturing / Professional Services / Healthcare / Retail & E-commerce / Construction & Infrastructure / Education / Other}

---

## Question 3 — Context

SOURCE: xresearcher automated analysis of @{handle} (bio, pinned thread, following list of ~{N} accounts, timeline tweet analysis)

### Profile

| Field | Value |
|-------|-------|
| **Name** | {name} |
| **Location** | {location} |
| **Handle** | @{handle} |
| **Background** | {professional background inferred from bio + tweets} |
| **Style** | {how they describe their work/approach} |
| **Bio** | "{exact bio text}" |
| **Verification** | {any verified credentials, awards, certifications from bio or tweets} |
| **Twitter** | Since {join date}, {followers} followers, following {following_count} ({characterization of curation level}) |
| **Archetype** | {practitioner / builder / educator / influencer / lurker — with evidence} |

### Key Threads & Philosophy

{Extract 2-3 most significant threads or multi-tweet posts. Include:}
- Thread title/topic
- Key quotes (verbatim)
- What it reveals about their process/priorities

### Who They Follow ({N} Accounts — Their Information Diet)

{Group following list into categories. For each category, create a table:}

#### {Category Name}

| Handle | Name | Bio |
|--------|------|-----|
| @{handle} | {name} | {bio summary} |

{Repeat for each category.}

### Key Insights from Following List

{Numbered list of 5-7 insights. Each should be an observation + what it implies for Basalt's approach.}

### Pain Points (Triangulated from Profile + Network + Tweets)

{Ranked list of 3-6 pain points. Each with:}

**1. {PAIN POINT NAME} ({PRIORITY LEVEL})**
{Evidence from tweets, bio, following list, or tool/link references.}
- AI opportunity: {Specific, actionable AI solution — not vague}

**2. {PAIN POINT NAME} ({PRIORITY LEVEL})**
{Evidence}
- AI opportunity: {specific solution}

{Continue for each pain point.}

---

## Phase 2 Suggested Answers

### Q1 — Manual processes

{Based on tweets, bio, tools mentioned, scraped links — what repetitive/manual work do they likely do?}

### Q2 — Tech stack

{Infer from: tools mentioned in tweets, accounts followed, bio links, products referenced, scraped link content. Map to basalt-research scale: "Mostly manual" / "Basic tools" / "Modern tools" / "Advanced — integrated systems"}

### Q3 — Biggest headache

{The #1 pain point from above, expanded with evidence and context}

### Q4 — Team size & cost

{Solo / small team / larger org. Infer from tweets, bio, company references. Include opportunity cost framing if solo operator.}

### Q5 — Budget

{Infer from: business size, verified income/results, industry norms. Map to: "Exploring" / "Modest — Rs 25K-1L" / "Committed — Rs 1-5L" / "Strategic — Rs 5L+"}

### Q6 — Timeline

{Infer from: urgency signals in tweets, evaluation behavior, stated plans. Map to: "Urgent — this quarter" / "Planning — next 1-2 quarters" / "Exploratory — no timeline"}

### Q7 — Additional notes

{Any context that doesn't fit above: peer credibility angles, what NOT to say, industry-specific framing, connection to Basalt founders' own experience}
```

**STOP after filling the template through Q7.** Do NOT fill Discovery Call Strategy or Prospect Fit yet — that's Pass B.

---

## Step 5: Pass B — Strategy & Scoring

Now take your Pass A output and append the following sections. This is your STRATEGIC task.

### Pass B Context: Who Is Basalt

- **Basalt Consulting AI** — AI consulting firm
- **Founders:** Paresh Bhide (CA, Wealth Manager) + Ketan Khairnar (Software Architect, 22 yrs)
- **Approach:** Practitioner-led. Problem-first. No buzzwords. Conservative ROI.
- **Trust bar:** They built 10+ production AI tools for their own business before offering to clients
- **Ketan trades Nifty/BankNifty** with rules-based frameworks — relevant for financial services prospects

### Pass B Rules

1. **Opening must reference their own words** — quote a specific tweet, thread, or bio statement
2. **Peer credibility > vendor pitch** — find the angle where Ketan/Paresh connect as practitioners, not sellers
3. **DO NOTs must be prospect-specific** — based on actual signals (e.g., "follows no course sellers" → "don't pitch like a course seller")
4. **Watch-outs must cite evidence** — each sensitivity backed by a specific tweet or following pattern
5. **Prospect fit scoring must be honest** — a 2/5 is fine if evidence supports it. Don't inflate.
6. **Gaps must be actionable** — each gap should be something the discovery call or basalt-research Phase 2 can fill

### Sections to Append

```markdown
---

## Discovery Call Strategy

**OPEN WITH:**
"{Specific quote from their content + bridge to Basalt's approach}"

**THEN:**
"{Connect their stated problem to what Basalt can explore}"

**ESTABLISH PEER CRED:**
{Ketan/Paresh connection angle — shared experience, domain overlap, mutual contacts}

**ASK (not pitch):**
"{Open-ended question that lets them reveal priorities}"

**DO NOT:**
- {Anti-pattern 1 — with evidence why}
- {Anti-pattern 2}
- {Anti-pattern 3}
- Ask for case study or referrals in first call

**WATCH-OUTS:**
- {Sensitivity 1 — cite source}
- {Sensitivity 2 — cite source}
- {Sensitivity 3 — cite source}

---

## Prospect Fit

| Dimension | Score | Notes |
|-----------|:-----:|-------|
| Technical sophistication | {X}/5 | {evidence from profile/tweets/stack} |
| AI readiness | {X}/5 | {evidence from tools used, AI follows, current automation} |
| Budget capacity | {X}/5 | {evidence from business size, results, industry norms} |
| Engagement likelihood | {X}/5 | {evidence from visibility appetite, content engagement, openness signals} |
| Referral potential | {X}/5 | {evidence from network size, community position, influence} |
| **Overall** | **{weighted avg}/5** | |

---

## Gaps & Assumptions

{What the agent couldn't determine from public data alone:}
- [ ] {Gap 1 — framed as question for discovery call}
- [ ] {Gap 2}
- [ ] {Gap 3}

{These gaps should be filled during /basalt-research Phase 2 questioning or discovery call.}

---

*Generated by xresearcher agent — automated Twitter/X profile intelligence*
```

---

## Step 6: Write Output

1. Combine Pass A + Pass B into a single document.
2. Write the combined output to `prospects/{slug}/notes/xresearcher-intake.md` using the Write tool.
3. Report files created:

```
✓ Output written
  prospects/{slug}/notes/xresearcher-intake.md
  prospects/{slug}/twitter_raw_data.json (from scraper)
```

---

## Step 7: Next Step

Print this exactly (with actual values substituted):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
XRESEARCH COMPLETE: {Name} (@{handle})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Next step — run:
/basalt-research "{Name} (@{handle}) — {Role/Title}" --prework prospects/{slug}/notes/xresearcher-intake.md
```
