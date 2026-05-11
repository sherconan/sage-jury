# Sage Jury 小程序版 v60.4 Changelog

> 起点：`74e4604` (v53 — 4 sage 横排选择卡)
> 终点：`v60.4-mp.5` (sessions 操作菜单)
> 时间：2026-05-12 二次 7H 挑战赛迭代

## 总览

把小程序从 v53 升到 v60.4，**跨 9 个后端版本**，6 个 mp commit 闭环：

| commit | 内容 | 文件 | 净行数 |
|--------|------|------|--------|
| `27a649a` mp.0 | baseline P0：lazy session / tool fold pill / analyst card | 5 | +391/-80 |
| `e430266` mp.1 | citation chip / score badges / per-session streaming / sage 列表对齐 | 8 | +377/-64 |
| `dfca691` mp.2 | 60ms throttle + precise setData / retry / storage guardrails | 3 | +93/-33 |
| `2e2b089` mp.3 | 自写轻量 markdown parser（block + inline 节点树） | 4 | +316/-20 |
| `e879be0` mp.4 | empty state + input + send button 抛光（pulse halo / focus glow） | 2 | +140/-55 |
| `21ddc80` mp.5 | sessions 长按 action sheet：重命名 / 复制 / 删除 | 2 | +42/-2 |

净增 **~1300 行**，删 **~250 行**。

## 用户可见变化

| 改前（v53） | 改后（v60.4） |
|---|---|
| "新对话"立即在历史列表生成空 session | Lazy：发第一条消息才落地 |
| `🛠️ get_pe_history_pct ✓` 黄底卡堆叠 | 单 pill「用了 N 个工具 ✓ ⌄」点开看「📈 PE 历史分位 · 招行 ✓」 |
| 30s 等答案空白 | 紫色 💭 卡实时流出"内心分析"，writer 一开始自动折叠 |
| `[原文 1]` 纯文本 | `#1` 可点击 chip → 滚到对应 quote 卡 + 黄色高亮 1.5s |
| quote 卡只有日期/点赞 | 加 **相关性 + 时效性** 双 badge |
| 简陋 `• ` markdown 兜底 | 真 markdown：标题、加粗、列表、引用、代码块、分隔线 |
| sage 列表 4 个（含已废 lao-tang / dan-bin） | 只留 v60 质量达标的 duan + guan |
| sessions 列表只有标题 + 轮数 | 加：最新消息预览 + sage 头像 + 时间 + 搜索框 + streaming 脉冲 |
| 删除：单一删除按钮 | 长按 → action sheet：重命名 / 复制标题 / 删除 |
| input 单行无字数 | input 含字数计数（450+ 变橙），focus 时蓝光环 |
| send button 平面 | 渐变阴影 + 按压缩放 |
| empty state 简洁 | avatar pulse 光晕 + 标题 sage 名加粗 + "切换大佬"/"试试这些问题"引导 |

## 架构变化

```
miniprogram/
├─ app.js                       (含 streamingIds 全局注册表)
├─ utils/
│  ├─ api.js                    (+ parseCitationSegments / decorateQuote / decorateToolCall / TOOL_LABELS_ICONS)
│  ├─ sessions.js               (+ purgeEmpty / 容量护栏)
│  └─ markdown.js  ★ NEW        (block + inline parser)
├─ pages/chat/                  (template-driven markdown render)
└─ pages/sessions/              (action sheet + rename + search + streaming dot)
```

## SSE 事件支持矩阵

| 事件 | v53 | v60.4 | 备注 |
|------|:---:|:---:|------|
| quotes | ✓ | ✓ | 加 score badge 装饰 |
| chunk | ✓ | ✓ | + writerStarted 自动标记 |
| tool_call | ✓ | ✓ | 折叠 pill |
| tool_result | ✓ | ✓ | 折叠 pill |
| done | ✓ | ✓ | + fullReply 覆盖 (v55) |
| error | ✓ | ✓ | + errorState + retry 按钮 |
| **analyst_chunk** | ✗ | **✓** | v60.1 思考流 |
| **analyst_done** | ✗ | **✓** | analyst 阶段结束 |
| **phase** | ✗ | **✓** | writer 阶段开始自动折叠 analyst |
| citation_audit | ✗ | (忽略) | server 内部，前端透传 |

## 性能数据

- markdown parse：2KB 输入 0.04ms/parse（100 iter 4ms）
- DSML clean：50KB 输入 <1ms
- setData throttle：60ms 窗口；600 analyst_chunk 从 ~600 次 setData 降到 ~25 次
- 容量护栏：MAX_SESSIONS=100，MAX_MSGS_PER_SESSION=200，storage 满兜底到 20

## 自动化回归（34 项全绿）

```
[1] JS syntax lint        6/6
[2] JSON config           5/5
[3] WXML→JS handler       2/2 pages (chat 13 handlers, sessions 7 handlers)
[4] template 引用         2 def / 7 uses 全匹配
[5] wx:if 配对            26 if / 11 elif / 5 else 平衡
[6] mock wx 全链 require  6/6 modules
[7] chat 关键方法存在     13/13
```

## 已知限制 / 后续优化

1. **bold/italic 内嵌 cite 不递归**：`**重点 [原文 2]**` 整段当 bold，cite 不可点。生产 sage 输出极少这样写。
2. **DSML body 不吞**：client 只剥标签，server v60.2+ 已用状态机吞 body。client 兜底不完整但 server 已守住。
3. **真机未实跑**：CLI 不带 lint，需在微信开发者工具 IDE 启动 + 编译验证。
4. **scroll-to-bottom 浮按钮缺失**：长 session 滚动后无快速回底入口。
5. **markdown 表格降级为空**：解析时直接跳过，原 markdown 表格会丢失（小程序原生不支持表格）。

## 微信侧准备

- 基础库要求：**≥ 2.20.1**（onChunkReceived 必需）
- 重命名功能要求：**≥ 2.18**（showModal editable）
- 服务器域名白名单：`https://sage-jury.vercel.app`
- 开发期可关"不校验合法域名"

## 配套文档

- `HANDOFF_MINIPROGRAM_v60.4.md` — 下一轮 sprint handoff
- `HANDOFF_MINIPROGRAM_v60.3.md` — 上一轮 handoff（保留作历史）

---

## v60.5 增量（同 7H 挑战赛后段）

把 v60.4 HANDOFF P1 全部消化 + 表格降级 + 多行输入 + streaming 续接：

| commit | 内容 |
|--------|------|
| `448db72` mp.1 | bold/italic 内 cite 递归 + scroll-to-bottom 浮按钮 + utils/dsml.js 状态机 + scripts/lint-miniprogram.js |
| `4b673d9` mp.2 | input → textarea（auto-height max 4 行 + maxlength 500 + focus glow） |
| `a02194e` mp.3 | onShow 续接 streaming + _doFlush 每 5 次持久化 storage |
| `7278caa` mp.4 | markdown 表格降级为 ul（不再 skip 丢数据） |

### v60.5 关键能力

- **bold/italic 内嵌 cite chip 可点**：parseInlines 递归 + wxml md-inline-child 二层 template
- **scroll-to-bottom 浮按钮**：长 session 离底 > 300rpx 显示，点击平滑回底
- **DSML 状态机硬化**：utils/dsml.js stripDSML 用嵌套计数吞 body（与 server 对齐）
- **回归测试固化**：scripts/lint-miniprogram.js 41 项检查，CI 友好（exit code = 失败数）
- **多行输入**：textarea + auto-height
- **streaming 续接**：page 切换不丢 streaming UI 状态
- **表格降级**：markdown 表格 → ul 列表（表头加粗）

### v60.5 测试结果

- lint script: **41 pass / 0 fail**
- stripDSML 单元测试: **7 case 全绿**
- bold/italic 递归 cite: **2 case 验证**
- cleanDSML 集成: **4 case 验证**

### 下一步建议（v60.6+ 候选）

- chat.json 加 `enablePullDownRefresh` 拉历史
- session 列表加 sage 头像分组 tab 切换
- 加 starters 推荐随机选 6 个（当前固定 3 个）
- HTML preview 工具：把 wxml → preview HTML 用于视觉走查
