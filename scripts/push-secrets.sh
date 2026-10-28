#!/usr/bin/env bash
# Copy secrets from .env to GitHub Actions of tdvchina/coloprice-social. Values are piped, never printed.
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
gh variable set SLIDES_BASE_URL -R "$REPO" --body "https://raw.githubusercontent.com/tdvchina/coloprice-social/main/out" && echo "✓ SLIDES_BASE_URL (variable)"
gh secret list -R "$REPO"
