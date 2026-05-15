# Sage Chat · Web 项目 · v60.3 Handoff

> 给"继续做 web 端"的新 session 直接读。读完就能上手。

---

## 当前 production

- **URL**: https://sage-jury.vercel.app/
- **版本**: v60.3 (commit `9138f55`)
- **核心架构**: 单 LLM 双流（思考 + 答案）+ 模型分工（thinking 模型 + 快模型）

## v60 系列演进（按版本看决策）

| 版本 | 核心改动 | 关键指标 |
|---|---|---|
| v55 | 修引用伪造（OOC 不再编 [原文 N]） | 张冠李戴 = 0 |
| v56 | 并行 session（per-session streamingIds Set） | 并行 -50% 时间 |
| v57 | 反复读机（9 处招牌结尾松绑 + 多样化）+ 检索 5→8 | 复读率 0/5 |
| v57.1/.2 | 动态检索（按相关性×时效性，废写死 N） | 4 archetype 条数 8/3/8/7 不同 |
| v58 | tool call UI 折叠（人话标签 + 中文图标） | 主答案不再被工具栏淹没 |
| v59 | 新对话 lazy 创建（不再每点一次冒空 session） | 4 个空 session 自动清理 |
| v60 | Analyst+Writer 双 LLM + corpus 深度挖矿 27 条 | 评委 50/60 vs 19/60（**+163% 深度**） |
| v60.1 | Analyst 改流式 markdown（不再 JSON） | analyst_chunk SSE 事件 |
| v60.2 | 取消双 LLM，单 v4-pro thinking 流 reasoning+content | TTFT 思考 4s（-94%） |
| **v60.3** | 最后一轮切 deepseek-chat（fast TTFT） | TTFT 答案 23s（-82%） |

## 顶层架构（v60.3）

```
用户 query
  ↓
┌─ Round 0 ─────────────────────────────────────────┐
│ deepseek-v4-pro (thinking)                         │
│ ↓ reasoning_content 流式 → analyst_chunk SSE      │  ← 用户在 4s 内看到 💭 卡
│ ↓ 决定调哪些工具 (并行)                            │
└────────────────────────────────────────────────────┘
  ↓ tool_call / tool_result SSE 事件
┌─ Round 1 ─────────────────────────────────────────┐
│ deepseek-v4-pro (thinking) 继续                    │
│ ↓ reasoning_content 流式                          │
│ ↓ 决定是否再调工具 OR 转入合成                     │
└────────────────────────────────────────────────────┘
  ↓
┌─ Round 2 (Last, no tools) ────────────────────────┐
│ deepseek-chat (FAST, 非 thinking)                  │
│ ↓ content 流式 → chunk SSE 事件                    │  ← 用户在 ~20s 内看到答案流
└────────────────────────────────────────────────────┘
  ↓
  citation audit (v55) → done event (含 fullReply / followups)
```

## 必读文件（按重要度）

1. `app/api/chat/stream/route.ts` (~1280 行) — 主 agent loop，含 8 工具/双流/citation 闸
2. `app/page.tsx` (~770 行) — 前端，含 💭 思考卡 / 工具折叠 / 引用 chip / lazy session
3. `public/sages/duan-yongping/SKILL.md` — sage v60 角色蒸馏 + 收尾铁律
4. `public/sages/duan-yongping/deep_thought_samples.md` — corpus 挖出来的 8 个深度推理样本
5. `public/sages-quotes/duan-yongping.json` — corpus 数据 + 新池 `deep_analysis_originals` (27 条)

## 8 个工具

```
search_sage_post       — 在 sage 雪球发言里 BM25+rerank 搜（带时效性 boost）
get_realtime_quote     — A股/港股实时价 PE PB 股息
get_pe_history_pct     — PE/PB 历史分位（管哥必用）
get_financials         — 近 4 年年报关键指标
get_dividend_history   — 5 年派息历史（管哥必用）
get_kline              — K 线
web_search             — Bocha 联网搜
compare_stocks         — 多股对比
```

## 关键环境变量

```bash
SAGE_LLM_BASE     = https://api.deepseek.com
SAGE_LLM_KEY      = <set-in-vercel-env>  (DeepSeek)
SAGE_LLM_MODEL    = deepseek-v4-pro (thinking mode, 前 N-1 轮用)
SAGE_LLM_FAST_MODEL = deepseek-chat (非 thinking, 最后一轮用)
BOCHA_API_KEY     = <set-in-vercel-env>   (web_search + rerank)
```

## SSE 事件协议

```
event: quotes             data: Quote[]                      (RAG 召回，含 _rel_score/_rec_mul)
event: tool_call          data: {name, args, id}             (工具开始)
event: tool_result        data: {name, id, result}           (工具完成)
event: analyst_chunk      data: {delta}                      (思考流式)
event: chunk              data: {delta}                      (答案流式)
event: phase              data: {name, message}              (阶段切换提示)
event: citation_audit     data: {stripped, kept}             (剥除张冠李戴引用)
event: done               data: {followups, fullReply, citationStrippedCount}
event: error              data: {message}
```

## 🔴 P0 已知阻碍上线问题（必须修才能说"v60 全量上线"）

| # | 问题 | 数据 | 修法估时 |
|---|---|---|---|
| 1 | **管我财/但斌 没 deep_analysis_originals 池** | corpus 有 管 553 / 斌 120 条 >500 字深度帖，0 入库 | mine 30 条/sage：~1h |
| 2 | **管我财/但斌 SKILL.md 没 v60 升级** | 还是 May 9 老版，缺反复读机 + 5 维度强制深度 | 复制段永平改动模板：~2h |
| 3 | **老唐 corpus 几近为空**（>500 字仅 3 条） | 老唐 sage 实际上没语料 | 决策：补 fetch 还是临时下线 |
| 4 | **followups 还在用 LLM_MODEL (v4-pro)** | `done` 前白等 5-10s | 切 LLM_FAST_MODEL：5min |

## 🟡 P1 未验证

- v60.3 流式架构只测了**段永平 + 管我财** — 但斌、老唐 完全没测
- 多轮对话（history 注入）没在 v60.3 重测
- DSML 抑制 leftover 代码可能与 deepseek-chat 输出冲突（v60.0-v60.1 遗留）

## 🟢 P2 polish

- `max_tokens: 2500` 偶尔截断长答案（茅台 v60.1 测试时被截）
- `analyst_thinking` 1500+ 字/次 写 localStorage（10 session 就 15KB+）
- `exportMarkdown` 不含 analyst thinking（可能用户希望保留）
- 移动端 sidebar overlay 未测试

## 回归测试 query 集

```
"苹果 2026 还能不能拿"              段永平 / 经典持仓
"你怎么看茅台现在"                  段永平 / 算账
"江南布衣怎么看"                    管我财 / 高股息 + 港股
"腾讯能买吗"                        管我财 / 大市值
"什么是 stop doing list"            段永平 / 方法论
"存储芯片 DRAM 周期"                段永平 / OOC（应承认能力圈外）
"老皮黄金和泡泡玛特，哪个你更看好"  管我财 / 多标的对比
"我重仓茅台亏了 30% 怎么办"          管我财 / portfolio
```

每次回归看：① analyst_thinking 4s 内开始流 ② 答案 25-40s 内开始流 ③ 引用真实 ④ 收尾不复读 ⑤ 深度（类比/数字/竞品/历史决策）

## 推荐新 session 第一句话

> "继续 sage chat web v60.3。先读 HANDOFF_WEB_v60.3.md。当前 production 段永平已完整 v60，管我财/但斌/老唐还是 v59 体验。我想先 [推进 P0 / 加新 sage / 改 UI / ...]"

