# Sage Chat 微信小程序

> 和 2 位投资大佬 1v1 聊天的小程序版（段永平 / 管我财），DeepSeek thinking 模式 + 8 工具。

> v60.5 — 完整追平 web 后端 v60.4。详见 `../CHANGELOG_MINIPROGRAM_v60.4.md`。

## 项目结构

```
miniprogram/
├── app.json / app.js / app.wxss     全局配置 + sage 数据 + 全局样式
│                                    含 streamingIds 跨页 streaming 注册表
├── project.config.json              AppID = wx8b251c593a93d37e
├── sitemap.json
├── pages/
│   ├── chat/                        主对话页（sage 切换 / 工具折叠 / 内心分析 / cite chip）
│   └── sessions/                    历史列表（搜索 / 预览 / streaming 脉冲 / 长按操作）
└── utils/
    ├── api.js                       SSE 解析 + decorate helpers (含 v60.1 analyst_chunk)
    ├── sessions.js                  lazy session + 容量护栏 (MAX 100/200)
    ├── markdown.js                  轻量 markdown parser (block + inline)
    └── dsml.js                      DSML 状态机（与 server 端 inDSML 对齐）
```

## 启动步骤

1. **打开微信开发者工具**
2. 导入项目 → 选择本目录 `/Users/sherconan/sage-jury/miniprogram`
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

## 技术亮点（v60.5）

| 维度 | 实现 |
|---|---|
| **流式响应** | `enableChunked: true` + `onChunkReceived` SSE 解析；含 v60.1 analyst_chunk 双流 |
| **内心分析卡** | 紫色 💭 卡 streaming markdown，writer 阶段开始自动折叠 |
| **工具折叠** | 单 pill「用了 N 个工具 ✓」点开看人话标签（📈 PE 历史分位 · 招行 ✓） |
| **引用 chip** | `[原文 N]` → 可点击 `#N` → 滚到 quote 卡 + 黄色高亮 1.5s |
| **Quote score badges** | 相关性（强/中/弱）+ 时效性（近期🔥/近期/去年/老）双 badge |
| **Markdown 渲染** | 自写 parser：heading / list / quote / code / hr + bold/italic 内嵌 cite 递归 |
| **Per-session streaming** | app.globalData.streamingIds，sessions 列表脉冲动画 |
| **Lazy session** | "新对话"不立即建实体，第一条消息发出才落 storage |
| **多 session** | wx.setStorageSync 持久化 + 容量护栏 (max 100 sessions × 200 msgs) |
| **首轮自动标题** | LLM 生成 |
| **DSML 安全** | 状态机吞 body（不只剥标签），与 server 行为对齐 |
| **setData 节流** | 60ms 合并 + precise path `messages[i].field`，600 chunks 不爆 |

## 已知差距 / 路线图

- 真机验证：CLI 不带 lint，需 IDE 实跑（GUI 启动 → 编译）
- markdown 表格降级为 ul（cells 用 ` · ` 连接），不渲染原始表格结构
- 输入 textarea：回车 = 换行（不发送），发送靠按钮

详见 `../HANDOFF_MINIPROGRAM_v60.4.md`。

## 上架准备 (生产部署)

要上架到正式版，需要解决：

1. **域名备案**：
   - vercel.app 不能直接加入小程序「request 合法域名」
   - 方案 A：买/借一个国内已 ICP 备案的域名 → CNAME 到 vercel
   - 方案 B：阿里云/腾讯云国内 ECS 部署反向代理（同时可用 Cloudflare Workers 国际加速）

2. **后端域名变更**：
   - `app.js` 里的 `apiBase` 改成你的备案域名
   - 微信小程序后台 → 开发管理 → 服务器域名 → request 域名添加

3. **小程序备案**：
   - 2024 年起所有小程序也需要 MIIT 工信部备案
   - 微信小程序后台 → 设置 → 基本设置 → 备案信息

4. **审核与发布**：
   - 每次发布先「上传」→ 在线提交审核 → 通过后「发布」

## 基础库要求

- **≥ 2.20.1**（onChunkReceived 必需）
- 重命名 modal: **≥ 2.18**（showModal editable）
- textarea auto-height: **≥ 1.4.0**（基本所有版本支持）
