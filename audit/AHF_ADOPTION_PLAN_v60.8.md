# v60.8 · 抄 AI Hedge Fund 的两阶段架构（推翻 ReAct）

> 用户选 Path B (AI Hedge Fund) — 这是真改架构，不再 prompt 缝缝补补。

---

## 一、核心架构 insight（从 [virattt/ai-hedge-fund](https://github.com/virattt/ai-hedge-fund) buffett agent 抄到的）

### 他们的 Buffett agent 怎么写（35KB Python）

```python
def warren_buffett_agent(state):
    for ticker in tickers:
        metrics = get_financial_metrics(ticker, period="ttm", limit=10)
        financial_line_items = search_line_items(ticker, [...])
        market_cap = get_market_cap(ticker)

        # ⭐ Python 端跑 5 个量化分析（不是 LLM 干的）
        fundamental_analysis = analyze_fundamentals(metrics)        # 评分 + reasoning
        consistency_analysis = analyze_consistency(line_items)     # 评分 + reasoning
        moat_analysis = analyze_moat(metrics)                       # 评分 + reasoning
        pricing_power_analysis = analyze_pricing_power(...)         # 评分 + reasoning
        book_value_analysis = analyze_book_value_growth(...)       # 评分 + reasoning

        analysis_data = { 所有 5 个分析结果 JSON }

    # LLM 只做这一步：拿 JSON 写 Buffett-voice 输出
    return llm_call(
        system="You are Warren Buffett. Decide bullish/bearish/neutral using only provided facts. Checklist: Circle of competence / Moat / Mgmt / Financial / Margin of safety / Long-term outlook. Keep reasoning under 120 chars. Return JSON only.",
        human=f"Ticker: {ticker}\nFacts:\n{facts}\nReturn JSON: {signal, confidence, reasoning}",
    )
```

### 关键洞察对比

| 维度 | 我们 v60.7（错） | AI Hedge Fund（对） |
|---|---|---|
| LLM 干几件事 | 思考 + 调 7 工具 + 写作 | **只写 voice narrative** |
| 量化分析 | LLM 边调边想边写 | **Python 函数族算完输出 JSON** |
| 工具调用 | ReAct 自动决定（炸了） | Python 主控（确定性） |
| Prompt | 长（"你必须按 5 步走"） | **极短**（Checklist + Facts + JSON） |
| 输出 | 自由 narrative（容易跑偏） | **结构化 + Pydantic 验证** |

我们 LLM 干 3 件事必然 fuck up，他们 LLM 只干 1 件事（写口吻）→ 稳定。

---

## 二、v60.8 落地计划（适配段永平 + 中文场景）

### 模块 1：`lib/sage/duan_analyzers.ts` — Python-equivalent 量化分析（TS 版）

5 个 analyzer 函数（对应段永平 5 个维度）：

```typescript
analyzeCircle(ticker, businessDesc) → {
  score: 0-5,
  inCircle: boolean,
  reason: "消费品类 / 互联网类 / 苹果生态 → 在能力圈" 或 "搜索/生物医药/能源 → 圈外"
}
analyzeBusinessModel(financials) → {
  score: 0-5,
  rightBusiness: boolean,
  reason: "高毛利稳定 + ROE>15% + FCF 稳进 → right business"
}
analyzeManagement(dividends, insider) → {
  score: 0-5,
  rightPeople: boolean,
  reason: "回购+分红+高管增持 → 本分"
}
analyzePrice(quote, pe_history) → {
  score: 0-5,
  rightPrice: boolean,
  reason: "PE 30 倍 vs 10 年期国债 4% → 年化预期 10%，合理"
}
checkStopDoing(metrics) → {
  triggered: ["high_leverage" / "story_stock" / ...] | [],
  reason: "..."
}
```

每个函数 deterministic，没 LLM 参与，只算数字。

### 模块 2：`app/api/chat/v2/route.ts` — 两阶段 agent

```typescript
POST /api/chat/v2/stream

// Phase 1: 提取股票 + 跑量化分析
const stock = extractStock(userMsg);  // 简单 regex / LLM 一句话识别
if (stock) {
  // Python-equivalent analyzer 跑完
  const analysis = {
    circle: analyzeCircle(stock),
    business: analyzeBusinessModel(stock),
    mgmt: analyzeManagement(stock),
    price: analyzePrice(stock),
    stopDoing: checkStopDoing(stock),
  };
}

// Phase 2: LLM 只写 voice narrative（极短 prompt + 12 雪球 few-shot）
const sys = `你是段永平。12 条真实雪球短回复：[12 examples].
规则：80-200 字，不分段不分点，首句优先反问/场景。
拿到的分析数据是事实，你的工作是用段永平口吻 100 字内说人话。`;

const result = llm_call(sys, {
  user_query: userMsg,
  analysis: JSON.stringify(analysis),  // 5 维 JSON 注入
});

stream_back(result);
```

### 模块 3：`app/api/chat/v2/few_shot.ts` — 12 条真实雪球 voice 注入

复用 `audit/duan_real_short_replies.txt` 那 12 条，硬编码到 prompt。

---

## 三、与现状对比

| 项 | v60.7（现) | v60.8（新） |
|---|---|---|
| 路由 | /api/chat/stream | /api/chat/v2/stream（并存，不破坏现状） |
| LLM 角色 | ReAct + 写作 | 仅写作 |
| 工具 | 8 个 LLM 自决 | Python 主控 4-5 个 |
| 长度 | 200-500 字 | 80-200 字（强制） |
| 自由度 | 高（出 bug） | 低（高质量） |

---

## 四、实施步骤

1. ⏳ 写 `lib/sage/duan_analyzers.ts`（5 函数 + 单测）— 30 min
2. ⏳ 写 `app/api/chat/v2/route.ts`（两阶段 endpoint）— 30 min
3. ⏳ TS check + commit + deploy
4. ⏳ Prod curl 实测 + 跟 v60.7 同 query 对比
5. ⏳ 满意 → frontend 切换调用 `/v2`；不满意 → 调 prompt / analyzer 阈值

预计：1.5-2 小时完成 POC + 部署 + 实测。

---

## 五、风险

- 国内股 financial_metrics 数据源：用现有 akshare/雪球 wrapper（已有 8 工具实现可复用）
- 段永平的 "在能力圈内" 判断不是 Python 算得清的：用启发式 keyword 匹配（消费品 / 互联网 / 苹果产业链）+ LLM 兜底
- 中文 voice 输出：要不要保留 thinking model 推理 + content 两路？v60.8 先关 thinking，只做 voice，看效果

---

## 六、决定

✅ 用户选 Path B。我立刻开干。第一份代码 30 min 内交付（`lib/sage/duan_analyzers.ts`）。
