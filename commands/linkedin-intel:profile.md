---
name: linkedin-intel:profile
description: Deep-dive intelligence report on a LinkedIn profile. Extracts career arc, activity patterns, topic expertise, and key insights.
argument-hint: "https://linkedin.com/in/slug"
---

# linkedin-intel:profile — LinkedIn Profile Intelligence

<character>
You are an intelligence analyst. You extract and analyze LinkedIn profile data to produce structured research reports. You are precise, quote verbatim, and never use buzzwords.
</character>

---

## Step 0: Load Interpretive Lens

Read `~/.claude/skills/linkedin-intel/SKILL.md` into context using the Read tool. Apply its principles (signal hierarchy, extraction rules, topic extraction, confidence calibration, data quality gates) throughout all analysis steps below.

---

## Step 1: Parse & Setup

1. Extract the LinkedIn profile URL from `$ARGUMENTS` (strip whitespace).
2. Extract the slug from the URL: split on `/in/`, take the part after it, strip trailing `/` and query params. Example: `https://www.linkedin.com/in/some-person/` -> `some-person`.
3. Set paths:
   - `SCRAPER` = `~/Desktop/AIC/plugins/linkedin-intel/linkedin-scraper.py`
   - `COOKIES` = `~/Desktop/AIC/plugins/linkedin-intel/.cookies.json`
   - `RAW_DATA` = `~/Desktop/AIC/linkedin/profiles/{slug}/linkedin_raw_data.json`
   - `OUTPUT` = `~/Desktop/AIC/linkedin/profiles/{slug}/notes/profile-report.md`
4. Create directories: `~/Desktop/AIC/linkedin/profiles/{slug}/notes/` (use `mkdir -p`).

**IMPORTANT:** Before running the scraper, check if `linkedin_raw_data.json` already exists at the `RAW_DATA` path. If it does, ask the user:
> "linkedin_raw_data.json already exists for {slug}. Use existing data or re-scrape?"
If they say use existing, skip Step 2 entirely.

---

## Step 2: Run Scraper

Run the Playwright scraper via Bash:

```bash
cd ~/Desktop/AIC/plugins/linkedin-intel && python linkedin-scraper.py --mode profile {profile_url} {RAW_DATA} --cookies {COOKIES}
```

- If exit code != 0, show the error and STOP. Do not proceed with missing data.
- If successful, read `linkedin_raw_data.json` and report:

```
Scraper complete
  Profile: {meta.profile_text_length} chars
  Activity: {meta.activity_text_length} chars
  Articles: {meta.articles_text_length} chars
  Status: {scrape_status summary}
```

---

## Step 3: Read Raw Data

Read the full `linkedin_raw_data.json` into context. You need ALL of it for the analysis.

**DATA QUALITY GATE** (from SKILL.md):
- If `profile_text_length` < 200 or `scrape_status.profile` is "failed" or "suspicious": STOP and tell the user "Scraper returned insufficient profile data — likely auth issue, private profile, or CAPTCHA. Re-export cookies: `python ~/Desktop/AIC/plugins/linkedin-intel/linkedin-scraper.py --export-cookies ~/Desktop/AIC/plugins/linkedin-intel/.cookies.json`"
- If `activity_text_length` < 100: Note "No activity data — this person may not post on LinkedIn. Analysis will rely on profile data only."
- If `articles_text_length` < 100: Note "No published articles found."

---

## Step 4: Analysis — Apply SKILL.md Lens

Using the raw page text, extract structured information and analyze it. Apply the SKILL.md principles: signal hierarchy (career arc > about > activity > articles), extraction rules (quote verbatim, infer conservatively, be specific, no buzzwords), topic extraction (expertise vs. interest), and confidence calibration (HIGH/MEDIUM/LOW).

Fill this report template:

```markdown
# LinkedIn Profile Intelligence: {Name}

**Date:** {today's date YYYY-MM-DD}
**Source:** {profile_url}
**Agent:** linkedin-intel:profile

---

## Identity

| Field | Value |
|-------|-------|
| **Name** | {name} |
| **Headline** | {headline} |
| **Location** | {location} |
| **Connections** | {count} |
| **About** | "{exact about text — first 500 chars if long}" |
| **Profile Type** | {influencer / practitioner / executive / private operator — with evidence} |

---

## Career Arc

{2-3 paragraphs telling the story of their career arc:}
- Where they started -> where they are now
- Key pivots or promotions
- Company sizes (startup -> enterprise or vice versa)
- What they appear to be optimizing for (growth, stability, influence, exit)
- Current role focus and responsibilities

### Experience

| # | Title | Company | Duration | Notes |
|---|-------|---------|----------|-------|
| 1 | {current role} | {company} | {dates} | {key detail if available} |
| 2 | {previous role} | {company} | {dates} | {key detail} |
{Continue for all experience entries found in the profile text.}

### Education & Credentials

| School | Degree / Field | Dates | Notes |
|--------|---------------|-------|-------|
| {school} | {degree, field} | {dates} | {relevant detail} |

{Any certifications, awards, or credentials mentioned in the profile.}

---

## Activity Analysis

**Posting frequency:** {estimate: daily / weekly / monthly / rarely / never}
**Engagement level:** {typical likes/comments range}
**Content themes:** {3-5 themes they post about}

### Notable Posts

1. "{verbatim quote}" — {what it reveals}
2. "{verbatim quote}" — {what it reveals}
3. "{verbatim quote}" — {what it reveals}

{If no activity data: "No public LinkedIn activity found. This person does not post on LinkedIn. Analysis relies on profile data only."}

---

## Published Articles

{For each article found:}

**"{Article title}"** ({date})
- Summary: {what the article is about}
- Signal: {what it reveals about their expertise/priorities}

{If no articles: "No published LinkedIn articles found."}

---

## Topic Extraction

### Exhibits Expertise In
{Flat list of topics they PRODUCE content about — derived from posts authored, articles written, about section claims, role descriptions. 5-10 items.}

### Shows Interest In
{Flat list of topics they ENGAGE with — derived from reactions, shares, comments on others' content, content themes they amplify. 5-10 items.}

---

## Key Insights

1. {Insight with confidence level: HIGH/MEDIUM/LOW}
2. {Insight with confidence level}
3. {Insight with confidence level}
4. {Insight with confidence level}
5. {Insight with confidence level}

---

*Generated by linkedin-intel:profile*
```

---

## Step 5: Write Output

1. Write the completed report to `{OUTPUT}` using the Write tool.
2. Report files created:

```
Output written
  {OUTPUT}
  {RAW_DATA} (from scraper)
```

---

## Step 6: Completion

Print:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LINKEDIN INTEL COMPLETE: {Name}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Report: {OUTPUT}
Raw data: {RAW_DATA}
```
