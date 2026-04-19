#!/usr/bin/env python3
"""
github_users.py — Extract user info (email, company, bio, twitter) from GitHub repos.

Mines contributors, stargazers, and forkers of a given repo.
Uses GitHub API (unauthenticated: 60 req/hr, with token: 5000 req/hr).

Usage:
    # Get contributors + stargazers for a repo
    python github_users.py --repo kingjulio8238/humanoid-atlas

    # With GitHub token for higher rate limits
    python github_users.py --repo kingjulio8238/humanoid-atlas --token ghp_xxx

    # Also mine stargazers (can be large)
    python github_users.py --repo kingjulio8238/humanoid-atlas --stargazers

    # Save to file
    python github_users.py --repo kingjulio8238/humanoid-atlas --output users.json

    # Get emails from git log (requires cloning — most reliable for emails)
    python github_users.py --repo kingjulio8238/humanoid-atlas --git-log

Environment:
    GITHUB_TOKEN — GitHub personal access token (optional, for higher rate limits)
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone

try:
    import requests
except ImportError:
    print("pip install requests", file=sys.stderr)
    sys.exit(1)


GITHUB_API = "https://api.github.com"


def gh_get(path: str, token: str | None = None, params: dict = None) -> list | dict:
    """GitHub API GET with pagination support."""
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    results = []
    url = f"{GITHUB_API}{path}" if path.startswith("/") else path

    while url:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        params = None  # only use params on first request

        if resp.status_code == 403:
            reset = resp.headers.get("X-RateLimit-Reset")
            if reset:
                wait = max(int(reset) - int(time.time()), 1)
                print(f"  Rate limited. Resets in {wait}s. Use --token for 5000 req/hr.", file=sys.stderr)
            return results
        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
            return results

        data = resp.json()
        if isinstance(data, list):
            results.extend(data)
        else:
            return data  # single object response

        # Follow pagination
        link = resp.headers.get("Link", "")
        url = None
        for part in link.split(","):
            if 'rel="next"' in part:
                url = part.split(";")[0].strip().strip("<>")
                break

        remaining = resp.headers.get("X-RateLimit-Remaining", "?")
        if isinstance(remaining, str) and remaining.isdigit() and int(remaining) < 5:
            print(f"  Warning: only {remaining} API requests remaining.", file=sys.stderr)

    return results


def get_user_details(username: str, token: str | None = None) -> dict:
    """Fetch full user profile (includes email, company, bio, twitter)."""
    data = gh_get(f"/users/{username}", token)
    if not isinstance(data, dict):
        return {}
    return {
        "username": data.get("login"),
        "name": data.get("name"),
        "email": data.get("email"),
        "company": data.get("company"),
        "bio": data.get("bio"),
        "twitter": data.get("twitter_username"),
        "blog": data.get("blog"),
        "location": data.get("location"),
        "public_repos": data.get("public_repos"),
        "followers": data.get("followers"),
        "profile": data.get("html_url"),
    }


def get_contributors(repo: str, token: str | None = None) -> list[str]:
    """Get contributor usernames for a repo."""
    contributors = gh_get(f"/repos/{repo}/contributors", token, params={"per_page": 100})
    return [c["login"] for c in contributors if isinstance(c, dict) and "login" in c]


def get_stargazers(repo: str, token: str | None = None, max_pages: int = 5) -> list[str]:
    """Get stargazer usernames (paginated, capped)."""
    all_users = []
    page = 1
    while page <= max_pages:
        stars = gh_get(f"/repos/{repo}/stargazers", token, params={"per_page": 100, "page": page})
        if not stars:
            break
        all_users.extend(s["login"] for s in stars if isinstance(s, dict) and "login" in s)
        page += 1
    return all_users


def get_forkers(repo: str, token: str | None = None) -> list[str]:
    """Get usernames of people who forked the repo."""
    forks = gh_get(f"/repos/{repo}/forks", token, params={"per_page": 100})
    return [f["owner"]["login"] for f in forks if isinstance(f, dict) and "owner" in f]


def get_git_log_emails(repo: str) -> list[dict]:
    """Clone repo and extract unique author emails from git log."""
    with tempfile.TemporaryDirectory() as tmpdir:
        clone_url = f"https://github.com/{repo}.git"
        print(f"  Cloning {repo} for git log emails ...")
        result = subprocess.run(
            ["git", "clone", "--bare", "--quiet", clone_url, f"{tmpdir}/repo.git"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            print(f"  Clone failed: {result.stderr[:200]}", file=sys.stderr)
            return []

        result = subprocess.run(
            ["git", "--git-dir", f"{tmpdir}/repo.git", "log", "--format=%an|%ae", "--all"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return []

        seen = set()
        emails = []
        for line in result.stdout.strip().split("\n"):
            if "|" not in line:
                continue
            name, email = line.split("|", 1)
            if email in seen or "noreply" in email:
                continue
            seen.add(email)
            emails.append({"name": name.strip(), "email": email.strip(), "source": "git-log"})

        return emails


def main():
    parser = argparse.ArgumentParser(description="Extract user info from GitHub repos")
    parser.add_argument("--repo", "-r", required=True, help="GitHub repo (owner/name)")
    parser.add_argument("--token", "-t", help="GitHub token (or set GITHUB_TOKEN)")
    parser.add_argument("--stargazers", action="store_true", help="Also mine stargazers")
    parser.add_argument("--max-star-pages", type=int, default=5, help="Max stargazer pages (100/page)")
    parser.add_argument("--git-log", action="store_true", help="Clone and extract git log emails")
    parser.add_argument("--output", "-o", help="Save results to JSON file")

    args = parser.parse_args()
    token = args.token or os.environ.get("GITHUB_TOKEN")

    if not token:
        print("Note: No GitHub token. Rate limit = 60 requests/hour. Use --token for 5000/hr.\n")

    all_usernames = set()
    sources = {}

    # Contributors
    print(f"Fetching contributors for {args.repo} ...")
    contributors = get_contributors(args.repo, token)
    print(f"  {len(contributors)} contributors")
    for u in contributors:
        all_usernames.add(u)
        sources[u] = "contributor"

    # Forkers
    print(f"Fetching forkers ...")
    forkers = get_forkers(args.repo, token)
    print(f"  {len(forkers)} forkers")
    for u in forkers:
        if u not in all_usernames:
            all_usernames.add(u)
            sources[u] = "forker"

    # Stargazers (optional, can be large)
    if args.stargazers:
        print(f"Fetching stargazers (up to {args.max_star_pages * 100}) ...")
        stargazers = get_stargazers(args.repo, token, args.max_star_pages)
        print(f"  {len(stargazers)} stargazers")
        for u in stargazers:
            if u not in all_usernames:
                all_usernames.add(u)
                sources[u] = "stargazer"

    # Fetch full profiles
    print(f"\nFetching {len(all_usernames)} user profiles ...")
    users = []
    for i, username in enumerate(sorted(all_usernames), 1):
        print(f"  [{i}/{len(all_usernames)}] {username} ...", end=" ")
        details = get_user_details(username, token)
        if details:
            details["source"] = sources.get(username, "unknown")
            users.append(details)
            email_str = details.get("email") or "-"
            company_str = details.get("company") or "-"
            print(f"{email_str} | {company_str}")
        else:
            print("(failed)")
        time.sleep(0.5 if token else 1.5)  # respect rate limits

    # Git log emails
    git_emails = []
    if args.git_log:
        print(f"\nExtracting emails from git log ...")
        git_emails = get_git_log_emails(args.repo)
        print(f"  {len(git_emails)} unique emails from git log")

    # Print summary
    print("\n" + "=" * 90)
    print(f"{'Username':<20} {'Name':<20} {'Email':<30} {'Company':<20}")
    print("-" * 90)

    users_with_email = 0
    for u in users:
        email = u.get("email") or ""
        if email:
            users_with_email += 1
        name = (u.get("name") or "")[:19]
        company = (u.get("company") or "")[:19]
        print(f"{u['username']:<20} {name:<20} {email:<30} {company:<20}")

    if git_emails:
        print(f"\n--- Git Log Emails ---")
        for e in git_emails:
            print(f"  {e['name']:<30} {e['email']}")

    print("-" * 90)
    print(f"Total: {len(users)} users, {users_with_email} with public email, {len(git_emails)} from git log")
    print("=" * 90)

    # Save
    if args.output:
        with open(args.output, "w") as f:
            json.dump({
                "repo": args.repo,
                "extracted_at": datetime.now(timezone.utc).isoformat(),
                "users": users,
                "git_log_emails": git_emails,
                "summary": {
                    "total_users": len(users),
                    "with_email": users_with_email,
                    "git_log_emails": len(git_emails),
                },
            }, f, indent=2)
        print(f"\nSaved to {args.output}")


if __name__ == "__main__":
    main()
