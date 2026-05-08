#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "🏛️  Sage Jury — Deploying to Vercel"

if ! command -v vercel >/dev/null 2>&1; then
  echo "vercel CLI not found. Install with: npm i -g vercel"
  exit 1
fi

# 1. local sanity
echo "▶︎ Step 1: type check + build"
bun run build

# 2. deploy
echo "▶︎ Step 2: vercel --prod"
URL=$(vercel --prod --yes 2>&1 | tee /tmp/sage-jury-deploy.log | grep -E "https://" | tail -1 | sed 's/.* //')

echo "▶︎ Deployed: ${URL}"

# 3. fetch homepage to verify
echo "▶︎ Step 3: smoke test"
sleep 3
HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${URL}")
if [ "$HTTP" = "200" ]; then
  echo "✅ HTTP 200 — site is live"
else
  echo "⚠️  HTTP $HTTP — investigate"
fi

echo "${URL}" > /tmp/sage-jury-url.txt
echo "Deploy URL saved to /tmp/sage-jury-url.txt"
