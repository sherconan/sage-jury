#!/usr/bin/env python3
"""
雪球 watcher · 首次登录 + token 永久化

用法（一次性）:
    /usr/bin/python3 ~/sage-jury/scripts/xueqiu_watcher/setup.py

流程:
    1. 用户在自己 Chrome 里登录 https://xueqiu.com
    2. 此脚本用 pycookiecheat 拿登录 cookie (xq_a_token / xq_r_token / u)
    3. 保存到 ~/.sage-jury/xueqiu-token.json
    4. 验证 token 工作（拿段永平第 5 页 timeline）
"""
import sys, os, json, time
from pathlib import Path
sys.path.insert(0, "/Users/sherconan/Library/Python/3.9/lib/python/site-packages")
import requests

TOKEN_DIR = Path(os.path.expanduser("~/.sage-jury"))
TOKEN_DIR.mkdir(parents=True, exist_ok=True)
TOKEN_FILE = TOKEN_DIR / "xueqiu-token.json"

REQUIRED_KEYS = ("xq_a_token", "u")


def grab_from_chrome():
    try:
        from pycookiecheat import chrome_cookies
    except ImportError:
        print("❌ pycookiecheat 缺失。/usr/bin/python3 自带，确认 Chrome 路径正确")
        sys.exit(1)

    for url in ["https://xueqiu.com/", "https://stock.xueqiu.com/", "https://xueqiu.com/u/1247347556"]:
        ck = chrome_cookies(url)
        if ck and all(k in ck for k in REQUIRED_KEYS):
            return ck
    return None


def verify_token(cookies: dict) -> dict:
    s = requests.Session()
    s.headers["User-Agent"] = "Mozilla/5.0 Chrome/131.0.0.0"
    for k, v in cookies.items():
        s.cookies.set(k, v, domain=".xueqiu.com")
    r = s.get("https://xueqiu.com/user/current.json", timeout=10)
    if not r.ok:
        return {"valid": False, "error": f"HTTP {r.status_code}"}
    try:
        u = r.json()
        login_id = u.get("id") or u.get("user_id", -1)
        if login_id and login_id != -1:
            # 测试拿段永平第 5 页
            s.headers["Referer"] = "https://xueqiu.com/u/1247347556"
            r2 = s.get("https://xueqiu.com/statuses/user_timeline.json?user_id=1247347556&page=5", timeout=10)
            if r2.ok and r2.json().get("statuses"):
                return {"valid": True, "user_id": login_id, "screen_name": u.get("screen_name"),
                        "test_page5_count": len(r2.json()["statuses"])}
        return {"valid": False, "error": "anonymous", "raw": str(u)[:200]}
    except Exception as e:
        return {"valid": False, "error": str(e)}


def main():
    print("=" * 60)
    print("雪球 Watcher · 首次登录设置")
    print("=" * 60)
    print()
    print("Step 1: 请在 Chrome 里打开 https://xueqiu.com 并登录")
    print("        （手机号短信 / 微信扫码 / QQ 都行）")
    print()
    input("登录完成后按 Enter 继续...")
    print()

    print("Step 2: 从 Chrome 抓取登录 cookie...")
    ck = grab_from_chrome()
    if not ck:
        print("❌ Chrome 里没找到 xueqiu 登录 cookie")
        print("   请确认: (a) Chrome 已开 (b) 已登录 https://xueqiu.com")
        sys.exit(1)
    print(f"✓ 拿到 {len(ck)} 个 cookie: {list(ck.keys())[:8]}")

    print("\nStep 3: 验证 token...")
    v = verify_token(ck)
    if not v.get("valid"):
        print(f"❌ token 无效: {v.get('error')}")
        sys.exit(1)
    print(f"✓ 登录态有效")
    print(f"  user_id: {v['user_id']}")
    print(f"  screen_name: {v.get('screen_name')}")
    print(f"  段永平第 5 页测试: 拿到 {v['test_page5_count']} 条 ✓")

    print(f"\nStep 4: 保存 token 到 {TOKEN_FILE}")
    TOKEN_FILE.write_text(json.dumps({
        "cookies": ck,
        "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "verified": v,
    }, ensure_ascii=False, indent=2))
    os.chmod(TOKEN_FILE, 0o600)  # 只有用户能读
    print("✓ 已保存（权限 600，只本用户可读）")
    print()
    print("✅ 设置完成！现在可以运行:")
    print("   /usr/bin/python3 ~/sage-jury/scripts/xueqiu_watcher/fetch_incremental.py duan")
    print("   或安装 launchd 定时任务，每天自动跑")


if __name__ == "__main__":
    main()
