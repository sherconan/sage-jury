#!/usr/bin/env python3
"""
雪球数据治理打标 v1
======================
对每位大V的所有 post，做 7 个维度的打标：

1. **mention_stocks**：提到的股票 (规范化为 SH/SZ/HK/US 代码)
2. **mention_companies**：公司名（"茅台"、"腾讯"等中文别名）
3. **concepts**：方法论概念（PE/护城河/能力圈/复利等）
4. **post_type**：original | reply | retweet | position_change | book_recommend | life | other
5. **sentiment_lean**：bullish | bearish | neutral | sarcasm
6. **has_position_change**：是否含具体持仓变化（"买了"、"卖了"、"换"、"加仓"）
7. **importance_score**：基于 likes + retweets + 是否 $标记 + 是否含具体持仓 + 文本长度

输出：在原表上加 12 个新列，全部 SQL 可索引可查询。

用法: python3 scripts/data_governance.py [duan-yongping|guan-wo-cai|all]
"""
import sys, sqlite3, re, json, os
from pathlib import Path

DATA_DIR = Path.home() / "sage-jury/data/xueqiu-watcher"
SAGES = ["duan-yongping", "guan-wo-cai", "lao-tang", "dan-bin"]

# === 股票/公司词典 ===
STOCK_ALIASES = {
    # A股
    "茅台": "SH600519", "贵州茅台": "SH600519",
    "五粮液": "SZ000858", "汾酒": "SH600809", "山西汾酒": "SH600809",
    "泸州老窖": "SZ000568", "洋河": "SZ002304", "洋河股份": "SZ002304",
    "海天": "SH603288", "海天味业": "SH603288",
    "伊利": "SH600887", "伊利股份": "SH600887",
    "片仔癀": "SH600436", "云南白药": "SZ000538",
    "恒瑞": "SH600276", "恒瑞医药": "SH600276",
    "美的": "SZ000333", "美的集团": "SZ000333",
    "格力": "SZ000651", "格力电器": "SZ000651",
    "海尔": "SH600690", "海尔智家": "SH600690",
    "招商银行": "SH600036", "招行": "SH600036",
    "中国平安": "SH601318", "平安": "SH601318",
    "工商银行": "SH601398", "工行": "SH601398",
    "宁德时代": "SZ300750", "宁德": "SZ300750",
    "比亚迪": "SZ002594", "BYD": "SZ002594",
    "隆基": "SH601012", "隆基绿能": "SH601012",
    "中免": "SH601888", "中国中免": "SH601888",
    "神华": "SH601088", "中国神华": "SH601088",
    "海康": "SZ002415", "海康威视": "SZ002415",
    "中石油": "SH601857",
    # 港股
    "腾讯": "HK00700", "腾讯控股": "HK00700",
    "阿里": "HK09988", "阿里巴巴": "HK09988", "BABA": "HK09988",
    "美团": "HK03690",
    "拼多多": "PDD", "PDD": "PDD",
    "网易": "NTES", "NTES": "NTES",
    "百度": "BIDU", "BIDU": "BIDU",
    "京东": "HK09618",
    "理想": "HK02015", "理想汽车": "HK02015",
    "蔚来": "NIO",
    "小米": "HK01810",
    "万华": "SH600309", "万华化学": "SH600309",
    "万科": "SZ000002",
    "泡泡玛特": "HK09992",
    # 美股
    "苹果": "AAPL", "AAPL": "AAPL", "Apple": "AAPL",
    "英伟达": "NVDA", "NVDA": "NVDA",
    "特斯拉": "TSLA", "TSLA": "TSLA",
    "亚马逊": "AMZN", "Amazon": "AMZN",
    "谷歌": "GOOGL", "微软": "MSFT", "MSFT": "MSFT",
    "Meta": "META", "脸书": "META",
    "可口可乐": "KO", "Costco": "COST", "好市多": "COST",
}
# 反向：代码 → 中文名
TICKER_TO_NAME = {v: k for k, v in STOCK_ALIASES.items() if not k.isupper() or len(k) > 4}

# === 方法论概念 ===
CONCEPT_PATTERNS = {
    "护城河": r"护城河|moat",
    "能力圈": r"能力圈|看不懂|不懂不投",
    "本分": r"本分",
    "复利": r"复利",
    "现金流": r"现金流|fcf|FCF|自由现金流",
    "ROE": r"\bROE\b|净资产收益率",
    "ROIC": r"\bROIC\b|投入资本回报",
    "PE": r"\bPE\b|市盈率|p\.?e",
    "PB": r"\bPB\b|市净率",
    "PEG": r"\bPEG\b",
    "估值": r"估值|valuation",
    "价值投资": r"价值投资|value investing",
    "stop_doing_list": r"stop doing list|stop\s*doing",
    "看十年": r"看十年|10年|十年后|长期持有",
    "低估": r"低估|undervalu",
    "逆向": r"逆向|contrarian|contrar",
    "分散": r"分散|diversif",
    "排雷": r"排雷|避雷",
    "股息": r"股息|分红|dividend",
    "回购": r"回购|buyback",
    "管理层": r"管理层|CEO|创始人",
    "商业模式": r"商业模式|生意模式|business model",
}

# === 帖子类型 ===
POSITION_PATTERNS = [
    r"今天\s*(?:还\s*)?买了?\s*[点些]?",
    r"加仓",
    r"减仓|卖了?",
    r"换成?了|换\s*了",
    r"清仓|清了",
    r"建仓|建了",
    r"持仓",
    r"all in|allin",
    r"重仓",
]
POSITION_RE = re.compile("|".join(POSITION_PATTERNS), re.I)

REPLY_RE = re.compile(r"^(?:回复\s*)?@[一-鿿\w]+:|//\s*@")  # "回复@xxx:" 或 "//@xxx:"
RETWEET_RE = re.compile(r"^转发|^转\s|^retweet", re.I)
BOOK_RE = re.compile(r"读了?《|看完《|推荐\s*《|本书|《[^》]+》")
LIFE_RE = re.compile(r"生日|妈妈|球|湖人|nba|NBA|篮球|足球|高尔夫|打球|健康")

# === 情感（简单规则）===
BULL_RE = re.compile(r"看好|买入|加仓|增持|上涨|向上|乐观|right|不错|喜欢|good|爱|repurchase")
BEAR_RE = re.compile(r"卖出|减仓|清仓|看空|危险|风险|崩盘|下跌|不靠谱|烂|垃圾|警惕|远离")
SARCASM_RE = re.compile(r"哈哈哈|哈哈|笑|忽悠|韭菜|🤣|😂")


def normalize_text(html: str) -> str:
    if not html: return ""
    t = re.sub(r"<br\s*/?>", "\n", html)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"&nbsp;|&amp;|&quot;", " ", t).strip()


def tag_post(text: str, raw_text: str, like_count: int, rt_count: int) -> dict:
    text = text or ""
    raw = raw_text or text
    # 1. 股票（按代码 + 中文名）
    mentioned_codes = set()
    for alias, code in STOCK_ALIASES.items():
        if alias in text:
            mentioned_codes.add(code)
    # 雪球 $股票名(代码)$ 正则
    for m in re.finditer(r"\$([^$()]+)\(([A-Z]{0,2}\d{4,6}|[A-Z]+\.?[A-Z]*)\)\$", raw):
        code = m.group(2).replace(".", "").upper()
        mentioned_codes.add(code)
    # 中文公司名
    company_names = sorted(set(k for k in STOCK_ALIASES if k in text and not k.isascii()))

    # 2. 概念
    concepts = [name for name, pat in CONCEPT_PATTERNS.items() if re.search(pat, text)]

    # 3. 帖子类型
    if REPLY_RE.search(text):
        post_type = "reply"
    elif RETWEET_RE.search(text):
        post_type = "retweet"
    elif POSITION_RE.search(text) and ("$" in raw or any(s in text for s in STOCK_ALIASES)):
        post_type = "position_change"
    elif BOOK_RE.search(text):
        post_type = "book_recommend"
    elif LIFE_RE.search(text) and len(mentioned_codes) == 0:
        post_type = "life"
    elif len(text) > 30:
        post_type = "original"
    else:
        post_type = "other"

    # 4. 情感
    bull = bool(BULL_RE.search(text))
    bear = bool(BEAR_RE.search(text))
    sarc = bool(SARCASM_RE.search(text))
    if sarc:
        sentiment = "sarcasm"
    elif bull and not bear:
        sentiment = "bullish"
    elif bear and not bull:
        sentiment = "bearish"
    else:
        sentiment = "neutral"

    # 5. has_position_change
    has_position = bool(POSITION_RE.search(text)) and bool(mentioned_codes)

    # 6. importance_score
    score = (like_count or 0) * 1.0 + (rt_count or 0) * 2.0
    if "$" in raw: score += 50
    if has_position: score += 100
    if len(text) > 80: score += 20
    if post_type == "original" and len(concepts) >= 2: score += 50

    return {
        "mention_codes": ",".join(sorted(mentioned_codes)),
        "mention_names": ",".join(company_names),
        "concepts": ",".join(concepts),
        "post_type": post_type,
        "sentiment": sentiment,
        "has_position_change": 1 if has_position else 0,
        "importance_score": int(score),
        "text_length": len(text),
    }


def add_columns(conn):
    cur = conn.cursor()
    cols = [r[1] for r in cur.execute("PRAGMA table_info(posts)").fetchall()]
    add_sql = []
    for col, t in [
        ("mention_codes", "TEXT"), ("mention_names", "TEXT"),
        ("concepts", "TEXT"), ("post_type", "TEXT"),
        ("sentiment", "TEXT"), ("has_position_change", "INTEGER"),
        ("importance_score", "INTEGER"), ("text_length", "INTEGER"),
    ]:
        if col not in cols:
            add_sql.append(f"ALTER TABLE posts ADD COLUMN {col} {t}")
    for sql in add_sql:
        cur.execute(sql)
    # indexes
    for idx_sql in [
        "CREATE INDEX IF NOT EXISTS idx_post_type ON posts(post_type)",
        "CREATE INDEX IF NOT EXISTS idx_sentiment ON posts(sentiment)",
        "CREATE INDEX IF NOT EXISTS idx_has_position ON posts(has_position_change)",
        "CREATE INDEX IF NOT EXISTS idx_importance ON posts(importance_score)",
        "CREATE INDEX IF NOT EXISTS idx_timestamp ON posts(timestamp)",
    ]:
        cur.execute(idx_sql)
    conn.commit()


def govern(slug: str):
    db = DATA_DIR / f"{slug}.sqlite"
    if not db.exists():
        print(f"⚠️  {db} 不存在")
        return
    print(f"\n📂 治理 {slug}...")
    conn = sqlite3.connect(str(db))
    add_columns(conn)
    rows = conn.execute("SELECT id, text, raw_text, like_count, retweet_count FROM posts").fetchall()
    print(f"  {len(rows)} 条 post 待治理...")
    cur = conn.cursor()
    type_count, sent_count = {}, {}
    pos_change = 0
    for r in rows:
        id_, text, raw, lc, rt = r
        text = text or normalize_text(raw or "")
        tags = tag_post(text, raw or "", lc or 0, rt or 0)
        cur.execute("""UPDATE posts SET
            mention_codes=?, mention_names=?, concepts=?,
            post_type=?, sentiment=?, has_position_change=?,
            importance_score=?, text_length=? WHERE id=?""",
            (tags["mention_codes"], tags["mention_names"], tags["concepts"],
             tags["post_type"], tags["sentiment"], tags["has_position_change"],
             tags["importance_score"], tags["text_length"], id_))
        type_count[tags["post_type"]] = type_count.get(tags["post_type"], 0) + 1
        sent_count[tags["sentiment"]] = sent_count.get(tags["sentiment"], 0) + 1
        pos_change += tags["has_position_change"]
    conn.commit()

    # 统计报告
    print("\n  📊 类型分布:")
    for t, c in sorted(type_count.items(), key=lambda x: -x[1]):
        print(f"    {t:<20} {c:>5}")
    print("\n  📊 情感分布:")
    for s, c in sorted(sent_count.items(), key=lambda x: -x[1]):
        print(f"    {s:<10} {c:>5}")
    print(f"\n  📊 持仓变化帖: {pos_change} 条")

    # 持仓变化具体股票统计
    print("\n  📊 持仓变化提到的股票 Top 10:")
    pc_rows = conn.execute("""SELECT mention_codes, COUNT(*) FROM posts
                              WHERE has_position_change=1 AND mention_codes != ''
                              GROUP BY mention_codes ORDER BY 2 DESC LIMIT 10""").fetchall()
    for codes, c in pc_rows:
        print(f"    {codes:<30} {c}")

    # 概念热度 top
    print("\n  📊 高概念密度 post 数 Top 5 概念:")
    cm = {}
    for r in conn.execute("SELECT concepts FROM posts WHERE concepts != ''").fetchall():
        for c in r[0].split(","):
            cm[c] = cm.get(c, 0) + 1
    for c, cnt in sorted(cm.items(), key=lambda x: -x[1])[:10]:
        print(f"    {c:<20} {cnt}")

    conn.close()
    print(f"\n✅ {slug} 治理完成")


def main():
    arg = sys.argv[1] if len(sys.argv) > 1 else "all"
    if arg == "all":
        for s in SAGES: govern(s)
    else:
        govern(arg)


if __name__ == "__main__":
    main()
