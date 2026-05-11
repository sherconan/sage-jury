#!/usr/bin/env python3
"""
雪球 watcher · 增量抓取大V最新发言

用法:
    /usr/bin/python3 fetch_incremental.py duan          # 段永平
    /usr/bin/python3 fetch_incremental.py danbin        # 但斌（如果监控）
    /usr/bin/python3 fetch_incremental.py all           # 全部监控

策略:
    1. 读 ~/.sage-jury/xueqiu-token.json
    2. SQLite 查 last_id (上次抓到的最新 id)
    3. 翻页 user_timeline 直到遇到已有的 id 或 max_page
    4. 新增发言写入 SQLite + 生成 daily digest md
    5. 失败时记录日志 + 可选 Discord 告警

每次运行只抓增量 — 通常 1-5 条新发言，秒级完成。
"""
import sys, os, json, time, sqlite3, re
from pathlib import Path
from datetime import datetime as dt
sys.path.insert(0, "/Users/sherconan/Library/Python/3.9/lib/python/site-packages")
import requests

TOKEN_FILE = Path(os.path.expanduser("~/.sage-jury/xueqiu-token.json"))
DATA_DIR = Path(os.path.expanduser("~/sage-jury/data/xueqiu-watcher"))
DAILY_DIR = DATA_DIR / "daily"
LOG_FILE = DATA_DIR / "watcher.log"

# 监控名单（id, slug, display）
TARGETS = {
    "duan":     (1247347556, "duan-yongping",   "段永平 (大道无形我有型)"),
    "guan":     (9650668145, "guan-wo-cai",     "管我财"),
    "laotang":  (8290096439, "lao-tang",        "唐朝（老唐）"),
    "danbin":   (1102105103, "dan-bin",         "但斌"),
    # "fengliu": (待校验真实 ID),
}


def log(msg: str):
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    line = f"[{dt.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line)
    with LOG_FILE.open("a") as f:
        f.write(line + "\n")


def load_session():
    if not TOKEN_FILE.exists():
        log(f"❌ token 文件不存在: {TOKEN_FILE}")
        log("   先跑 setup.py 一次性登录")
        sys.exit(1)
    cfg = json.loads(TOKEN_FILE.read_text())
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0",
        "Accept-Language": "zh-CN,zh;q=0.9",
    })
    for k, v in cfg["cookies"].items():
        s.cookies.set(k, v, domain=".xueqiu.com")
    return s


def open_db(slug: str) -> sqlite3.Connection:
    db_path = DATA_DIR / f"{slug}.sqlite"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.execute("""CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY,
        timestamp INTEGER,
        created_at TEXT,
        title TEXT, text TEXT, raw_text TEXT,
        retweet_count INTEGER, reply_count INTEGER, like_count INTEGER,
        view_count INTEGER, type TEXT, url TEXT,
        rt_id INTEGER, rt_user_id INTEGER, rt_user_name TEXT,
        rt_title TEXT, rt_text TEXT, rt_raw_text TEXT,
        rt_url TEXT, rt_created_at TEXT,
        fetched_at TEXT
    )""")
    # 老库迁移：补齐 rt_* 引用帖字段（已存在则忽略）
    for col, typ in [
        ("rt_id", "INTEGER"), ("rt_user_id", "INTEGER"), ("rt_user_name", "TEXT"),
        ("rt_title", "TEXT"), ("rt_text", "TEXT"), ("rt_raw_text", "TEXT"),
        ("rt_url", "TEXT"), ("rt_created_at", "TEXT"),
    ]:
        try:
            conn.execute(f"ALTER TABLE posts ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError:
            pass
    conn.commit()
    return conn


def get_last_id(conn) -> int:
    r = conn.execute("SELECT MAX(id) FROM posts").fetchone()
    return r[0] or 0


def clean_text(html: str) -> str:
    if not html: return ""
    t = re.sub(r"<br\s*/?>", "\n", html)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"&nbsp;", " ", t).strip()


def fetch_user(session, user_id: int, since_id: int, max_pages: int = 30):
    new_posts = []
    for page in range(1, max_pages + 1):
        session.headers["Referer"] = f"https://xueqiu.com/u/{user_id}"
        r = session.get(f"https://xueqiu.com/statuses/user_timeline.json?user_id={user_id}&page={page}", timeout=15)
        if r.status_code != 200 or not r.text.strip().startswith("{"):
            log(f"  page {page}: {r.status_code} — {r.text[:100]}")
            break
        d = r.json()
        posts = d.get("statuses", [])
        if not posts:
            break
        # 检查是否已遇到 since_id
        hit_existing = False
        for p in posts:
            if p.get("id", 0) <= since_id:
                hit_existing = True
                break
            new_posts.append(p)
        if hit_existing:
            break
        if page >= d.get("maxPage", 1):
            break
        time.sleep(0.4)
    return new_posts


def write_to_db(conn, posts):
    cur = conn.cursor()
    for p in posts:
        # 雪球的 created_at 是毫秒级时间戳（字符串），timestamp 字段实际是 0
        ca = p.get("created_at") or p.get("timestamp")
        try:
            ts = int(ca) if ca else 0
        except: ts = 0
        # 引用帖（转发/回复时雪球嵌套返回原帖对象）
        rs = p.get("retweeted_status") or {}
        rs_user = (rs.get("user") or {}) if rs else {}
        rs_target = rs.get("target") or "" if rs else ""
        rs_ca = rs.get("created_at") if rs else None
        rt_id = rs.get("id") if rs else None
        rt_user_id = rs_user.get("id") if rs_user else None
        rt_user_name = rs_user.get("screen_name") if rs_user else None
        rt_title = rs.get("title") if rs else None
        rt_raw = rs.get("text") if rs else None
        rt_text = clean_text(rs.get("text") or rs.get("description") or "") if rs else None
        rt_url = f"https://xueqiu.com{rs_target}" if rs_target else None
        rt_ca_str = str(rs_ca) if rs_ca else None
        # UPSERT：新帖 INSERT，存量帖刷新引用字段（用于历史回灌）
        cur.execute("""INSERT INTO posts
            (id, timestamp, created_at, title, text, raw_text, retweet_count, reply_count,
             like_count, view_count, type, url,
             rt_id, rt_user_id, rt_user_name, rt_title, rt_text, rt_raw_text, rt_url, rt_created_at,
             fetched_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                rt_id=excluded.rt_id,
                rt_user_id=excluded.rt_user_id,
                rt_user_name=excluded.rt_user_name,
                rt_title=excluded.rt_title,
                rt_text=excluded.rt_text,
                rt_raw_text=excluded.rt_raw_text,
                rt_url=excluded.rt_url,
                rt_created_at=excluded.rt_created_at,
                retweet_count=excluded.retweet_count,
                reply_count=excluded.reply_count,
                like_count=excluded.like_count,
                view_count=excluded.view_count""",
            (p.get("id"), ts, str(ca) if ca else "",
             p.get("title") or "", clean_text(p.get("text") or p.get("description") or ""),
             p.get("text") or "", p.get("retweet_count", 0), p.get("reply_count", 0),
             p.get("like_count", 0), p.get("view_count", 0), p.get("type") or "",
             f"https://xueqiu.com{p.get('target', '')}",
             rt_id, rt_user_id, rt_user_name, rt_title, rt_text, rt_raw, rt_url, rt_ca_str,
             dt.now().strftime("%Y-%m-%d %H:%M:%S")))
    conn.commit()


def write_daily_digest(slug: str, display: str, new_posts: list):
    if not new_posts: return
    DAILY_DIR.mkdir(parents=True, exist_ok=True)
    today = dt.now().strftime("%Y-%m-%d")
    md_path = DAILY_DIR / f"{today}-{slug}.md"
    with md_path.open("a") as f:
        f.write(f"# {display} · {today}\n\n新增 {len(new_posts)} 条:\n\n")
        for p in new_posts:
            ts = p.get("timestamp") or 0
            ts_str = dt.fromtimestamp(ts/1000 if ts > 10**10 else ts).strftime("%H:%M") if ts else "?"
            text = clean_text(p.get("text") or "")[:300]
            counts = f"💬{p.get('reply_count',0)} ↻{p.get('retweet_count',0)} ❤{p.get('like_count',0)}"
            url = f"https://xueqiu.com{p.get('target','')}"
            f.write(f"## {ts_str}  {counts}\n\n{text}\n\n[原帖]({url})\n\n---\n\n")
    log(f"  digest 写入: {md_path}")


def enrich_retweets(session, slug: str, only_missing: bool = True, limit=None, sleep: float = 1.2):
    """拉引用帖全文 — user_timeline 只返摘要(~150字)，detail 接口才有全文(几千字)
    only_missing=True: 仅处理 rt_text 短于 500 字符的（未 enrich）
    """
    if slug not in TARGETS:
        log(f"❌ 未知监控目标: {slug}"); return
    _, db_slug, display = TARGETS[slug]
    conn = open_db(db_slug)
    # 加 rt_enriched_at 列做幂等标记
    try:
        conn.execute("ALTER TABLE posts ADD COLUMN rt_enriched_at TEXT")
        conn.commit()
    except sqlite3.OperationalError: pass

    where = "rt_id IS NOT NULL"
    if only_missing:
        where += " AND (rt_enriched_at IS NULL OR length(rt_text) < 500)"
    sql = f"SELECT id, rt_id FROM posts WHERE {where} ORDER BY id DESC"
    if limit:
        sql += f" LIMIT {limit}"
    targets = conn.execute(sql).fetchall()
    log(f"▶ Enrich {display}: {len(targets)} 条引用帖待拉全文")
    ok, fail = 0, 0
    # 反爬：固定 Referer + 1.2s 间隔（连续触发会 405）
    session.headers["Referer"] = "https://xueqiu.com"
    for i, (post_id, rt_id) in enumerate(targets, 1):
        try:
            r = session.get(f"https://api.xueqiu.com/statuses/show.json?id={rt_id}", timeout=15)
            if r.status_code == 405:
                log(f"  [{i}/{len(targets)}] 405 触发风控，停 60s")
                time.sleep(60)
                continue
            if r.status_code != 200 or not r.text.strip().startswith("{"):
                fail += 1
                if fail % 20 == 0: log(f"  [{i}/{len(targets)}] http {r.status_code}, 累计失败 {fail}")
                time.sleep(sleep); continue
            d = r.json()
            rt_user = d.get("user") or {}
            rt_target = d.get("target") or ""
            full_text = clean_text(d.get("text") or d.get("description") or "")
            full_title = d.get("title") or ""
            rt_url = f"https://xueqiu.com{rt_target}" if rt_target else None
            conn.execute("""UPDATE posts SET
                rt_user_name = COALESCE(?, rt_user_name),
                rt_user_id   = COALESCE(?, rt_user_id),
                rt_title     = COALESCE(NULLIF(?, ''), rt_title),
                rt_text      = ?,
                rt_raw_text  = ?,
                rt_url       = COALESCE(?, rt_url),
                rt_created_at= COALESCE(?, rt_created_at),
                rt_enriched_at = ?
                WHERE id = ?""",
                (rt_user.get("screen_name"), rt_user.get("id"),
                 full_title, full_text, d.get("text") or "",
                 rt_url, str(d.get("created_at") or "") or None,
                 dt.now().strftime("%Y-%m-%d %H:%M:%S"), post_id))
            if i % 50 == 0:
                conn.commit()
                log(f"  [{i}/{len(targets)}] 已 enrich")
            ok += 1
        except Exception as e:
            fail += 1
            if fail % 20 == 0: log(f"  err: {e}")
        time.sleep(sleep)
    conn.commit()
    log(f"  ✅ Enrich {display}: 成功 {ok} / 失败 {fail}")
    conn.close()


def watch_one(session, slug: str, deep: bool = False):
    if slug not in TARGETS:
        log(f"❌ 未知监控目标: {slug}")
        return
    user_id, db_slug, display = TARGETS[slug]
    conn = open_db(db_slug)
    since = 0 if deep else get_last_id(conn)
    pages = 100 if deep else 30
    mode = "深度回灌" if deep else "增量"
    log(f"▶ 监控 {display} (id={user_id}, since_id={since}, mode={mode})")
    new_posts = fetch_user(session, user_id, since, max_pages=pages)
    log(f"  抓取 {len(new_posts)} 条")
    if new_posts:
        write_to_db(conn, new_posts)
        if not deep:
            write_daily_digest(db_slug, display, new_posts)
    total_q = conn.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
    rt_q = conn.execute("SELECT COUNT(*) FROM posts WHERE rt_id IS NOT NULL").fetchone()[0]
    log(f"  累积 {total_q} 条 (含引用 {rt_q})")
    conn.close()


def export_to_sage_jury():
    """把 SQLite 数据导出到 sage-jury/data/sages-quotes/<slug>.json
    供 sage-jury 网页 /sage/[id] 详情页加载真实雪球观点"""
    out_dir = Path(os.path.expanduser("~/sage-jury/data/sages-quotes"))
    out_dir.mkdir(parents=True, exist_ok=True)
    for slug, (uid, db_slug, display) in TARGETS.items():
        db_path = DATA_DIR / f"{db_slug}.sqlite"
        if not db_path.exists(): continue
        conn = sqlite3.connect(str(db_path))
        rows = conn.execute("""SELECT id, timestamp, text, retweet_count, reply_count, like_count, url
                               FROM posts ORDER BY timestamp DESC LIMIT 20""").fetchall()
        conn.close()
        out = {
            "slug": db_slug, "display": display, "user_id": uid,
            "fetched_at": dt.now().strftime("%Y-%m-%d %H:%M:%S"),
            "recent_posts": [{
                "id": r[0], "timestamp": r[1],
                "ts_str": dt.fromtimestamp(r[1]/1000 if r[1] > 10**10 else r[1]).strftime("%Y-%m-%d %H:%M") if r[1] else "?",
                "text": r[2][:300],
                "engagement": {"retweet": r[3], "reply": r[4], "like": r[5]},
                "url": r[6],
            } for r in rows],
        }
        json_path = out_dir / f"{db_slug}.json"
        json_path.write_text(json.dumps(out, ensure_ascii=False, indent=2))
        log(f"  exported → {json_path}")


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "duan"
    deep = "--deep" in sys.argv
    enrich = "--enrich" in sys.argv
    s = load_session()
    if arg == "enrich":
        # python3 fetch_incremental.py enrich [slug|all]
        target = sys.argv[2] if len(sys.argv) > 2 else "all"
        targets = list(TARGETS) if target == "all" else [target]
        for slug in targets:
            enrich_retweets(s, slug)
        return
    if arg == "all":
        for slug in TARGETS:
            watch_one(s, slug, deep=deep)
            if enrich:
                enrich_retweets(s, slug)
    elif arg == "export":
        export_to_sage_jury()
        return
    else:
        watch_one(s, arg, deep=deep)
        if enrich:
            enrich_retweets(s, arg)
    # 默认每次跑完都导出给 sage-jury 网页用
    export_to_sage_jury()


if __name__ == "__main__":
    main()
