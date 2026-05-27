# Sage Chat 小程序版 v62-mp.1 Changelog

> 2026-05-26 · 把小程序从 v60.5 拉齐到 web v62.1 — 跨 ~12 个 minor 版本的能力对齐。
> 离线回归 41/41 全绿；node 语法 5/5；jury endpoint 现场 smoke 验证通过。

## 总览

| 维度 | v60.5 (旧) | v62-mp.1 (新) |
|---|---|---|
| Chat endpoint | `/api/chat/stream`（单阶段 agent loop） | `/api/chat/v2/stream`（三阶段：Phase1 取数 / Phase2 5 维加权 / Phase3 LLM voice） |
| 数据深度 | 实时行情兜底 | 10 年财务档案 + A/HK/US 统一 + 多源融合（eastmoney/sina/stooq/bocha） |
| 评分模型 | 无 | sage-specific 加权（段永平 circle/business/team/price/stop_doing；管哥 position/landmine/dividend/stability/island） |
| 结论结构 | 纯文本 markdown | verdict 卡（signal/headline/keyMetrics/5 维 dims/topConcerns） |
| 股票识别 | 隐式 | facts 卡（name / code / market badge / 10y 深度标记） |
| 思考过程 | analyst_chunk 流式（v1 路径） | analyzing 徽章（Python Phase1）+ writer 阶段折叠 |
| Multi-sage | ❌ | ✅ 陪审团页（`/api/jury/stream` 并行 2-5 位 sage） |
| 错误反馈 | error 事件 | + strip_warning（跨角色清洗）+ dataErrors 横条 |

## 用户可见变化

1. **三阶段透明化** — chat 气泡顶部按序出现：🔬 analyzing 绿色徽章 → 📌 facts 灰色 pill → verdict 4 色卡（bull 绿 / hold 灰 / bear 红 / pass 黄）→ tools 折叠 → 答案正文 → followups + quotes。
2. **verdict 卡** — 顶部 signal chip + headline + confidence%；展开看 keyMetrics + 5 维 dim chips（左边色条 pass/fail，权重 %，note 释义）+ topConcerns 红字重点。
3. **陪审团页** — header 新「陪审团」蓝色入口按钮；多选 sage chips（默认全选 2 位）；输入框；submit 后每位 sage 一张独立 result card（状态徽章 分析中⟳ / 落笔中… / 已审 ✓ / 异常）。
4. **加载时长** — Phase1 取数+评分可能 5-10s，已把 wx.request timeout 从 120s 提到 180s（chat）/ 240s（jury）。

## 架构变化

- `utils/api.js` 新增 `callJurySSE` / `callChatTitle` / `decorateVerdict` / `decorateFacts` / `SIGNAL_LABEL` / `DIM_LABEL`；`makeStreamState` feed() 支持 `phase(analyzing|writer)` / `facts` / `verdict` / `history` / `strip_warning` / `done(+data_errors)`。
- `pages/chat/chat.js` sageMsg 初始化加 `verdict / facts / analyzing / analyzingDone / dataErrors / verdictOpen / analyzingOpen` 字段；`_doFlush` 精准 setData；`hydrateMessages` 兼容旧 storage（不显式 decorate 过的对象会重 decorate）。
- `pages/chat/chat.wxml` 4 个新卡（analyzing badge / facts card / verdict card / dataErrors banner），插在 analyst-card 之前；header 加 onGoJury 入口。
- `pages/jury/` 4 个新文件（jury.json / wxml / wxss / js），独立 markdown template 子集。
- `app.json` 注册 `pages/jury/jury`。
- `app.js` 版本字符串 v60.4 → v62-mp.1。

## SSE 事件支持矩阵

| 事件 | v1 旧 | v2 新 | 小程序处理 |
|---|---|---|---|
| `phase{analyzing}` | ❌ | ✅ | analyzing 徽章 |
| `phase{writer}` | ✅ | ✅ | 折叠 analyzing / analyst |
| `facts` | ❌ | ✅ | facts 卡 |
| `verdict` | ❌ | ✅ | verdict 卡 |
| `history` | ❌ | ✅ | 忽略（quotes 随后覆盖） |
| `strip_warning` | ❌ | ✅ | console.warn 记录 |
| `analyst_chunk/done` | ✅ | ❌ | v1 fallback 保留 |
| `quotes / tool_call / tool_result / chunk / done / error` | ✅ | ✅ | 既有逻辑直接复用 |
| `citation_audit` | ✅ | ❌ | 既有忽略保留 |

## 自动化回归

```bash
node scripts/lint-miniprogram.js
# → 41 passed / 0 failed
#   含 chat.wxml 18 handler ↔ chat.js method 全对应
#   含 3 template def / 9 use 平衡
#   含 wx:if 43/elif 17/else 5 平衡
```

## 已知差距 / 后续

- jury 页未持久化（不进 sessions 列表，刷新即清空）；后续可选加 jury session 类型。
- verdict 卡 dim score 当前只显示 weight，未显示 raw score（v2 server 返 0 时无意义）。
- 真机验证待 IDE 实跑：CLI 不能测 onChunkReceived 真实行为。
- 微信小程序文本节点的 markdown table 仍降级为 ul（同 v60.4 已知限制）。

## 配套文档

- `miniprogram/README.md` — 更新到 v62-mp.1 项目结构与启动步骤
- 上游 web 端文档：`docs/v62-integration-handoff.md` / `docs/HANDOFF-v1.0-2026-05-21.md`
