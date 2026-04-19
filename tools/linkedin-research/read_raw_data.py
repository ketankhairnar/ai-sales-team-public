#!/usr/bin/env python3
"""
read_raw_data.py — Extract sections from linkedin_raw_data.json files.

Useful when JSON files are too large for Claude's Read tool (>25K tokens).

Usage:
    python read_raw_data.py <json_path> meta          # Print scrape metadata
    python read_raw_data.py <json_path> profile       # Print profile text
    python read_raw_data.py <json_path> activity      # Print activity text
    python read_raw_data.py <json_path> articles      # Print articles text
    python read_raw_data.py <json_path> all           # Print everything
    python read_raw_data.py <json_path> profile --start 0 --end 8000  # Slice text
"""

import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser(description="Extract sections from linkedin_raw_data.json")
    parser.add_argument("json_path", help="Path to linkedin_raw_data.json")
    parser.add_argument("section", choices=["meta", "profile", "activity", "articles", "all"],
                        help="Which section to extract")
    parser.add_argument("--start", type=int, default=0, help="Start character offset (for text sections)")
    parser.add_argument("--end", type=int, default=0, help="End character offset (0 = no limit)")
    args = parser.parse_args()

    try:
        with open(args.json_path) as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"Error: File not found: {args.json_path}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError:
        print(f"Error: Invalid JSON: {args.json_path}", file=sys.stderr)
        sys.exit(1)

    if args.section == "meta":
        print(json.dumps(data["meta"], indent=2))
    elif args.section == "all":
        print("=== META ===")
        print(json.dumps(data["meta"], indent=2))
        for key in ["profile_text", "activity_text", "articles_text"]:
            print(f"\n=== {key.upper()} ===")
            text = data.get(key, "")
            text = _slice(text, args.start, args.end)
            print(text)
    else:
        key = f"{args.section}_text"
        text = data.get(key, "")
        text = _slice(text, args.start, args.end)
        print(text)


def _slice(text: str, start: int, end: int) -> str:
    if end > 0:
        return text[start:end]
    elif start > 0:
        return text[start:]
    return text


if __name__ == "__main__":
    main()
