#!/usr/bin/env python3
"""
拉取段永平 (大道无形我有型 id=1247347556) 在雪球的所有发言。
保存到 data/duan-yongping-xueqiu.json + .md
"""
import requests, json, time, re, os, sys
from pathlib import Path

USER_ID = 1247347556
USER_NAME = "大道无形我有型（段永平）"
OUT_DIR = Path(os.path.expanduser("~/sage-jury/data/duan-yongping-xueqiu"))
OUT_DIR.mkdir(parents=True, exist_ok=True)

def make_session():
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    s.get("https://xueqiu.com/hq/detail", timeout=10)
    s.headers["Referer"] = f"https://xueqiu.com/u/{USER_ID}"
    return s

def fetch_page(s, page):
    url = f"https://xueqiu.com/statuses/user_timeline.json?user_id={USER_ID}&page={page}"
    for retry in range(3):
        try:
            r = s.get(url, timeout=15)
            if r.status_code == 200 and r.text.strip().startswith("{"):
                return r.json()
            else:
                # cookie 可能过期，重建 session
                s = make_session()
                time.sleep(1)
        except Exception as e:
            print(f"  page {page} retry {retry+1}: {e}")
            time.sleep(2)
    return None

def clean_text(html: str) -> str:
    if not html: return ""
    t = re.sub(r"<br\s*/?>", "\n", html)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"&nbsp;", " ", t)
    t = re.sub(r"&amp;", "&", t)
    t = re.sub(r"&lt;", "<", t)
    t = re.sub(r"&gt;", ">", t)
    t = re.sub(r"&quot;", '"', t)
    return t.strip()

def main():
    s = make_session()
    all_posts = []
    page = 1
    consec_empty = 0

    while page <= 200:  # safety cap
        d = fetch_page(s, page)
        if not d:
            print(f"page {page}: failed completely, stop")
            break
        posts = d.get("statuses", [])
        max_page = d.get("maxPage", 0)
        total = d.get("total", 0)
        if not posts:
            consec_empty += 1
            print(f"page {page}: empty (total={total} maxPage={max_page})")
            if consec_empty >= 2:
                break
        else:
            consec_empty = 0
            for p in posts:
                # 提取关键字段
                all_posts.append({
                    "id": p.get("id"),
                    "created_at": p.get("created_at"),
                    "timestamp": p.get("timestamp"),
                    "title": p.get("title"),
                    "text": clean_text(p.get("text") or p.get("description") or ""),
                    "raw_text": p.get("text"),
                    "retweet_count": p.get("retweet_count", 0),
                    "reply_count": p.get("reply_count", 0),
                    "fav_count": p.get("fav_count", 0),
                    "like_count": p.get("like_count", 0),
                    "view_count": p.get("view_count", 0),
                    "type": p.get("type"),
                    "source": p.get("source"),
                    "url": f"https://xueqiu.com{p.get('target', '')}",
                })
            print(f"page {page}/{max_page}: +{len(posts)}, total accumulated={len(all_posts)}")

        if page >= max_page and max_page > 0:
            break
        page += 1
        time.sleep(0.6)  # 礼貌延迟

    # 保存
    by_year = {}
    for p in all_posts:
        ts = p.get("timestamp")
        if isinstance(ts, (int, float)) and ts > 0:
            from datetime import datetime as dt
            year = dt.fromtimestamp(ts/1000 if ts > 10**10 else ts).year
        else:
            year = "unknown"
        by_year.setdefault(year, []).append(p)

    json_path = OUT_DIR / "all-posts.json"
    json_path.write_text(json.dumps({
        "user_id": USER_ID,
        "user_name": USER_NAME,
        "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": len(all_posts),
        "by_year_count": {str(y): len(ps) for y, ps in sorted(by_year.items(), reverse=True)},
        "posts": all_posts,
    }, ensure_ascii=False, indent=2))

    # Markdown 版本（可读）
    md_path = OUT_DIR / "all-posts.md"
    with md_path.open("w") as f:
        f.write(f"# {USER_NAME} 雪球发言全集\n\n")
        f.write(f"- 用户ID: {USER_ID}\n- 抓取时间: {time.strftime('%Y-%m-%d %H:%M:%S')}\n- 总条数: {len(all_posts)}\n\n")
        f.write("## 按年统计\n\n")
        for y, ps in sorted(by_year.items(), reverse=True):
            f.write(f"- {y}: {len(ps)} 条\n")
        f.write("\n---\n\n")
        for p in all_posts:
            ts = p.get("timestamp")
            from datetime import datetime as dt
            ts_str = dt.fromtimestamp(ts/1000 if ts and ts > 10**10 else (ts or 0)).strftime("%Y-%m-%d %H:%M") if ts else "?"
            title = p.get("title") or ""
            text = p.get("text") or ""
            counts = f"💬{p['reply_count']} ↻{p['retweet_count']} ❤{p.get('like_count', 0)}"
            f.write(f"## {ts_str}{' · ' + title if title else ''}\n\n")
            f.write(f"_{counts}_  {p['url']}\n\n")
            f.write(f"{text}\n\n---\n\n")

    print(f"\n✅ 完成 — {len(all_posts)} 条发言")
    print(f"  JSON: {json_path}")
    print(f"  Markdown: {md_path}")
    print(f"\n按年分布:")
    for y, ps in sorted(by_year.items(), reverse=True):
        print(f"  {y}: {len(ps)} 条")

if __name__ == "__main__":
    main()
