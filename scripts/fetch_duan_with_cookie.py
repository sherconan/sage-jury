#!/usr/bin/env python3
"""
段永平雪球全集抓取（登录态版）

使用前提：用户已在 Chrome 登录 xueqiu.com
脚本流程：
  1. 用 pycookiecheat 从 Chrome 拿登录 cookie
  2. 翻 542 页 user_timeline，每页 20 条 → 10840 条
  3. 保存为 JSON + Markdown + 按年分卷

用法: /usr/bin/python3 scripts/fetch_duan_with_cookie.py
"""
import sys, json, time, re, os
from pathlib import Path
from datetime import datetime as dt

sys.path.insert(0, "/Users/sherconan/Library/Python/3.9/lib/python/site-packages")
import requests

USER_ID = 1247347556
USER_NAME = "大道无形我有型（段永平）"
OUT_DIR = Path(os.path.expanduser("~/sage-jury/data/duan-yongping-xueqiu"))
OUT_DIR.mkdir(parents=True, exist_ok=True)


def get_cookie_from_chrome():
    """用 pycookiecheat 拿 xueqiu cookie"""
    try:
        from pycookiecheat import chrome_cookies
    except ImportError:
        print("❌ pycookiecheat 未安装。/usr/bin/python3 已有，直接运行。")
        sys.exit(1)

    for url in ["https://xueqiu.com", "https://stock.xueqiu.com", "https://xueqiu.com/u/1247347556"]:
        ck = chrome_cookies(url)
        if ck and any(k in ck for k in ("xq_a_token", "xqat", "u")):
            print(f"✓ 从 Chrome 拿到 {len(ck)} 个 cookie ({url})")
            return ck
    return None


def make_session_logged_in():
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Referer": f"https://xueqiu.com/u/{USER_ID}",
    })
    ck = get_cookie_from_chrome()
    if ck:
        for k, v in ck.items():
            s.cookies.set(k, v, domain=".xueqiu.com")
        # 验证登录态
        r = s.get("https://xueqiu.com/user/current.json", timeout=10)
        if r.ok:
            try:
                u = r.json()
                login_id = u.get("id") or u.get("user_id")
                if login_id and login_id != -1:
                    print(f"✓ 登录态有效, 用户 id={login_id} screen_name={u.get('screen_name', '?')}")
                    return s
            except Exception:
                pass
    print("⚠️  没有有效登录 cookie — fallback 到匿名（只能拿第 1 页）")
    s2 = requests.Session()
    s2.headers.update({"User-Agent": "Mozilla/5.0 Chrome/131.0.0.0",
                       "Referer": f"https://xueqiu.com/u/{USER_ID}"})
    s2.get("https://xueqiu.com/hq/detail", timeout=10)
    return s2


def clean_text(html: str) -> str:
    if not html: return ""
    t = re.sub(r"<br\s*/?>", "\n", html)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"&nbsp;", " ", t).strip()


def main():
    s = make_session_logged_in()
    all_posts = []
    page = 1
    fail_streak = 0

    while page <= 600:
        try:
            r = s.get(f"https://xueqiu.com/statuses/user_timeline.json?user_id={USER_ID}&page={page}", timeout=15)
            if r.status_code == 200 and r.text.strip().startswith("{"):
                d = r.json()
                posts = d.get("statuses", [])
                max_page = d.get("maxPage", 0)
                if not posts:
                    print(f"page {page}: empty, stop")
                    break
                for p in posts:
                    all_posts.append({
                        "id": p.get("id"),
                        "created_at": p.get("created_at"),
                        "timestamp": p.get("timestamp") or p.get("created_at"),
                        "title": p.get("title"),
                        "text": clean_text(p.get("text") or p.get("description") or ""),
                        "retweet_count": p.get("retweet_count", 0),
                        "reply_count": p.get("reply_count", 0),
                        "like_count": p.get("like_count", 0),
                        "view_count": p.get("view_count", 0),
                        "type": p.get("type"),
                        "url": f"https://xueqiu.com{p.get('target', '')}",
                    })
                fail_streak = 0
                if page % 10 == 0 or page == 1:
                    print(f"page {page}/{max_page}: total accumulated={len(all_posts)}")
                if page >= max_page > 0:
                    print(f"reached maxPage={max_page}")
                    break
            else:
                err = r.text[:150]
                print(f"page {page}: {r.status_code} {err}")
                fail_streak += 1
                if fail_streak >= 3:
                    print(f"3 次连续失败，停止")
                    break
                time.sleep(3)
        except Exception as e:
            print(f"page {page} ERR: {e}")
            fail_streak += 1
            if fail_streak >= 3: break
        page += 1
        time.sleep(0.5)

    # 保存
    by_year = {}
    for p in all_posts:
        ts = p.get("timestamp")
        if isinstance(ts, (int, float)) and ts > 0:
            year = dt.fromtimestamp(ts/1000 if ts > 10**10 else ts).year
        elif isinstance(p.get("created_at"), str):
            year = p["created_at"][:4]
        else:
            year = "unknown"
        by_year.setdefault(str(year), []).append(p)

    json_path = OUT_DIR / "all-posts.json"
    json_path.write_text(json.dumps({
        "user_id": USER_ID, "user_name": USER_NAME,
        "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": len(all_posts),
        "by_year": {y: len(ps) for y, ps in sorted(by_year.items(), reverse=True)},
        "posts": all_posts,
    }, ensure_ascii=False, indent=2))
    print(f"\n✅ 完成 {len(all_posts)} 条 → {json_path}")
    for y, ps in sorted(by_year.items(), reverse=True):
        print(f"  {y}: {len(ps)} 条")


if __name__ == "__main__":
    main()
