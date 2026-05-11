#!/usr/bin/env python3
"""
mine_deep_posts.py — 从 xueqiu-watcher sqlite 挖深度长帖入 deep_analysis_originals 池

v60 Analyst 阶段会读取 public/sages-quotes/{slug}.json 的 deep_analysis_originals 字段
作为"密度模板"。每条 sage 应有 30 条左右 500+ 字优质长帖。

用法：
    python3 scripts/mine_deep_posts.py guan-wo-cai
    python3 scripts/mine_deep_posts.py duan-yongping --top 30 --min-len 500
    python3 scripts/mine_deep_posts.py guan-wo-cai --dry-run  # 只打印不落盘
    python3 scripts/mine_deep_posts.py --all                  # 给所有有 sqlite 的 sage 跑一遍

约束：
- 复用本脚本即可给新 sage 补 deep pool（前提是 xueqiu_watcher 已抓过其 corpus）
- 同步写 public/ 和 data/ 两份（chat route 读 public，工作流脚本读 data）
- 粤语字过多的帖子跳过（>3% 粤字密度），SKILL.md 已要求简体输出
- 4-gram Jaccard 去重，避免同期同主题帖塞满前 30

退出码：0 成功；1 sqlite 不存在；2 池未变更（all candidates filtered out）
"""

import argparse
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone, timedelta

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQLITE_DIR = os.path.join(PROJECT_ROOT, 'data', 'xueqiu-watcher')
PUBLIC_POOL_DIR = os.path.join(PROJECT_ROOT, 'public', 'sages-quotes')
DATA_POOL_DIR = os.path.join(PROJECT_ROOT, 'data', 'sages-quotes')

CANTONESE_CHARS = set('嘅咗喺啲冇畀俾咁咩邊唔睇識點解唸啦呀喎吖')
TZ = timezone(timedelta(hours=8))


def cantonese_ratio(text: str) -> float:
    if not text:
        return 0.0
    n = sum(1 for ch in text if ch in CANTONESE_CHARS)
    return n / max(1, len(text))


def ngrams(s: str, n: int = 4):
    return set(s[i:i + n] for i in range(len(s) - n + 1))


def is_diverse(text: str, picked: list, threshold: float = 0.65) -> bool:
    a = ngrams(text[:500])
    if not a:
        return True
    for p in picked:
        b = ngrams(p['text'][:500])
        if not b:
            continue
        inter = len(a & b)
        union = len(a | b)
        if union and inter / union > threshold:
            return False
    return True


def quality_score(text: str) -> int:
    """0-4 分质量评分（用于过滤敷衍帖）"""
    if not text:
        return 0
    has_numbers = bool(re.search(r'\d+(?:\.\d+)?(?:%|倍|股|港元|元|亿|万|块|港)', text))
    has_stock = bool(re.search(r'\$|腾讯|招行|工行|茅台|物管|港交|滙丰|阿里|苹果|网易', text))
    has_struct = bool(re.search(r'第一|第二|首先|其次|然而|不过|关键|更重要|总结|结论', text))
    not_thin = len(text) >= 600
    return sum([has_numbers, has_stock, has_struct, not_thin])


def fetch_candidates(slug: str, min_len: int, fetch_cap: int = 80):
    sqlite_path = os.path.join(SQLITE_DIR, f'{slug}.sqlite')
    if not os.path.exists(sqlite_path):
        return None
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    rows = c.execute(f'''
        SELECT id, timestamp, created_at, text, like_count, reply_count, retweet_count,
               view_count, text_length, importance_score, post_type
        FROM posts
        WHERE text_length >= ?
          AND text IS NOT NULL
          AND (post_type IS NULL OR post_type NOT IN ('pure_retweet'))
        ORDER BY (
          COALESCE(like_count, 0) +
          COALESCE(retweet_count, 0) * 3 +
          COALESCE(reply_count, 0) * 2 +
          COALESCE(importance_score, 0) * 5
        ) DESC
        LIMIT ?
    ''', (min_len, fetch_cap)).fetchall()
    conn.close()
    return rows


def to_pool_entry(row):
    ts = row['timestamp'] or 0
    if ts > 1e12:
        d = datetime.fromtimestamp(ts / 1000, tz=TZ).strftime('%Y-%m-%d')
    elif ts > 1e9:
        d = datetime.fromtimestamp(ts, tz=TZ).strftime('%Y-%m-%d')
    else:
        d = row['created_at'] or ''
    return {
        'id': row['id'],
        'date': d,
        'ts': ts,
        'text': row['text'],
        'engagement': {
            'like': row['like_count'] or 0,
            'reply': row['reply_count'] or 0,
            'retweet': row['retweet_count'] or 0,
        },
        'importance': row['importance_score'] or 0,
    }


def mine(slug: str, top: int, min_len: int, max_cantonese: float, min_quality: int, dry_run: bool):
    rows = fetch_candidates(slug, min_len)
    if rows is None:
        print(f'[{slug}] ERR: sqlite not found at {SQLITE_DIR}/{slug}.sqlite', file=sys.stderr)
        return 1

    if not rows:
        print(f'[{slug}] ERR: no candidates (min_len={min_len})', file=sys.stderr)
        return 2

    picked = []
    skipped_cantonese = skipped_dup = skipped_quality = 0
    for r in rows:
        if len(picked) >= top:
            break
        text = r['text'] or ''
        if cantonese_ratio(text) > max_cantonese:
            skipped_cantonese += 1
            continue
        if quality_score(text) < min_quality:
            skipped_quality += 1
            continue
        if not is_diverse(text, picked):
            skipped_dup += 1
            continue
        picked.append(to_pool_entry(r))

    print(f'[{slug}] candidates={len(rows)} picked={len(picked)} '
          f'(skipped cantonese={skipped_cantonese} quality={skipped_quality} dup={skipped_dup})')
    if not picked:
        return 2
    print(f'[{slug}] date range: {min(p["date"] for p in picked)} → {max(p["date"] for p in picked)}')
    print(f'[{slug}] top 3 by likes:')
    for p in sorted(picked, key=lambda x: x['engagement']['like'], reverse=True)[:3]:
        print(f'  [{p["date"]} 👍{p["engagement"]["like"]}] {p["text"][:60]}...')

    if dry_run:
        print(f'[{slug}] dry-run, not writing')
        return 0

    now_iso = datetime.now(TZ).isoformat()
    for pool_dir in (PUBLIC_POOL_DIR, DATA_POOL_DIR):
        path = os.path.join(pool_dir, f'{slug}.json')
        if not os.path.exists(path):
            continue
        with open(path, 'r', encoding='utf-8') as f:
            pool = json.load(f)
        pool['deep_analysis_originals'] = picked
        pool['_deep_pool_added_at'] = now_iso
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(pool, f, ensure_ascii=False, indent=2)
        print(f'[{slug}] wrote {len(picked)} entries → {path}')
    return 0


def find_all_slugs():
    if not os.path.isdir(SQLITE_DIR):
        return []
    return sorted(
        f[:-len('.sqlite')] for f in os.listdir(SQLITE_DIR)
        if f.endswith('.sqlite') and not f.endswith('.sqlite-journal')
    )


def main():
    ap = argparse.ArgumentParser(description='Mine deep_analysis_originals pool for v60 Analyst')
    ap.add_argument('slug', nargs='?', help='sage slug (e.g. guan-wo-cai); omit if --all')
    ap.add_argument('--all', action='store_true', help='process all sages with sqlite')
    ap.add_argument('--top', type=int, default=30, help='top N to pick (default 30)')
    ap.add_argument('--min-len', type=int, default=500, help='min text length (default 500)')
    ap.add_argument('--max-cantonese', type=float, default=0.03,
                    help='max cantonese ratio (default 0.03)')
    ap.add_argument('--min-quality', type=int, default=2,
                    help='min quality score 0-4 (default 2 = need numbers + stock OR struct OR length)')
    ap.add_argument('--dry-run', action='store_true', help="print picks but don't write")
    args = ap.parse_args()

    if args.all:
        slugs = find_all_slugs()
        if not slugs:
            print('ERR: no sqlite found in', SQLITE_DIR, file=sys.stderr)
            return 1
        print(f'processing {len(slugs)} sages: {", ".join(slugs)}')
        rcs = [mine(s, args.top, args.min_len, args.max_cantonese, args.min_quality, args.dry_run)
               for s in slugs]
        return max(rcs)

    if not args.slug:
        ap.error('slug required (or use --all)')
    return mine(args.slug, args.top, args.min_len, args.max_cantonese, args.min_quality, args.dry_run)


if __name__ == '__main__':
    sys.exit(main())
