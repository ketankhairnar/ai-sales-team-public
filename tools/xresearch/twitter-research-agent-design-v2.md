# Twitter/X Research Intelligence Agent — Design v2

**Status**: Design Document  
**Author**: Ketan Khairnar  
**Purpose**: Reconstruct a target person's typical day, business priorities, and pain points from their public digital footprint — starting from Twitter/X and following every signal outward. Usable as a standalone CLI and as a Claude Code MCP skill.

---

## 1. The Core Question

This agent is not a tweet summarizer. It is answering four specific questions about a person:

1. **What does their typical day / week look like?**
2. **What are their real business priorities right now?**
3. **Where are the inefficiencies, time sinks, and pain points?**
4. **How active and self-aware are they about these problems?**

Some of this is explicit — they tweet about it clearly. Most of it is implicit — buried in frustrations, offhand complaints, what they retweet at 11pm, what tools they link, what questions they ask. The agent's job is to surface both layers.

---

## 2. Signal Architecture

Twitter is the entry point. Every link, retweet, mention, and bio reference is a thread to pull. The agent follows all of them.

```
ENTRY POINT
    └── Twitter Profile (@handle)
            │
            ├── LAYER 1 — Profile Surface
            │       Profile text, bio links, location, joined date
            │       Pinned tweet (deliberate signal — what they want you to see)
            │       Follower/following counts, verified status
            │
            ├── LAYER 2 — Tweet Feed (scroll 100 tweets / 3 months)
            │       Original tweets → what they choose to say
            │       Replies → where frustrations live (offhand, unfiltered)
            │       Quote tweets → what they amplify + their commentary on it
            │       Retweets → what they silently endorse
            │       Thread starters → what they care enough to write long-form
            │
            ├── LAYER 3 — Following List (up to 300)
            │       Who they follow → peer map, trust signals, industry lens
            │       What categories dominate → tools, peers, media, educators
            │       Who they DON'T follow → as important as who they do
            │
            └── LAYER 4 — Outbound Links (Playwright follows these)
                    Bio links → personal site, Substack, GitHub, LinkedIn, product pages
                    Shared article links → what content they read and amplify
                    Retweeted thread links → what ideas they want their audience to see
                    Tool/product links → what they're using or evaluating
                    Referenced profiles → who they mention, praise, or critique
```

### Signal Priority for Intent Inference

| Signal | Explicitness | Where Pain Lives |
|--------|:-----------:|-----------------|
| Original tweets | High | Stated priorities, deliberate positioning |
| Reply threads | **Highest** | Unfiltered frustrations, real opinions |
| Quote tweets with commentary | High | What they're reacting to, implicit disagreements |
| Late-night / weekend retweets | Medium | What they're actually thinking about off-hours |
| Bio links (scraped content) | High | Their professional identity, what they're building |
| Shared article links (scraped) | Medium | What problems they're reading about |
| Following list categories | Medium | Peer group, what tools/communities they trust |
| What they DON'T tweet about | Low but real | Blind spots or deliberate omissions |

---

## 3. What the Agent Is Extracting

### 3.1 Typical Day / Week Reconstruction

Not from asking them — from inferring it. Sources:

- **Tweet timestamps** → when do they post? Pre-market? Late night? Weekends? This reveals their schedule
- **Content themes by time** → market-hours content vs. research content vs. learning content
- **Reply patterns** → are they in conversations during market hours or after?
- **Retweet cadence** → passive consumption (reading) vs. active production (creating)
- **Tool and service references** → what platforms appear in their tweets reveals their workflow
- **Complaints about time** → "spent 3 hours doing X", "wish I didn't have to manually Y"

Output: a structured hypothesis of their typical day — morning routine, active work hours, research/learning time, what operational tasks consume them.

### 3.2 Business Priority Inference

Sources:

- **Thread topics** → what they write multi-tweet threads about = highest priority thinking
- **Link sharing patterns** → what articles they share reveals what they're learning about or validating
- **Pinned tweet** → deliberate statement of current priority
- **Bio links** → what they're building or selling
- **Scraped bio link content** → what their website/Substack actually says
- **Repeated topics** → what comes up 3+ times across tweets, replies, retweets

Output: ranked list of 3-5 current priorities with evidence trail.

### 3.3 Pain Point Extraction

This is the most valuable output and the hardest to extract. Pain rarely announces itself. Sources:

**Explicit pain** (easy):
- Direct complaints: "X is broken", "I hate having to do Y manually"
- Tool criticism: "tried Z, doesn't work for my use case because..."
- Wish statements: "someone should build X for Y"
- Questions asked: "does anyone know a good tool for..."

**Implicit pain** (where the real signal is):
- Repeated workarounds described: "what I do is manually..." → a workaround is an unfilled need
- Partial solutions praised: "X is good but doesn't do Y" → the missing Y is the pain
- Volume of content about a problem → the more they write about something, the more it bothers them
- Late-night frustrations in replies → unguarded, often more honest than polished tweets
- What they retweet about tools/processes → silent endorsement of someone articulating their pain
- Hedged complaints: "not ideal but...", "kind of annoying that...", "would be nice if..."

**From scraped links** (deep signal):
- Articles they share about productivity, tools, workflows → reading about a problem = probably experiencing it
- Blog posts or threads they link from peers solving a specific problem → same inference
- Tool landing pages they visit or link → evaluating a solution = aware of the problem

### 3.4 Activity Level and Self-Awareness Assessment

- **Posting frequency** → how active are they? Increasing or declining over 3 months?
- **Reply vs. broadcast ratio** → do they engage or just broadcast?
- **Depth of content** → quick takes vs. thought-through threads
- **Self-reflection tweets** → do they write about their own process? How aware are they of their bottlenecks?
- **Tool evaluation behavior** → actively trying new things vs. settled into existing stack
- **Community participation** → do they respond to others, or are they an island?

---

## 4. Data Collection Pipeline

### 4.1 Playwright Scraper — What Gets Collected

Everything goes into a single structured JSON. No analysis at this stage — pure data collection.

```
Stage 1: Profile Page
    → name, bio, location, website, joined date, verified status
    → follower count, following count, tweet count
    → pinned tweet (full text + metrics)
    → avatar + header image URLs

Stage 2: Tweet Feed Scroll
    → last 100 tweets OR last 3 months (whichever comes first)
    → per tweet: text, timestamp, type (original/reply/QT/RT)
    → per tweet: likes, replies, retweets, views
    → per tweet: all URLs (before expansion), @mentions, #hashtags
    → per tweet: media presence (image/video/poll)
    → reply tweets: capture what they're replying TO (the parent tweet text)
      ↳ this is critical — reply context reveals what triggered their response

Stage 3: Following List
    → up to 300 accounts: handle, display name, bio snippet
    → stop at 300 — beyond this, signal density drops

Stage 4: Outbound Link Expansion (Playwright navigates to each)
    → Bio links: full page scrape (title, meta description, first 500 words)
    → Shared article links from tweets: title + first 500 words
    → Limit: top 20 most-linked domains, max 3 pages per domain
    → Skip: paywalled content, social platforms, image links
```

### 4.2 Link Expansion Priority

Not all links are equal. The agent prioritizes:

1. **Bio links** — highest signal, always scrape
2. **Links in pinned tweet** — deliberate, always scrape
3. **Links shared 2+ times** — repetition = importance
4. **Tool/product landing pages** — reveals stack and evaluation behavior
5. **Personal blogs or Substack of followed accounts** — peer influence signal
6. **News/article links** — scrape for topic, skip body (copyright + noise)

### 4.3 JSON Output Schema

The scraper produces one JSON file per research session:

```json
{
  "meta": {
    "handle": "trading_wise",
    "scraped_at": "2026-03-06T14:30:00Z",
    "tweet_count_collected": 94,
    "date_range": ["2025-12-08", "2026-03-06"],
    "following_collected": 48
  },

  "profile": {
    "name": "Shyam",
    "bio": "...",
    "location": "Coimbatore, TN",
    "website": null,
    "joined": "2018-06-01",
    "verified": false,
    "followers": 1240,
    "following": 48,
    "tweet_count_total": 3820
  },

  "pinned_tweet": {
    "text": "...",
    "created_at": "...",
    "metrics": { "likes": 0, "replies": 0, "retweets": 0 }
  },

  "tweets": [
    {
      "id": "...",
      "text": "...",
      "created_at": "2026-03-05T18:42:00Z",
      "type": "reply",
      "in_reply_to_text": "parent tweet text here",
      "metrics": { "likes": 12, "replies": 3, "retweets": 1, "views": 340 },
      "urls": ["https://expanded.url/..."],
      "mentions": ["madan_kumar"],
      "hashtags": [],
      "has_media": false
    }
  ],

  "following": [
    {
      "handle": "madan_kumar",
      "name": "Madan Kumar",
      "bio": "Mr. Consistent. Derivatives trader...",
      "scraped_at": "2026-03-06"
    }
  ],

  "scraped_links": [
    {
      "url": "https://marketswithmadan.com",
      "source": "following_bio",
      "title": "Markets with Madan",
      "excerpt": "First 500 words...",
      "scraped_at": "2026-03-06T14:35:00Z"
    }
  ]
}
```

---

## 5. Analysis Pipeline

The JSON is the fuel. Claude runs the analysis in structured passes. Each pass has a specific question it is answering.

### Pass 1 — Persona Reconstruction

**Input:** profile + pinned tweet + following list bios  
**Question:** Who is this person? What is their professional identity and current chapter?  
**Output:**
```json
{
  "one_line": "Ex-IT professional turned full-time systematic trader...",
  "professional_identity": "...",
  "current_chapter": "...",
  "trust_indicators": ["..."],
  "community_position": "practitioner | builder | learner | influencer | lurker"
}
```

### Pass 2 — Priority Extraction

**Input:** all tweets (full text), pinned tweet, bio link excerpts  
**Question:** What are this person's 3-5 current priorities? What evidence supports each?  
**Output:**
```json
{
  "priorities": [
    {
      "topic": "Scaling systematic strategy research",
      "confidence": "high",
      "evidence": ["tweet text 1", "shared article title", "..."],
      "priority_rank": 1
    }
  ]
}
```

### Pass 3 — Typical Day/Week Reconstruction

**Input:** tweet timestamps + types + topics, tool references, time-related language in tweets  
**Question:** What does a typical day and week look like for this person? What consumes their time?  
**Output:**
```json
{
  "typical_day": {
    "morning": "...",
    "active_hours": "...",
    "evening": "..."
  },
  "typical_week": {
    "daily_recurring": ["..."],
    "weekly_recurring": ["..."],
    "estimated_time_sinks": [
      { "activity": "Manual backtesting / candle review", "estimated_hrs_week": "5-10", "evidence": "..." }
    ]
  },
  "posting_schedule_signal": "posts primarily evenings (7-10pm IST) — market hours are work, evenings are reflection"
}
```

### Pass 4 — Pain Point Extraction

**Input:** all tweets, especially replies and quote tweets, scraped link excerpts  
**Question:** Where are the explicit and implicit frustrations? What workarounds are described? What tools are praised-but-incomplete?  
**Output:**
```json
{
  "explicit_pains": [
    {
      "pain": "Manual candle scrolling is the bottleneck to scaling",
      "explicitness": "stated directly",
      "quote": "exact tweet text",
      "frequency": 3
    }
  ],
  "implicit_pains": [
    {
      "pain": "Performance attribution — verified results with no visual showcase",
      "explicitness": "inferred from tool links + complaint pattern",
      "evidence": "shared article about trading dashboards + comment 'wish I had something like this'",
      "confidence": "medium"
    }
  ],
  "workarounds_described": ["..."],
  "tools_evaluated_but_incomplete": [
    { "tool": "Sentinel Algo", "gap": "US market focused, not Indian" }
  ]
}
```

### Pass 5 — Peer Network Intelligence

**Input:** following list with bios, mentions in tweets, accounts engaged with  
**Question:** Who influences this person? What does their peer network reveal about their worldview and trust structure?  
**Output:**
```json
{
  "peer_categories": {
    "mentors": ["..."],
    "peers_builders": ["..."],
    "tools_followed": ["..."],
    "media_news": ["..."],
    "finfluencers": 0
  },
  "trust_structure": "in-person seminar trust + verified results community — not social media influence",
  "influence_gap": "no agency or consultant follows — may be skeptical of outsiders",
  "approach_signal": "peer conversation > vendor pitch"
}
```

### Pass 6 — Synthesis and B2B Signal

**Input:** all previous pass outputs  
**Question:** If approaching this person for consulting or product work, what matters?  
**Output:**
```json
{
  "approach_angle": "...",
  "opening_that_resonates": "...",
  "opening_to_avoid": "...",
  "credibility_requirements": ["..."],
  "timing_signal": "actively researching expansion — receptive window is now",
  "red_flags": ["..."],
  "business_signals": ["..."]
}
```

---

## 6. Output Formats

### 6.1 Structured JSON (always produced)

All pass outputs merged into one `analysis.json`. This is the machine-readable artifact — used by downstream tools (action plan generator, outreach drafters, Claude Code mid-session context).

### 6.2 Research Document (markdown, always produced)

Mirrors the format of `01-research.md` and `02-analysis.md` from the Basalt workflow. Structured enough to drop directly into the consulting pipeline.

```
# Research: [Name] — [Role] (@handle)
## Persona Snapshot
## Typical Day / Week (Reconstructed)
## Business Priorities
## Pain Points — Explicit
## Pain Points — Implicit  
## Peer Network Intelligence
## AI Readiness Assessment
## Approach Signals
## Gaps & Assumptions (what the agent couldn't determine)
## Sources
```

### 6.3 TL;DR Card (markdown, always produced)

One-page summary — mirrors `03-tldr.md`. Situation / Problem / Opportunity / Next Step. Ready to share or drop into a consulting deck.

### 6.4 HTML Report (optional, `--report` flag)

Interactive version with charts: posting frequency timeline, content mix breakdown, engagement patterns, peer network tag cloud.

---

## 7. Human Annotation Slot

The agent produces `00-intake` through `03-tldr` automatically. `04-action-plan` requires human input that the agent cannot get from public data.

After the agent runs, it produces a `NEEDS_HUMAN.md` file:

```markdown
# What the agent couldn't determine — fill these in before generating the action plan

## From a discovery call or direct conversation:
- [ ] What are they currently working on that isn't public?
- [ ] What did they say about their biggest frustration in their own words?
- [ ] What have they already tried and rejected?
- [ ] What is their budget posture? (exploratory / allocated / urgent)
- [ ] What is their timeline? (no pressure / defined deadline)
- [ ] Any specifics about their tech stack not visible in tweets?

## Paste discovery call notes here:
[PASTE NOTES]

## Agent will then generate 04-action-plan incorporating above
```

Once the human fills in `NEEDS_HUMAN.md`, running `twresearch @handle --action-plan` generates the full action plan using both agent research and call notes.

---

## 8. Architecture Summary

```
INVOCATION
twresearch @handle [--tweets N] [--months N] [--depth full] [--report] [--action-plan]
    OR
MCP tool call from Claude Code session

                │
                ▼
        ORCHESTRATOR
        Check cache → skip scrape if < 6hrs old
                │
                ▼
        PLAYWRIGHT SCRAPER                    ← runs headless, your Chrome session
        Stage 1: Profile
        Stage 2: Tweet feed scroll
        Stage 3: Following list
        Stage 4: Bio link scrapes
        Stage 5: Shared article scrapes
        Stage 6: Peer profile bios
                │
                ▼
        raw_data.json                         ← all collected data, unanalyzed
                │
                ▼
        CLAUDE ANALYSIS PIPELINE
        Pass 1: Persona reconstruction
        Pass 2: Priority extraction
        Pass 3: Typical day/week reconstruction
        Pass 4: Pain point extraction (explicit + implicit)
        Pass 5: Peer network intelligence
        Pass 6: B2B synthesis
                │
                ▼
        analysis.json                         ← structured intelligence output
                │
          ┌─────┴─────┐
          ▼           ▼
    research.md    tldr.md          ← always produced
    NEEDS_HUMAN.md
          │
    [human pastes call notes]
          │
          ▼
    action-plan.md                  ← generated with human + agent context combined
          │
          ▼
    report.html                     ← optional, --report flag
```

---

## 9. CLI Reference

```
twresearch <handle> [options]

Core options:
  --tweets N          Max tweets to collect (default: 100)
  --months N          Date cutoff in months (default: 3)
  --depth             standard | full (full adds following list scrape)
  --no-cache          Force re-scrape even if cache is fresh

Output options:
  --report            Generate interactive HTML report
  --action-plan       Generate action plan (requires NEEDS_HUMAN.md to be filled)
  --format            json | md | all (default: all)

Analysis options:
  --focus TEXT        Bias the analysis toward a specific question
                      e.g. --focus "operational inefficiencies"
                      e.g. --focus "AI tool adoption readiness"
                      e.g. --focus "outreach angle for consulting"

Examples:
  twresearch @trading_wise
  twresearch @trading_wise --depth full --focus "pain points and time sinks"
  twresearch @trading_wise --action-plan   # after filling NEEDS_HUMAN.md
  twresearch @sama --report --focus "AI infrastructure opinions"
```

---

## 10. MCP Tool for Claude Code

```python
@mcp.tool()
async def research_person(
    handle: str,
    depth: Literal["standard", "full"] = "standard",
    focus: Optional[str] = None
) -> dict:
    """
    Research a person's Twitter/X profile. Reconstructs their typical day,
    business priorities, and pain points from their public digital footprint.
    Follows all outbound links from their profile and tweets.
    Returns structured intelligence ready for outreach, consulting, or background research.
    
    Focus examples:
    - "operational inefficiencies and time sinks"
    - "AI tool adoption readiness"  
    - "outreach angle for B2B consulting"
    - "technical sophistication and stack signals"
    """
```

When Claude Code has this tool registered, it can answer mid-session:

```
"Before I write this outreach email to @trading_wise, research him."
→ Claude Code calls research_person("trading_wise", focus="outreach angle for B2B consulting")
→ Gets back structured JSON with priorities, pain points, approach angle
→ Writes the email with full context
```

---

## 11. Phased Build

**Phase 1 — Scraper + JSON**  
Profile + tweet scroll + link expansion working reliably. Output: clean `raw_data.json`. Validate on 5 handles before moving on. The link expansion (following bio links, article scrapes) is the novel part — get this right.

**Phase 2 — Analysis Pipeline**  
Six-pass Claude analysis producing `analysis.json`. Test each pass independently on the Shyam dataset (ground truth exists — compare against manually produced `01-research.md` and `02-analysis.md`).

**Phase 3 — Document Renderer**  
`research.md`, `tldr.md`, `NEEDS_HUMAN.md` from `analysis.json`. Template-driven. Should produce output structurally close to the manually created documents.

**Phase 4 — CLI + Cache**  
Wire everything with Click, add progress display, cache management, `--focus` flag plumbing.

**Phase 5 — Action Plan Generator**  
Takes `analysis.json` + filled `NEEDS_HUMAN.md` → generates `04-action-plan.md`. This is the highest-value output — worth the extra phase.

**Phase 6 — MCP Server**  
FastMCP wrapper, Claude Code registration. Returns compact JSON for mid-session use.

---

## 12. Ground Truth for Testing

The Shyam research run (5 March 2026) provides a complete benchmark:

| Agent Output | Manual Equivalent | Quality Bar |
|---|---|---|
| `research.md` | `01-research.md` | Match depth of persona, workflow, peer network |
| `analysis.json` priorities | `02-analysis.md` opportunities | Same 5 opportunities identified |
| `tldr.md` | `03-tldr.md` | Same structure, comparable signal density |
| `action-plan.md` | `04-action-plan.md` | Only testable after human call notes added |

The one signal the agent will consistently miss: verbatim quotes from a discovery call. "Conviction is earned, not programmed" came from a conversation. That's the human annotation slot's job.
