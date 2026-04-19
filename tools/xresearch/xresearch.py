#!/usr/bin/env python3
"""
xresearch.py — Playwright-based Twitter/X profile scraper for Basalt Research.

Extracts: profile, tweets (100 or 3 months), following list, links with context,
and top-link content. Outputs twitter_raw_data.json for the /xresearch slash command.

Usage:
    python xresearch.py <handle> <output_path> [--cookies <path>] [--login <user:pass>]
    python xresearch.py --export-cookies <path>
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_COOKIE_PATH = str(Path(__file__).parent / ".cookies.json")
MAX_TWEETS = 100
MAX_MONTHS = 3
MAX_FOLLOWING = 300
MAX_LINK_SCRAPE = 10
LINK_SCRAPE_TIMEOUT = 10_000  # ms
SCROLL_PAUSE_MIN = 2.0
SCROLL_PAUSE_MAX = 4.5

SOCIAL_DOMAINS = {
    "twitter.com", "x.com", "facebook.com", "instagram.com",
    "linkedin.com", "youtube.com", "t.co",
}

PAYWALL_PATTERNS = [
    "subscribe to continue", "sign in to read", "premium content",
    "paywall", "members only", "create a free account",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def err(msg: str):
    print(msg, file=sys.stderr)


def rand_pause():
    """Random pause between scrolls to avoid detection."""
    import random
    time.sleep(random.uniform(SCROLL_PAUSE_MIN, SCROLL_PAUSE_MAX))


def cutoff_date():
    return datetime.now(timezone.utc) - timedelta(days=MAX_MONTHS * 30)


def parse_twitter_date(date_str: str) -> str | None:
    """Parse various Twitter date formats to ISO 8601."""
    if not date_str:
        return None
    # Try common patterns
    for fmt in ["%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%b %d, %Y"]:
        try:
            return datetime.strptime(date_str, fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    return date_str


def extract_urls(text: str) -> list[str]:
    """Extract all URLs from text."""
    return re.findall(r'https?://[^\s)<>"]+', text or "")


def is_social_url(url: str) -> bool:
    """Check if URL is a social media platform (skip for scraping)."""
    try:
        domain = urlparse(url).netloc.lower().replace("www.", "")
        return any(d in domain for d in SOCIAL_DOMAINS)
    except Exception:
        return False


def is_image_url(url: str) -> bool:
    path = urlparse(url).path.lower()
    return any(path.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"])


# ---------------------------------------------------------------------------
# Cookie management
# ---------------------------------------------------------------------------

def export_cookies(output_path: str):
    """Open browser for manual login, save cookies on close."""
    print("Opening browser for manual X login...")
    print("1. Log into X in the browser window that opens")
    print("2. Wait until you see the home feed")
    print("3. CLOSE the browser window")
    print(f"Cookies will be saved to: {output_path}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )
        page = context.new_page()
        page.goto("https://x.com/i/flow/login", timeout=60000)

        # Poll until user is on a logged-in page or browser closes
        logged_in = False
        for _ in range(600):  # up to 5 minutes, check every 0.5s
            try:
                url = page.url
                if "/home" in url or ("x.com" in url and "/login" not in url and "/i/flow" not in url):
                    logged_in = True
                    print("Login detected! You can close the browser now, or it will auto-save in 5 seconds...")
                    page.wait_for_timeout(5000)
                    break
                page.wait_for_timeout(500)
            except Exception:
                break  # browser was closed

        cookies = context.cookies()
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        Path(output_path).write_text(json.dumps(cookies, indent=2))
        auth_names = [c["name"] for c in cookies if c["name"] in ("auth_token", "ct0", "twid")]
        print(f"Saved {len(cookies)} cookies to {output_path}")
        if auth_names:
            print(f"Auth cookies captured: {auth_names}")
        else:
            print("WARNING: No auth cookies found — login may not have completed")
        try:
            browser.close()
        except Exception:
            pass


def load_cookies(context, cookie_path: str) -> bool:
    """Load cookies from file into browser context."""
    try:
        cookies = json.loads(Path(cookie_path).read_text())
        context.add_cookies(cookies)
        return True
    except (FileNotFoundError, json.JSONDecodeError) as e:
        err(f"Cookie load failed: {e}")
        return False


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

def do_login(page, credentials: str) -> bool:
    """Login with user:pass credentials. Handles X's multi-step flow."""
    parts = credentials.split(":", 1)
    if len(parts) != 2:
        err("Invalid --login format. Use user:pass")
        return False
    username, password = parts
    try:
        page.goto("https://x.com/i/flow/login", timeout=60000)
        page.wait_for_timeout(4000)

        # Enter username
        username_input = page.wait_for_selector('input[autocomplete="username"]', timeout=15000)
        username_input.fill(username)
        # Click Next button
        next_btn = page.query_selector('[role="button"]:has-text("Next")')
        if next_btn:
            next_btn.click()
        else:
            page.keyboard.press("Enter")
        page.wait_for_timeout(4000)

        # Handle "unusual login activity" — X may ask for email/phone/username verification
        for _ in range(3):
            unusual_el = page.query_selector('input[data-testid="ocfEnterTextTextInput"]')
            if unusual_el:
                err("X verification challenge detected. Entering username...")
                unusual_el.fill(username)
                next_btn2 = page.query_selector('[data-testid="ocfEnterTextNextButton"]')
                if next_btn2:
                    next_btn2.click()
                else:
                    page.keyboard.press("Enter")
                page.wait_for_timeout(3000)
            else:
                break

        # Enter password — wait longer for the step to appear
        password_input = page.wait_for_selector(
            'input[type="password"], input[name="password"]', timeout=15000
        )
        password_input.fill(password)
        page.wait_for_timeout(500)

        # Click Log in button
        login_btn = page.query_selector('[data-testid="LoginForm_Login_Button"]')
        if login_btn:
            login_btn.click()
        else:
            page.keyboard.press("Enter")
        page.wait_for_timeout(6000)

        # Check if logged in
        current = page.url
        if "/home" in current or ("x.com" in current and "/login" not in current and "/i/flow" not in current):
            err("Login successful")
            return True
        err(f"Login may have failed — ended at: {current}")
        return False
    except Exception as e:
        err(f"Login failed: {e}")
        return False


def setup_auth(context, page, args) -> bool:
    """Set up authentication. Returns True if authenticated."""
    cookie_path = args.cookies or DEFAULT_COOKIE_PATH
    if Path(cookie_path).exists():
        if load_cookies(context, cookie_path):
            # Test if cookies work
            page.goto("https://x.com/home", wait_until="load", timeout=30000)
            page.wait_for_timeout(3000)
            if "/login" not in page.url and "/i/flow" not in page.url:
                return True
            err("Cookies expired, trying fallback...")

    if args.login:
        return do_login(page, args.login)

    err("No valid auth. Export cookies with --export-cookies or provide --login user:pass")
    return False


# ---------------------------------------------------------------------------
# Stage 1: Profile extraction
# ---------------------------------------------------------------------------

def extract_profile(page, handle: str) -> tuple[dict, dict | None]:
    """Extract profile data and pinned tweet. Returns (profile_dict, pinned_dict)."""
    url = f"https://x.com/{handle}"
    page.goto(url, wait_until="load")
    page.wait_for_timeout(2000)

    # Check if profile exists
    if page.query_selector('text="This account doesn\'t exist"') or \
       page.query_selector('[data-testid="empty_state_header_text"]'):
        err(f"Handle @{handle} not found")
        sys.exit(1)

    # Check if private
    if page.query_selector('text="These posts are protected"') or \
       page.query_selector('text="These Tweets are protected"'):
        err(f"Profile @{handle} is private")
        sys.exit(1)

    # Wait for primary column
    try:
        page.wait_for_selector('[data-testid="primaryColumn"]', timeout=10000)
    except PlaywrightTimeout:
        err("Page failed to load primary column")
        sys.exit(1)

    profile = {}

    # Name
    name_el = page.query_selector('[data-testid="UserName"]')
    if name_el:
        spans = name_el.query_selector_all("span")
        if spans:
            profile["name"] = spans[0].inner_text().strip()

    # Bio
    bio_el = page.query_selector('[data-testid="UserDescription"]')
    profile["bio"] = bio_el.inner_text().strip() if bio_el else None

    # Location, website, join date from header items
    profile["location"] = None
    profile["website"] = None
    profile["joined"] = None

    # Location — look for span with location icon sibling
    header_items = page.query_selector_all('[data-testid="UserProfileHeader_Items"] span')
    for item in header_items:
        text = item.inner_text().strip()
        if not text:
            continue
        if "Joined" in text:
            profile["joined"] = text.replace("Joined ", "")
        elif text.startswith("http") or text.startswith("www"):
            profile["website"] = text

    # Location — separate selector
    loc_el = page.query_selector('[data-testid="UserLocation"]')
    if loc_el:
        profile["location"] = loc_el.inner_text().strip()

    # Website from UserUrl
    url_el = page.query_selector('[data-testid="UserUrl"] a')
    if url_el:
        profile["website"] = url_el.get_attribute("href") or url_el.inner_text().strip()

    # Verified
    profile["verified"] = bool(page.query_selector('[data-testid="icon-verified"]'))

    # Followers / following counts
    profile["followers"] = 0
    profile["following"] = 0
    profile["tweet_count_total"] = 0

    # Try to get follower/following links
    followers_link = page.query_selector(f'a[href="/{handle}/verified_followers"]')
    if not followers_link:
        followers_link = page.query_selector(f'a[href="/{handle}/followers"]')
    if followers_link:
        text = followers_link.inner_text()
        nums = re.findall(r'[\d,.]+[KMB]?', text)
        if nums:
            profile["followers"] = _parse_count(nums[0])

    following_link = page.query_selector(f'a[href="/{handle}/following"]')
    if following_link:
        text = following_link.inner_text()
        nums = re.findall(r'[\d,.]+[KMB]?', text)
        if nums:
            profile["following"] = _parse_count(nums[0])

    # Pinned tweet — search all tweets for the one with "Pinned" social context
    pinned = None
    all_tweets = page.query_selector_all('[data-testid="tweet"]')
    for tw in all_tweets:
        ctx = tw.query_selector('[data-testid="socialContext"]')
        if ctx:
            try:
                ctx_text = ctx.inner_text()
                if "Pinned" in ctx_text:
                    pinned = _parse_tweet_element(page, tw)
                    if pinned:
                        err(f"  Pinned tweet captured: {pinned.get('text', '')[:60]}...")
                    else:
                        err("  Pinned tweet element found but parse failed")
                    break
            except Exception as e:
                err(f"  Pinned tweet extraction error: {e}")
                continue

    # Also extract bio links (href from <a> inside bio)
    profile["bio_links"] = []
    if bio_el:
        for a in bio_el.query_selector_all('a[href^="http"]'):
            href = a.get_attribute("href")
            if href:
                profile["bio_links"].append(href)

    return profile, pinned


def _parse_count(text: str) -> int:
    """Parse '1,234' or '5.2K' or '1.3M' into int."""
    text = text.strip().replace(",", "")
    multiplier = 1
    if text.endswith("K"):
        multiplier = 1000
        text = text[:-1]
    elif text.endswith("M"):
        multiplier = 1_000_000
        text = text[:-1]
    elif text.endswith("B"):
        multiplier = 1_000_000_000
        text = text[:-1]
    try:
        return int(float(text) * multiplier)
    except ValueError:
        return 0


# ---------------------------------------------------------------------------
# Stage 2: Tweet extraction
# ---------------------------------------------------------------------------

def _parse_tweet_element(page, tweet_el) -> dict | None:
    """Parse a single tweet article element into a dict."""
    try:
        tweet = {}

        # Text
        text_el = tweet_el.query_selector('[data-testid="tweetText"]')
        tweet["text"] = text_el.inner_text().strip() if text_el else ""

        # Tweet ID from link
        tweet["id"] = None
        time_el = tweet_el.query_selector("time")
        if time_el:
            link = time_el.evaluate_handle("el => el.closest('a')").as_element()
            if link:
                href = link.get_attribute("href") or ""
                parts = href.split("/status/")
                if len(parts) == 2:
                    tweet["id"] = parts[1].split("/")[0].split("?")[0]
            tweet["created_at"] = time_el.get_attribute("datetime")
        else:
            tweet["created_at"] = None

        # Type detection
        tweet["type"] = "original"
        tweet["in_reply_to_text"] = None

        social_ctx = tweet_el.query_selector('[data-testid="socialContext"]')
        if social_ctx:
            ctx_text = social_ctx.inner_text()
            if "reposted" in ctx_text.lower():
                tweet["type"] = "retweet"
            elif "Pinned" in ctx_text:
                pass  # pinned original

        # Check for reply — look for "Replying to @user" text pattern
        reply_context = tweet_el.evaluate(
            """el => {
                const text = el.innerText;
                const match = text.match(/Replying to\\s+@(\\w+)/);
                return match ? match[1] : null;
            }"""
        )
        if reply_context and tweet["type"] == "original":
            tweet["type"] = "reply"
            tweet["in_reply_to_text"] = f"@{reply_context}"

        # Check for quote tweet — look for embedded tweet card
        qt_card = tweet_el.query_selector('[data-testid="quoteTweet"]')
        if not qt_card:
            # Fallback: inner articles (nested tweet)
            inner_articles = tweet_el.query_selector_all('article')
            if len(inner_articles) > 0:
                qt_card = True
        if qt_card and tweet["type"] == "original":
            tweet["type"] = "quote_tweet"

        # Metrics
        tweet["metrics"] = {"likes": 0, "replies": 0, "retweets": 0, "views": 0}
        # Like
        like_el = tweet_el.query_selector('[data-testid="like"] span, [data-testid="unlike"] span')
        if like_el:
            tweet["metrics"]["likes"] = _parse_count(like_el.inner_text())
        # Reply
        reply_el = tweet_el.query_selector('[data-testid="reply"] span')
        if reply_el:
            tweet["metrics"]["replies"] = _parse_count(reply_el.inner_text())
        # Retweet
        rt_el = tweet_el.query_selector('[data-testid="retweet"] span, [data-testid="unretweet"] span')
        if rt_el:
            tweet["metrics"]["retweets"] = _parse_count(rt_el.inner_text())
        # Views — look for analytics link
        analytics_el = tweet_el.query_selector('a[href*="/analytics"] span')
        if analytics_el:
            tweet["metrics"]["views"] = _parse_count(analytics_el.inner_text())

        # URLs — collect from multiple sources
        tweet["urls"] = extract_urls(tweet["text"])
        # Links inside tweet text (t.co redirects)
        text_el_for_links = tweet_el.query_selector('[data-testid="tweetText"]')
        if text_el_for_links:
            for le in text_el_for_links.query_selector_all('a'):
                href = le.get_attribute("href")
                if href and href.startswith("http"):
                    tweet["urls"].append(href)
        # Card links (article previews, etc.)
        card_el = tweet_el.query_selector('[data-testid="card.wrapper"] a')
        if card_el:
            href = card_el.get_attribute("href")
            if href and href.startswith("http"):
                tweet["urls"].append(href)
        # Any other links in tweet body (not profile links)
        for a_el in tweet_el.query_selector_all('a[href^="http"]'):
            href = a_el.get_attribute("href")
            if href and not is_social_url(href):
                tweet["urls"].append(href)
        tweet["urls"] = list(set(tweet["urls"]))

        # Mentions
        tweet["mentions"] = re.findall(r'@(\w+)', tweet["text"])

        # Hashtags
        tweet["hashtags"] = re.findall(r'#(\w+)', tweet["text"])

        # Media
        tweet["has_media"] = bool(tweet_el.query_selector('[data-testid="tweetPhoto"], video'))

        return tweet
    except Exception as e:
        err(f"Tweet parse error: {e}")
        return None


def extract_tweets(page, handle: str) -> list[dict]:
    """Scroll tweet feed and collect tweets."""
    tweets = []
    seen_ids = set()
    cutoff = cutoff_date()
    stall_count = 0
    max_stalls = 8

    # Always navigate fresh to profile to ensure tweet timeline is loaded
    page.goto(f"https://x.com/{handle}", wait_until="load", timeout=30000)
    page.wait_for_timeout(4000)

    # Wait for first tweet to appear
    try:
        page.wait_for_selector('[data-testid="tweet"]', timeout=10000)
    except PlaywrightTimeout:
        err("No tweets found on timeline")
        return tweets

    while len(tweets) < MAX_TWEETS and stall_count < max_stalls:
        tweet_els = page.query_selector_all('[data-testid="tweet"]')
        new_this_round = 0

        for el in tweet_els:
            # Skip pinned tweets (already captured in profile extraction)
            social_ctx = el.query_selector('[data-testid="socialContext"]')
            if social_ctx and "Pinned" in social_ctx.inner_text():
                continue

            try:
                tweet = _parse_tweet_element(page, el)
            except Exception as e:
                err(f"Tweet parse exception: {e}")
                continue
            if not tweet:
                continue
            # If no ID, generate one from text hash to avoid losing data
            if not tweet.get("id"):
                tweet["id"] = f"noid_{hash(tweet.get('text', ''))}"
            if tweet["id"] in seen_ids:
                continue
            seen_ids.add(tweet["id"])
            new_this_round += 1

            # Check date cutoff — only stop if we've already collected some tweets
            # (early tweets may be out of order due to algorithmic timeline)
            if tweet.get("created_at") and len(tweets) > 5:
                try:
                    tweet_dt = datetime.fromisoformat(tweet["created_at"].replace("Z", "+00:00"))
                    if tweet_dt < cutoff:
                        err(f"  Reached date cutoff at {len(tweets)} tweets")
                        return tweets
                except (ValueError, TypeError):
                    pass

            tweets.append(tweet)
            if len(tweets) >= MAX_TWEETS:
                break

        if new_this_round == 0:
            stall_count += 1
        else:
            stall_count = 0

        # Scroll down
        page.evaluate("window.scrollBy(0, window.innerHeight * 2)")
        rand_pause()
        page.wait_for_timeout(1500)

    return tweets


# ---------------------------------------------------------------------------
# Stage 3: Following list extraction
# ---------------------------------------------------------------------------

def extract_following(page, handle: str) -> list[dict]:
    """Navigate to /following and extract accounts."""
    following = []
    seen_handles = set()
    stall_count = 0
    max_stalls = 8

    page.goto(f"https://x.com/{handle}/following", wait_until="load", timeout=30000)
    page.wait_for_timeout(3000)

    # Wait for user cells to appear
    try:
        page.wait_for_selector('[data-testid="UserCell"]', timeout=10000)
    except PlaywrightTimeout:
        err("No following list found")
        return following

    while len(following) < MAX_FOLLOWING and stall_count < max_stalls:
        cells = page.query_selector_all('[data-testid="UserCell"]')
        new_this_round = 0

        for cell in cells:
            try:
                # Handle from link — find the profile link (single-segment path)
                links = cell.query_selector_all('a[role="link"]')
                cell_handle = None
                cell_name = None
                for link in links:
                    href = link.get_attribute("href") or ""
                    if href.startswith("/") and len(href) > 1 and "/" not in href[1:]:
                        cell_handle = href[1:]
                        break

                if not cell_handle or cell_handle in seen_handles:
                    continue
                seen_handles.add(cell_handle)
                new_this_round += 1

                # Name — get from UserName testid or first link text
                name_el = cell.query_selector('[data-testid="UserName"] span')
                cell_name = name_el.inner_text().strip() if name_el else cell_handle

                # Bio — only from UserDescription, skip unreliable fallbacks
                bio_el = cell.query_selector('[data-testid="UserDescription"]')
                bio = bio_el.inner_text().strip() if bio_el else None
                # Filter out non-bio text
                if bio and ("Click to Follow" in bio or "Follow" == bio):
                    bio = None

                following.append({
                    "handle": cell_handle,
                    "name": cell_name or cell_handle,
                    "bio": bio,
                })
            except Exception:
                continue

        if new_this_round == 0:
            stall_count += 1
        else:
            stall_count = 0

        page.evaluate("window.scrollBy(0, window.innerHeight)")
        rand_pause()
        page.wait_for_timeout(1000)

    return following


def enrich_following_bios(page, following: list[dict]) -> list[dict]:
    """Visit profile pages to fill in missing bios from the following list."""
    MAX_BIO_ENRICHMENT = 75
    missing = [f for f in following if not f.get("bio")]
    if not missing:
        return following

    if len(missing) > MAX_BIO_ENRICHMENT:
        err(f"  {len(missing)} accounts missing bios, capping enrichment at {MAX_BIO_ENRICHMENT}")
        missing = missing[:MAX_BIO_ENRICHMENT]

    err(f"  Enriching bios for {len(missing)}/{len(following)} accounts...")
    enriched = 0
    for entry in missing:
        h = entry["handle"]
        try:
            page.goto(f"https://x.com/{h}", wait_until="domcontentloaded", timeout=15000)
            page.wait_for_timeout(1500)
            bio_el = page.query_selector('[data-testid="UserDescription"]')
            if bio_el:
                bio_text = bio_el.inner_text().strip()
                if bio_text and bio_text != "Follow":
                    entry["bio"] = bio_text
                    enriched += 1
        except Exception:
            pass  # skip on any error, keep bio as null

    err(f"  Enriched {enriched}/{len(missing)} bios")
    return following


# ---------------------------------------------------------------------------
# Stage 4: Link extraction + context
# ---------------------------------------------------------------------------

def extract_links(profile: dict, pinned: dict | None, tweets: list[dict]) -> list[dict]:
    """Aggregate and deduplicate all URLs with source context."""
    link_map: dict[str, dict] = {}  # url -> link record

    def add_link(url: str, source: str, context: str, timestamp: str = None,
                 tweet_id: str = None):
        # Normalize
        url = url.rstrip("/")
        if url in link_map:
            link_map[url]["occurrences"] += 1
            return
        link_map[url] = {
            "url": url,
            "final_url": url,  # will be expanded later
            "source": source,
            "source_tweet_id": tweet_id,
            "context": (context or "")[:300],
            "context_timestamp": timestamp,
            "occurrences": 1,
        }

    # Bio links
    if profile.get("website"):
        add_link(profile["website"], "bio", profile.get("bio", ""))
    for url in extract_urls(profile.get("bio", "") or ""):
        add_link(url, "bio", profile.get("bio", ""))

    # Pinned tweet links
    if pinned:
        for url in pinned.get("urls", []):
            add_link(url, "pinned_tweet", pinned.get("text", ""),
                     pinned.get("created_at"))
        for url in extract_urls(pinned.get("text", "")):
            add_link(url, "pinned_tweet", pinned.get("text", ""),
                     pinned.get("created_at"))

    # Tweet links
    for tweet in tweets:
        for url in tweet.get("urls", []):
            add_link(url, "tweet", tweet.get("text", ""),
                     tweet.get("created_at"), tweet.get("id"))
        for url in extract_urls(tweet.get("text", "")):
            add_link(url, "tweet", tweet.get("text", ""),
                     tweet.get("created_at"), tweet.get("id"))

    return list(link_map.values())


def expand_tco_urls(page, links: list[dict]) -> list[dict]:
    """Expand t.co shortened URLs by navigating and following redirects."""
    # Create a new page for expansion to avoid disturbing main navigation
    context = page.context
    expand_page = context.new_page()
    try:
        for link in links:
            url = link["url"]
            if "t.co/" not in url:
                continue
            try:
                expand_page.goto(url, wait_until="domcontentloaded", timeout=8000)
                link["final_url"] = expand_page.url
            except PlaywrightTimeout:
                # Even on timeout, check if URL redirected
                current = expand_page.url
                if current != url and "t.co/" not in current:
                    link["final_url"] = current
                else:
                    link["final_url"] = url
            except Exception:
                link["final_url"] = url
    finally:
        expand_page.close()
    return links


# ---------------------------------------------------------------------------
# Stage 5: Link scraping (top priority links)
# ---------------------------------------------------------------------------

def prioritize_links(links: list[dict]) -> list[dict]:
    """Sort links by priority: bio > pinned > 2+ occurrences > rest."""
    def score(link):
        s = 0
        if link["source"] == "bio":
            s += 100
        elif link["source"] == "pinned_tweet":
            s += 50
        s += link["occurrences"] * 10
        return s

    # Filter out social/image URLs — use final_url (expanded) for filtering
    eligible = []
    for l in links:
        check_url = l.get("final_url", l["url"])
        # t.co links that weren't expanded are still eligible (we'll expand during scraping)
        if "t.co/" in check_url:
            eligible.append(l)
            continue
        if not is_social_url(check_url) and not is_image_url(check_url):
            eligible.append(l)
    return sorted(eligible, key=score, reverse=True)[:MAX_LINK_SCRAPE]


def scrape_link(page, url: str) -> dict:
    """Navigate to URL and extract title + meta + first 500 words."""
    result = {
        "url": url,
        "title": None,
        "meta_description": None,
        "excerpt": None,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "scrape_status": "complete",
    }
    try:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=LINK_SCRAPE_TIMEOUT)
        # Update URL to final destination (t.co expansion happens here)
        result["url"] = page.url
        if resp and resp.status == 404:
            result["scrape_status"] = "failed"
            return result

        page.wait_for_timeout(1000)

        # Check paywall
        body_text = page.inner_text("body").lower()
        for pattern in PAYWALL_PATTERNS:
            if pattern in body_text:
                result["scrape_status"] = "paywall"
                return result

        # Title
        result["title"] = page.title()

        # Meta description
        meta = page.query_selector('meta[name="description"], meta[property="og:description"]')
        if meta:
            result["meta_description"] = meta.get_attribute("content")

        # First 500 words of body content
        # Try main/article first, then body
        content_el = page.query_selector("article") or page.query_selector("main") or page.query_selector("body")
        if content_el:
            text = content_el.inner_text().strip()
            words = text.split()[:500]
            result["excerpt"] = " ".join(words)

    except PlaywrightTimeout:
        result["scrape_status"] = "timeout"
    except Exception as e:
        result["scrape_status"] = "failed"
        err(f"Link scrape failed for {url}: {e}")

    return result


def scrape_top_links(page, links: list[dict]) -> list[dict]:
    """Scrape top priority links, expanding t.co URLs along the way."""
    priority_links = prioritize_links(links)
    scraped = []
    for link in priority_links:
        url = link.get("final_url", link["url"])

        # Navigate and let redirects resolve (handles t.co expansion)
        result = scrape_link(page, url)

        # Update link record with expanded URL
        if result.get("url") != url:
            link["final_url"] = result["url"]

        # Skip if expanded URL is social/image
        final = result["url"]
        if is_social_url(final) or is_image_url(final):
            continue

        result["source"] = link["source"]
        scraped.append(result)
    return scraped


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

def run_scraper(handle: str, output_path: str, args) -> dict:
    """Run all 5 extraction stages and produce twitter_raw_data.json."""
    handle = handle.lstrip("@")

    scrape_status = {
        "profile": "complete",
        "tweets": "complete",
        "following": "complete",
        "links": "complete",
        "link_scraping": "complete",
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        )
        page = context.new_page()

        # Auth
        if not setup_auth(context, page, args):
            browser.close()
            sys.exit(1)

        # Save cookies after successful auth (for next run)
        cookie_path = args.cookies or DEFAULT_COOKIE_PATH
        try:
            cookies = context.cookies()
            Path(cookie_path).write_text(json.dumps(cookies, indent=2))
        except Exception:
            pass  # non-critical

        # Stage 1: Profile
        print("Stage 1/5: Extracting profile...", file=sys.stderr)
        profile, pinned = extract_profile(page, handle)
        print(f"  Profile: {profile.get('name', 'unknown')} — {profile.get('bio', '')[:60]}",
              file=sys.stderr)

        # Stage 2: Tweets (extract_tweets re-navigates to profile, which also
        # gives us another chance to grab pinned tweet if Stage 1 missed it)
        print("Stage 2/5: Scrolling tweets...", file=sys.stderr)
        tweets = extract_tweets(page, handle)

        # If pinned tweet wasn't captured in Stage 1, try again now
        if not pinned:
            page.goto(f"https://x.com/{handle}", wait_until="load", timeout=30000)
            page.wait_for_timeout(3000)
            all_tw = page.query_selector_all('[data-testid="tweet"]')
            for tw in all_tw:
                ctx = tw.query_selector('[data-testid="socialContext"]')
                if ctx and "Pinned" in ctx.inner_text():
                    pinned = _parse_tweet_element(page, tw)
                    if pinned:
                        err(f"  Pinned tweet captured on retry: {pinned.get('text', '')[:60]}...")
                    break
        print(f"  Collected {len(tweets)} tweets", file=sys.stderr)
        if len(tweets) < 20:
            err(f"  Warning: only {len(tweets)} tweets collected (expected 50+)")
            scrape_status["tweets"] = "partial"

        # Stage 3: Following
        print("Stage 3/5: Extracting following list...", file=sys.stderr)
        try:
            following = extract_following(page, handle)
            print(f"  Collected {len(following)} following accounts", file=sys.stderr)
            if following and len(following) < profile.get("following", 0) * 0.5:
                scrape_status["following"] = "partial"
            # Enrich missing bios by visiting individual profiles
            following = enrich_following_bios(page, following)
        except Exception as e:
            err(f"  Following extraction failed: {e}")
            following = []
            scrape_status["following"] = "failed"

        # Stage 4: Links
        print("Stage 4/5: Extracting links...", file=sys.stderr)
        try:
            links = extract_links(profile, pinned, tweets)
            links = expand_tco_urls(page, links)
            print(f"  Extracted {len(links)} unique links", file=sys.stderr)
        except Exception as e:
            err(f"  Link extraction failed: {e}")
            links = []
            scrape_status["links"] = "failed"

        # Stage 5: Link scraping
        print("Stage 5/5: Scraping top links...", file=sys.stderr)
        try:
            scraped_links = scrape_top_links(page, links)
            completed = sum(1 for l in scraped_links if l["scrape_status"] == "complete")
            print(f"  Scraped {completed}/{len(scraped_links)} links successfully", file=sys.stderr)
            if completed == 0 and len(scraped_links) > 0:
                scrape_status["link_scraping"] = "partial"
        except Exception as e:
            err(f"  Link scraping failed: {e}")
            scraped_links = []
            scrape_status["link_scraping"] = "failed"

        browser.close()

    # Compute date range from tweets
    dates = []
    for t in tweets:
        if t.get("created_at"):
            try:
                dates.append(t["created_at"][:10])
            except (TypeError, IndexError):
                pass
    date_range = [min(dates), max(dates)] if dates else []

    # Assemble output
    data = {
        "meta": {
            "handle": handle,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "tweet_count_collected": len(tweets),
            "date_range": date_range,
            "following_collected": len(following),
            "following_total": profile.get("following", 0),
            "scrape_status": scrape_status,
        },
        "profile": profile,
        "pinned_tweet": {
            "text": pinned.get("text") if pinned else None,
            "created_at": pinned.get("created_at") if pinned else None,
            "metrics": pinned.get("metrics") if pinned else {"likes": 0, "replies": 0, "retweets": 0},
        },
        "tweets": tweets,
        "following": following,
        "links": links,
        "scraped_links": scraped_links,
    }

    # Write output
    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
    print(f"\nOutput written to: {output_path}", file=sys.stderr)
    print(f"Summary: {len(tweets)} tweets, {len(following)} following, "
          f"{len(links)} links, {len(scraped_links)} scraped", file=sys.stderr)

    return data


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="xresearch — Twitter/X profile scraper for Basalt Research"
    )
    parser.add_argument("handle", nargs="?", help="Twitter handle (with or without @)")
    parser.add_argument("output_path", nargs="?", help="Output path for twitter_raw_data.json")
    parser.add_argument("--cookies", help="Path to cookies JSON file",
                        default=DEFAULT_COOKIE_PATH)
    parser.add_argument("--login", help="Login credentials as user:pass")
    parser.add_argument("--export-cookies", dest="export_cookies", metavar="PATH",
                        help="Open browser for manual login, save cookies")

    args = parser.parse_args()

    if args.export_cookies:
        export_cookies(args.export_cookies)
        return

    if not args.handle or not args.output_path:
        parser.error("handle and output_path are required (unless using --export-cookies)")

    try:
        run_scraper(args.handle, args.output_path, args)
    except KeyboardInterrupt:
        err("\nAborted by user")
        sys.exit(130)
    except Exception as e:
        err(f"Scraper failed: {e}")
        # Retry once
        err("Retrying once...")
        try:
            run_scraper(args.handle, args.output_path, args)
        except Exception as e2:
            err(f"Retry failed: {e2}")
            sys.exit(1)


if __name__ == "__main__":
    main()
