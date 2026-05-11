#!/usr/bin/env python3
"""
把雪球大V发言导出到 Obsidian vault
- 路径: ~/Obsidian/Metsherconan/雪球大佬发言/<sage>/<year>/<month>.md
- 每月 1 个 md（避免文件过多）
- 加 frontmatter（YAML metadata for Obsidian Dataview）
- 关键词自动 [[link]]：股票名 / 公司名 / 重要概念
- Index 文件：~/Obsidian/Metsherconan/雪球大佬发言/index.md (按年汇总)
"""
import sqlite3, sys, os, re
from pathlib import Path
from datetime import datetime as dt
from collections import defaultdict

OBSIDIAN_DIR = Path.home() / "Obsidian/Metsherconan/雪球大佬发言"
DATA_DIR = Path.home() / "sage-jury/data/xueqiu-watcher"

SAGES = {
    "duan-yongping": {"display": "段永平", "alias": "大道无形我有型", "school": "价值派 · 能力圈"},
    "guan-wo-cai":   {"display": "管我财", "alias": "管我财", "school": "价值派 · 低估逆向定量"},
    "lao-tang":      {"display": "唐朝", "alias": "老唐", "school": "老唐估值法"},
    "dan-bin":       {"display": "但斌", "alias": "但斌", "school": "时间的玫瑰"},
}

# 自动加 [[link]] 的关键词（股票 + 概念）
LINK_TERMS = [
    "茅台", "贵州茅台", "腾讯", "苹果", "AAPL", "特斯拉", "TSLA", "BABA", "阿里",
    "宁德时代", "比亚迪", "拼多多", "PDD", "网易", "NTES", "拼多多", "海康威视",
    "泡泡玛特", "神华", "中石油", "招商银行", "美的", "格力", "片仔癀", "云南白药",
    "护城河", "能力圈", "复利", "现金流", "FCF", "ROE", "ROIC", "PE", "PB",
    "价值投资", "本分", "stop doing list",
]


def clean_md(s: str) -> str:
    """清理 markdown 不友好的字符"""
    if not s: return ""
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"&nbsp;", " ", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def add_links(text: str) -> str:
    """给关键词加 [[link]]"""
    for term in LINK_TERMS:
        # 只链接独立词，不重复
        text = re.sub(rf"(?<![\[\w]){re.escape(term)}(?![\w\]])", f"[[{term}]]", text, count=1)
    return text


def export_sage(slug: str, info: dict):
    db_path = DATA_DIR / f"{slug}.sqlite"
    if not db_path.exists():
        print(f"  ⚠️  {db_path} 不存在，跳过")
        return 0
    conn = sqlite3.connect(str(db_path))
    rows = conn.execute("""SELECT id, timestamp, text, retweet_count, reply_count, like_count, view_count, url,
                                  rt_id, rt_user_name, rt_title, rt_text, rt_url, rt_created_at
                           FROM posts WHERE timestamp > 0 ORDER BY timestamp ASC""").fetchall()
    conn.close()

    out_dir = OBSIDIAN_DIR / info["display"]
    out_dir.mkdir(parents=True, exist_ok=True)

    by_month = defaultdict(list)
    for r in rows:
        ts = r[1]
        d = dt.fromtimestamp(ts/1000)
        by_month[(d.year, d.month)].append(r)

    total = 0
    for (year, month), posts in sorted(by_month.items()):
        md_path = out_dir / f"{year}" / f"{year}-{month:02d}.md"
        md_path.parent.mkdir(parents=True, exist_ok=True)
        lines = []
        # frontmatter for Obsidian Dataview
        lines.append("---")
        lines.append(f"sage: {info['display']}")
        lines.append(f"alias: {info['alias']}")
        lines.append(f"school: {info['school']}")
        lines.append(f"year: {year}")
        lines.append(f"month: {month}")
        lines.append(f"count: {len(posts)}")
        lines.append(f"tags: [雪球, {info['display']}, 投资大V]")
        lines.append("---")
        lines.append("")
        lines.append(f"# {info['display']} · {year}-{month:02d}")
        lines.append("")
        lines.append(f"> {info['school']} · 共 {len(posts)} 条")
        lines.append("")

        for r in posts:
            id_, ts, text, rt, rp, lk, vw, url, rt_id, rt_user, rt_title, rt_text, rt_url, rt_ca = r
            d = dt.fromtimestamp(ts/1000)
            text_md = clean_md(text)
            text_md = add_links(text_md)
            lines.append(f"## {d.strftime('%Y-%m-%d %H:%M')}")
            lines.append("")
            lines.append(f"`👍 {lk} · ↻ {rt} · 💬 {rp}` · [雪球原帖]({url})")
            lines.append("")
            lines.append(text_md)
            lines.append("")
            # 引用帖块（转发/回复时雪球嵌套返回的原帖）
            if rt_id and (rt_text or rt_title):
                rt_ts_str = ""
                if rt_ca:
                    try:
                        rt_d = dt.fromtimestamp(int(rt_ca)/1000)
                        rt_ts_str = f" · {rt_d.strftime('%Y-%m-%d %H:%M')}"
                    except: pass
                head = f"@{rt_user}" if rt_user else "原帖"
                link = f" · [原帖]({rt_url})" if rt_url else ""
                lines.append(f"> **📌 引用 {head}{rt_ts_str}{link}**")
                lines.append(">")
                if rt_title:
                    lines.append(f"> **{clean_md(rt_title)}**")
                    lines.append(">")
                if rt_text:
                    body = clean_md(rt_text)
                    # 不截断 — 完整引用内容（用户要求"信息完全"）
                    for ln in body.split("\n"):
                        lines.append(f"> {ln}" if ln.strip() else ">")
                lines.append("")
            lines.append("---")
            lines.append("")

        md_path.write_text("\n".join(lines))
        total += len(posts)

    # 顶层 README
    readme = out_dir / "README.md"
    readme.write_text(f"""---
sage: {info["display"]}
alias: {info["alias"]}
school: {info["school"]}
total_posts: {total}
fetched_at: {dt.now().strftime('%Y-%m-%d %H:%M:%S')}
tags: [雪球, {info['display']}, 投资大V, INDEX]
---

# {info['display']} ({info['alias']}) · 雪球发言归档

**流派**: {info['school']}
**总条数**: {total:,}
**时间**: {min((y, m) for y, m in by_month.keys())} → {max((y, m) for y, m in by_month.keys())}

## 按年浏览

{chr(10).join(f"- [[{y}/{y}-{m:02d}|{y}年{m}月 ({len(ps)} 条)]]" for (y, m), ps in sorted(by_month.items(), reverse=True))}
""")
    print(f"  ✓ {info['display']}: {total} 条 → {len(by_month)} 个月文件 → {out_dir}")
    return total


def main():
    OBSIDIAN_DIR.mkdir(parents=True, exist_ok=True)
    print(f"📁 输出到: {OBSIDIAN_DIR}\n")

    grand_total = 0
    summary = {}
    for slug, info in SAGES.items():
        n = export_sage(slug, info)
        if n > 0:
            grand_total += n
            summary[info["display"]] = n

    # 主索引
    index_path = OBSIDIAN_DIR / "index.md"
    index_path.write_text(f"""---
title: 雪球大V发言知识库
total: {grand_total}
sages: {len(summary)}
updated: {dt.now().strftime('%Y-%m-%d %H:%M:%S')}
tags: [雪球, INDEX]
---

# 🏛️ 雪球大V发言知识库

**总条数**: {grand_total:,} 条
**陪审团**: {len(summary)} 位

## 大V列表

{chr(10).join(f"- [[{name}/README|{name} ({cnt:,} 条)]]" for name, cnt in summary.items())}

## 自动同步

每天 9:00 / 21:00 launchd 自动跑 `~/sage-jury/scripts/xueqiu_watcher/fetch_incremental.py all`，新发言自动追加到对应月份的 md 文件。

## 数据源
- 雪球 user_timeline API
- 通过 Chrome cookie 解密绕过反爬
- SQLite 全量 + Markdown Obsidian 视图
""")
    print(f"\n✅ 完成: 总 {grand_total:,} 条 → {len(summary)} 位大V")
    print(f"  Obsidian index: {index_path}")


if __name__ == "__main__":
    main()
