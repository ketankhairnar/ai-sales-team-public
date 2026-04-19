#!/usr/bin/env python3
"""
find_emails.py — Scrape team page, extract names, guess & verify emails.

Usage:
    python find_emails.py --domain apptronik.com
    python find_emails.py --domain apptronik.com --skip-verify
    python find_emails.py --all                          # run all OEMs sequentially
    python find_emails.py --all --skip-verify            # fast mode, no SMTP
"""

import argparse
import json
import re
import smtplib
import socket
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import dns.resolver
except ImportError:
    dns = None

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
except ImportError:
    print("pip install playwright && playwright install chromium", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

TEAM_PATHS = [
    "/leadership", "/team", "/about", "/about-us", "/about/team",
    "/people", "/our-team", "/company", "/company/team",
]

SKIP_DOMAINS = {"tesla.com", "xiaomi.com", "xpeng.com"}

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")

OUTPUT_DIR = Path(__file__).parent / "results"

KNOWN_DOMAINS = {
    "Tesla": "tesla.com", "Figure": "figure.ai",
    "Agility Robotics": "agilityrobotics.com", "1X": "1x.tech",
    "Boston Dynamics": "bostondynamics.com", "Sunday Robotics": "sundayrobotics.com",
    "Vibe Robotics": "viberobotics.co", "Dexmate": "dexmate.com",
    "Sanctuary AI": "sanctuary.ai", "Foundation Robotics": "foundationrobotics.com",
    "Fauna Robotics": "faunarobotics.com", "Pollen Robotics": "pollen-robotics.com",
    "PAL Robotics": "pal-robotics.com", "Engineered Arts": "engineeredarts.co.uk",
    "Apptronik": "apptronik.com", "Unitree": "unitree.com",
    "Booster Robotics": "boosterrobotics.com", "AGIBot": "agibot.com",
    "XPeng": "xpeng.com", "EngineAI": "engineai.com",
    "UBTECH": "ubtrobot.com", "Fourier Intelligence": "fftai.com",
    "Kepler Robotics": "keplerbot.com", "Noetix Robotics": "noetixrobotics.com",
    "Dobot": "dobot.cc", "LimX Dynamics": "limxdynamics.com",
    "PUDU Robotics": "pudurobotics.com", "Astribot": "astribot.com",
    "MagicLab": "magiclab.ai", "Xiaomi": "xiaomi.com",
    "RobotEra": "robotera.com", "OpenLoong": "openloong.org.cn",
    "Mentee Robotics": "menteebot.com", "Neura Robotics": "neura-robotics.com",
    "Clone Robotics": "clonerobotics.com", "Vanar Robots": "vanarrobots.com",
}

# ---------------------------------------------------------------------------
# 1. Scrape — stop as soon as we find a good team page
# ---------------------------------------------------------------------------

TEAM_SIGNALS = ["ceo", "cto", "cfo", "coo", "founder", "co-founder",
                "chief", "director", "head of", "vp ", "our team",
                "leadership", "management team"]


def scrape_team_page(domain: str) -> tuple[str, str]:
    """Returns (url, text) of best team page found. Stops early on strong match."""
    base = f"https://{domain}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900}, user_agent=UA)

        for path in TEAM_PATHS:
            url = f"{base}{path}"
            print(f"  {path} ...", end=" ", flush=True)
            try:
                resp = page.goto(url, wait_until="domcontentloaded", timeout=10000)
                status = resp.status if resp else 0
                page.wait_for_timeout(1500)

                if status >= 400:
                    print("404"); continue

                final = page.url
                if final.rstrip("/") == base.rstrip("/") and path != "/":
                    print("→home"); continue

                text = page.inner_text("body").strip()
                if len(text) < 100:
                    print("empty"); continue

                tl = text.lower()
                score = sum(1 for s in TEAM_SIGNALS if s in tl)

                if score >= 3:
                    print(f"✓ TEAM ({len(text)} chars)")
                    browser.close()
                    return final, text[:15000]
                elif score >= 2:
                    print(f"~ maybe ({len(text)} chars)")
                    # keep looking for a better one
                    best = (final, text[:15000])
                else:
                    print(f"skip ({score} signals)")

            except PlaywrightTimeout:
                print("timeout")
            except Exception as e:
                print(f"err")
            time.sleep(0.5)

        browser.close()

    return locals().get("best", ("", ""))


# ---------------------------------------------------------------------------
# 2. Extract people (name + title) from raw text
# ---------------------------------------------------------------------------

TITLE_RE = re.compile(
    r"(?:CEO|CTO|CFO|COO|CIO|CMO|CPO|CRO|CSO|"
    r"Chief\s+\w+\s+Officer|Chief\s+\w+\s+&\s+\w+\s+Officer|"
    r"Co-?Founder(?:\s*[,&]\s*\w+)?|Founder|"
    r"President|Chairman|Board\s+Member|"
    r"(?:VP|Vice\s+President)\s+(?:of\s+)?\w+|"
    r"(?:Director|Head)\s+(?:of\s+)?\w+|"
    r"General\s+Manager|Managing\s+Director|"
    r"Partner|Advisor|Scientific\s+Advisor)",
    re.IGNORECASE,
)


def looks_like_name(s: str) -> bool:
    s = s.strip()
    if not s or len(s) > 40 or len(s) < 3:
        return False
    words = s.split()
    if len(words) < 2 or len(words) > 4:
        return False
    # All words should be capitalized (names are)
    if not all(w[0].isupper() for w in words if len(w) > 1):
        return False
    # No common non-name words
    noise = ["learn more", "read more", "view", "click", "contact", "email",
             "phone", "copyright", "privacy", "terms", "menu", "home",
             "about", "careers", "news", "blog", "solutions", "industries",
             "resources", "get started", "watch", "deploy", "prior to",
             "throughout", "leads", "worked", "received", "joined",
             "before", "since", "after", "has been", "was the"]
    if any(n in s.lower() for n in noise):
        return False
    # Name words should be short (< 15 chars each)
    if any(len(w) > 15 for w in words):
        return False
    return True


def clean_name(s: str) -> str:
    return re.sub(r"^(Dr\.?|Prof\.?|Mr\.?|Mrs\.?|Ms\.?)\s+", "", s.strip()).strip()


def extract_people(text: str) -> list[dict]:
    people = []
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    i = 0
    while i < len(lines):
        line = lines[i]
        # Pattern: Name\nTitle
        if i + 1 < len(lines):
            nxt = lines[i + 1]
            if TITLE_RE.search(nxt) and looks_like_name(line):
                people.append({"name": clean_name(line), "title": nxt.strip()})
                i += 2; continue
        # Pattern: Name — Title
        for sep in [" — ", " – ", " - ", ", "]:
            if sep in line:
                parts = line.split(sep, 1)
                if looks_like_name(parts[0]) and TITLE_RE.search(parts[1]):
                    people.append({"name": clean_name(parts[0]), "title": parts[1].strip()})
                    break
        i += 1

    # Dedupe
    seen = set()
    return [p for p in people if p["name"].lower() not in seen and not seen.add(p["name"].lower())]


# ---------------------------------------------------------------------------
# 3. Guess emails
# ---------------------------------------------------------------------------

def guess_emails(name: str, domain: str) -> list[str]:
    parts = name.lower().split()
    if len(parts) < 2:
        return [f"{parts[0]}@{domain}"]
    first = re.sub(r"[^a-z]", "", parts[0])
    last = re.sub(r"[^a-z]", "", parts[-1])
    fi = first[0] if first else ""
    return [p for p in [
        f"{first}.{last}@{domain}",
        f"{first}@{domain}",
        f"{fi}{last}@{domain}",
        f"{first}{last}@{domain}",
        f"{last}@{domain}",
        f"{fi}.{last}@{domain}",
        f"{first}_{last}@{domain}",
    ] if p]


# ---------------------------------------------------------------------------
# 4. Verify emails (MX + SMTP)
# ---------------------------------------------------------------------------

def get_mx(domain: str) -> str | None:
    if not dns:
        return None
    try:
        answers = dns.resolver.resolve(domain, "MX")
        return str(sorted(answers, key=lambda r: r.preference)[0].exchange).rstrip(".")
    except Exception:
        return None


def smtp_check(email: str, mx: str) -> str:
    try:
        with smtplib.SMTP(timeout=8) as s:
            s.connect(mx, 25)
            s.helo("check.local")
            s.mail("test@check.local")
            code, _ = s.rcpt(email)
            if code == 250: return "valid"
            if code in (550, 551, 553): return "invalid"
            return f"code-{code}"
    except smtplib.SMTPServerDisconnected:
        return "disconnected"
    except (socket.timeout, ConnectionRefusedError, OSError):
        return "error"
    except Exception:
        return "error"


def verify_batch(emails: list[str], domain: str) -> dict[str, str]:
    mx = get_mx(domain)
    if not mx:
        print(f"  MX: not found — skipping verification")
        return {e: "no-mx" for e in emails}

    print(f"  MX: {mx}")

    # Catch-all check
    fake = f"xyznotreal{int(time.time())}@{domain}"
    if smtp_check(fake, mx) == "valid":
        print(f"  Catch-all server — accepts everything, can't confirm individuals")
        return {e: "catchall" for e in emails}

    results = {}
    for email in emails:
        st = smtp_check(email, mx)
        m = "✓" if st == "valid" else "✗" if st == "invalid" else "?"
        print(f"    {m} {email} ({st})")
        results[email] = st
        time.sleep(0.3)
    return results


# ---------------------------------------------------------------------------
# Run for one company
# ---------------------------------------------------------------------------

def run_one(domain: str, name: str, skip_verify: bool = False) -> dict | None:
    print(f"\n{'='*70}")
    print(f"  {name} ({domain})")
    print(f"{'='*70}")

    # Scrape
    print(f"\n  Scraping team pages ...")
    url, text = scrape_team_page(domain)
    if not text:
        print(f"  ✗ No team page found.\n")
        return None

    print(f"  Found: {url}")

    # Extract
    people = extract_people(text)
    if not people:
        print(f"  ✗ Could not extract names from page text.\n")
        return None

    print(f"  Extracted {len(people)} people\n")

    # Guess emails
    for p in people:
        p["guessed_emails"] = guess_emails(p["name"], domain)

    # Verify
    if not skip_verify:
        all_emails = [e for p in people for e in p["guessed_emails"][:3]]  # top 3 per person
        verification = verify_batch(all_emails, domain)
        for p in people:
            p["verified"] = {e: verification.get(e, "?") for e in p["guessed_emails"][:3]}
    else:
        for p in people:
            p["verified"] = {}

    # Print results
    print(f"\n  --- {name} ({domain}) ---\n")
    for p in people:
        best = p["guessed_emails"][:3]
        verified = p.get("verified", {})
        status_str = ""
        for e in best:
            v = verified.get(e, "")
            tag = " ✓" if v == "valid" else ""
            status_str += f"    {e}{tag}\n"
        print(f"  {p['name']} — {p['title']}")
        print(status_str)

    # Save per-company file
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    slug = domain.replace(".", "-")
    outfile = OUTPUT_DIR / f"{slug}.json"
    result = {
        "company": name,
        "domain": domain,
        "team_page": url,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "people": people,
    }
    outfile.write_text(json.dumps(result, indent=2))
    print(f"  Saved → {outfile}\n")

    # WhatsApp block
    print(f"  --- WhatsApp ---")
    print(f"  *{name}* ({domain})\n")
    for p in people:
        emails = p["guessed_emails"][:2]
        v = p.get("verified", {})
        best = [e for e in emails if v.get(e) == "valid"] or emails
        print(f"  • {p['name']} — {p['title']}")
        print(f"    {best[0]}")
    print()

    return result


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--domain", "-d", help="Single company domain")
    parser.add_argument("--name", "-n", help="Company name")
    parser.add_argument("--all", action="store_true", help="Run all OEMs")
    parser.add_argument("--skip-verify", action="store_true", help="Skip SMTP verification")
    args = parser.parse_args()

    if args.all:
        for name, domain in KNOWN_DOMAINS.items():
            if domain in SKIP_DOMAINS:
                print(f"\n  Skipping {name} (too large)")
                continue
            # Skip if already scraped
            slug = domain.replace(".", "-")
            if (OUTPUT_DIR / f"{slug}.json").exists():
                print(f"\n  Skipping {name} (already done)")
                continue
            run_one(domain, name, args.skip_verify)
            time.sleep(2)

    elif args.domain:
        domain = args.domain.strip().lower()
        name = args.name or domain.split(".")[0].title()
        run_one(domain, name, args.skip_verify)

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
