# 交易对线 小程序版 Changelog

---

## v1.0-mp — 数据驱动可视化改版收尾

> 2026-06-05 · 把判决从「文字墙答案」升级为「数据驱动可视化档案」。
> 离线回归 41/41 全绿；置信度环填充角度 + 整卡观感经浏览器截图端到端验证。

### 总览

改版前 chat 页判决只落地了「判决横幅 + 浅灰 facts 卡 + 堆叠可视化块」。本轮补齐了视觉规范（`miniprogram/preview/redesign-preview.html`）缺的两块核心元素——**深色 ticker 名片条** 和 **置信度环**——接好了之前算了没用的孤儿字段，并把 chat / jury / sessions 三页统一到同源浅色设计语言。

### 用户可见变化

1. **Ticker 名片条** — 股票识别从浅灰扁 pill 变成深蓝渐变名片条（白色股名 + 浅蓝代码 + 亮青 A/HK/US 徽章 + 右侧「N 年深度档案」chip），成为整份档案的视觉锚。
2. **判决横幅 + 置信度环** — 横幅右侧从干巴巴的「62%」文字换成**置信度环**（橙/绿/红随判决语义变色，按百分比顺时针填充，中心显数字）。
3. **五维体检带大佬名** — 标题从「五维体检」变成「管我财 · 五维体检」/「段永平 · 五维体检」。
4. **估值可视化**（沿用并打磨）— PE 估值标尺（5 色渐变 + 游标）、股息率 vs 10Y 国债对比条（含利差胜出提示）、成长 & 质地 4 tiles（营收/净利 CAGR + ROE + 毛利率）。
5. **多人对线页同款升级** — jury 每位 sage 的 result card 复用 chat 同款数据驱动视觉语言（facts 行 / 判决横幅 / 紧凑版估值标尺 / 五维 dossier）；状态徽章统一为 分析中⟳ / 落笔中… / 已审 ✓ / 异常。
6. **会话历史判决徽章** — sessions 列表每条对话显示上次 sage 的结论（看好 / 观察 / 不碰 / 能力圈外），用判决横幅同源语义色；没出过判决的不显示徽章。
7. **统一浅色设计语言** — 全局壳层与小程序窗口底色统一到 `#eef2f7`，对齐 redesign-preview 设计基准（取代旧 slate 灰底）。

### 架构变化

- **`utils/api.js`** — `decorateVerdict` 纯新增 3 字段（不改任何现有字段名/结构，jury 契约安全）：`sageDisplay`（slug→中文名，新增 `SAGE_DISPLAY` 映射）、`confDegR`/`confDegL`（置信度环旋转角，api.js 算好，wxml 只绑值）。`buildViz()` 把 keyMetrics 文案解析成 PE 游标 / 股息对比 / 成长 tiles 数据。
- **`pages/chat/`** — wxml：facts 卡 markup 换成 ticker 条；横幅文字 chip 换成置信度环（`confidence===null` 降级不渲染）；五维标题绑 `sageDisplay`。wxss：删除旧 `.facts-card` / `.verdict-confidence`（本轮改动产生的孤儿样式），新增 `.tk-strip` 系列（深色 ticker）和 `.vz-ring` 系列（两半圆 rotate 环）。
- **`pages/jury/`** — wxml：每位 sage 卡升级为 chat 同款可视化（均 `wx:if` 守卫，无数据零渲染）。js：import `decorateVerdict`/`decorateFacts`，onSageProgress 解析 `patch.verdict`/`patch.facts`，catch 块把仍在「分析中」的卡转错误态（修掉原「永久转圈」缺陷）。wxss：页面底色对齐 + 镜像 chat 可视化样式（仅 jury 引用到的类，全 rpx，无 conic-gradient）。
- **`pages/sessions/`** — js：`refresh()` 派生 `verdictTone`/`verdictSignal`（来自最近一条带 `verdict.tone` 的 sage 消息）。wxml：标题行插入判决徽章。wxss：旧 slate 色板迁移到 redesign 浅底色板。
- **`app.wxss` / `app.json`** — page 底色 `#f8fafc → #eef2f7`、主文字加深；window `backgroundColor` 同步；末尾新增改版设计 token 工具类。预先存在的旧类未动。
- **`app.js`** — 版本字符串 `v62-mp.4 → v1.0-mp`（仅此一行；其余字段未动）。

### 真机稳妥写法

- 置信度环 / 进度条全部用 `transform: rotate` + 两半圆遮罩，**不用 `conic-gradient`**（小程序真机渲染不稳）。
- 角度映射在 JS 侧算好（`confDegL = deg>180 ? 360-deg : 180`；`confDegR = 180 - min(deg,180)`，`deg = pct*3.6`），wxml 只绑值。
- 全 rpx 单位，无 px 混用。

### 已知差距 / 后续

- 五维评分条：v62 server 返 score=0 时按 pass/fail 给体感宽度（无 raw score 可显示）。
- jury 页仍未持久化（不进 sessions，刷新即清空）。
- 真机 `onChunkReceived` 行为待 IDE 实跑确认（CLI lint 不覆盖）；可视化已用浏览器截图验证。

---

## v62-mp.1 — 拉齐 web v62.1

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
