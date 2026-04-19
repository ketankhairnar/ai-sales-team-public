#!/usr/bin/env python3
"""Quick script to check email counts for all OEM domains via Hunter.io (free, no API key needed)."""

import json
import time
import requests

with open("plugins/email-enrichment/oems.json") as f:
    data = json.load(f)

print(f"{'Company':<25} {'Domain':<30} {'Emails':>6}")
print("-" * 65)

total = 0
hits = 0
for c in data["companies"]:
    domain = c["domain"]
    name = c["name"]
    try:
        resp = requests.get(
            "https://api.hunter.io/v2/email-count",
            params={"domain": domain},
            timeout=10,
        )
        count = resp.json().get("data", {}).get("total", 0) if resp.status_code == 200 else -1
    except Exception:
        count = -1

    marker = " <--" if count > 0 else ""
    print(f"{name:<25} {domain:<30} {count:>6}{marker}")
    if count > 0:
        total += count
        hits += 1
    time.sleep(0.3)

print("-" * 65)
print(f"{hits} companies with emails, {total} total emails available")
