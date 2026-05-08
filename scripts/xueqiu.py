#!/usr/bin/env python3
"""
Sage Jury × 雪球抓取工具
========================
匿名访问 xueqiu.com，拿股票详细数据 + 大V讨论 + 关注/持仓信息。

用法:
  python3 scripts/xueqiu.py quote 600519
  python3 scripts/xueqiu.py discussion 600519
  python3 scripts/xueqiu.py user_posts 7392790928   # 雪球大V用户ID
  python3 scripts/xueqiu.py guru 但斌                 # 搜大V

无需登录。Cookie 自动通过浏览主页流程获取。
"""
import sys, json, requests, re
from typing import Optional

XQ_HEADERS_WEB = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
    "Accept-Language": "zh-CN,zh;q=0.9",
}
XQ_HEADERS_MOBILE = {"User-Agent": "Xueqiu iPhone 13.0 build:14.10"}


def make_session() -> requests.Session:
    """建立带 xq_a_token 的 session"""
    s = requests.Session()
    s.headers.update(XQ_HEADERS_WEB)
    # 关键：必经过 /hq/detail 才会 set xq_a_token
    s.get("https://xueqiu.com/hq/detail", timeout=10)
    if "xq_a_token" not in s.cookies:
        # fallback
        s.get("https://xueqiu.com/hq", timeout=10)
    return s


def normalize(code: str) -> str:
    """600519 → SH600519, 0700 → HK00700, NVDA → NVDA"""
    code = code.upper().strip()
    if re.match(r"^[0-9]{6}$", code):
        return ("SH" if code[0] in "69" else "SZ") + code
    if re.match(r"^[0-9]{5}$", code):
        return "HK" + code
    return code


def quote(code: str) -> dict:
    """股票实时行情 + 估值"""
    s = make_session()
    sym = normalize(code)
    s.headers["Referer"] = f"https://xueqiu.com/S/{sym}"
    r = s.get(f"https://stock.xueqiu.com/v5/stock/quote.json?symbol={sym}&extend=detail", timeout=10)
    if r.status_code != 200 or not r.text.strip().startswith("{"):
        # try with mobile UA in fresh session
        s2 = requests.Session()
        s2.headers.update(XQ_HEADERS_MOBILE)
        s2.get("https://xueqiu.com/hq/detail", timeout=10)
        r = s2.get(f"https://stock.xueqiu.com/v5/stock/quote.json?symbol={sym}", timeout=10)
    try:
        return r.json()
    except Exception:
        return {"raw_status": r.status_code, "raw_body": r.text[:300]}


def discussion(code: str, count: int = 10) -> list:
    """雪球股友讨论"""
    s = make_session()
    sym = normalize(code)
    r = s.get(f"https://xueqiu.com/query/v1/symbol/search/status.json"
              f"?count={count}&comment=0&symbol={sym}&hl=0&source=user&sort=time&page=1&q=", timeout=10)
    if r.status_code != 200:
        # fallback to general search
        r = s.get(f"https://xueqiu.com/statuses/search.json?q={sym}&count={count}&page=1&sort=time", timeout=10)
    try:
        return r.json().get("list", [])
    except Exception:
        return []


def user_posts(user_id: str, count: int = 10) -> list:
    """雪球大V用户主页文章"""
    s = make_session()
    s.headers["Referer"] = f"https://xueqiu.com/u/{user_id}"
    r = s.get(f"https://xueqiu.com/statuses/user_timeline.json?user_id={user_id}&page=1", timeout=10)
    try:
        return r.json().get("statuses", [])[:count]
    except Exception:
        return []


def search_guru(name: str) -> list:
    """搜大V用户"""
    s = make_session()
    r = s.get(f"https://xueqiu.com/query/v1/search/user.json?q={name}&count=10&page=1", timeout=10)
    try:
        return r.json().get("list", [])
    except Exception:
        return []


def fmt_post(p: dict) -> str:
    user = p.get("user", {})
    text = re.sub(r"<[^>]+>", "", p.get("text", "") or "")[:150]
    return f"@{user.get('screen_name', '?')} ({user.get('followers_count', 0):,}粉丝): {text}"


def main():
    if len(sys.argv) < 2:
        print(__doc__); return

    cmd = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else ""

    if cmd == "quote":
        d = quote(arg)
        q = d.get("data", {}).get("quote", {})
        if not q:
            print(f"❌ 未拿到 {arg} 数据")
            print(json.dumps(d, ensure_ascii=False)[:300])
            return
        print(f"📊 {q.get('name')} ({arg})")
        print(f"  现价: {q.get('current')} ({q.get('percent', 0):+.2f}%)")
        print(f"  PE TTM: {q.get('pe_ttm')}")
        print(f"  PB: {q.get('pb')}")
        print(f"  ROE: {q.get('roe', 'n/a')}")
        print(f"  EPS: {q.get('eps', 'n/a')}")
        print(f"  市值: {(q.get('market_capital', 0) or 0) / 1e8:,.0f} 亿")
        print(f"  毛利率: {q.get('gross_margin', 'n/a')}")
        print(f"  净利率: {q.get('net_profit_margin', 'n/a')}")
        print(f"  行业: {q.get('industry', 'n/a')}")
        print(f"  上市日期: {q.get('list_date_str', 'n/a')}")
        print(f"  股息率: {q.get('dividend_yield', 'n/a')}")
        print(f"  雪球关注: {q.get('follow_count', 0):,}")
        print(f"  雪球讨论: {q.get('status_count', 0):,}")

    elif cmd == "discussion":
        posts = discussion(arg, count=8)
        print(f"📢 {arg} 雪球讨论 ({len(posts)} 条):\n")
        for p in posts:
            print("  " + fmt_post(p))

    elif cmd == "user_posts":
        posts = user_posts(arg, count=5)
        print(f"👤 用户 {arg} 最新 {len(posts)} 条:\n")
        for p in posts:
            print("  " + fmt_post(p))

    elif cmd == "guru":
        users = search_guru(arg)
        print(f"🔍 搜 '{arg}' 找到 {len(users)} 位大V:\n")
        for u in users[:10]:
            print(f"  @{u.get('screen_name')} (id={u.get('id')}, {u.get('followers_count', 0):,}粉)")
            if u.get('description'):
                print(f"    {u['description'][:80]}")
    else:
        print(f"未知命令: {cmd}\n{__doc__}")


if __name__ == "__main__":
    main()
