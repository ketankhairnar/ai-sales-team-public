#!/usr/bin/env python3
"""
linkedin_common.py — Shared utilities for LinkedIn scraping.

Extracted from linkedin-research.py. Used by linkedin-scraper.py.
Do NOT modify the original linkedin-research.py.
"""

import json
import random
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCROLL_PAUSE_MIN = 3.0
SCROLL_PAUSE_MAX = 6.0
CLICK_PAUSE_MIN = 1.5
CLICK_PAUSE_MAX = 3.0
MIN_PROFILE_TEXT_LENGTH = 200
MIN_POST_TEXT_LENGTH = 100
ACTIVITY_MAX_SCROLLS = 15
COMMENT_LOAD_MAX = 10
REPLY_EXPAND_MAX = 20

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def err(msg: str):
    """Print to stderr."""
    print(msg, file=sys.stderr)


def rand_pause(min_s: float = SCROLL_PAUSE_MIN, max_s: float = SCROLL_PAUSE_MAX):
    """Random sleep between min_s and max_s seconds."""
    time.sleep(random.uniform(min_s, max_s))


def parse_slug(url: str) -> str:
    """Extract slug from LinkedIn profile URL."""
    url = url.rstrip("/")
    parts = url.split("/in/")
    if len(parts) == 2:
        return parts[1].split("/")[0].split("?")[0]
    raise ValueError(f"Cannot extract LinkedIn slug from: {url}")


def parse_activity_id(url: str) -> str:
    """Extract numeric activity ID from LinkedIn post URL."""
    match = re.search(r'activity[:\-](\d{19,20})', url)
    if match:
        return match.group(1)
    raise ValueError(f"Cannot extract activity ID from: {url}")


# ---------------------------------------------------------------------------
# Browser setup
# ---------------------------------------------------------------------------

def create_browser_context(playwright):
    """Launch browser and create context with standard config.

    Returns (browser, context, page) tuple.
    """
    browser = playwright.chromium.launch(headless=False)
    context = browser.new_context(
        viewport={"width": 1280, "height": 900},
        user_agent=USER_AGENT,
    )
    page = context.new_page()
    return browser, context, page


# ---------------------------------------------------------------------------
# Cookie management
# ---------------------------------------------------------------------------

def export_cookies(output_path: str):
    """Open browser for manual LinkedIn login, save cookies."""
    print("Opening browser for manual LinkedIn login...")
    print("1. Log into LinkedIn in the browser window")
    print("2. Wait until you see the home feed")
    print("3. Close the browser window")
    print(f"Cookies will be saved to: {output_path}")

    with sync_playwright() as p:
        browser, context, page = create_browser_context(p)
        page.goto("https://www.linkedin.com/login", timeout=60000)

        for _ in range(600):  # up to 5 minutes
            try:
                current_url = page.url
                if "/feed" in current_url or ("/in/" in current_url and "/login" not in current_url):
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


def load_cookies(context, cookie_path: str):
    """Load cookies into browser context. Exit on failure."""
    try:
        cookies = json.loads(Path(cookie_path).read_text())
        context.add_cookies(cookies)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        err(f"Cookie load failed: {e}")
        err(f"Export cookies first: python linkedin-scraper.py --export-cookies {cookie_path}")
        sys.exit(1)


def verify_auth(page) -> bool:
    """Navigate to feed and check for auth wall. Returns True if auth OK."""
    err("Verifying auth...")
    page.goto("https://www.linkedin.com/feed/", wait_until="load", timeout=30000)
    page.wait_for_timeout(3000)
    if "/login" in page.url or "/authwall" in page.url:
        err("Auth failed — cookies expired.")
        return False
    err("  Auth OK")
    return True


def refresh_cookies(context, cookie_path: str):
    """Save refreshed cookies after successful auth."""
    try:
        Path(cookie_path).write_text(json.dumps(context.cookies(), indent=2))
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Page capture
# ---------------------------------------------------------------------------

def capture_page_text(page, url: str, scroll_count: int = 3, label: str = "page") -> str:
    """Navigate to URL, scroll to load content, return inner text.

    Includes retry-on-timeout (one retry).
    """
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
