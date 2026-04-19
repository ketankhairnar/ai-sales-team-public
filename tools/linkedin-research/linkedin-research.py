#!/usr/bin/env python3
"""
linkedin-research.py — Playwright-based LinkedIn profile scraper for Basalt Research.

Captures raw page text from profile, activity, and articles pages.
No CSS selectors — Claude extracts structure in the /linkedin-research slash command.
Outputs linkedin_raw_data.json.

Usage:
    python linkedin-research.py <profile_url> <output_path> [--cookies <path>]
    python linkedin-research.py --export-cookies <path>
"""

import argparse
import json
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


DEFAULT_COOKIE_PATH = str(Path(__file__).parent / ".cookies.json")
SCROLL_PAUSE_MIN = 3.0
SCROLL_PAUSE_MAX = 6.0
ACTIVITY_MAX_SCROLLS = 15  # ~25 posts worth of scrolling
MIN_PROFILE_TEXT_LENGTH = 200  # below this, likely bot-detection or private profile


def err(msg: str):
    print(msg, file=sys.stderr)


def rand_pause():
    time.sleep(random.uniform(SCROLL_PAUSE_MIN, SCROLL_PAUSE_MAX))


def parse_slug(url: str) -> str:
    """Extract slug from LinkedIn profile URL."""
    url = url.rstrip("/")
    parts = url.split("/in/")
    if len(parts) == 2:
        return parts[1].split("/")[0].split("?")[0]
    raise ValueError(f"Cannot extract LinkedIn slug from: {url}")


# ---------------------------------------------------------------------------
# Cookie management
# ---------------------------------------------------------------------------

def export_cookies(output_path: str):
    """Open browser for LinkedIn login, save cookies.
    Auto-fills if LI_EMAIL + LI_PASSWORD env vars are set. Human still completes any 2FA/captcha.
    """
    import os
    email = os.environ.get("LI_EMAIL")
    password = os.environ.get("LI_PASSWORD")
    print("Opening browser for LinkedIn login...")
    if email and password:
        print(f"Auto-filling creds for {email} — complete 2FA manually if shown")
    else:
        print("1. Log into LinkedIn in the browser window")
        print("2. Wait until you see the home feed")
        print("3. Window closes automatically")
    print(f"Cookies will be saved to: {output_path}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/131.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        page.goto("https://www.linkedin.com/login", timeout=60000)

        if email and password:
            try:
                page.wait_for_selector('input#username', timeout=10000)
                page.fill('input#username', email)
                page.wait_for_timeout(400)
                page.fill('input#password', password)
                page.wait_for_timeout(400)
                page.click('button[type="submit"]')
            except Exception as e:
                print(f"Auto-fill failed: {e}. Complete login manually.")

        for _ in range(600):  # up to 5 minutes
            try:
                url = page.url
                if "/feed" in url or ("/in/" in url and "/login" not in url):
                    print("Login detected! Saving cookies in 5 seconds...")
                    page.wait_for_timeout(5000)
                    break
                page.wait_for_timeout(500)
            except Exception:
                break

        cookies = context.cookies()
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_text(json.dumps(cookies, indent=2))
        li_at = [c["name"] for c in cookies if c["name"] in ("li_at", "JSESSIONID")]
        print(f"Saved {len(cookies)} cookies to {output_path}")
        if li_at:
            print(f"Auth cookies captured: {li_at}")
        else:
            print("WARNING: No LinkedIn auth cookies found")
        try:
            browser.close()
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Page capture
# ---------------------------------------------------------------------------

def capture_page_text(page, url: str, scroll_count: int = 3, label: str = "page") -> str:
    """Navigate to URL, scroll to load content, return inner text."""
    try:
        page.goto(url, wait_until="load", timeout=30000)
        page.wait_for_timeout(3000)

        # Check for auth redirect
        if "/login" in page.url or "/authwall" in page.url:
            err(f"  {label}: Hit auth wall — cookies expired")
            return ""

        # Scroll to trigger lazy loading
        for i in range(scroll_count):
            page.evaluate("window.scrollBy(0, window.innerHeight * 1.5)")
            page.wait_for_timeout(random.randint(1500, 3000))

        text = page.inner_text("body")
        err(f"  {label}: captured {len(text)} chars")
        return text
    except PlaywrightTimeout:
        err(f"  {label}: timeout — retrying once")
        try:
            page.goto(url, wait_until="load", timeout=30000)
            page.wait_for_timeout(3000)
            text = page.inner_text("body")
            err(f"  {label}: captured {len(text)} chars (retry)")
            return text
        except Exception as e:
            err(f"  {label}: retry failed: {e}")
            return ""
    except Exception as e:
        err(f"  {label}: failed: {e}")
        return ""


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_scraper(profile_url: str, output_path: str, cookie_path: str, light: bool = False) -> dict:
    """Capture text from 3 LinkedIn pages and output JSON."""
    slug = parse_slug(profile_url)
    if not profile_url.startswith("http"):
        profile_url = f"https://www.linkedin.com/in/{profile_url}"

    start_time = time.time()
    scrape_status = {"auth": "ok", "profile": "ok", "activity": "ok", "articles": "ok"}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/131.0.0.0 Safari/537.36",
        )
        page = context.new_page()

        # Load cookies
        try:
            cookies = json.loads(Path(cookie_path).read_text())
            context.add_cookies(cookies)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            err(f"Cookie load failed: {e}")
            err("Export cookies first: python linkedin-research.py --export-cookies .cookies.json")
            browser.close()
            sys.exit(1)

        # Verify auth
        err("Verifying auth...")
        page.goto("https://www.linkedin.com/feed/", wait_until="load", timeout=30000)
        page.wait_for_timeout(3000)
        if "/login" in page.url or "/authwall" in page.url:
            err("Auth failed — cookies expired. Re-export with --export-cookies")
            scrape_status["auth"] = "failed"
            browser.close()
            sys.exit(1)
        err("  Auth OK")

        # Save refreshed cookies
        try:
            Path(cookie_path).write_text(json.dumps(context.cookies(), indent=2))
        except Exception:
            pass

        # Stage 1: Profile page (scroll deep to load all sections)
        err("Stage 1/3: Capturing profile page...")
        profile_text = capture_page_text(
            page, profile_url, scroll_count=8, label="profile"
        )
        if len(profile_text) < MIN_PROFILE_TEXT_LENGTH:
            err(f"  WARNING: Profile text suspiciously short ({len(profile_text)} chars)")
            err("  Possible bot detection, private profile, or CAPTCHA")
            scrape_status["profile"] = "suspicious"

        activity_text = ""
        articles_text = ""

        if light:
            err("Light mode: skipping activity + articles (1 hit only)")
            scrape_status["activity"] = "skipped"
            scrape_status["articles"] = "skipped"
        else:
            rand_pause()

            # Stage 2: Activity page (more scrolls for posts)
            err("Stage 2/3: Capturing activity page...")
            activity_url = f"https://www.linkedin.com/in/{slug}/recent-activity/all/"
            activity_text = capture_page_text(
                page, activity_url, scroll_count=ACTIVITY_MAX_SCROLLS, label="activity"
            )
            if not activity_text or len(activity_text) < 100:
                scrape_status["activity"] = "empty"

            rand_pause()

            # Stage 3: Articles page
            err("Stage 3/3: Capturing articles page...")
            articles_url = f"https://www.linkedin.com/in/{slug}/recent-activity/articles/"
            articles_text = capture_page_text(
                page, articles_url, scroll_count=3, label="articles"
            )
            if not articles_text or len(articles_text) < 100:
                scrape_status["articles"] = "empty"

        browser.close()

    duration = round(time.time() - start_time, 1)

    data = {
        "meta": {
            "profile_url": profile_url,
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
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="linkedin-research — LinkedIn profile text capture for Basalt Research"
    )
    parser.add_argument("profile_url", nargs="?",
                        help="LinkedIn profile URL (e.g., https://linkedin.com/in/some-slug)")
    parser.add_argument("output_path", nargs="?",
                        help="Output path for linkedin_raw_data.json")
    parser.add_argument("--cookies", default=DEFAULT_COOKIE_PATH,
                        help="Path to cookies JSON file")
    parser.add_argument("--export-cookies", dest="export_cookies", metavar="PATH",
                        help="Open browser for manual login, save cookies")
    parser.add_argument("--light", action="store_true",
                        help="Light mode: profile page only, skip activity + articles (1 hit)")

    args = parser.parse_args()

    if args.export_cookies:
        export_cookies(args.export_cookies)
        return

    if not args.profile_url or not args.output_path:
        parser.error("profile_url and output_path are required (unless using --export-cookies)")

    try:
        run_scraper(args.profile_url, args.output_path, args.cookies, light=args.light)
    except KeyboardInterrupt:
        err("\nAborted by user")
        sys.exit(130)
    except Exception as e:
        err(f"Scraper failed: {e}")
        err("Retrying once...")
        try:
            run_scraper(args.profile_url, args.output_path, args.cookies, light=args.light)
        except Exception as e2:
            err(f"Retry failed: {e2}")
            sys.exit(1)


if __name__ == "__main__":
    main()
