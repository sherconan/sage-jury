# Sage Chat · 小程序版 · v60.3 Handoff

> 给"把现有功能搬到小程序"的新 session 直接读。

---

## 现状

后端 web v60.3 已上线 https://sage-jury.vercel.app/，**小程序版停在 v53**（commit `74e4604`，2026-05 时段）。**v54-v60.3 所有改动小程序均未同步**。

```
/Users/sherconan/sage-jury/miniprogram/
├─ app.json / app.js / app.wxss            (入口配置)
├─ project.config.json / sitemap.json
├─ utils/
│  ├─ api.js                                (调 sage-jury.vercel.app/api/chat/stream)
│  └─ sessions.js                           (本地存储)
├─ pages/
│  ├─ chat/         (chat.wxml/.wxss/.js)   主对话页
│  └─ sessions/     (sessions.wxml/.wxss/.js) 历史列表
└─ README.md
```

**API 端点**：`miniprogram/utils/api.js:122` 直接调 `${apiBase}/api/chat/stream`，所以**后端不用改**，小程序只是要把 v54-v60.3 的前端 UI/UX 改造照搬过去。

## 后端已变化（小程序必须适配的）

按 commit 历史从 v53 → v60.3 后端新增/变化的 SSE 事件和数据：

| 版本 | 后端变化 | 小程序需适配 |
|---|---|---|
| v54 | `[原文 N]` chip 渲染 + force methodology | wxml 需渲染 inline chip + 滚动到 quote 卡 |
| v55 | `citation_audit` 事件 + `fullReply` 校验 | 用 `done.fullReply` 覆盖 streamed text |
| v56 | per-session streamingIds | 切 session 不应阻塞别的 session |
| v57 | quote 8 条 + 反复读机 | 不需 UI 改 |
| v57.1/.2 | quote 含 `_rel_score`/`_rec_mul`/`_final_score` | quote 卡上加相关性 + 时效性 badge |
| v58 | tool call 折叠 + 人话标签 | tool UI 全部重做（折叠 pill + 中文 + 图标） |
| v59 | lazy session 创建 | "新对话"按钮不立即建 session |
| v60 | `phase` 事件 + 新池 deep_analysis_originals | 后端变化，小程序自动受益 |
| v60.1 | **`analyst_chunk` / `analyst_done` 事件** | **新增 💭 内心分析卡** |
| v60.2/.3 | 双流（reasoning + content） | 同时渲染思考流 + 答案流 |

## 必读文件（按重要度）

### Web 端参考实现（要照搬到 wxml/wxss/js）

1. `app/page.tsx:558-625` — tool call 折叠 UI（v58）
2. `app/page.tsx:627-680` — analyst thinking 卡（v60.1）
3. `app/page.tsx:163-178` — lazy newSession（v59）
4. `app/page.tsx:283-345` — SSE 事件处理（含 analyst_chunk / chunk / done / citation_audit）
5. `app/page.tsx:8-37` — TOOL_LABELS / TOOL_ICONS / formatToolArgs 映射表

### 小程序现状

6. `miniprogram/utils/api.js` — 当前 SSE 接收逻辑（v53 时点，只处理 chunk / tool_call / tool_result / done）
7. `miniprogram/pages/chat/chat.js` + `.wxml` — 主对话页
8. `miniprogram/utils/sessions.js` — wx.storage 本地持久化
9. `miniprogram/README.md` — 微信开发者工具调试说明（要关"不校验合法域名"）

## SSE 事件适配清单（小程序 utils/api.js 需新增）

```js
// 当前已处理（v53）
quotes / tool_call / tool_result / chunk / done / error

// 必须新增（v54-v60.3）
analyst_chunk      → 累积到 msg.analystThinking，触发 💭 卡渲染
analyst_done       → 设置 msg.analystDone = true
phase              → 可选：显示阶段提示（"思考中"/"落笔中"）
citation_audit     → 调试日志，前端可忽略
```

⚠️ **微信小程序 SSE 限制**：`wx.request` 不原生支持 SSE 流。需用 **`onChunkReceived`**（基础库 2.20.1+）。当前 `api.js` 已经在用 onChunkReceived，看是否完整解析事件类型行。

## UI 改造清单（按优先级）

### 🔴 P0（必做才像个 v60 产品）

1. **tool call 折叠 UI**（v58）— wxml + wxss，参考 page.tsx:558-625
   - 单 pill "用了 N 个工具 ✓ ⌄"，点开显示中文标签列表
   - TOOL_LABELS / TOOL_ICONS 映射搬到 js 工具函数

2. **analyst thinking 卡**（v60.1）— wxml + wxss
   - 紫色 violet 渐变样式
   - 默认展开（writer 开始前）→ writer 开始后自动折叠
   - 实时累积 analystThinking 字段

3. **lazy session 创建**（v59）— pages/chat/chat.js + sessions.js
   - "新对话"按钮不要立即写 wx.storage，等用户真发消息再创建
   - sessions hydrate 时过滤 msgs.length === 0 的项

### 🟡 P1（深度体验）

4. **citation chip 渲染**（v54+v55）— wxml
   - `[原文 N]` 文本替换为可点击 chip，跳到 quote 卡
   - `done.fullReply` 覆盖 streamed text（v55 修引用伪造）

5. **quote 卡 score badges**（v57.2）— wxml + wxss
   - 相关性 badge (强相关/相关/弱相关)
   - 时效性 badge (近期🔥/近期/去年/老)
   - 数据来自 quote._rel_score / _rec_mul

6. **per-session streaming 状态**（v56）— pages/chat/chat.js
   - 用 Set 跟踪 streaming session id，允许切 session 时另一个继续跑
   - sidebar 显示"生成中"脉冲

### 🟢 P2 polish

7. Sage picker（小程序 v53 时已加横排选择卡，v60 没改 sage 那部分）
8. Markdown 渲染（小程序内 markdown 比 web 难，用 towxml 或自写解析）
9. 滚动到 quote 卡的交互（小程序用 scroll-into-view）

## 已知坑

- 小程序 onChunkReceived 数据包**可能跨多个事件**，需用 buffer + split("\n\n") 切分
- DeepSeek 流式响应**有 DSML 包裹**（虽然 v60.2 后端已经在处理，但小程序 buffer 内可能要再过一遍 cleanDSML 防止泄漏，参考 page.tsx:75-90）
- localStorage → wx.storage 单 key 大小上限 1MB，sessions 超量需分片

## 后端契约（小程序 dev 不用改）

```
POST https://sage-jury.vercel.app/api/chat/stream
Content-Type: application/json

{
  "sage_id": "duan-yongping" | "guan-wo-cai" | "lao-tang" | "dan-bin",
  "message": "用户问题",
  "history": [{"role": "user|assistant", "content": "..."}]   // 最近 8 轮
}

→ text/event-stream
```

## 推荐新 session 第一句话

> "把 sage-jury 小程序版从 v53 升到 v60.3。先读 HANDOFF_MINIPROGRAM_v60.3.md。重点同步：tool 折叠 UI（v58）、analyst thinking 卡（v60.1）、lazy session 创建（v59）。后端已经在 v60.3，不用动。"

