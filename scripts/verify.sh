#!/usr/bin/env bash
# Phase 0 automated verification. Run: bash scripts/verify.sh
set -u
PASS=0
FAIL=0
SKIP=0

check() {
  local name="$1"; shift
  if "$@" > /dev/null 2>&1; then
    echo "  ✅ $name"
    PASS=$((PASS+1))
  else
    echo "  ❌ $name"
    FAIL=$((FAIL+1))
  fi
}

skip() { echo "  ⏭  $1 (manual)"; SKIP=$((SKIP+1)); }

echo "== Phase 0 Verification =="

echo "[Runtimes]"
check "python3 ≥ 3.10" python3 -c "import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)"
check "node ≥ 20"      node -e "process.exit(process.versions.node.split('.')[0] >= 20 ? 0 : 1)"
check "playwright"     bash -c "command -v playwright || python3 -c 'import playwright'"

echo "[Cookies present]"
check "LI cookies"     test -s tools/linkedin-research/.cookies.json
check "LII cookies"    test -s tools/linkedin-intel/.cookies.json
check "X cookies"      test -s tools/xresearch/.cookies.json

echo "[Tool scripts exist]"
check "li scraper"     test -f tools/linkedin-research/linkedin-research.py
check "lii scraper"    test -f tools/linkedin-intel/linkedin-scraper.py
check "x scraper"      test -f tools/xresearch/xresearch.py

echo "[API keys set]"
check "ANTHROPIC_API_KEY" test -n "${ANTHROPIC_API_KEY:-}"
check "RESEND_API_KEY"    test -n "${RESEND_API_KEY:-}"

echo "[Deploy tooling]"
check "fly CLI"        command -v fly
check "docker"         command -v docker

echo "[Live API smoke]"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  check "Anthropic 200" bash -c '
    code=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "x-api-key: $ANTHROPIC_API_KEY" \
      -H "anthropic-version: 2023-06-01" \
      -H "content-type: application/json" \
      https://api.anthropic.com/v1/messages \
      -d "{\"model\":\"claude-haiku-4-5-20251001\",\"max_tokens\":10,\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}")
    [ "$code" = "200" ]'
else
  skip "Anthropic live call"
fi

echo ""
echo "== Summary: $PASS pass / $FAIL fail / $SKIP skip =="
exit $FAIL
