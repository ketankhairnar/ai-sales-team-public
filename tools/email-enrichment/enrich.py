#!/usr/bin/env python3
"""
enrich.py — Find employee emails for companies using Hunter.io API.

Two-step pipeline:
  1. Scrape company list from humanoids.fyi/oems (or use cached data)
  2. Query Hunter.io Domain Search for each company domain

Usage:
    # Step 1: Scrape OEM list from the site
    python enrich.py scrape --output oems.json

    # Step 2: Enrich with Hunter.io emails
    python enrich.py enrich --input oems.json --output results.json --api-key YOUR_KEY

    # Or do both in one shot
    python enrich.py run --api-key YOUR_KEY --output results.json

    # Search a single domain
    python enrich.py search --domain figurerobotics.com --api-key YOUR_KEY

Environment:
    HUNTER_API_KEY — Hunter.io API key (alternative to --api-key flag)

Requirements:
    pip install requests playwright
    playwright install chromium
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("Missing dependency: pip install requests", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

HUNTER_BASE = "https://api.hunter.io/v2"
RATE_LIMIT_DELAY = 0.5  # seconds between Hunter API calls

# Known domains for companies where the website isn't obvious from the name
KNOWN_DOMAINS = {
    "Tesla": "tesla.com",
    "Figure": "figure.ai",
    "Agility Robotics": "agilityrobotics.com",
    "1X": "1x.tech",
    "Boston Dynamics": "bostondynamics.com",
    "Sunday Robotics": "sundayrobotics.com",
    "Vibe Robotics": "viberobotics.co",
    "Dexmate": "dexmate.com",
    "Sanctuary AI": "sanctuary.ai",
    "Foundation Robotics": "foundationrobotics.com",
    "Fauna Robotics": "faunarobotics.com",
    "Pollen Robotics": "pollen-robotics.com",
    "PAL Robotics": "pal-robotics.com",
    "Engineered Arts": "engineeredarts.co.uk",
    "Apptronik": "apptronik.com",
    "Unitree": "unitree.com",
    "Booster Robotics": "boosterrobotics.com",
    "AGIBot": "agibot.com",
    "XPeng": "xpeng.com",
    "EngineAI": "engineai.com",
    "UBTECH": "ubtrobot.com",
    "Fourier Intelligence": "fftai.com",
    "Kepler Robotics": "keplerbot.com",
    "Noetix Robotics": "noetixrobotics.com",
    "Dobot": "dobot.cc",
    "LimX Dynamics": "limxdynamics.com",
    "PUDU Robotics": "pudurobotics.com",
    "Astribot": "astribot.com",
    "MagicLab": "magiclab.ai",
    "Xiaomi": "xiaomi.com",
    "RobotEra": "robotera.com",
    "OpenLoong": "openloong.org.cn",
    "Mentee Robotics": "menteebot.com",
    "Neura Robotics": "neura-robotics.com",
    "Clone Robotics": "clonerobotics.com",
    "Vanar Robots": "vanarrobots.com",
}


# ---------------------------------------------------------------------------
# Scraper — extract company list from humanoids.fyi
# ---------------------------------------------------------------------------

def scrape_oems(output_path: str) -> list[dict]:
    """Scrape OEM list from humanoids.fyi/oems using Playwright."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Missing dependency: pip install playwright && playwright install chromium", file=sys.stderr)
        sys.exit(1)

    print("Scraping humanoids.fyi/oems ...")
    companies = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://www.humanoids.fyi/oems", wait_until="networkidle", timeout=30000)
        time.sleep(2)  # let dynamic content render

        # Grab full page text — we'll parse company names from it
        text = page.inner_text("body")
        browser.close()

    # Parse known companies from the text
    for name, domain in KNOWN_DOMAINS.items():
        if name.lower() in text.lower():
            companies.append({
                "name": name,
                "domain": domain,
                "source": "humanoids.fyi/oems",
            })

    # Also try to find companies in text that aren't in KNOWN_DOMAINS
    # (manual review needed for these)
    print(f"Found {len(companies)} companies with known domains.")

    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump({
                "scraped_at": datetime.now(timezone.utc).isoformat(),
                "source": "https://www.humanoids.fyi/oems",
                "companies": companies,
            }, f, indent=2)
        print(f"Saved to {output_path}")

    return companies


# ---------------------------------------------------------------------------
# Hunter.io API
# ---------------------------------------------------------------------------

def hunter_domain_search(domain: str, api_key: str, **kwargs) -> dict:
    """Query Hunter.io Domain Search API for a given domain."""
    params = {
        "domain": domain,
        "api_key": api_key,
        "limit": kwargs.get("limit", 10),
        "type": kwargs.get("type", "personal"),  # personal emails, not generic
    }
    if kwargs.get("seniority"):
        params["seniority"] = kwargs["seniority"]
    if kwargs.get("department"):
        params["department"] = kwargs["department"]

    resp = requests.get(f"{HUNTER_BASE}/domain-search", params=params, timeout=15)

    if resp.status_code == 401:
        print("ERROR: Invalid Hunter.io API key.", file=sys.stderr)
        sys.exit(1)
    if resp.status_code == 429:
        print(f"  Rate limited on {domain}, waiting 10s ...", file=sys.stderr)
        time.sleep(10)
        return hunter_domain_search(domain, api_key, **kwargs)
    if resp.status_code != 200:
        return {"error": f"HTTP {resp.status_code}", "body": resp.text}

    return resp.json().get("data", {})


def hunter_email_count(domain: str, api_key: str) -> int:
    """Quick check: how many emails does Hunter have for this domain? (Free, no quota cost.)"""
    resp = requests.get(
        f"{HUNTER_BASE}/email-count",
        params={"domain": domain},
        timeout=10,
    )
    if resp.status_code == 200:
        return resp.json().get("data", {}).get("total", 0)
    return -1


# ---------------------------------------------------------------------------
# Enrichment pipeline
# ---------------------------------------------------------------------------

def enrich_companies(companies: list[dict], api_key: str, output_path: str, **kwargs) -> list[dict]:
    """Run Hunter.io domain search for each company."""
    results = []
    total = len(companies)

    for i, company in enumerate(companies, 1):
        domain = company["domain"]
        name = company["name"]
        print(f"[{i}/{total}] {name} ({domain}) ...", end=" ")

        # Quick count check first (free, no quota)
        count = hunter_email_count(domain, api_key)
        if count == 0:
            print(f"0 emails found, skipping.")
            results.append({**company, "emails": [], "email_count": 0})
            time.sleep(RATE_LIMIT_DELAY)
            continue

        print(f"{count} emails available ...", end=" ")

        # Full search
        data = hunter_domain_search(domain, api_key, **kwargs)

        if "error" in data:
            print(f"ERROR: {data['error']}")
            results.append({**company, "emails": [], "error": data["error"]})
        else:
            emails = data.get("emails", [])
            print(f"got {len(emails)} emails.")
            results.append({
                **company,
                "organization": data.get("organization"),
                "email_count": count,
                "pattern": data.get("pattern"),
                "emails": [
                    {
                        "email": e.get("value"),
                        "first_name": e.get("first_name"),
                        "last_name": e.get("last_name"),
                        "position": e.get("position"),
                        "seniority": e.get("seniority"),
                        "department": e.get("department"),
                        "confidence": e.get("confidence"),
                        "verification": e.get("verification", {}).get("status"),
                    }
                    for e in emails
                ],
            })

        time.sleep(RATE_LIMIT_DELAY)

    # Save results
    if output_path:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump({
                "enriched_at": datetime.now(timezone.utc).isoformat(),
                "total_companies": total,
                "total_emails_found": sum(len(r.get("emails", [])) for r in results),
                "results": results,
            }, f, indent=2)
        print(f"\nResults saved to {output_path}")

    return results


# ---------------------------------------------------------------------------
# Pretty print
# ---------------------------------------------------------------------------

def print_results(results: list[dict]):
    """Print a summary table of enrichment results."""
    print("\n" + "=" * 80)
    print(f"{'Company':<25} {'Domain':<25} {'Emails':>6}  {'Pattern':<20}")
    print("-" * 80)

    total_emails = 0
    for r in results:
        emails = r.get("emails", [])
        total_emails += len(emails)
        pattern = r.get("pattern") or "-"
        print(f"{r['name']:<25} {r['domain']:<25} {len(emails):>6}  {pattern:<20}")

        # Show top 3 emails per company
        for e in emails[:3]:
            conf = e.get("confidence", 0)
            pos = e.get("position", "")[:30] or "-"
            ver = e.get("verification", "unknown")
            print(f"  {'':25} {e['email']:<35} {conf:>3}% {ver:<8} {pos}")

    print("-" * 80)
    print(f"Total: {len(results)} companies, {total_emails} emails found")
    print("=" * 80)


# ---------------------------------------------------------------------------
# Single domain search
# ---------------------------------------------------------------------------

def search_single(domain: str, api_key: str, **kwargs):
    """Search a single domain and print results."""
    print(f"Searching {domain} ...")
    count = hunter_email_count(domain, api_key)
    print(f"Hunter has {count} emails for {domain}")

    if count == 0:
        print("No emails found.")
        return

    data = hunter_domain_search(domain, api_key, **kwargs)
    if "error" in data:
        print(f"Error: {data['error']}")
        return

    emails = data.get("emails", [])
    pattern = data.get("pattern")
    print(f"Email pattern: {pattern}")
    print(f"\nFound {len(emails)} emails:\n")

    for e in emails:
        name = f"{e.get('first_name', '')} {e.get('last_name', '')}".strip()
        pos = e.get("position", "-")
        conf = e.get("confidence", 0)
        ver = e.get("verification", {}).get("status", "unknown")
        print(f"  {e['value']:<35} {conf:>3}% {ver:<10} {name:<25} {pos}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def get_api_key(args) -> str:
    key = getattr(args, "api_key", None) or os.environ.get("HUNTER_API_KEY")
    if not key:
        print("ERROR: Provide --api-key or set HUNTER_API_KEY env var.", file=sys.stderr)
        sys.exit(1)
    return key


def main():
    parser = argparse.ArgumentParser(description="Email enrichment for humanoid robotics companies")
    sub = parser.add_subparsers(dest="command", required=True)

    # scrape
    p_scrape = sub.add_parser("scrape", help="Scrape OEM list from humanoids.fyi")
    p_scrape.add_argument("--output", "-o", default="oems.json", help="Output JSON path")

    # enrich
    p_enrich = sub.add_parser("enrich", help="Enrich company list with Hunter.io emails")
    p_enrich.add_argument("--input", "-i", required=True, help="Input JSON from scrape step")
    p_enrich.add_argument("--output", "-o", default="results.json", help="Output JSON path")
    p_enrich.add_argument("--api-key", help="Hunter.io API key")
    p_enrich.add_argument("--seniority", help="Filter: junior,senior,executive")
    p_enrich.add_argument("--department", help="Filter: executive,it,engineering,sales,etc.")
    p_enrich.add_argument("--limit", type=int, default=10, help="Max emails per domain")

    # run (scrape + enrich)
    p_run = sub.add_parser("run", help="Scrape + enrich in one shot")
    p_run.add_argument("--output", "-o", default="results.json", help="Output JSON path")
    p_run.add_argument("--api-key", help="Hunter.io API key")
    p_run.add_argument("--seniority", help="Filter: junior,senior,executive")
    p_run.add_argument("--department", help="Filter: executive,it,engineering,sales,etc.")
    p_run.add_argument("--limit", type=int, default=10, help="Max emails per domain")

    # search single domain
    p_search = sub.add_parser("search", help="Search a single domain")
    p_search.add_argument("--domain", "-d", required=True, help="Domain to search")
    p_search.add_argument("--api-key", help="Hunter.io API key")
    p_search.add_argument("--seniority", help="Filter: junior,senior,executive")
    p_search.add_argument("--department", help="Filter: executive,it,engineering,sales,etc.")
    p_search.add_argument("--limit", type=int, default=10, help="Max emails per domain")

    args = parser.parse_args()

    if args.command == "scrape":
        companies = scrape_oems(args.output)
        print(f"\nScraped {len(companies)} companies. Review {args.output} and add missing domains.")

    elif args.command == "enrich":
        api_key = get_api_key(args)
        with open(args.input) as f:
            data = json.load(f)
        companies = data.get("companies", data) if isinstance(data, dict) else data
        results = enrich_companies(
            companies, api_key, args.output,
            limit=args.limit, seniority=args.seniority, department=args.department,
        )
        print_results(results)

    elif args.command == "run":
        api_key = get_api_key(args)
        companies = scrape_oems("oems.json")
        results = enrich_companies(
            companies, api_key, args.output,
            limit=args.limit, seniority=args.seniority, department=args.department,
        )
        print_results(results)

    elif args.command == "search":
        api_key = get_api_key(args)
        search_single(
            args.domain, api_key,
            limit=args.limit, seniority=args.seniority, department=args.department,
        )


if __name__ == "__main__":
    main()
