#!/usr/bin/env bash
# Copy secrets from .env to GitHub Actions of tdvchina/coloprice-social. Values are piped, never printed.
#   Instagram + Claude keys are required; X (Twitter) keys are pushed only when filled in .env.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=tdvchina/coloprice-social
val() { python3 -I -c "
import re,sys
for l in open('.env'):
    m=re.match(r'^\s*'+sys.argv[1]+r'\s*=\s*(.*)$',l)
    if m: sys.stdout.write(m.group(1).strip().strip('\"').strip(\"'\")); break
" "$1"; }
for k in IG_USER_ID IG_ACCESS_TOKEN CLAUDE_CODE_OAUTH_TOKEN; do
  v=$(val "$k"); [ -n "$v" ] || { echo "✗ $k is empty in .env"; exit 1; }
  printf '%s' "$v" | gh secret set "$k" -R "$REPO" && echo "✓ $k"
done
# X (Twitter): optional, skipped silently while empty
for k in X_API_KEY X_API_SECRET X_ACCESS_TOKEN X_ACCESS_SECRET; do
  v=$(val "$k"); [ -n "$v" ] || continue
  printf '%s' "$v" | gh secret set "$k" -R "$REPO" && echo "✓ $k"
done
h=$(val X_HANDLE); [ -z "$h" ] || { gh variable set X_HANDLE -R "$REPO" --body "${h#@}" >/dev/null && echo "✓ X_HANDLE (variable)"; }
gh variable set SLIDES_BASE_URL -R "$REPO" --body "https://raw.githubusercontent.com/tdvchina/coloprice-social/main/out" && echo "✓ SLIDES_BASE_URL (variable)"
gh secret list -R "$REPO"
