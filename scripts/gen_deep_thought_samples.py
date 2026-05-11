#!/usr/bin/env python3
"""
gen_deep_thought_samples.py — 从 deep_analysis_originals 池生成 deep_thought_samples.md

mining 脚本（mine_deep_posts.py）只填池子；这个脚本把池里的 top-N 转成
"v60 Analyst 模仿用的推理样本" md 文档。

用法：
    python3 scripts/gen_deep_thought_samples.py guan-wo-cai
    python3 scripts/gen_deep_thought_samples.py duan-yongping --top 8
    python3 scripts/gen_deep_thought_samples.py guan-wo-cai --dry-run

依赖：zhconv（python3.13 -m pip install --break-system-packages zhconv）。
        没装时退回手写映射，覆盖率约 70%。
"""

import argparse
import json
import os
import re
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
POOL_DIR = os.path.join(PROJECT_ROOT, 'public', 'sages-quotes')
SAGE_DIR = os.path.join(PROJECT_ROOT, 'public', 'sages')

try:
    from zhconv import convert as _zhconv
    def t2s(s): return _zhconv(s, 'zh-cn') if s else s
    _USING_ZHCONV = True
except ImportError:
    _USING_ZHCONV = False
    _TRAD = {  # fallback：常用 100+ 字字符级映射（不完美但能用）
        '進': '进', '當': '当', '個': '个', '對': '对', '時': '时', '後': '后', '業': '业',
        '長': '长', '實': '实', '過': '过', '經': '经', '現': '现', '歲': '岁', '選': '选',
        '點': '点', '體': '体', '還': '还', '麼': '么', '發': '发', '關': '关', '數': '数',
        '說': '说', '會': '会', '從': '从', '變': '变', '學': '学', '於': '于', '應': '应',
        '總': '总', '與': '与', '將': '将', '給': '给', '裡': '里', '圍': '围', '問': '问',
        '資': '资', '產': '产', '權': '权', '處': '处', '觀': '观', '聲': '声', '際': '际',
    }
    _TABLE = str.maketrans({k: v for k, v in _TRAD.items() if len(k) == 1})
    def t2s(s):
        if not s: return s
        s = s.replace('荒島', '荒岛')
        return s.translate(_TABLE)


def score(p):
    e = p.get('engagement') or {}
    return e.get('like', 0) + e.get('retweet', 0) * 3 + e.get('reply', 0) * 2 + p.get('importance', 0) * 5


THEME_RULES = [
    ('估值/分位', r'PE|估值|估價|價位|股價|價值|分位|貴|低估'),
    ('股息安全垫', r'股息|派息|分紅|分红|高息'),
    ('排雷', r'雷|商譽|商誉|負債|负债|現金流|现金流|大股東|大股东|質押|质押'),
    ('荒岛/长持', r'荒島|荒岛|長期|长期|十年|時間|时间'),
    ('卖出/换仓', r'清倉|清仓|止盈|止損|止损|換股|换股|賣出|卖出'),
    ('代表持仓', r'招商|招行|工行|工商|江南|首都機場|首都机场|騰訊|腾讯|物管|蘋果|苹果|网易|茅台'),
    ('AH/港股', r'A股|港股|H股|AH|溢價|溢价'),
    ('财务分析', r'業績|业绩|淨利|净利|收入|盈利|ROE'),
    ('仓位/分散', r'分散|集中|倉位|仓位|組合|组合'),
    ('能力圈', r'能力圈|看不懂|stop\s*doing|不懂不投'),
    ('商业模式', r'right\s*business|商业模式|商業模式|生意'),
]


def themes(text):
    tags = [tag for tag, pat in THEME_RULES if re.search(pat, text, re.I)]
    return tags or ['投资心法']


SAGE_DISPLAY = {
    'guan-wo-cai': '管我财',
    'duan-yongping': '段永平',
    'dan-bin': '但斌',
    'lao-tang': '老唐',
}


def build_md(slug: str, picked: list, max_chars: int = 2000):
    display = SAGE_DISPLAY.get(slug, slug)
    md = [
        f'# {display} · 真实深度推理样本（v60 Analyst 用）',
        '',
        f'以下是{display}在雪球的真实长帖（zhconv 繁→简全量转换），每条 500-2000 字，'
        '展示真实推理链路（数字 + 排雷 + 股息 + 案例对照）。',
        '',
        'Analyst LLM 在 5 维度分析时应**模仿这种密度**——具体数字、具体公司、具体年份，'
        '不要止于金句。',
        '',
        '---',
        '',
    ]
    for i, p in enumerate(picked, 1):
        text = t2s(p['text'])
        if len(text) > max_chars:
            text = text[:max_chars - 50] + '...\n（原文较长，已截取前部分）'
        e = p.get('engagement') or {}
        md.append(f'## 样本 {i} · {p.get("date","")} · 👍{e.get("like",0)}')
        md.append('')
        md.append(f'主题：{", ".join(themes(p["text"]))}')
        md.append('')
        quoted = '\n'.join('> ' + ln if ln.strip() else '>' for ln in text.split('\n'))
        md.append(quoted)
        md.append('')
        md.append('---')
        md.append('')
    return '\n'.join(md)


def run(slug, top, max_chars, dry_run):
    pool_path = os.path.join(POOL_DIR, f'{slug}.json')
    if not os.path.exists(pool_path):
        print(f'ERR: pool {pool_path} not found', file=sys.stderr)
        return 1
    with open(pool_path, 'r', encoding='utf-8') as f:
        pool = json.load(f)
    posts = pool.get('deep_analysis_originals') or []
    if not posts:
        print(f'ERR: empty deep_analysis_originals in {pool_path}', file=sys.stderr)
        return 2
    picked = sorted(posts, key=score, reverse=True)[:top]
    content = build_md(slug, picked, max_chars=max_chars)

    out_dir = os.path.join(SAGE_DIR, slug)
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'deep_thought_samples.md')

    print(f'[{slug}] {len(picked)} samples, {len(content)} chars '
          f'(zhconv={"yes" if _USING_ZHCONV else "fallback"})')
    print(f'[{slug}] dates: {[p["date"] for p in picked]}')
    print(f'[{slug}] likes: {[p["engagement"]["like"] for p in picked]}')
    if dry_run:
        print(f'[{slug}] dry-run, not writing')
        print(content[:500])
        return 0
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'[{slug}] wrote → {out_path}')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('slug', help='sage slug')
    ap.add_argument('--top', type=int, default=8, help='top N samples (default 8)')
    ap.add_argument('--max-chars', type=int, default=2000, help='per-sample truncation (default 2000)')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    return run(args.slug, args.top, args.max_chars, args.dry_run)


if __name__ == '__main__':
    sys.exit(main())
