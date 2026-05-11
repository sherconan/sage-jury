# Sage Chat · 架构 v2 设计

> 用户反馈："你的 agent 设计是不是有问题，先优化设计再优化细节再去测试。"
> 当前 v1 病灶：单一 LLM 同时干 router + tool caller + writer + 风格控制 → 角色撕裂 → 表格化 / 兜底 hack 越加越多。

---

## 1. 顶层数据流

```
                                ┌──────────────────────┐
user msg ──────────────────────▶│  Memory Loader       │
                                │  session 摘要 +       │
                                │  用户画像 (~500 tk)   │
                                └──────────┬───────────┘
                                           ▼
                        ┌──────────────────────────────────────┐
                        │  Layer 1: Router LLM                  │
                        │  model: deepseek-chat (快/便宜/非思考) │
                        │  输入: msg + memory + sage 简介(2KB)  │
                        │  输出: JSON {                         │
                        │    tools_to_call: [{name,args}, ...] │
                        │    focus: valuation|method|chitchat  │
                        │    needs_search_sage: true/false     │
                        │  }                                    │
                        └────────────────────┬─────────────────┘
                                             ▼
                        ┌─────────────────────────────────────┐
                        │  Layer 2: Tool Executor              │
                        │  并行执行 router 决定的工具          │
                        │  无 LLM，纯 fetch                    │
                        │  search_sage_post / quote / news /  │
                        │  kline / financials                   │
                        └────────────────────┬─────────────────┘
                                             ▼
                        ┌─────────────────────────────────────┐
                        │  Layer 3: Writer LLM (主力)         │
                        │  model: deepseek-chat (非 thinking)  │
                        │  输入:                                │
                        │   - 瘦 SKILL.md (5KB)                │
                        │   - 1 个 voice 样本                  │
                        │   - tool 结果                         │
                        │   - memory 摘要                      │
                        │   - 1 对 few-shot                    │
                        │  任务: 流式输出 sage 风格散文         │
                        │  禁: 调任何工具 / 思考过程            │
                        └────────────────────┬─────────────────┘
                                             ▼ stream to user
                        ┌─────────────────────────────────────┐
                        │  Layer 4: Reflector (异步, 不阻塞)   │
                        │  model: deepseek-chat                │
                        │  任务:                                │
                        │   1. 风格评分 (1-10)                 │
                        │   2. 抽取本轮讨论的标的/概念          │
                        │   3. 更新用户画像 (风险偏好/兴趣)     │
                        │   4. 若评分<6 → 触发重写              │
                        │  写入 session memory                  │
                        └──────────────────────────────────────┘
```

## 2. 关键设计决策

### 2.1 角色分工 (核心改动)

| 层 | 模型 | 输入大小 | 任务范围 | 失败兜底 |
|---|---|---|---|---|
| Router | deepseek-chat | ~3KB | **只决策**：调啥工具 + 模式 | 默认全调 |
| Writer | deepseek-chat | ~8KB | **只演 sage**：写散文 + 禁工具 | 重试 1 次 |
| Reflector | deepseek-chat | ~2KB | **只评分**：风格 + 提取记忆 | 跳过 |

**为啥不用 deepseek-v4-pro thinking？**
Thinking 模式优化结构化推理，跟"像人说话"反着来。v1 一直 fight thinking 倾向 → 表格化复发。Writer 改用 chat (非 thinking) 是设计核心改变。

### 2.2 Memory 层（新）

```typescript
interface SessionMemory {
  user_profile: {
    risk_appetite?: 'conservative' | 'balanced' | 'aggressive';
    interests: string[];           // ["茅台", "腾讯", "高股息"]
    holdings_mentioned?: string[]; // 用户提到过的持仓
  };
  topics_discussed: Array<{
    ticker?: string;
    concept?: string;
    sage_id: string;
    summary: string;     // 一句话总结那次讨论
    ts: number;
  }>;
  last_n_summaries: string[];  // 最近 5 轮对话的 1 行摘要
}
```

存储：v1 = localStorage（本地）；v2 = 同左 + 可选导出。
Memory 注入：每次 user msg → 取该 session memory → 摘要成 ~500 tokens 注入 Writer prompt。

### 2.3 Sage Skill 瘦身

v1 错：6 文件 30KB 全塞 prompt → 注意力衰减。
v2 改：

```
/public/sages/<slug>/
├── SKILL_CORE.md         (~3KB)  ← 始终注入
│   - persona 5 行
│   - 输出禁令 5 行
│   - 工具偏好表 1 张
├── voice_one_sample.md   (~1KB)  ← 始终注入 (1 对 example)
├── methodology.md        (~5KB)  ← 按需 RAG (问方法论才注入)
├── classic_holdings.md   (~5KB)  ← 按需 RAG (提到对应股票才注入)
└── triggers.md           (~1KB)  ← Router 用 (帮决策模式)
```

Router 的决策包含 `needs_methodology: true/false` → Writer 加载与否。

### 2.4 流式协议升级

新 SSE 事件序列：

```
event: router_decision   { tools, focus, mode }
event: tool_progress     { name, status, summary }
event: writer_chunk      { delta }
event: done              { fullReply, memory_updates }
event: reflection        { score, suggestions }   ← 异步, 可选发
```

UI 可以渲染：
- Router 决策展示（"我需要查一下当前价 + 你的历史观点"）
- Tool 进度条
- Writer 流式
- Reflection 评分（小角标）

### 2.5 兜底 vs 设计

v1 的兜底 synthesis pass = hack（Writer 没写就强制再调）。
v2 = 设计：Writer 角色明确禁工具，**逻辑上不可能不写答案**。如真的失败 → Reflector 检测 → trigger Writer retry，整个机制是设计内的。

## 3. 与 v1 的差异 (一表对照)

| 维度 | v1 现在 | v2 设计 |
|---|---|---|
| LLM 角色数 | 1 (混合) | 3 (Router/Writer/Reflector) |
| Writer 模型 | deepseek-v4-pro thinking | deepseek-chat 非 thinking |
| System prompt 大小 | ~30KB | Writer ~8KB / Router ~3KB |
| 工具决策 | LLM ReAct 循环 | Router 一次性 JSON |
| Memory | 无 (每次零拼) | 每 session 有 profile + topics |
| 风格自检 | 无 | Reflector 评分 + 触发重写 |
| 失败模式 | 兜底 synthesis hack | 重试机制 (设计内) |
| 跨对话连续性 | 无 | Memory 提供 |

## 4. 实施分阶段

| Phase | 内容 | 估时 | 依赖 |
|---|---|---|---|
| **D1** | 设计文档 (此文件) + ROUTER_SCHEMA.md | 0.5h | - |
| **D2** | Router endpoint `/api/chat/route` + JSON schema | 2h | D1 |
| **D3** | Writer endpoint `/api/chat/write` (新版, 不调工具) | 2h | D2 |
| **D4** | Memory 层 (`SessionMemory` schema + load/save 函数) | 2h | D2 |
| **D5** | Reflector endpoint + memory 更新 | 2h | D3, D4 |
| **D6** | UI 适配 4 事件 SSE 协议 | 1.5h | D2-D5 |
| **D7** | 旧 `/api/chat/stream` deprecate / 平滑迁移 | 1h | D6 |
| **D8** | 评测台 (30 测试 query + 自动评分) | 3h | D7 |

总 ~14h。

## 5. 取舍说明

### 用 deepseek-chat 而非 -v4-pro 的代价

- ❌ 失去 thinking 的深度推理（但实测 thinking 在 sage 扮演场景反而是负担）
- ✅ 输出更"人话"
- ✅ 推理更便宜更快 (3-5x speed)
- ✅ 兼容性更好（DSML 标签问题大幅减少）

### Memory 不上服务器的代价

- ❌ 换设备/浏览器丢失
- ✅ 隐私好（投资偏好不传服务器）
- ✅ 简单（不要数据库）
- 后续：可加可选导入导出 JSON

### Router 多一次 LLM 调用的代价

- ❌ 多 ~3 秒延迟（Router decision）
- ✅ Writer 拿到精准工具结果后只需 1 次调用，节省 1-2 个 ReAct 轮次
- 净延迟：实测可能持平甚至更快

## 6. 评测台 (D8)

不是事后想起来，是设计的一部分。30 条固定测试集：

```typescript
const TEST_CASES = [
  // 估值类
  { sage: 'duan-yongping', q: '现在能买苹果吗', expect: { uses_realtime: true, has_FCF_calc: true, no_step_table: true } },
  { sage: 'guan-wo-cai',   q: '腾讯 PE 历史什么分位', expect: { uses_realtime: true, mentions_dividend: true, no_step_table: true } },
  // 方法论类
  { sage: 'duan-yongping', q: '什么是 stop doing list', expect: { mentions_8_items: true, no_table: true } },
  { sage: 'guan-wo-cai',   q: '荒岛策略怎么选', expect: { mentions_5_pct_dividend: true, mentions_AH: true } },
  // 历史观点类
  { sage: 'duan-yongping', q: '你为啥换神华去泡泡玛特', expect: { cites_2026_05_07: true } },
  // 跨对话 memory 类
  { sage: 'guan-wo-cai',   q: '我之前问过的腾讯还能加仓吗', expect: { uses_session_memory: true } },
  // ...
];
```

每条评分 5 维：
1. 风格符合度（无 ##/表格/Step）
2. 工具调用合理性（该调没调？不该调瞎调？）
3. 真实数据引用（有没有引用 RAG 历史 + 实时行情）
4. 答案完整性（有结论，不烂尾）
5. Memory 利用（跨对话场景必须用上）

每次架构变更 → 跑一遍 → 看分数变化。

---

## 7. 自我 review v2 设计的弱点（先优化设计，不冲去写代码）

按用户指令"先优化设计"，对 §1-6 自审 10 个潜在漏洞：

### ⚠️ R1：Router 必要性存疑 → 验证：保留但精简

deepseek-chat 自带 tool calling 能并行调多个工具，单独抽 Router 是否过度？
**结论：保留**。Router 的差异化价值 = 能在「问纯方法论」时**决定不调任何工具**（v1 实测：问"什么是 stop doing list"也调 search_sage_post 浪费 5s）。但 Router 输出只保留 `{tools, focus}` 两个字段，禁止 free-form 推理，强 JSON schema。

### ⚠️ R2：Writer 禁工具的安全网

Router 漏判一个工具 → Writer 没法补救 → 烂回答。
**改**：Writer 检测到关键数据缺失（如用户问 PE 但 tool_results 没有 quote）→ 输出 `<NEED_TOOL: get_realtime_quote>` 特殊 token → 控制层捕获 → 补一次 tool → 回喂 Writer 续写。Router 一次 + Writer 一次补救 = 上限。

### ⚠️ R3：Memory 需要双层

v2 只设计了 per-session memory。但用户讨论一只股票常跨多个 session。
**改**：拆 2 层
- **GlobalProfile** (per-sage, 跨 session)：用户讨论过的标的、风险偏好、价值倾向
- **SessionContext** (per-session)：本对话最近 5 轮摘要

GlobalProfile 在 sage 切换时合并到 prompt。

### ⚠️ R4：Reflector 别每次跑

每次都跑评分 + 可能触发重写 → 体验更糟（一个慢回答变两个慢回答）。
**改**：Reflector 默认 **每 N 次抽样**（N=5），且**只更新 memory，不触发重写**。重写改为 Writer 自己出 `<RETRY>` token 时触发（用户喷"这是啥垃圾"时 next round 显式重新）。

### ⚠️ R5："deepseek-chat 比 v4-pro 更适合扮演" 是猜测

没数据支撑。**改**：D2 之前先做 mini AB 测：3 case × 2 model = 6 次手测，看 chat vs v4-pro 哪个表格化更少 / 风格更稳。**这一步先于 D2 实施**。

### ⚠️ R6：SKILL_CORE 还能再瘦

`SKILL_CORE 3KB + voice 1KB + few-shot 2KB = 6KB` 还可再压。**改**：把"你是谁 / 禁令 / 工具偏好"合并为一份 ≤1.5KB 的 single-page persona card。其他信息推到 RAG 按需调。

### ⚠️ R7：延迟预算需公开

Memory(200ms) + Router(3s) + Tools 并行(1-3s) + Writer(TTFC 12s + stream 8s) ≈ 18-25s。**v1 是 10-15s**。**改**：Router 决策完立刻 stream `router_decision` 事件给 UI 显示「我要做的事」反馈，让等待可见。否则用户感觉"卡了"。

### ⚠️ R8：工具失败兜底

Router 决定调 web_search 但 web_search 503 怎么办？v2 没写。**补**：Tool Executor 层每个工具有 fallback：失败 → 返回 `{error, fallback_text: '工具不可用，按 RAG 回答'}` → Writer 收到照常写。

### ⚠️ R9：Multi-stock 对比模式

用户隐含需求 ("茅台 vs 五粮液 你看哪个")。**v2 设计补丁**：Router schema 新增 `comparison: { tickers: [...] }`，Writer prompt 模板分单股票 / 对比两种。

### ⚠️ R10：Cost / token 控制

Router 3K input × 每次对话 + Reflector 1K × 1/N 抽样 + Writer ≈ +30% tokens vs v1。**接受**这个代价，但加监控：在 Reflector 抽样里记录 token 用量，每周看一次。

---

## 8. 实施分阶段 (v2.1, 增加 R5 / R7 / R8)

| Phase | 内容 | 估时 | 依赖 |
|---|---|---|---|
| **D0** | **mini AB 测** (chat vs v4-pro on 6 case) → 决定 Writer 模型 | 1h | R5 |
| **D1** | 此设计 + ROUTER_SCHEMA.md (JSON schema 文档) | ✓ 已完成 + 0.5h |  |
| **D2** | Router endpoint + 严格 JSON schema validation | 2h | D0/D1 |
| **D3** | Writer endpoint (chat 模型, 禁 tool, NEED_TOOL token 协议) | 2.5h | D2 |
| **D4** | Memory 双层 (GlobalProfile + SessionContext) + localStorage schema | 2h | D2 |
| **D5** | Reflector 异步抽样 (默认 1/5) | 1.5h | D3, D4 |
| **D6** | Tool Executor 加 fallback 包装 | 1h | D2 |
| **D7** | UI 适配 SSE 5 事件: router_decision / tool_progress / writer_chunk / done / reflection | 2h | D2-D6 |
| **D8** | 旧 endpoint deprecate + 平滑迁移 | 1h | D7 |
| **D9** | 评测台 30 测试 query + 5 维评分 | 3h | D8 |

总 ~16h（增 2h 因 R5 / R7 / R8 补丁）。

## 9. 设计取舍最终对照表 (v2.1)

| 维度 | v1 现状 | v2.1 设计 | 净改变 |
|---|---|---|---|
| LLM 角色数 | 1 (混) | 3 (Router/Writer/Reflector) | +2 |
| Writer 模型 | v4-pro thinking | 待 D0 AB 决定 (倾向 chat) | TBD |
| System prompt | ~30KB | Router ~3KB / Writer ~8KB | -75% |
| 工具决策 | LLM ReAct 循环 | Router 一次性 JSON + Writer NEED_TOOL 补救 | 设计内 |
| Memory | 无 | GlobalProfile (per-sage) + SessionContext (per-conv) | 双层 |
| 风格自检 | 无 | Reflector 1/5 抽样, 只更新 memory 不重写 | 加 |
| 失败兜底 | 兜底 hack | NEED_TOOL token + tool fallback | 设计内 |
| 跨对话连续 | 无 | GlobalProfile 提供 | 加 |
| 延迟 | 10-15s | 18-25s (用 router_decision 事件遮掩) | +5-10s |
| Token cost | 1x | ~1.3x | +30% |

## 10. 立刻能开干 (待你拍板)

✅ D1 设计文档（v2.1, 含 10 条 review）
🟡 等拍板：D0 mini AB 测 → D2 Router endpoint

讨论项（不影响当前决策）：
- 增加 sage（冯柳/老唐/但斌）— 数据已有，UI 已支持
- Memory 是否引入 IndexedDB (大于 localStorage 5MB) — 暂不需
- Discord 接入 — 等你启动 `/discord:access`

---

**等你拍板：**
1. v2.1 设计认可吗？还有哪条 R1-R10 想再讨论？
2. 是否走 D0 → D2 → ... → D9 的执行路径？
