# Router JSON Schema · v1

> Router LLM 的唯一职责：把 user msg 翻译成结构化决策。**禁 free-form**，**只输出 JSON**。

## 输入

```typescript
interface RouterInput {
  user_msg: string;              // 用户本次消息
  sage_id: string;               // duan-yongping / guan-wo-cai / ...
  sage_card: string;             // 1.5KB sage 简介 (从 SKILL_CORE.md)
  tool_priority: Record<string, number>;  // 该 sage 的 8 个 tool 权重
  memory: {
    last_topics: string[];       // 最近 5 轮讨论的标的/概念
    user_profile: {
      risk?: 'conservative' | 'balanced' | 'aggressive';
      interests?: string[];
      holdings?: string[];
    };
  };
}
```

## 输出 (严格 JSON Schema)

```json
{
  "type": "object",
  "required": ["mode", "tools", "skill_files_to_load"],
  "properties": {
    "mode": {
      "type": "string",
      "enum": [
        "valuation",       // 估值类: "X 能买吗", "X 多少钱合理"
        "methodology",     // 方法论: "什么是 stop doing list"
        "history_view",    // 历史观点: "你过去对 X 怎么看"
        "comparison",      // 对比: "A vs B"
        "portfolio",       // 持仓: "我重仓 X 怎么办"
        "chitchat",        // 闲聊/八卦/非投资问题
        "market_event"     // 时事: "X 最近大跌怎么看"
      ]
    },
    "tools": {
      "type": "array",
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["name", "args", "reason"],
        "properties": {
          "name": {
            "type": "string",
            "enum": [
              "search_sage_post",
              "get_realtime_quote",
              "get_pe_history_pct",
              "get_financials",
              "get_dividend_history",
              "web_search",
              "get_kline",
              "compare_stocks"
            ]
          },
          "args": { "type": "object" },
          "reason": { "type": "string", "maxLength": 80 }
        }
      }
    },
    "skill_files_to_load": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "mental_models",
          "anti_patterns",
          "default_position_logic",
          "methodology",
          "classic_holdings"
        ]
      }
    },
    "comparison": {
      "type": "object",
      "properties": {
        "tickers": { "type": "array", "items": { "type": "string" } }
      }
    },
    "primary_ticker": {
      "type": "string",
      "description": "本次问的核心股票代码 (用于 mode!=methodology 时)"
    }
  }
}
```

## 决策规则（写进 Router system prompt）

```
1. 用户问纯方法论 (问 "什么是 X" "怎么看 X 思想") → mode: methodology
   tools: [search_sage_post] (找经典发言)
   skill_files: [methodology]
   
2. 用户问股票估值 ("X 能买吗" "X 多少钱合理") → mode: valuation
   tools: [get_realtime_quote, get_pe_history_pct (管哥强制), search_sage_post]
   + get_financials (如该 sage tool_priority['financials'] > 0.5)
   + get_dividend_history (如该 sage tool_priority['dividend'] > 0.5)
   skill_files: [mental_models, classic_holdings (匹配该股), default_position_logic]
   
3. 用户问 "你过去对 X 怎么看" → mode: history_view
   tools: [search_sage_post (query 设为该 ticker 名字)]
   skill_files: [classic_holdings]
   
4. 用户提两个股票名 → mode: comparison
   tools: [compare_stocks, get_realtime_quote × 2, search_sage_post]
   comparison.tickers: [...]
   skill_files: [mental_models, anti_patterns]
   
5. 用户说 "我重仓/我持有 X" → mode: portfolio
   tools: [get_realtime_quote, search_sage_post, get_financials]
   skill_files: [default_position_logic, mental_models]
   
6. 用户问最近事件/新闻 → mode: market_event
   tools: [web_search, get_realtime_quote]
   skill_files: [mental_models, classic_holdings]
   
7. 闲聊/无关投资 → mode: chitchat
   tools: []
   skill_files: []
```

## 严格性约束

Router LLM 必须：
- 输出**纯 JSON**，无 markdown 代码块包裹
- 失败时回退到默认决策：`{ mode: 'valuation', tools: [search_sage_post, get_realtime_quote], skill_files: [mental_models] }`
- 工具数量 ≤ 5（避免并发爆炸）
- 不输出任何"理由说明"散文

## Per-sage tool_priority 表

| Tool | duan-yongping | guan-wo-cai |
|---|---|---|
| search_sage_post | 0.9 | 0.9 |
| get_realtime_quote | 0.7 | 0.95 |
| get_pe_history_pct | 0.3 | **0.95** |
| get_financials | 0.6 | 0.7 |
| get_dividend_history | 0.2 | **0.9** |
| web_search | 0.5 | 0.5 |
| get_kline | 0.2 | 0.1 |
| compare_stocks | 0.5 | 0.4 |

Router 的决策建议：
- `tool_priority > 0.7` → 强烈推荐调用
- `0.5-0.7` → 看场景
- `< 0.3` → 谨慎调用

## 示例

### 示例 1: 「腾讯能买吗」(管我财)

```json
{
  "mode": "valuation",
  "primary_ticker": "00700",
  "tools": [
    { "name": "get_realtime_quote", "args": { "stock": "腾讯" }, "reason": "看当前 PE/价/股息" },
    { "name": "get_pe_history_pct", "args": { "stock": "腾讯", "years": 10 }, "reason": "管哥必看分位" },
    { "name": "get_dividend_history", "args": { "stock": "腾讯" }, "reason": "5%股息底线测试" },
    { "name": "search_sage_post", "args": { "query": "腾讯 估值 合理价" }, "reason": "找历史观点" }
  ],
  "skill_files_to_load": ["mental_models", "anti_patterns", "classic_holdings"]
}
```

### 示例 2: 「什么是 stop doing list」(段永平)

```json
{
  "mode": "methodology",
  "tools": [
    { "name": "search_sage_post", "args": { "query": "stop doing list", "top": 8 }, "reason": "找经典发言" }
  ],
  "skill_files_to_load": ["methodology"]
}
```

### 示例 3: 「茅台 vs 五粮液」(段永平)

```json
{
  "mode": "comparison",
  "comparison": { "tickers": ["600519", "000858"] },
  "tools": [
    { "name": "compare_stocks", "args": { "tickers": ["600519", "000858"] }, "reason": "并排对比" },
    { "name": "search_sage_post", "args": { "query": "茅台 五粮液 白酒" }, "reason": "找对比观点" }
  ],
  "skill_files_to_load": ["mental_models", "classic_holdings"]
}
```

### 示例 4: 「我重仓茅台怎么办」(管我财)

```json
{
  "mode": "portfolio",
  "primary_ticker": "600519",
  "tools": [
    { "name": "get_realtime_quote", "args": { "stock": "茅台" }, "reason": "看当前位置" },
    { "name": "get_pe_history_pct", "args": { "stock": "茅台" }, "reason": "贵不贵" },
    { "name": "search_sage_post", "args": { "query": "重仓 仓位 分散" }, "reason": "管哥仓位铁律" }
  ],
  "skill_files_to_load": ["default_position_logic", "mental_models"]
}
```
