#!/usr/bin/env python3
"""
scrape_teams.py — Scrape team/about pages from humanoid robotics OEM websites.

Uses Playwright to capture raw page text from common team page URLs.
No CSS selectors — captures full page text for downstream extraction.

Usage:
    python scrape_teams.py --input oems.json --output team_pages.json

Then feed team_pages.json to extract_contacts.py for name/email extraction.
"""

import json
import random
import re
import sys
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("pip install requests", file=sys.stderr)
    sys.exit(1)

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("pip install playwright && playwright install chromium", file=sys.stderr)
    sys.exit(1)


# Common team/about page paths to try
TEAM_PATHS = [
    "/team",
    "/about",
    "/about-us",
    "/about/team",
    "/people",
    "/leadership",
    "/our-team",
    "/company",
    "/company/team",
    "/company/about",
    "/contact",
]

# Skip huge companies where team page scraping is pointless
SKIP_DOMAINS = {
    "tesla.com",      # 140k employees
    "xiaomi.com",     # 35k employees
    "xpeng.com",      # public company, 15k employees
}

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

PAGE_TIMEOUT = 15000  # 15s per page
PAUSE_BETWEEN_COMPANIES = (2.0, 5.0)
PAUSE_BETWEEN_PAGES = (1.0, 3.0)
MIN_USEFUL_TEXT = 100  # chars — below this the page is empty/error


# ---------------------------------------------------------------------------
# Sitemap discovery — find team/about/people URLs from sitemap.xml
# ---------------------------------------------------------------------------

TEAM_URL_PATTERNS = re.compile(
    r"/(team|about|people|leadership|staff|our-team|management|founders|who-we-are|meet-the-team|company/team|about/team|contact)",
    re.IGNORECASE,
)


def discover_from_sitemap(domain: str) -> list[str]:
    """Fetch sitemap.xml and extract URLs that look like team/about pages."""
    team_urls = []
    sitemap_urls_to_try = [
        f"https://{domain}/sitemap.xml",
        f"https://{domain}/sitemap_index.xml",
        f"https://www.{domain}/sitemap.xml",
    ]

    for sitemap_url in sitemap_urls_to_try:
        try:
            resp = requests.get(sitemap_url, timeout=10, headers={"User-Agent": USER_AGENT})
            if resp.status_code != 200:
                continue

            # Parse XML
            root = ET.fromstring(resp.text)
            ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

            # Check if this is a sitemap index
            sitemaps = root.findall(".//sm:sitemap/sm:loc", ns)
            if sitemaps:
                # It's an index — fetch each sub-sitemap
                for sm_loc in sitemaps[:5]:  # limit to 5 sub-sitemaps
                    try:
                        sub_resp = requests.get(sm_loc.text, timeout=10, headers={"User-Agent": USER_AGENT})
                        if sub_resp.status_code == 200:
                            sub_root = ET.fromstring(sub_resp.text)
                            for url_el in sub_root.findall(".//sm:url/sm:loc", ns):
                                if TEAM_URL_PATTERNS.search(url_el.text):
                                    team_urls.append(url_el.text)
                    except Exception:
                        continue
            else:
                # Regular sitemap
                for url_el in root.findall(".//sm:url/sm:loc", ns):
                    if TEAM_URL_PATTERNS.search(url_el.text):
                        team_urls.append(url_el.text)

            # Also try without namespace (some sitemaps don't use it)
            if not team_urls:
                for url_el in root.iter():
                    if url_el.tag.endswith("loc") and url_el.text:
                        if TEAM_URL_PATTERNS.search(url_el.text):
                            team_urls.append(url_el.text)

            if team_urls:
                break  # found something, stop trying other sitemap URLs

        except Exception:
            continue

    return list(set(team_urls))  # dedupe


# ---------------------------------------------------------------------------
# Google search fallback — find team page via site: search
# ---------------------------------------------------------------------------

def google_find_team_page(domain: str) -> list[str]:
    """Use a simple search to find team pages. Returns URLs."""
    # We'll skip this for now — Google blocks automated searches.
    # The sitemap + common paths approach covers most cases.
    return []


def capture_page(page, url: str, label: str = "") -> dict:
    """Navigate to URL and capture page text. Returns dict with text or error."""
    try:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT)
        status = resp.status if resp else 0
        page.wait_for_timeout(2000)  # let JS render

        # Check for redirects to homepage or 404
        final_url = page.url
        text = page.inner_text("body").strip()

        if status >= 400:
            return {"url": url, "final_url": final_url, "status": status, "text": "", "useful": False}

        useful = len(text) >= MIN_USEFUL_TEXT
        return {
            "url": url,
            "final_url": final_url,
            "status": status,
            "text": text[:15000] if useful else "",  # cap at 15k chars
            "char_count": len(text),
            "useful": useful,
        }

    except PlaywrightTimeout:
        return {"url": url, "status": 0, "text": "", "useful": False, "error": "timeout"}
    except Exception as e:
        return {"url": url, "status": 0, "text": "", "useful": False, "error": str(e)[:200]}


def looks_like_team_page(text: str) -> bool:
    """Heuristic: does the text look like it contains team/people info?"""
    text_lower = text.lower()
    # Look for patterns common on team pages
    signals = [
        "ceo", "cto", "cfo", "coo", "vp ", "founder", "co-founder",
        "chief", "director", "head of", "engineer", "designer",
        "linkedin.com/in/", "twitter.com/", "@",
        "our team", "meet the team", "leadership", "management team",
    ]
    hits = sum(1 for s in signals if s in text_lower)
    return hits >= 2


def scrape_company(page, company: dict) -> dict:
    """Try multiple team page paths for a company. Return best result."""
    domain = company["domain"]
    name = company["name"]
    base_url = f"https://{domain}"

    print(f"\n{'='*60}")
    print(f"  {name} ({domain})")
    print(f"{'='*60}")

    # First check if the site is even reachable
    home = capture_page(page, base_url, "homepage")
    if not home["useful"]:
        print(f"  Homepage unreachable or empty. Skipping.")
        return {**company, "pages": [], "best_page": None, "reachable": False}

    # Try sitemap first for smart URL discovery
    print(f"  Checking sitemap ...", end=" ")
    sitemap_urls = discover_from_sitemap(domain)
    if sitemap_urls:
        print(f"found {len(sitemap_urls)} candidate URLs from sitemap")
        for u in sitemap_urls:
            print(f"    -> {u}")
    else:
        print(f"no sitemap or no team URLs")

    # Build URL list: sitemap discoveries + common paths
    urls_to_try = []
    seen = set()

    # Sitemap URLs first (higher confidence)
    for u in sitemap_urls:
        if u not in seen:
            urls_to_try.append(("sitemap", u))
            seen.add(u)

    # Then common paths
    for path in TEAM_PATHS:
        url = f"{base_url}{path}"
        if url not in seen:
            urls_to_try.append(("common", url))
            seen.add(url)

    pages_tried = []
    best_page = None
    best_score = 0

    for source, url in urls_to_try:
        path = url.replace(base_url, "") or "/"
        print(f"  Trying {path} ({source}) ...", end=" ")

        result = capture_page(page, url, path)

        if not result["useful"]:
            print(f"skip ({result.get('error', 'empty/404')})")
            time.sleep(random.uniform(*PAUSE_BETWEEN_PAGES))
            continue

        # Check if it redirected back to homepage
        if result.get("final_url", "").rstrip("/") == base_url.rstrip("/"):
            print(f"redirected to homepage")
            time.sleep(random.uniform(*PAUSE_BETWEEN_PAGES))
            continue

        is_team = looks_like_team_page(result["text"])
        score = result["char_count"] if is_team else 0
        status_str = f"{result['char_count']} chars"
        if is_team:
            status_str += " [TEAM PAGE]"
            print(f"{status_str}")
        else:
            print(f"{status_str} (no team signals)")

        pages_tried.append({
            "path": path,
            "url": result.get("final_url", url),
            "char_count": result["char_count"],
            "is_team_page": is_team,
            "text": result["text"] if is_team else "",  # only keep text for team pages
        })

        if score > best_score:
            best_score = score
            best_page = pages_tried[-1]

        time.sleep(random.uniform(*PAUSE_BETWEEN_PAGES))

    # If no team page found, capture the about page text anyway
    if not best_page and pages_tried:
        # Use the longest useful page as fallback
        best_page = max(pages_tried, key=lambda p: p["char_count"])
        best_page["is_team_page"] = False

    return {
        **company,
        "reachable": True,
        "pages_tried": len(pages_tried),
        "best_page": best_page,
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Scrape team pages from OEM websites")
    parser.add_argument("--input", "-i", default="plugins/email-enrichment/oems.json")
    parser.add_argument("--output", "-o", default="plugins/email-enrichment/team_pages.json")
    parser.add_argument("--limit", type=int, help="Only process first N companies")
    parser.add_argument("--only", help="Comma-separated company names to process")
    args = parser.parse_args()

    with open(args.input) as f:
        data = json.load(f)

    companies = data["companies"]

    # Filter
    if args.only:
        names = {n.strip().lower() for n in args.only.split(",")}
        companies = [c for c in companies if c["name"].lower() in names]
    if args.limit:
        companies = companies[:args.limit]

    # Skip huge companies
    companies = [c for c in companies if c["domain"] not in SKIP_DOMAINS]

    print(f"Scraping team pages for {len(companies)} companies ...\n")

    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=USER_AGENT,
        )
        page = context.new_page()

        for i, company in enumerate(companies, 1):
            print(f"\n[{i}/{len(companies)}]", end="")
            result = scrape_company(page, company)
            results.append(result)
            time.sleep(random.uniform(*PAUSE_BETWEEN_COMPANIES))

        browser.close()

    # Save results
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump({
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "total_companies": len(results),
            "with_team_page": sum(1 for r in results if r.get("best_page", {}) and r["best_page"].get("is_team_page")),
            "results": results,
        }, f, indent=2)

    # Summary
    print(f"\n\n{'='*60}")
    print(f"SUMMARY")
    print(f"{'='*60}")
    found = 0
    not_found = 0
    unreachable = 0
    for r in results:
        bp = r.get("best_page")
        if not r.get("reachable"):
            print(f"  {r['name']:<25} UNREACHABLE")
            unreachable += 1
        elif bp and bp.get("is_team_page"):
            print(f"  {r['name']:<25} {bp['path']:<15} {bp['char_count']:>6} chars")
            found += 1
        else:
            print(f"  {r['name']:<25} no team page found")
            not_found += 1

    print(f"\nTeam pages found: {found}")
    print(f"No team page: {not_found}")
    print(f"Unreachable: {unreachable}")
    print(f"Saved to {args.output}")


if __name__ == "__main__":
    main()
