#!/usr/bin/env python3
"""
RAG-friendly 导出 sage 数据
==========================
从 ~/sage-jury/data/xueqiu-watcher/<slug>.sqlite 读出经过 data_governance 打标的 posts，
导出为 sage-jury/data/sages-quotes/<slug>.json，供 /api/battle 的 RAG 检索使用。

关键设计：
- by_stock 同时用「中文别名」和「股票代码」做 key（解决"泡泡玛特" vs "09992"匹配问题）
- by_concept 用方法论概念做 key
- high_quality_originals 取原创且高赞的 top 200
- recent_originals 取最近 60 天的原创
- position_changes 取所有 has_position_change=1 的
"""
import sqlite3, json, os, re, sys
from pathlib import Path
from datetime import datetime as dt, timedelta

DATA_DIR = Path.home() / "sage-jury/data/xueqiu-watcher"
OUT_DIR  = Path.home() / "sage-jury/data/sages-quotes"

SAGES = {
    "duan-yongping": {"display": "段永平", "alias": "大道无形我有型",
                      "philosophy": "本分 / 不懂不投 / 看十年 / stop doing list"},
    "guan-wo-cai":   {"display": "管我财", "alias": "管我财",
                      "philosophy": "低估逆向平均赢 / 排雷排千平常心 / 定量估值"},
}

# 反向：从 STOCK_ALIASES 拿到 中文名 ↔ 代码 双向映射
sys.path.insert(0, str(Path(__file__).parent))
from data_governance import STOCK_ALIASES  # type: ignore

# 反向字典：代码 → [所有别名]（含中文名）
CODE_TO_ALIASES: dict[str, list[str]] = {}
for alias, code in STOCK_ALIASES.items():
    CODE_TO_ALIASES.setdefault(code, []).append(alias)


def make_quote(r):
    """r: (id, timestamp, text, like_count, retweet_count, url)"""
    id_, ts, text, lk, rt, url = r
    d = dt.fromtimestamp(ts/1000) if ts else None
    return {
        "id": id_,
        "date": d.strftime("%Y-%m-%d") if d else "?",
        "ts": ts,
        "text": (text or "").replace("\n", " ").strip()[:600],
        "likes": lk or 0,
        "rt": rt or 0,
        "url": url or "",
    }


def export_sage(slug: str):
    db = DATA_DIR / f"{slug}.sqlite"
    if not db.exists():
        print(f"⚠️  {db} 不存在")
        return
    info = SAGES[slug]
    conn = sqlite3.connect(str(db))
    conn.row_factory = None

    total = conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
    print(f"📂 {slug}  共 {total} 条 post")

    # 1. high_quality_originals：原创 + 高赞 top 200
    high_quality = conn.execute("""
        SELECT id, timestamp, text, like_count, retweet_count, url
        FROM posts
        WHERE post_type = 'original' AND like_count >= 30
        ORDER BY importance_score DESC, like_count DESC
        LIMIT 200
    """).fetchall()

    # 2. recent_originals：最近 90 天原创 + 回复（包括含股票讨论）
    cutoff = int((dt.now() - timedelta(days=90)).timestamp() * 1000)
    recent = conn.execute("""
        SELECT id, timestamp, text, like_count, retweet_count, url
        FROM posts
        WHERE timestamp > ? AND text_length > 30
        ORDER BY timestamp DESC
        LIMIT 300
    """, (cutoff,)).fetchall()

    # 3. position_changes：买卖换仓记录
    pos_changes = conn.execute("""
        SELECT id, timestamp, text, like_count, retweet_count, url
        FROM posts
        WHERE has_position_change = 1
        ORDER BY timestamp DESC
        LIMIT 300
    """).fetchall()

    # 4. by_stock 字典：每个股票最相关的 top 20 发言
    #    ⭐ 关键：同时用 代码 和 中文别名 做 key（解决泡泡玛特问题）
    by_stock: dict[str, list] = {}
    code_rows = conn.execute("""
        SELECT mention_codes, id, timestamp, text, like_count, retweet_count, url
        FROM posts
        WHERE mention_codes != '' AND mention_codes IS NOT NULL
        ORDER BY importance_score DESC, like_count DESC
    """).fetchall()
    for row in code_rows:
        codes_str = row[0]
        post_data = (row[1], row[2], row[3], row[4], row[5], row[6])
        for code in codes_str.split(","):
            code = code.strip()
            if not code: continue
            # 用代码做 key
            by_stock.setdefault(code, []).append(post_data)
            # 用所有中文别名也做 key（核心修复）
            for alias in CODE_TO_ALIASES.get(code, []):
                if not alias.isupper() or len(alias) > 4:  # 跳过纯英文 ticker（已经用代码做 key）
                    by_stock.setdefault(alias, []).append(post_data)
    # 截取 top 20
    by_stock = {k: [make_quote(r) for r in v[:20]] for k, v in by_stock.items()}

    # 5. by_concept 字典
    by_concept: dict[str, list] = {}
    concept_rows = conn.execute("""
        SELECT concepts, id, timestamp, text, like_count, retweet_count, url
        FROM posts
        WHERE concepts != '' AND concepts IS NOT NULL
        ORDER BY importance_score DESC, like_count DESC
    """).fetchall()
    for row in concept_rows:
        for con in row[0].split(","):
            con = con.strip()
            if not con: continue
            by_concept.setdefault(con, []).append((row[1], row[2], row[3], row[4], row[5], row[6]))
    by_concept = {k: [make_quote(r) for r in v[:15]] for k, v in by_concept.items()}

    out = {
        "slug": slug,
        "display": info["display"],
        "alias": info["alias"],
        "philosophy": info["philosophy"],
        "total_posts": total,
        "fetched_at": dt.now().strftime("%Y-%m-%d %H:%M:%S"),
        "high_quality_originals": [make_quote(r) for r in high_quality],
        "recent_originals":       [make_quote(r) for r in recent],
        "position_changes":       [make_quote(r) for r in pos_changes],
        "by_stock":               by_stock,
        "by_concept":             by_concept,
    }
    out_path = OUT_DIR / f"{slug}.json"
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"  ✓ {out_path}  ({out_path.stat().st_size//1024}KB)")
    print(f"  by_stock keys (示例): {list(by_stock.keys())[:8]}")
    print(f"  '泡泡玛特' in by_stock? {'泡泡玛特' in by_stock} (条数: {len(by_stock.get('泡泡玛特', []))})")
    print(f"  position_changes: {len(out['position_changes'])} 条")
    conn.close()


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    if arg == "all":
        for s in SAGES: export_sage(s)
    else:
        export_sage(arg)


if __name__ == "__main__":
    main()
