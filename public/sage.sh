#!/usr/bin/env bash
# sage — Sage Jury CLI (single + batch mode)
# 用法:
#   sage 600519                     # 单股完整判决
#   sage 600519 000858 300750       # 批量自选股排序
#   sage --pe < 15 600519 ...       # 仅过滤后展示（暂未实现）
#
# 安装:
#   curl -fsSL https://sage-jury.vercel.app/sage > /tmp/sage
#   chmod +x /tmp/sage && sudo mv /tmp/sage /usr/local/bin/sage

set -e
URL="${SAGE_JURY_URL:-https://sage-jury.vercel.app}"

# Color
B="\033[1m"; D="\033[2m"; G="\033[32m"; Y="\033[33m"; R="\033[31m"; C="\033[36m"; N="\033[0m"

if [ "$#" -eq 0 ]; then
  cat <<EOF
🏛️  Sage Jury CLI · v2

用法:
  sage 600519                     单股完整判决（8 大佬逐一意见）
  sage 600519 000858 300750       批量按综合分排序
  sage 600519 002594 600036       自选股扫描

  环境变量: SAGE_JURY_URL (默认: https://sage-jury.vercel.app)

示例:
  sage 600519                     # 茅台
  sage 000858 600519 600809       # 三大白酒龙头
  sage 002594 300750 600036       # 比亚迪/宁德/招行
EOF
  exit 0
fi

# Single ticker → detailed
if [ "$#" -eq 1 ]; then
  TICKER="$1"
  echo -e "${D}fetching $TICKER from $URL...${N}"
  RESP=$(curl -fsSL "$URL/api/lookup?ticker=$TICKER" 2>&1)
  if [ -z "$RESP" ]; then
    echo -e "${R}❌ 未能获取${N}"; exit 1
  fi

  echo "$RESP" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if 'error' in d:
  print(f\"\\033[31m❌ {d['error']}\\033[0m\")
  sys.exit(1)
f = d.get('fetched', {})
r = d.get('report', {})
print()
print(f\"\\033[1m📋 案件: {f.get('name')} ({d.get('ticker')})\\033[0m\")
print(f\"\\033[2m   {d.get('inferredFromIndustry') or '?'} · PE {f.get('pe')} · PB {f.get('pb')} · ¥{f.get('lastPrice')}\\033[0m\")
print()
score = r.get('consensusScore', 0)
label = r.get('consensusLabel', '')
agree = r.get('agreementLevel', '')
color = '\\033[32m' if score >= 60 else ('\\033[33m' if score >= 40 else '\\033[31m')
print(f\"⚖️  陪审团综合判决: {color}{score}/100\\033[0m  |  {label}  |  {agree}\")
print()
print(f\"\\033[1m{'陪审员':<10} {'等级':<5} {'分数':<7} {'判决':<14}\\033[0m\")
print('─' * 60)
for v in r.get('verdicts', []):
  s = v['finalScore']
  c = '\\033[32m' if s >= 75 else ('\\033[36m' if s >= 60 else ('\\033[33m' if s >= 45 else '\\033[31m'))
  print(f\"{v['sageName']:<10} {c}{v['letterGrade']:<5}{s:<7}\\033[0m {v['verdictLabel']}\")
  print(f\"\\033[2m           └ {v['oneLine']}\\033[0m\")
print()
print(f\"\\033[2m📜 {r.get('finalJudgment')}\\033[0m\")
print()
print(f\"\\033[2m🔗 https://sage-jury.vercel.app/stock/{d.get('ticker')}\\033[0m\")
"
  exit 0
fi

# Batch mode: multiple tickers → table sorted by score
echo -e "${D}fetching ${#} tickers from $URL...${N}"
echo

# Build a python script that fetches all and prints a table
TICKERS_JSON=$(printf '"%s",' "$@" | sed 's/,$//')

python3 -c "
import json, sys, urllib.request
URL = '$URL'
tickers = [$TICKERS_JSON]
rows = []
for t in tickers:
    try:
        with urllib.request.urlopen(f'{URL}/api/lookup?ticker={t}', timeout=15) as r:
            d = json.loads(r.read())
        f = d.get('fetched', {})
        rep = d.get('report', {})
        rows.append({
            'ticker': t,
            'name': f.get('name', t),
            'industry': d.get('inferredFromIndustry') or '?',
            'pe': f.get('pe'),
            'pb': f.get('pb'),
            'score': rep.get('consensusScore', 0),
            'label': rep.get('consensusLabel', '').split(' · ')[0],
            'agree': rep.get('agreementLevel', '?'),
            'topPro': rep.get('topPro', '?'),
        })
    except Exception as e:
        rows.append({'ticker': t, 'name': t, 'error': str(e)[:30]})

rows.sort(key=lambda r: r.get('score', 0) if 'score' in r else -1, reverse=True)

print(f\"\\033[1m{'#':<3}{'股票':<10}{'代码':<9}{'行业':<7}{'PE':<8}{'PB':<7}{'综合':<6}{'共识':<14}{'判决':<10}\\033[0m\")
print('─' * 80)
for i, r in enumerate(rows, 1):
    if 'error' in r:
        print(f\"\\033[31m{i:<3}{r['name']:<10}{r['ticker']:<9} ERROR: {r['error']}\\033[0m\")
        continue
    s = r['score']
    c = '\\033[32m' if s >= 75 else ('\\033[36m' if s >= 60 else ('\\033[33m' if s >= 45 else '\\033[31m'))
    pe = f\"{r['pe']:.1f}\" if r.get('pe') else '-'
    pb = f\"{r['pb']:.2f}\" if r.get('pb') else '-'
    print(f\"{i:<3}{r['name']:<8}{r['ticker']:<9}{r['industry']:<7}{pe:<8}{pb:<7}{c}{s:<6}\\033[0m{r['agree']:<14}{r['label']}\")

valid = [r for r in rows if 'score' in r]
buy = sum(1 for r in valid if r['score'] >= 60)
watch = sum(1 for r in valid if 40 <= r['score'] < 60)
avoid = sum(1 for r in valid if r['score'] < 40)
print()
print(f\"\\033[32m  看好 {buy}\\033[0m | \\033[33m观望 {watch}\\033[0m | \\033[31m回避 {avoid}\\033[0m\")
print(f\"\\033[2m  → 在网页查看: $URL/watchlist?codes=\" + ','.join(tickers) + '\\033[0m')
"
