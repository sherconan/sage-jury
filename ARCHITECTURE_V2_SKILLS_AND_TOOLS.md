# Sage Chat · v2 设计补充：Skill 提纯 + Tool 配置

> 用户指令："产品的关键目前是两个点：第一是这个人投资思想的 skill，第二是 agent 以及 tool 的配置。先设计好结构，再做优化。"

## 1. Skill 提纯现状审计（v2 → v3 改进方向）

### 1.1 当前 v2 sage skill 现状

实测「泡泡玛特怎么看」两个 sage 各 540 字回复，**提纯命中率 90%+**：

| 命中 | 段永平 | 管我财 |
|---|---|---|
| 真实时间线 | 8月不懂 → 3月重看 → 5月7日换神华 | 3月25日观察仓 + 4月19日游客观察 |
| 决策框架 | "想 10 年后" + "对的事把事做对" | "PE 分位 + 5% 股息" 直接 pass |
| 真实数据 | 2025 营收 371 亿+净利 127 亿 | 168 港元 + 0.2% 仓位 + 德银 27% 下滑 |
| 招牌句 | "反正我是这么看的，对错我自己负责" | "等是我的核心竞争力" + "放长线钓大鱼" |
| 灰色操作 | - | "态度票"（不投但买 0.2%）|

### 1.2 v3 提纯升级（4 类新文件 / sage）

#### A. `mental_models.md` —— 反射式心理模型（最缺）

不是「方法论描述」，是「看到 X 信号时本能反应」。

**段永平示例：**

```
看到「重资产 + 技术快速变化」 → 反射: stop doing list 第三条, 不碰
看到「公司讲大故事」 → 反射: 警惕本分, 看历史言行
看到「CEO 频繁卖股票」 → 反射: 团队靠不靠谱亮红灯
看到「我用不上的产品」 → 反射: 看不懂, 不投
看到「跌 30%」 → 反射: 不动, 看 10 年后
```

**管我财示例：**

```
看到「PE 历史 > 70 分位」 → 反射: 立即 pass
看到「股息率 < 5%」 → 反射: 没下行保护, 至少减半
看到「商誉 > 净资产 30%」 → 反射: 直接 pass
看到「频繁配股」 → 反射: 老千股气味, 永不碰
看到「市场绝望价」 → 反射: 慢慢分批
看到「我重仓 XX」 → 反射: 重仓本身就是问题
```

#### B. `anti_patterns.md` —— 反例集合

不只是"喜欢什么"，更要"绝对不碰什么"，反向定义 sage 的能力圈。

#### C. `default_position_logic.md` —— 仓位决策

```
段永平: 集中持仓 (5-8 只), 单只 10-30% OK, 长期看 10 年
管我财: 极度分散 (AH 各 10 只), 单只 5% 上限, 1 年荒岛不能换
```

#### D. SKILL_CORE.md 极致压缩

当前 SKILL.md 3KB → 1.5KB single-page persona card：
- 一句话身份
- 5 条 do
- 5 条 don't  
- 工具偏好 1 行
- 输出格式 3 行铁律

其他文件全部推到 RAG 按需调用（mental_models 只在问决策时调，classic_holdings 只在问股票时调）。

## 2. Tool v2 重设计

### 2.1 现状 4 工具 + 缺口分析

| 现有 | 评估 | 谁会用 |
|---|---|---|
| search_sage_post (BM25+rerank) | ⭐⭐⭐⭐⭐ 必备 | 两个 sage 都用 |
| web_search (Bocha) | ⭐⭐⭐⭐⭐ 必备 | 两个 sage 都用 |
| get_realtime_quote | ⭐⭐⭐⭐⭐ 必备 | 两个 sage 都用 |
| get_kline | ⭐⭐⭐ 中频 | 两个 sage 偶尔用 |

**真实缺口（实测中暴露）：**

| 缺失工具 | 场景 | 优先用户 |
|---|---|---|
| `get_financials` | "ROE/毛利率/三年增长" — 管哥每次必看 | 管哥优先 |
| `get_pe_history_pct` | "PE 历史分位" — 管哥核心信条 | **管哥强需** |
| `get_dividend_history` | "5 年派息记录" | 管哥强需 |
| `get_business_segments` | "茅台直销占比/苹果服务占比" | 段永平偏好 |
| `get_top_holders` | "谁还在拿这只股" | 段永平偏好（看机构持仓变化）|
| `compare_stocks` | "茅台 vs 五粮液" | 两个 sage 都需要（multi-stock 对比模式）|

### 2.2 v3 工具集（8 个，按调用频次排）

```
高频 (>50% 对话都用):
1. search_sage_post     — 自己历史发言语义搜
2. get_realtime_quote   — 当前 PE/价/股息
3. get_pe_history_pct   — PE 历史分位（管哥核心）

中频 (20-50%):
4. get_financials       — 年报关键指标 (ROE/毛利/3年增长)
5. web_search           — 最新事件/政策/争议
6. get_dividend_history — 派息历史

低频 (<20%):
7. get_kline            — K 线/趋势
8. compare_stocks       — 多股对比 (multi-stock 模式触发)
```

### 2.3 Per-Sage Tool Priority（Router 决策用）

| 工具 | 段永平权重 | 管我财权重 |
|---|---|---|
| search_sage_post | 0.9 | 0.9 |
| get_realtime_quote | 0.7 | 0.95 |
| get_pe_history_pct | 0.3 | **0.95** |
| get_financials | 0.6 | 0.7 |
| get_dividend_history | 0.2 | **0.9** |
| web_search | 0.5 | 0.5 |
| get_kline | 0.2 | 0.1 |
| compare_stocks | 0.5 | 0.4 |

Router 决策时不只看 user msg，也看 sage tool priority 加权。

## 3. v2 架构 + v3 Skill/Tool 完整数据流

```
user msg + sage_id
    ↓
┌─────────────────────────────────────────┐
│ Memory Loader                            │
│   GlobalProfile (per-sage, 跨 session)   │
│   SessionContext (本对话最近 5 轮摘要)    │
└────────────────────┬────────────────────┘
                     ▼
┌─────────────────────────────────────────┐
│ Router LLM (deepseek-chat, 3s)           │
│  input: msg + memory + sage_card 1.5KB  │
│         + sage 的 tool_priority           │
│  output JSON:                             │
│   {                                       │
│     mode: 'valuation'|'methodology'|...   │
│     tools: [{name, args, reason}],        │
│     comparison?: { tickers: [...] },      │
│     skill_files_to_load: [               │
│       'mental_models',                    │
│       'classic_holdings' (if 提到股票)    │
│       'methodology' (if 问方法论)         │
│     ]                                     │
│   }                                       │
└────────────────────┬────────────────────┘
                     ▼ stream router_decision event
┌─────────────────────────────────────────┐
│ Tool Executor (并行)                     │
│  按 router 输出执行 8 工具中的子集        │
│  每个工具有 fallback                      │
└────────────────────┬────────────────────┘
                     ▼ stream tool_progress events
┌─────────────────────────────────────────┐
│ Writer LLM (deepseek-chat, stream)       │
│  input:                                   │
│   - SKILL_CORE.md 1.5KB (始终)           │
│   - router 决定加载的 skill 文件 (~3-5KB) │
│   - 1 voice sample 样本 1KB              │
│   - 1 few-shot example 2KB                │
│   - tool 结果 (~3KB)                      │
│   - memory 摘要 0.5KB                     │
│   total ~10KB (v1 是 30KB)                │
│  禁: 调任何工具 / 思考                    │
│  允: 输出 <NEED_TOOL: X> token 请求补救   │
└────────────────────┬────────────────────┘
                     ▼ stream writer_chunk events
┌─────────────────────────────────────────┐
│ Reflector (异步, 1/5 抽样)               │
│  - 风格评分 (无 ##/表格/Step)            │
│  - 提取本轮讨论标的 → 写入 Memory         │
│  - 提取用户风险偏好信号 → 更新 GlobalProfile │
└─────────────────────────────────────────┘
                     ▼ stream reflection event (可选)
```

## 4. v3 Skill 文件清单

```
/public/sages/<slug>/
├── SKILL_CORE.md             (1.5KB) ← 始终注入
├── voice_one_sample.md       (1KB)   ← 始终注入
├── few_shot_example.md       (2KB)   ← 始终注入
├── mental_models.md          (3KB)   ← 问决策类调
├── anti_patterns.md          (2KB)   ← 风险/反例问题调
├── default_position_logic.md (1.5KB) ← 仓位类问题调
├── methodology.md            (5KB)   ← 问方法论调
├── classic_holdings.md       (5-10KB)← 提到对应股票调
└── triggers.md               (1KB)   ← Router 用判断模式
```

## 5. 实施分阶段（v2.2，含 Skill v3）

| Phase | 内容 | 估时 |
|---|---|---|
| **D-1** | 设计文档 (本文) + ROUTER_SCHEMA.md JSON schema | 1h |
| **D0** | mini AB test (chat vs v4-pro × 6 case) | 1h |
| **D1** | Skill v3 文件改造 (段永平 + 管我财 各 4 个新文件) | 4h |
| **D2** | Tool v3: 实现 get_pe_history_pct / get_financials / get_dividend_history / compare_stocks | 3h |
| **D3** | Router endpoint + JSON schema | 2h |
| **D4** | Writer endpoint (新, 禁工具, NEED_TOOL 协议) | 2.5h |
| **D5** | Memory 双层 | 2h |
| **D6** | Reflector 抽样 | 1.5h |
| **D7** | UI 适配 5 事件 SSE 协议 | 2h |
| **D8** | 平滑迁移 + 旧 endpoint deprecate | 1h |
| **D9** | 30 case 评测台 + 自动评分 | 3h |

总 ~23h。

## 6. 设计取舍最终对照

| 维度 | v1 现在 | v2.2 设计 |
|---|---|---|
| Sage skill 文件 | 6 文件 30KB 全塞 | 9 文件，按 router 决策加载 ~5-10KB |
| Tool 数量 | 4 | 8 (+pe_history/financials/dividend/compare) |
| 工具决策 | LLM ReAct 混合 | Router JSON 一次性 + Writer NEED_TOOL 补救 |
| LLM 角色 | 1 (混) | 3 (Router/Writer/Reflector) |
| Memory | 无 | GlobalProfile (跨 session) + SessionContext |
| 提纯深度 | persona+voice+methodology | + mental_models + anti_patterns + default_position |

## 7. 待你拍板

1. **Skill v3 提纯方向**（mental_models / anti_patterns / default_position_logic 三类新文件）认可吗？
2. **Tool v3 新增 4 个**（pe_history / financials / dividend / compare）按这个优先级？
3. **D-1 / D0 我现在就开干？** 还是先讨论 §1-2 哪条改？
