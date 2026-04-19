#!/usr/bin/env python3
"""
linkedin-scraper.py — Multi-mode LinkedIn scraper for linkedin-intel.

Usage:
    python linkedin-scraper.py --mode profile <url> <output_path> [--cookies <path>]
    python linkedin-scraper.py --mode post <url> <output_path> [--cookies <path>]
    python linkedin-scraper.py --export-cookies <path>
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

from linkedin_common import (
    err, rand_pause, parse_slug, parse_activity_id,
    create_browser_context, export_cookies, load_cookies,
    verify_auth, refresh_cookies, capture_page_text,
    ACTIVITY_MAX_SCROLLS, MIN_PROFILE_TEXT_LENGTH, MIN_POST_TEXT_LENGTH,
    COMMENT_LOAD_MAX, REPLY_EXPAND_MAX, CLICK_PAUSE_MIN, CLICK_PAUSE_MAX,
)

DEFAULT_COOKIE_PATH = str(Path(__file__).parent / ".cookies.json")


# ---------------------------------------------------------------------------
# Profile mode
# ---------------------------------------------------------------------------

def run_profile(url: str, output_path: str, cookie_path: str) -> dict:
    """Capture text from profile, activity, and articles pages."""
    slug = parse_slug(url)
    if not url.startswith("http"):
        url = f"https://www.linkedin.com/in/{url}"

    start_time = time.time()
    scrape_status = {"auth": "ok", "profile": "ok", "activity": "ok", "articles": "ok"}

    with sync_playwright() as p:
        browser, context, page = create_browser_context(p)
        load_cookies(context, cookie_path)

        if not verify_auth(page):
            scrape_status["auth"] = "failed"
            browser.close()
            sys.exit(1)

        refresh_cookies(context, cookie_path)

        # Stage 1: Profile page
        err("Stage 1/3: Capturing profile page...")
        profile_text = capture_page_text(page, url, scroll_count=8, label="profile")
        if len(profile_text) < MIN_PROFILE_TEXT_LENGTH:
            err(f"  WARNING: Profile text suspiciously short ({len(profile_text)} chars)")
            scrape_status["profile"] = "suspicious"

        rand_pause()

        # Stage 2: Activity page
        err("Stage 2/3: Capturing activity page...")
        activity_url = f"https://www.linkedin.com/in/{slug}/recent-activity/all/"
        activity_text = capture_page_text(page, activity_url, scroll_count=ACTIVITY_MAX_SCROLLS, label="activity")
        if not activity_text or len(activity_text) < 100:
            scrape_status["activity"] = "empty"

        rand_pause()

        # Stage 3: Articles page
        err("Stage 3/3: Capturing articles page...")
        articles_url = f"https://www.linkedin.com/in/{slug}/recent-activity/articles/"
        articles_text = capture_page_text(page, articles_url, scroll_count=3, label="articles")
        if not articles_text or len(articles_text) < 100:
            scrape_status["articles"] = "empty"

        browser.close()

    duration = round(time.time() - start_time, 1)

    data = {
        "meta": {
            "mode": "profile",
            "profile_url": url,
            "slug": slug,
            "scrape_date": datetime.now(timezone.utc).isoformat(),
            "scrape_duration_seconds": duration,
            "scrape_status": scrape_status,
            "profile_text_length": len(profile_text),
            "activity_text_length": len(activity_text),
            "articles_text_length": len(articles_text),
        },
        "profile_text": profile_text,
        "activity_text": activity_text,
        "articles_text": articles_text,
    }

    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    err(f"\nOutput written to: {output_path}")
    err(f"Summary: profile={len(profile_text)} chars, activity={len(activity_text)} chars, "
        f"articles={len(articles_text)} chars ({duration}s)")

    return data


# ---------------------------------------------------------------------------
# Post mode
# ---------------------------------------------------------------------------

def _click_buttons(page, pattern: re.Pattern, max_clicks: int, label: str) -> int:
    """Click buttons matching pattern repeatedly. Returns number of clicks."""
    clicks = 0
    for _ in range(max_clicks):
        try:
            # Primary: role-based matching (survives i18n)
            btn = page.get_by_role("button", name=pattern).first
            if btn and btn.is_visible():
                btn.click()
                rand_pause(min_s=CLICK_PAUSE_MIN, max_s=CLICK_PAUSE_MAX)
                clicks += 1
                err(f"  {label}: clicked ({clicks})")
                continue
        except Exception:
            pass

        try:
            # Fallback: aria-label matching
            btn = page.locator("[aria-label*='more comments'], [aria-label*='more replies']").first
            if btn and btn.is_visible():
                btn.click()
                rand_pause(min_s=CLICK_PAUSE_MIN, max_s=CLICK_PAUSE_MAX)
                clicks += 1
                err(f"  {label}: clicked via aria-label ({clicks})")
                continue
        except Exception:
            pass

        try:
            # Last resort: visible text matching
            btn = page.get_by_text(pattern).first
            if btn and btn.is_visible():
                btn.click()
                rand_pause(min_s=CLICK_PAUSE_MIN, max_s=CLICK_PAUSE_MAX)
                clicks += 1
                err(f"  {label}: clicked via text ({clicks})")
                continue
        except Exception:
            pass

        # No more buttons found
        break

    err(f"  {label}: {clicks} total clicks")
    return clicks


def run_post(url: str, output_path: str, cookie_path: str) -> dict:
    """Capture post text, expand comments/replies, capture full discussion."""
    activity_id = parse_activity_id(url)

    start_time = time.time()
    scrape_status = {"auth": "ok", "post": "ok", "comments": "ok"}

    with sync_playwright() as p:
        browser, context, page = create_browser_context(p)
        load_cookies(context, cookie_path)

        if not verify_auth(page):
            scrape_status["auth"] = "failed"
            browser.close()
            sys.exit(1)

        refresh_cookies(context, cookie_path)

        # Stage 1: Navigate to post, initial load
        err("Stage 1/4: Loading post page...")
        page.goto(url, wait_until="load", timeout=30000)
        page.wait_for_timeout(3000)

        if "/login" in page.url or "/authwall" in page.url:
            err("  Post page: Hit auth wall")
            scrape_status["post"] = "auth_failed"
            browser.close()
            sys.exit(1)

        # Scroll down to load initial comments
        for _ in range(3):
            page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)")
            page.wait_for_timeout(2000)

        # Capture post text BEFORE expanding comments (delta approach)
        post_text = page.inner_text("body")
        err(f"  Post text (pre-expansion): {len(post_text)} chars")

        if len(post_text) < MIN_POST_TEXT_LENGTH:
            err(f"  WARNING: Post text suspiciously short ({len(post_text)} chars)")
            scrape_status["post"] = "suspicious"

        # Stage 2: Expand "load more comments"
        err("Stage 2/4: Expanding comments...")
        comment_pattern = re.compile(r"load more|more comments|previous comments", re.I)
        comment_clicks = _click_buttons(page, comment_pattern, COMMENT_LOAD_MAX, "comments")

        # Stage 3: Expand reply threads
        err("Stage 3/4: Expanding reply threads...")
        reply_pattern = re.compile(r"more repl|load more|view more repl", re.I)
        reply_clicks = _click_buttons(page, reply_pattern, REPLY_EXPAND_MAX, "replies")

        # Stage 4: Capture full page text after all expansions
        err("Stage 4/4: Capturing expanded page...")
        full_text = page.inner_text("body")
        err(f"  Full text (post-expansion): {len(full_text)} chars")

        # Delta: comments_text = everything new after expansion
        if len(full_text) > len(post_text):
            comments_text = full_text[len(post_text):]
        else:
            comments_text = ""
            scrape_status["comments"] = "empty"

        if not comments_text or len(comments_text) < 50:
            scrape_status["comments"] = "empty"

        browser.close()

    duration = round(time.time() - start_time, 1)

    data = {
        "meta": {
            "mode": "post",
            "post_url": url,
            "activity_id": activity_id,
            "scrape_date": datetime.now(timezone.utc).isoformat(),
            "scrape_duration_seconds": duration,
            "scrape_status": scrape_status,
            "post_text_length": len(post_text),
            "comments_text_length": len(comments_text),
            "comment_loads_clicked": comment_clicks,
            "reply_expands_clicked": reply_clicks,
        },
        "post_text": post_text,
        "comments_text": comments_text,
    }

    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    err(f"\nOutput written to: {output_path}")
    err(f"Summary: post={len(post_text)} chars, comments={len(comments_text)} chars, "
        f"comment_clicks={comment_clicks}, reply_clicks={reply_clicks} ({duration}s)")

    return data


# ---------------------------------------------------------------------------
# Search mode — ICP-driven prospect discovery
# ---------------------------------------------------------------------------

# Shared constants for _extract_search_results heuristic text parsing.
_NOISE_PREFIXES = ("View ", "• ", "Status is ", "Connect", "Follow", "Message", "1st", "2nd", "3rd", "3rd+")
_NOISE_SUFFIXES = ("degree connection", "followers", "mutual connection", "mutual connections")
_HEADLINE_SEPS = [" at ", " @ ", " · ", " | ", " — ", " - "]


def _is_noise_line(s: str) -> bool:
    if not s:
        return True
    if s.startswith(_NOISE_PREFIXES):
        return True
    for suf in _NOISE_SUFFIXES:
        if s.endswith(suf) or suf in s:
            return True
    return False


def _slug_from_href(href: str) -> str:
    if not href or "/in/" not in href:
        return ""
    return href.split("?")[0].rstrip("/").split("/in/")[-1].split("/")[0]


def _split_title_company(headline: str) -> tuple:
    """Split a LinkedIn headline on first matching separator. Returns (title, company)."""
    for sep in _HEADLINE_SEPS:
        if sep in headline:
            t, c = headline.split(sep, 1)
            return t.strip(), c.strip()
    return headline.strip(), ""


def _card_to_result(card) -> dict | None:
    """Extract one result from a LinkedIn search card. Returns None if unusable."""
    anchor = card.query_selector("a[href*='/in/']")
    if not anchor:
        return None
    slug = _slug_from_href(anchor.get_attribute("href") or "")
    if not slug:
        return None
    try:
        text = card.evaluate("el => el.innerText || ''") or ""
    except Exception:
        text = ""
    clean = [l.strip() for l in text.splitlines() if l.strip() and not _is_noise_line(l.strip())]
    name = clean[0] if clean else ""
    headline = clean[1] if len(clean) > 1 else ""
    location = clean[2] if len(clean) > 2 else ""
    title, company = _split_title_company(headline)
    return {
        "name": name,
        "title": title,
        "company": company,
        "headline": headline,
        "location": location,
        "profile_url": f"https://www.linkedin.com/in/{slug}",
        "slug": slug,
    }


def _extract_search_results(page) -> list:
    """Extract prospect cards from people-search results page.

    Uses [data-chameleon-result-urn] cards. Text structure (Dec 2025 LinkedIn):
        [0] Name · [1] 'View X's profile' · [2] '• 2nd' · [N] Headline · [N+1] Location · tail
    """
    results = []
    try:
        seen = set()
        for card in page.query_selector_all("[data-chameleon-result-urn]"):
            try:
                r = _card_to_result(card)
                if not r or r["slug"] in seen:
                    continue
                seen.add(r["slug"])
                results.append(r)
            except Exception:
                continue
    except Exception as e:
        err(f"  extract error: {e}")
    return results


def run_search(query: str, output_path: str, cookie_path: str, pages: int = 2) -> dict:
    """Search LinkedIn people for an ICP query, return prospect list.

    Query can be:
      - plain keywords ("VP engineering series B SaaS")
      - a full LinkedIn search URL (passed through verbatim)
    """
    import urllib.parse as _u

    if query.startswith("http"):
        base_url = query
    else:
        base_url = "https://www.linkedin.com/search/results/people/?keywords=" + _u.quote(query)

    start_time = time.time()
    all_results: list = []

    with sync_playwright() as p:
        browser, context, page = create_browser_context(p)
        load_cookies(context, cookie_path)

        if not verify_auth(page):
            browser.close()
            sys.exit(1)

        refresh_cookies(context, cookie_path)

        for n in range(1, pages + 1):
            sep = "&" if "?" in base_url else "?"
            paged_url = f"{base_url}{sep}page={n}" if "page=" not in base_url else base_url
            err(f"Page {n}/{pages}: {paged_url}")
            try:
                page.goto(paged_url, wait_until="load", timeout=30000)
            except PlaywrightTimeout:
                err(f"  page {n}: timeout, retrying once")
                page.goto(paged_url, wait_until="load", timeout=30000)

            page.wait_for_timeout(2500)
            # Scroll to load lazy results
            for _ in range(4):
                page.mouse.wheel(0, 2000)
                page.wait_for_timeout(600)

            page_results = _extract_search_results(page)
            err(f"  page {n}: {len(page_results)} candidates")
            all_results.extend(page_results)
            rand_pause()

        browser.close()

    # Deduplicate by slug preserving order
    seen = set()
    dedup = []
    for r in all_results:
        if r["slug"] in seen:
            continue
        seen.add(r["slug"])
        dedup.append(r)

    duration = round(time.time() - start_time, 1)
    data = {
        "meta": {
            "mode": "search",
            "query": query,
            "pages_fetched": pages,
            "total_raw": len(all_results),
            "total_unique": len(dedup),
            "scrape_date": datetime.now(timezone.utc).isoformat(),
            "scrape_duration_seconds": duration,
        },
        "prospects": dedup,
    }

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    err(f"\nOutput written to: {output_path}")
    err(f"Summary: {len(dedup)} unique prospects across {pages} pages ({duration}s)")
    return data


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="linkedin-scraper — Multi-mode LinkedIn scraper for linkedin-intel"
    )
    parser.add_argument("url", nargs="?", help="LinkedIn URL to scrape")
    parser.add_argument("output_path", nargs="?", help="Output path for linkedin_raw_data.json")
    parser.add_argument("--pages", type=int, default=2, help="Search: pages to fetch (default 2 = ~20 results)")
    parser.add_argument("--mode", choices=["profile", "post", "company", "search"],
                        help="Scraping mode")
    parser.add_argument("--cookies", default=DEFAULT_COOKIE_PATH,
                        help="Path to cookies JSON file")
    parser.add_argument("--export-cookies", dest="export_cookies", metavar="PATH",
                        help="Open browser for manual login, save cookies")

    args = parser.parse_args()

    if args.export_cookies:
        export_cookies(args.export_cookies)
        return

    if not args.mode:
        parser.error("--mode is required")

    if not args.url or not args.output_path:
        parser.error("url and output_path are required")

    if args.mode == "company":
        err(f"Mode 'company' is not yet implemented.")
        sys.exit(1)

    try:
        if args.mode == "profile":
            run_profile(args.url, args.output_path, args.cookies)
        elif args.mode == "post":
            run_post(args.url, args.output_path, args.cookies)
        elif args.mode == "search":
            run_search(args.url, args.output_path, args.cookies, pages=getattr(args, "pages", 2))
    except KeyboardInterrupt:
        err("\nAborted by user")
        sys.exit(130)
    except Exception as e:
        err(f"Scraper failed: {e}")
        err("Retrying once...")
        try:
            if args.mode == "profile":
                run_profile(args.url, args.output_path, args.cookies)
            elif args.mode == "post":
                run_post(args.url, args.output_path, args.cookies)
        except Exception as e2:
            err(f"Retry failed: {e2}")
            sys.exit(1)


if __name__ == "__main__":
    main()
