# 交易对线 微信小程序

> 和投资大佬 1v1 对线你的每一笔交易（段永平 / 管我财），并支持多大佬同场对线。基于 v62 真投资分析引擎（Phase1 取数 → Phase2 sage-specific 5 维加权评分 → Phase3 LLM voice）。

> **v1.0-mp** — 数据驱动可视化改版收尾。判决从「文字墙」升级为可视化档案：深色 ticker 名片条 + 判决横幅（语义色徽章 + 置信度环）+ PE 估值标尺 + 股息 vs 国债对比条 + 成长 & 质地体检 + 五维 dossier 评分条。chat / jury / sessions 三页统一到同源浅色设计语言。详见 `../CHANGELOG_MINIPROGRAM_v62.md`。
> v62-mp.x — 追平 web v62（v60.5 → v62）；endpoint 切到 `/api/chat/v2/stream`；新增 verdict / facts / analyzing 徽章 / 多人对线页（`/api/jury/stream`）；改名「交易对线」+ header 重设计。

## 项目结构

```
miniprogram/
├── app.json / app.js / app.wxss     全局配置 + sage 数据 + 全局样式
│                                    · app.js: apiBase / sages（段永平 蓝 #3b82f6 · 管我财 绿 #10b981）/ streamingIds 跨页注册表
│                                    · app.wxss: page 底色 #eef2f7（改版浅底）+ 改版设计 token 工具类
├── project.config.json              AppID = wx8b251c593a93d37e
├── sitemap.json
├── pages/
│   ├── chat/                        主对话页（sage 切换 / 工具折叠 / ticker 名片条 / 判决横幅+置信度环 / 估值标尺 / 五维 dossier）
│   ├── sessions/                    历史列表（搜索 / 预览 / streaming 脉冲 / 长按操作 / 判决结论徽章）
│   └── jury/                        多人对线页（多 sage 并行 SSE，每位独立 result card，复用 chat 同款可视化）
├── preview/
│   ├── redesign-preview.html        改版视觉规范源文件（颜色 / 间距 / 卡片结构基准）
│   └── index.html
└── utils/
    ├── api.js                       SSE 解析 + decorate helpers
    │                                · callChatStream (v2 三阶段) / callJurySSE / callChatTitle
    │                                · decorateVerdict（含 viz 标尺数据 / sageDisplay / confDeg 置信度环角度）
    │                                · decorateFacts（ticker 名片条）/ decorateToolCall / decorateQuote
    ├── sessions.js                  lazy session + 容量护栏 (MAX 100/200)
    ├── markdown.js                  轻量 markdown parser (block + inline)
    └── dsml.js                      DSML 状态机（与 server 端 inDSML 对齐）
```

## 启动步骤

1. **打开微信开发者工具**
2. 导入项目 → 选择本目录 `/Users/USER/sage-jury/miniprogram`
3. AppID 自动识别 = `wx8b251c593a93d37e`
4. **重要：勾选「不校验合法域名/web-view (业务域名)、TLS 版本以及 HTTPS 证书」**
   - 路径：详情 → 本地设置 → 不校验合法域名
   - 因为后端在 `sage-jury.vercel.app`，未做 ICP 备案，开发版必须关掉校验
5. 点击「编译」即可在模拟器看到效果

## 离线回归（不需要 IDE）

```bash
node ../scripts/lint-miniprogram.js
```

41 项检查（JS lint / JSON / WXML→JS handler / template 引用 / wx:if 平衡 / mock require / 关键方法）。
CI 友好：exit code = 失败数。

## 数据驱动可视化（v1.0-mp 核心）

判决卡不再是纯文字，而是把 v62 引擎算出的 keyMetrics / dims 解析成视觉元素。全部绑真实数据，无对应数据时降级不渲染（绝不编造）。

| 视觉元素 | 数据来源 | 实现 |
|---|---|---|
| **Ticker 名片条** | `facts`（识别股票） | 深蓝渐变条：白色股名 + 浅蓝代码 + 亮青 A/HK/US 徽章 + 右侧「N 年深度档案」chip |
| **判决横幅** | `verdict.signal / headline` | 语义色徽章（看好 绿 / 观察 灰 / 不碰 红 / 能力圈外 橙）+ headline |
| **置信度环** | `verdict.confidence` | 两半圆 rotate 进度环（纯 transform，真机稳，不用 conic-gradient）；角度在 api.js `confDegL/R` 预算好；`confidence===null` 时不渲染 |
| **PE 估值标尺** | keyMetrics → `viz.pe` | 5 色渐变标尺 + 游标按 PE 落点；标签 便宜/合理/中性偏贵/偏贵/贵 |
| **股息 vs 国债对比条** | keyMetrics → `viz.div` | 股息率 vs 10Y 国债（2.5%）双条 + 利差胜出提示 |
| **成长 & 质地体检** | keyMetrics → `viz.revC/npC/roe/gm` | 营收/净利 5 年 CAGR + ROE + 毛利率 4 tiles |
| **五维 dossier** | `verdict.dims` | 大佬名 + 五维评分条（pass/fail 色点 + 权重 % + note 释义）；标题取 `sageDisplay`（slug→中文名） |

> 解析逻辑集中在 `utils/api.js` 的 `buildViz()` / `decorateVerdict()` / `decorateFacts()`；wxml 只绑值不算数。视觉基准对照 `preview/redesign-preview.html`。

## 技术亮点

| 维度 | 实现 |
|---|---|
| **三阶段引擎** | `/api/chat/v2/stream`：Phase1 取数（10 年财务）/ Phase2 sage-specific 5 维加权 / Phase3 LLM voice |
| **伪流式响应** | `enableChunked: true` + `onChunkReceived` SSE 解析 |
| **数据驱动判决** | facts → ticker 条；verdict → 横幅+置信度环+估值标尺+五维 dossier（见上节） |
| **工具折叠** | 单 pill「用了 N 个工具 ✓」点开看人话标签（📈 PE 历史分位 · 招行 ✓） |
| **引用 chip** | `[原文 N]` → 可点击 `#N` → 滚到 quote 卡 + 黄色高亮 1.5s |
| **Quote score badges** | 相关性（强/中/弱）+ 时效性（近期🔥/近期/去年/老）双 badge |
| **Markdown 渲染** | 自写 parser：heading / list / quote / code / hr + bold/italic 内嵌 cite 递归 |
| **多人对线** | `/api/jury/stream` 并行 2 位 sage，每位独立 result card，复用 chat 同款可视化 |
| **会话历史判决徽章** | sessions 列表每条派生「最近一条带 verdict 的结论」语义色徽章，无则不显示 |
| **Per-session streaming** | app.globalData.streamingIds，sessions 列表脉冲动画 |
| **Lazy session** | 「新对话」不立即建实体，第一条消息发出才落 storage |
| **多 session** | wx.setStorageSync 持久化 + 容量护栏 (max 100 sessions × 200 msgs) |
| **首轮自动标题** | LLM 生成 |
| **DSML 安全** | 状态机吞 body（不只剥标签），与 server 行为对齐 |
| **setData 节流** | 60ms 合并 + precise path `messages[i].field`，600 chunks 不爆 |

## 已知差距 / 路线图

- 真机验证：CLI lint 不测 `onChunkReceived` 真实行为，需 IDE 实跑（GUI 启动 → 编译）；改版可视化已用浏览器截图端到端验证角度与观感。
- jury 页未持久化（不进 sessions 列表，刷新即清空）；后续可选加 jury session 类型。
- 五维评分条：v62 server 返 score=0 时按 pass/fail 给体感宽度（无 raw score 可显示）。
- markdown 表格降级为 ul（cells 用 ` · ` 连接），不渲染原始表格结构。
- 输入 textarea：回车 = 换行（不发送），发送靠按钮。

## 上架准备 (生产部署)

> 以下为**用户线下手动步骤**，需本人在阿里云/腾讯云、工信部、微信小程序后台逐项办理，代码层无法代办。

1. **域名备案（ICP）**：
   - vercel.app 不能直接加入小程序「request 合法域名」
   - 方案 A：买/借一个国内已 ICP 备案的域名 → CNAME 到 vercel
   - 方案 B：阿里云/腾讯云国内 ECS 部署反向代理（同时可用 Cloudflare Workers 国际加速）

2. **后端域名变更**：
   - `app.js` 里的 `apiBase` 改成你的备案域名
   - 微信小程序后台 → 开发管理 → 服务器域名 → request 域名添加

3. **小程序备案（MIIT 工信部）**：
   - 2024 年起所有小程序也需要工信部备案
   - 微信小程序后台 → 设置 → 基本设置 → 备案信息

4. **上传与审核发布**：
   - 每次发布先在 IDE「上传」→ 微信小程序后台「在线提交审核」→ 通过后「发布」

## 基础库要求

- **≥ 2.20.1**（onChunkReceived 必需）
- 重命名 modal: **≥ 2.18**（showModal editable）
- textarea auto-height: **≥ 1.4.0**（基本所有版本支持）
