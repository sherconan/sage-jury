# Sage Chat · Session Handoff (2026-05-09)

> 给下一个会话用。**先读这一份 + 3 个设计文档**，不要从头读 git log。

## 当前状态

- **production**: https://sage-jury.vercel.app/ (v54, commit `latest`)
- **架构**: 单一 LLM 混合 (v1) + skill v3 文件包 + tool v3 8 工具
- **核心 LLM**: DeepSeek V4 PRO (thinking mode)
- **路径**: B 路线（v52→v54 渐进改进），用户正在测试

## 必读文件（5 分钟看完）

1. `ARCHITECTURE_V2.md` — 架构 v2 设计 + §7 自审 10 漏洞
2. `ARCHITECTURE_V2_SKILLS_AND_TOOLS.md` — Skill v3 + Tool v3 设计 + §5 实施分阶段
3. `ROUTER_SCHEMA.md` — Router LLM JSON schema（v2 重构必备）
4. `app/api/chat/stream/route.ts` — 主 agent loop (~700 行，包含 8 工具 + skill 加载 + 兜底 synthesis)
5. `app/page.tsx` — 前端 (含 inline citation chip 渲染)

## 已完成

- ✅ **v54 inline 引用 chip**：sage 回复中的 `[原文 N]` → 可点击 `#N` chip → 滚动到底部对应雪球卡片高亮
- ✅ **强约束方法论分析**：问"怎么操作 / 能买吗"时必走 5 段 (生意/10年/估值/仓位/风险触发器)
- ✅ **港股工具支持** (03306 等 5 位代码)
- ✅ **段落强制换行** (4-7 段 / `\n\n` 必须)
- ✅ **Skill v3** (段永平+管我财各 9 文件，含 mental_models / anti_patterns / default_position_logic)
- ✅ **Tool v3** (8 工具：search_sage_post / web_search / get_realtime_quote / get_pe_history_pct / get_financials / get_dividend_history / get_kline / compare_stocks)
- ✅ **微信小程序原生版** (`/miniprogram/`, AppID `wx8b251c593a93d37e`)

## 待做（待用户拍板）

### 短期（B 路线继续打补丁）
- 段永平回答太"复述历史持仓"问题（v54 加了强约束，需用户复测）
- 用户提的"agent 没充分发挥 / sage 思想没充分体现"反馈

### 长期（A 路线，架构 v2 重构 ~16h）
- D0: AB 测 deepseek-chat vs v4-pro × 6 case
- D3: Router endpoint (JSON schema 决策)
- D4: Writer endpoint (deepseek-chat 非 thinking, 禁工具)
- D5: Memory 双层 (GlobalProfile + SessionContext)
- D6: Reflector 抽样
- D7: UI 5 事件 SSE 协议
- D8/D9: 平滑迁移 + 评测台

## 用户最新反馈关键词

- 「sage 投资思想 skill 是 #1 重要点」
- 「agent + tool 配置是 #2 重要点」
- 「先优化设计，再优化细节，最后测试」
- 「不要花里胡哨」（已砍 jury/heatmap/陪审团模式）
- 「速度太慢」（这次是因为 context 累积过大才开新会话）

## 已知 bug / 待验证

- v54 `[原文 N]` chip 渲染：用户需硬刷新看到效果
- 港股 F10 数据有时返回 fallback 提示 LLM 调 web_search（不是 hard error）
- 段永平偶尔答完工具直接 done 不写 text（兜底 synthesis 在救）

## 测试 query 集（用于回归）

```
段永平 × 「泡泡玛特怎么操作」  → 看 [原文 N] + 5 段方法论
段永平 × 「什么是 stop doing list」 → 看 8 条全列出
管我财 × 「腾讯能买吗」 → 看 PE 分位 + 5% 股息底线 + 简体输出
管我财 × 「江南布衣 03306 怎么样」 → 看港股工具能拿数据
管我财 × 「我重仓茅台怎么办」 → 看仓位铁律 (5% 上限)
```

## 推荐新 session 第一句话

> "继续 sage chat 项目。先读 HANDOFF.md + ARCHITECTURE_V2.md + ARCHITECTURE_V2_SKILLS_AND_TOOLS.md。当前 v54 已上线，我刚测完 [描述截图], 接下来 [...]"
