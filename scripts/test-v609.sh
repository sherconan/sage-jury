#!/usr/bin/env bash
# v60.9 4-query 验证脚本
# 测试矩阵：
#   1. 苹果 (duan)   — 能力圈内，验证 EY vs 国债 算账 + 传记锚
#   2. 隆基 (duan)   — 能力圈外，验证 too_hard 出口 + "太难篮子"
#   3. 江南布衣 (guan) — 港股，验证粤字归一 + 排雷+股息维度
#   4. 苹果 (guan)   — 跨域，验证"那是段永平角度" 踢球

set -e
HOST="${1:-https://sage-jury.vercel.app}"
echo "=== Testing v60.9 at $HOST ==="

run_query() {
  local sage="$1" msg="$2" label="$3"
  echo ""
  echo "─────────────────────────────────────────────"
  echo "[$label] $sage <- $msg"
  echo "─────────────────────────────────────────────"
  local resp
  resp=$(curl -sS -X POST "$HOST/api/chat/v2/stream" \
    -H "Content-Type: application/json" \
    --max-time 120 \
    -d "{\"sage_id\":\"$sage\",\"message\":\"$msg\"}" 2>&1)
  # 提取 verdict
  echo "$resp" | grep -E '^data:' | python3 -c "
import sys,json
chunks=[]
verdict=None
done=None
strip=None
for line in sys.stdin:
  if not line.startswith('data:'): continue
  try:
    j=json.loads(line[5:].strip())
    if 'signal' in j and 'dims' in j: verdict=j
    if 'fullReply' in j: done=j
    if 'stripped_chars' in j and 'signal' not in j: strip=j
    if 'delta' in j: chunks.append(j['delta'])
  except: pass
if verdict:
  print(f'  signal={verdict.get(\"signal\")} conf={verdict.get(\"confidence\")}')
  print(f'  top_concerns={verdict.get(\"top_concerns\",[])}')
if done:
  reply=done['fullReply']
  print(f'  reply ({len(reply)}字):')
  print('  '+reply.replace(chr(10),chr(10)+'  '))
  print(f'  data_errors={done.get(\"data_errors\",[])}')
  print(f'  history_used={done.get(\"history_used\")}')
"
}

run_query duan-yongping "苹果还能拿吗" "T1-Apple-Duan"
run_query duan-yongping "隆基怎么样" "T2-Longi-Duan-OOC"
run_query guan-wo-cai "江南布衣还能买吗" "T3-JNBY-Guan"
run_query guan-wo-cai "苹果你怎么看" "T4-Apple-Guan-Cross"

echo ""
echo "=== Done ==="
