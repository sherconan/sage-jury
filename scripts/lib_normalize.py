"""繁简 + 粤普 normalize + jieba 关键词提取
=================================================
解决 RAG 检索三大痛点：
1. 用户简体「壁垒」查不到管我财繁体「壁壘」语料
2. 粤语「點解/嘅/啲/睇好」跟普通话「为什么/的/些/看好」不通
3. 整句被当一个 term，无法精准匹配

提供：
- normalize(text)：繁→简 + 粤→普
- extract_keywords(text)：jieba 分词 + 停用词过滤 + 返回 top N
"""
import re
import zhconv
import jieba
import jieba.analyse

# 关键的粤普词典（按字符数倒序，长词优先）
HK_TO_MANDARIN = [
    # 句首 / 助词
    ("點解", "为什么"), ("點樣", "怎么样"), ("係咁", "是这样"), ("唔係", "不是"),
    ("唔好", "不要"), ("唔知", "不知"), ("好似", "好像"), ("呢個", "这个"),
    ("呢隻", "这只"), ("嗰個", "那个"), ("嗰隻", "那只"), ("邊度", "哪里"),
    ("邊個", "哪个"), ("幾多", "多少"), ("乜嘢", "什么"), ("有冇", "有没有"),
    ("係咪", "是不是"), ("會唔會", "会不会"), ("冇得", "没有"),
    ("唔會", "不会"), ("唔識", "不会"), ("可以咁", "可以这样"),
    # 单字
    ("嘅", "的"), ("咗", "了"), ("喺", "在"), ("啲", "些"),
    ("冇", "没"), ("畀", "给"), ("俾", "给"), ("咁", "这么"),
    ("咩", "什么"), ("邊", "哪"), ("唔", "不"), ("睇", "看"),
    ("識", "会"), ("靚", "好"), ("搵", "找"), ("嚟", "来"),
    ("㗎", "啊"), ("呀", "呀"), ("囉", "啰"), ("喎", "哦"),
    ("攞", "拿"), ("揀", "挑"), ("揾", "找"),
    ("成", "整"),
]

# 简单股票别名扩展（提高召回）
STOCK_ALIAS_EXPAND = {
    "腾讯": ["腾讯", "騰訊", "00700", "Tencent", "Tencent控股", "腾讯控股"],
    "茅台": ["茅台", "貴州茅台", "贵州茅台", "600519"],
    "泡泡玛特": ["泡泡玛特", "泡泡瑪特", "9992", "09992"],
    "招行": ["招行", "招商银行", "招商銀行", "600036"],
    "工行": ["工行", "工商银行", "工商銀行", "601398"],
    "平安": ["平安", "中国平安", "中國平安", "601318"],
    "美团": ["美团", "美團", "3690"],
    "京东": ["京东", "京東", "9618"],
    "比亚迪": ["比亚迪", "比亞迪", "BYD", "002594"],
    "小米": ["小米", "Xiaomi", "1810"],
    "阿里": ["阿里", "阿里巴巴", "BABA", "9988"],
    "苹果": ["苹果", "蘋果", "AAPL", "Apple"],
    "网易": ["网易", "網易", "NTES"],
    "拼多多": ["拼多多", "PDD"],
    "万科": ["万科", "萬科"],
    "格力": ["格力", "格力電器", "格力电器", "000651"],
    "美的": ["美的", "美的集團", "美的集团", "000333"],
    "宁德时代": ["宁德时代", "寧德時代", "300750"],
    "片仔癀": ["片仔癀", "600436"],
    "云南白药": ["云南白药", "雲南白藥", "000538"],
    "海天": ["海天", "海天味業", "海天味业", "603288"],
    "伊利": ["伊利", "伊利股份", "600887"],
    "神华": ["神华", "神華", "中國神華", "中国神华", "601088"],
}

# 停用词（jieba 分词后过滤，提高 keyword 质量）
STOPWORDS = set("""
的 了 是 在 我 有 和 就 不 也 都 这 那 与 及 但 于
吧 呀 啊 哦 嗯 呵 哈 嘛 呐 呗 哟 嗨 哇 唉 哎
你 我 他 她 它 们 自己 大家 这个 那个 一个 一些 这些 那些
什么 怎么 怎样 为何 哪个 哪里 哪 哪些 多少 几个 几次
能 会 要 该 应 可以 可能 应该 必须 也许
说 看 想 觉得 认为 知道 觉
比较 非常 很 太 挺 真 还 又 也 才 就
如果 那么 但是 而且 然后 所以 因为 由于 不过
现在 目前 已经 还 仍 总是 经常 偶尔
中 上 下 里 外 前 后 左 右
""".split())


def normalize(text: str) -> str:
    """繁→简 + 粤→普 标准化"""
    if not text:
        return ""
    # 1. 粤普替换（在繁简前做，因为粤字常用繁体）
    for hk, m in HK_TO_MANDARIN:
        text = text.replace(hk, m)
    # 2. 繁简
    text = zhconv.convert(text, "zh-cn")
    return text


def extract_keywords(text: str, top_k: int = 12) -> list[str]:
    """jieba 提取关键词 + 过滤停用词"""
    if not text:
        return []
    # 先 normalize 再分词
    n = normalize(text)
    # tf-idf 关键词
    tags = jieba.analyse.extract_tags(n, topK=top_k * 2, withWeight=False)
    # 过滤停用词 + 单字 + 数字噪音
    out = []
    for t in tags:
        if t in STOPWORDS:
            continue
        if len(t) < 2:
            continue
        if re.match(r"^\d+$", t):
            continue
        out.append(t)
        if len(out) >= top_k:
            break
    return out


def expand_query(query: str) -> set[str]:
    """把 query 扩展成多个匹配 token：
    - normalize 后的词
    - 股票别名扩展
    - jieba 切词"""
    n = normalize(query)
    tokens = set()
    # jieba 切词
    for t in jieba.cut(n):
        t = t.strip()
        if len(t) >= 2 and t not in STOPWORDS:
            tokens.add(t)
    # 股票别名扩展
    for canon, aliases in STOCK_ALIAS_EXPAND.items():
        if any(a in n or a in query for a in aliases):
            tokens.update(aliases)
    return tokens


if __name__ == "__main__":
    # smoke test
    tests = [
        "管哥怎么看腾讯？现在能买吗？",
        "壁垒怎么看？",
        "點解唔買招商銀行嘅？",
        "段大你最近换仓泡泡玛特了？",
    ]
    for q in tests:
        print(f"\nquery: {q}")
        print(f"  normalize: {normalize(q)}")
        print(f"  keywords:  {extract_keywords(q)}")
        print(f"  expand:    {sorted(expand_query(q))}")
