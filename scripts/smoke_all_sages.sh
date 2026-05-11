#!/usr/bin/env bash
# smoke_all_sages.sh — 对每个 live sage 跑一次 /api/chat/stream
#                       验证非 corpus sage（v60.4.7 fallback）也能正常工作
#
# Usage:
#   ./scripts/smoke_all_sages.sh                                  # prod
#   ./scripts/smoke_all_sages.sh "你怎么看 AI 泡沫"                  # 自定义 query
#   BASE=http://localhost:3000 ./scripts/smoke_all_sages.sh        # 本地

set -u
BASE="${BASE:-https://sage-jury.vercel.app}"
QUERY="${1:-你怎么看现在的中概股}"
TIMEOUT=90

# v60.4 SAGES_RAW live list（tier != 'removed'，dan-bin/lao-tang/lin-yuan/wang-yawei 不含）
LIVE_SAGES=(
  duan-yongping guan-wo-cai feng-liu zhang-kun buffett qiu-guolu
  li-lu fenghe-wu deng-xiaofeng zhao-jun jiang-jinzhi chen-guangming
  xie-zhiyu ma-zibing yang-dong
)

PASS=0
FAIL=0
TOTAL=${#LIVE_SAGES[@]}

echo "smoke: $TOTAL sages × query='$QUERY' → $BASE"
echo

for s in "${LIVE_SAGES[@]}"; do
  TMP=$(mktemp)
  CODE=$(curl -s -o "$TMP" -w '%{http_code}' --max-time "$TIMEOUT" \
    -X POST "$BASE/api/chat/stream" \
    -H 'Content-Type: application/json' \
    -d "{\"sage_id\":\"$s\",\"message\":\"$QUERY\",\"history\":[]}")
  SIZE=$(wc -c < "$TMP")
  HAS_DONE=$(grep -c '^event: done' "$TMP" 2>/dev/null || echo 0)
  HAS_CHUNK=$(grep -c '^event: chunk' "$TMP" 2>/dev/null || echo 0)
  rm -f "$TMP"
  if [ "$CODE" = "200" ] && [ "$HAS_DONE" -ge 1 ] && [ "$HAS_CHUNK" -ge 1 ]; then
    PASS=$((PASS+1))
    printf '  ✅ %-20s http=%s size=%6d chunks=%d\n' "$s" "$CODE" "$SIZE" "$HAS_CHUNK"
  else
    FAIL=$((FAIL+1))
    printf '  ❌ %-20s http=%s size=%6d done=%d chunks=%d\n' "$s" "$CODE" "$SIZE" "$HAS_DONE" "$HAS_CHUNK"
  fi
done

echo
echo "Verdict: $PASS / $TOTAL sages live"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
