# Sage Chat 微信小程序

> 和 4 位投资大佬 1v1 聊天的小程序版（段永平 / 管我财 / 但斌 / 老唐），Agent + tools。

## 项目结构

```
miniprogram/
├── app.json / app.js / app.wxss     全局配置 + 4 sage 数据 + 全局样式
├── project.config.json              AppID = wx8b251c593a93d37e
├── sitemap.json
├── pages/
│   ├── chat/                        主对话页（sage 选择 + 流式输出 + tool calls）
│   └── sessions/                    历史对话列表
└── utils/
    ├── api.js                       wx.request + onChunkReceived 实现"伪流式"
    └── sessions.js                  本地多 session 持久化
```

## 启动步骤

1. **打开微信开发者工具**
2. 导入项目 → 选择本目录 `/Users/sherconan/sage-jury/miniprogram`
3. AppID 自动识别 = `wx8b251c593a93d37e`
4. **重要：勾选「不校验合法域名/web-view (业务域名)、TLS 版本以及 HTTPS 证书」**
   - 路径：详情 → 本地设置 → 不校验合法域名
   - 因为后端在 `sage-jury.vercel.app`，未做 ICP 备案，开发版必须关掉校验

5. 点击「编译」即可在模拟器看到效果

## 技术亮点

| 维度 | 实现 |
|---|---|
| **流式响应** | 用 `enableChunked: true` + `onChunkReceived` 监听字节流 → SSE 解析 → 边收边渲染 |
| **多 session** | wx.setStorageSync 本地存储 (key: `sj_chat_sessions_v1`) |
| **Agent + tools** | 4 工具：search_sage_post (BM25+Bocha rerank) / web_search / get_realtime_quote / get_kline |
| **首轮自动标题** | 调用 /api/chat/title 用 LLM 生成 |
| **持久化恢复** | 启动时还原上次 active session |

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

## 当前 dev 体验

- ✅ 4 sage 列表 + 切换（切换=自动新建 session）
- ✅ 多 session 历史（持久化）
- ✅ Agent 调 4 工具 + 工具结果展示
- ✅ 历史对话恢复
- ✅ 首轮自动 LLM 标题
- ⚠️ 流式：依赖 `onChunkReceived`（PC/真机均支持，模拟器 1.05.2308310+）
