#!/usr/bin/env bash
# One venv per tool. Prevents dep conflicts.
set -e
for tool in linkedin-research linkedin-intel xresearch email-enrichment; do
  d="tools/$tool"
  if [ -f "$d/requirements.txt" ]; then
    echo "== Setting up venv: $d =="
    python3 -m venv "$d/.venv"
    "$d/.venv/bin/pip" install --quiet --upgrade pip
    "$d/.venv/bin/pip" install --quiet -r "$d/requirements.txt"
    "$d/.venv/bin/playwright" install chromium 2>/dev/null || true
    echo "  ✅ $tool ready (use $d/.venv/bin/python)"
  fi
done
