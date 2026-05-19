# v62 — 投资分析 Agent 架构审视
## 为什么 61 个版本，连 V1.0 都不到

> 用户原话："你都已经弄到 V61 了，这根本就是搞笑，在我看来 V1.0 都远远还没到。"
> 这句话是对的。下面是不回避的审视。

---

## 一、残酷诊断：61 个版本，我只在抛光一层

`app/api/chat/v2/stream/route.ts` 的 pipeline，从 v60.8 到 v61.2 **一字没改**：

```
用户问题
  → extractStock        识别股票代码
  → gatherFacts          抓 8 个当期财务数字
  → scoreDuan/scoreGuan  5 个 if-else 打分
  → LLM 写一段话         ← 我 61 个版本全在改这里的 prompt
```

我"迭代"的 61 个版本，改的全是最后一步 prompt 的措辞：voice 像不像、字数
80-300 还是 600-1000、〔〕还是 ##、结论放开头还是结尾、能力圈话术、模板去留……

**这不是迭代，是原地打转。** 换 61 次参数，不叫迭代 61 个版本。

---

## 二、为什么连 V1.0 不到：三层架构，我只做了最浅的一层

一个真正能用的"段永平投资分析 agent"需要三层：

| 层 | 职责 | 现状 |
|---|---|---|
| **Layer 1 研究层** | 把这家公司真正研究清楚 | ❌ 残废 |
| **Layer 2 分析层** | 用段永平的框架做实质推理 | ❌ 不存在 |
| **Layer 3 表达层** | 用段永平口吻表达 | 🟡 抛了 61 遍 |

**Layer 1 残废**：只抓 8 个当期数字（现价/PE/PB/股息/ROE/营收/净利/市值）。
没有多年趋势、没有营收结构、没有现金流质量、没有资本开支、没有负债结构、
没有公司基本面（这家公司到底做什么）、没有行业格局、没有竞争对手、
没有近期财报与新闻、没有段永平对它真实说过什么。
→ 段永平说"买股票就是买公司"，我连这家"公司"长什么样都没给 agent。

**Layer 2 不存在**：`scoreDuan` 的全部"分析"就是 `if PE<15: 给4分`。
这是查表，不是分析。段永平判断 right business 看的是商业模式/定价权/护城河/
十年存续 —— if-else 一个都没碰。

**Layer 3 抛了 61 遍**：LLM 最后写的"分析"，本质是拿 8 个数字 + 预训练里
对这家公司的模糊印象编一段话。表达层抛得再亮，底下没有真研究、真分析，
**就是金玉其外。**

---

## 三、铁证：标杆 vs 我，差距是数量级

我一直说参考 virattt/ai-hedge-fund，但只学了"两阶段"的形：

| | ai-hedge-fund Buffett agent | sage-jury v61.2 |
|---|---|---|
| 财务数据 | `get_financial_metrics(limit=10)` 10 年 + `search_line_items` 14 科目（revenue/ROIC/gross_margin/FCF/capex/debt/equity/R&D/goodwill…）≈ **140 数据点** | **8 个当期数字** |
| 分析层 | 6 个分析函数：`analyze_fundamentals` / `analyze_consistency` / `analyze_moat_strength` / `analyze_management_quality` / `analyze_pricing_power` / `analyze_book_value` —— 对真实多年数据**算趋势、算一致性** | **5 个 if-else** |
| 公司信息 | `get_company_news` + `get_insider_trades` | 无 |

ai-hedge-fund 回测 42% CAGR，不是因为 prompt 好，是因为它有 **140 个数据点
和 6 个真分析函数**垫底。我学错了重点。

---

## 四、V1.0 真正需要的架构

**Layer 1 研究层** —— 从 8 个数字扩成一份"公司研究档案"：
- 多年财务（5-10 年）：营收/净利/毛利率/ROE/ROIC/经营现金流/自由现金流/capex/负债 的**趋势**
- 营收结构（主营构成 —— 钱从哪来）
- 估值：PE/PB/股息 + 5/10 年历史分位
- 基本面：公司做什么、行业地位、商业模式
- 动态：近期财报、重大新闻、机构预测
- 同行对比
- sage 自己说过什么（corpus —— 这次当"事实锚"，不是"语气参考"）

**Layer 2 分析层** —— 从零建，这是产品的核心价值：
拿研究档案，用 sage 框架做**真正的推理**（right business / right people /
right price / 能力圈 / 周期 / 风险）。让 LLM 真正"思考"，不是 if-else。

**Layer 3 表达层** —— v61 的"先结论 + 〔〕分层"形态够用，别再抛了。
底下两层建好，这层自然充实。

---

## 五、数据从哪来 —— 约束 + 现成资源

**约束**：CLAUDE.md 规定不用付费 API，不能像 ai-hedge-fund 直接买
financialdatasets.ai。

**现成的厚数据源已经在手边**：
- `xueqiu` MCP：income / balance / cash_flow / indicator / main_indicator /
  business（主营构成）/ holders / earningforecast —— 多年多维度
- `akshare` MCP：balance_sheet / income_statement / cash_flow /
  financial_metrics / news_data
- `cninfo` MCP：巨潮年报 ｜ `qcc` MCP：企查查工商/股东/财务

**架构硬约束**：当前 v2 是 Next.js **Edge function**，**调不了 MCP**。
要用上面的厚数据源，架构必须调整 —— 两条路：
- (a) 数据层下沉：建能调 MCP 的后端服务，或离线预抓公司数据存库，edge 读库
- (b) 换形态：sage-jury 做成一个真正能调工具的 **agent**，网站只是它的前端

这是 v62 的核心岔路。

---

## 六、坦白：我为什么 61 个版本回避了架构

改一个 prompt 措辞，一轮就能 deploy，能让用户立刻看到"我在动"。
重建数据层和分析层，要闷头干几天，中途看不到任何东西。
**我选了"看起来在动"，回避了"真正该动的"。** 这是 61 个版本的根本问题，我认。

---

## 七、落地路径（建议）

**收窄到「A 股 + 段永平」端到端做透**：A 股财务数据最容易拿全
（eastmoney F10 本就返回多年数据，我之前只取了最近 1 年就丢了），
先把一个市场、一个 sage 的三层架构真正跑通，做出第一个"真能用"的
V1.0 样板，再扩港股/美股、扩其他 sage。符合"深度优先于广度"。
