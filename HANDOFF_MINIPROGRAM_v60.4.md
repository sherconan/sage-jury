# Sage Chat · 小程序版 · v60.4 Handoff

> 给"接小程序后续优化"的新 session 直接读。
> 上一轮 HANDOFF (v60.3) 已归档为参考。

---

## 现状（2026-05-12）

后端 web 已上线 https://sage-jury.vercel.app/（HEAD `21ddc80`）。

**小程序版与后端已完全对齐 v60.4。** 不再有版本差距。

```
miniprogram/
├─ app.json / app.js / app.wxss            (入口配置 + streamingIds 全局表)
├─ project.config.json / sitemap.json
├─ utils/
│  ├─ api.js          (SSE 解析 + decorate helpers)
│  ├─ sessions.js     (lazy + 容量护栏)
│  └─ markdown.js     (轻量 markdown parser, NEW v60.4)
├─ pages/
│  ├─ chat/           主对话页 (lazy / tool fold / analyst card / cite chip / md render / per-session)
│  └─ sessions/       历史列表 (search / preview / streaming dot / action sheet)
└─ CHANGELOG_MINIPROGRAM_v60.4.md
```

**API 端点**：`miniprogram/utils/api.js:122` 直接调 `${apiBase}/api/chat/stream`，**后端不用改**。

## SSE 事件完整支持

```js
// 全部 v60.4 后端事件
quotes / chunk / tool_call / tool_result / done / error
analyst_chunk / analyst_done / phase / citation_audit
```

## 必读文件（按重要度）

1. `CHANGELOG_MINIPROGRAM_v60.4.md` — 6 个 commit 完整改动 + 性能 + 已知限制
2. `miniprogram/utils/markdown.js` — block+inline parser，wxml template 渲染依赖
3. `miniprogram/pages/chat/chat.js:175-265` — 60ms throttle + precise setData 核心
4. `miniprogram/pages/chat/chat.wxml:1-32` — `md-inlines` + `md-blocks` template 复用
5. `miniprogram/app.js:9-13` — streamingIds 全局表（跨页共享）
6. `miniprogram/README.md` — 微信开发者工具调试说明

## 已知限制（按优先级）

### 🟡 P1（值得做但非阻塞）

1. **markdown bold/italic 内嵌 cite 不递归**
   - 现象：`**重点 [原文 2]**` 整段当 bold，cite 不可点
   - 修法：parseInlines 在 bold/italic 节点里再 parseInlines 一次（递归）
   - wxml: 让 template 支持嵌套 inlines（注意 mp template 不能直接递归，需手工拆两层）

2. **scroll-to-bottom 浮按钮缺失**
   - 现象：长 session 用户向上翻看历史时，没有"回底"快捷
   - 修法：scroll-view 加 bindscroll，记录 scrollTop。如果 distance > 200px 且未在底部，显示浮按钮
   - 注意 throttle scroll event 避免性能问题

3. **DSML body 状态机硬化**
   - 现象：client 兜底只剥标签，不吞 body 文本（v60.2+ server 已守住但 client 是兜底）
   - 修法：把 `app/api/chat/stream/route.ts:431-460` 的 `inDSML` 状态机抽到 `utils/dsml.js`，server + miniprogram 共用

### 🟢 P2

4. **markdown 表格降级**：当前直接 skip 表格行，无降级展示
5. **长按 quote 卡复制 URL**：已实现 `onCopyQuoteUrl`，但当前 wxml 直接绑 longpress 到 quote-item，体验可改成 ActionSheet
6. **sage picker 列表二级展开** 当前用 dropdown，无视觉指引指向 empty state 的横排卡

### 🔴 阻塞但非小程序代码

7. **真机验证**：CLI 不带 lint，必须打开微信开发者工具 IDE 实跑
   - 入口：`/Applications/wechatwebdevtools.app/Contents/MacOS/cli open --project /Users/sherconan/sage-jury/miniprogram --port 9421`
   - 或 GUI 启动 → 导入项目目录 → 开启「不校验合法域名」→ 编译

## 自动化测试套件（无需真机）

`mcp__plugin_context-mode_context-mode__ctx_execute` 跑：

```
[1] JS syntax lint      6/6 ✓
[2] JSON config         5/5 ✓
[3] WXML→JS handler     2/2 pages ✓
[4] template 引用       2 def / 7 uses 全匹配
[5] wx:if 配对          26 / 11 / 5 平衡
[6] mock wx 全链 require 6/6 modules
[7] chat 关键方法       13/13 ✓
TOTAL 34 pass / 0 fail
```

回归脚本可作为 `scripts/lint-miniprogram.js` 固化（未做，作为下一轮 P2）。

## 关键数据结构

```js
// 一条 sage msg 完整字段（hydrate 后）
{
  role: 'sage',
  ts: 1234567890,
  loading: false,
  content: 'markdown text...',
  contentBlocks: [...],    // parseMarkdown(content)
  analystThinking: '...',
  analystBlocks: [...],    // parseMarkdown(analystThinking)
  analystDone: true,
  writerStarted: true,
  toolCalls: [{ id, name, args, result, icon, label, argsStr, resultPreview }],
  toolsAllDone: true,
  quotes: [{ date, text, likes, url, textPreview, recLabel, recTone, relLabel, relTone, highlight }],
  followups: ['follow1', 'follow2', ...],
  toolsOpen: false,
  analystOpen: false,
  errorState: false,
}
```

## 后端契约（小程序 dev 不用改）

```
POST https://sage-jury.vercel.app/api/chat/stream
{
  "sage_id": "duan-yongping" | "guan-wo-cai",
  "message": "用户问题",
  "history": [{"role": "user|assistant", "content": "..."}]   // 最近 8 轮
}
→ text/event-stream
```

## 推荐新 session 第一句话

> "继续小程序优化。先读 HANDOFF_MINIPROGRAM_v60.4.md。重点做 P1：bold 内 cite 递归 / scroll-to-bottom 浮按钮 / DSML 状态机硬化。"

或

> "把 P1 的 3 件事固化成 v60.5-mp.1：bold cite 递归、scroll-to-bottom、DSML 状态机。读 HANDOFF_MINIPROGRAM_v60.4.md 入手。"
