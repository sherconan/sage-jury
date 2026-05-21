# sage-jury V1.0 交付 · 新 session 接力 Handoff (2026-05-21)

> 目标：3 个月内让普通投资者问 A/H/美 任意主流标的，都能用大佬真实逻辑算出**有数字、有判断、有边界**的深度分析。
> OKR 已立（`docs/v1.0-goal-okr.md`），本文是「**从哪开始干**」的执行 handoff。

---

## 1️⃣ 当前坐标（base line · 2026-05-21）

| 维度 | 状态 |
|---|---|
| 代码 tip | `da586ff` v62.1 端到端跑通（茅台被误判强周期已修 + LLM 401 收尾） |
| 引擎版本 | **v62** A 股 + 段永平 三层架构（v61 → v62 重构完成） |
| 数据 | A 股深度档案 ~30 只；港股/美股仍 thin（KR1 最大短板） |
| 未提交 | 4 个 sages-quotes json + 4 个 xueqiu-watcher sqlite + audit/ 草稿 + 本文档 + v1.0 OKR doc 都未入库 |
| 运行端口 | `bun dev` → http://localhost:3401 |
| 上次 sprint | `SESSION_REPORT_7H_2026-05-12.md` 已记录 |

---

## 2️⃣ 5 个 KR 的开干姿势（按优先级）

### 🥇 KR1 · 覆盖广度（最大短板，先做）

**Gap**：美股 + 港股 10 年财务源缺；管哥还在 v61 thin；标的字典只覆盖 ~30 票。

**第一刀**（建议 sprint 1 第 1 周）：
1. 探明**美股 10 年财务源**：先试 `akshare.stock_financial_us_*` / cninfo 美股接口 / eastmoney datacenter — **苹果是段永平第一票，必须能算**
2. 探明**港股 10 年财务源**：gtimg 只有当期；试 xueqiu MCP 后端代理 / eastmoney HK F10 历史
3. 把 v62 三层架构（分位/排雷/股息/稳态/荒岛）从段永平复制给**管哥**（`lib/analyzeGuan.ts`）
4. 扩 `lib/ticker-dict.ts` 的 `NAME_TO_TICKER` + `NAME_TO_US` 到 60 标的

**完成定义**：测试矩阵 60 题（60 标的 × 段永平），≥ 54 题输出含 5 个〔〕分层 + 真数字算账。

### 🥈 KR2 · 分析质量（reflection loop）

**关键文件**：`lib/analyzeDuan.ts`（v62 主引擎）

**第一刀**：加 reflection loop —— LLM 写完自检"像段永平吗 / 数字用对了吗 / 有没有空话"，不达标 regen 一次。

**完成定义**：10 题盲评 v62 vs v61，v62 胜 ≥ 7 题。

### 🥉 KR3 · 响应稳定性

**第一刀**：数据源 fallback（akshare 挂 → eastmoney → xueqiu）+ LLM 401/429 自动重试 + 加 `scripts/health-check.ts` 巡检脚本。

### KR4 · 真实使用（内测）

**第一刀**：onboarding 5 步引导（首次进入展示 茅台/苹果/腾讯 三个示例案例）+ Discord 反馈 webhook。

### KR5 · 数据可靠性

**第一刀**：写 `scripts/health-check.ts` 每 6h 跑一次，覆盖 5 大接口（A股 F10 / HK gtimg / US akshare / cninfo / xueqiu），失败发 Discord 告警。

---

## 3️⃣ 时间轴建议（12 周 = 3 sprint）

- **Sprint 1（W1-W4）**：KR1 美股 + 港股财务源 + 管哥 v62 化（KR1 60% + KR3 fallback）
- **Sprint 2（W5-W8）**：KR2 reflection loop + 定性维度 + 盲评（KR2 + KR4 onboarding）
- **Sprint 3（W9-W12）**：KR4 内测 20 用户 + KR5 健康巡检 + 收尾

---

## 4️⃣ 新 session 开场命令

```bash
cd ~/sage-jury
cat docs/v1.0-goal-okr.md          # 先复习 OKR
cat docs/HANDOFF-v1.0-2026-05-21.md # 本文档
git status                          # 看 untracked
bun dev                             # 起 3401
```

**第一句应该问的话**：
> "美股 10 年财务数据从哪个源拿最稳？我们 KR1 第一刀是把苹果（AAPL）跑通段永平 v62 三层分析。"

---

## 5️⃣ 红线（不能违反）

1. **不编造数据** — 缺数据就说"看不懂"，不 mock
2. **不用付费 API** — 走 akshare / cninfo / xueqiu / eastmoney 免费通道
3. **图片只用 Codex CLI image2** — 全局规则（feedback memory 已立）
4. **每个 KR 必须有完成定义** — 否则就是口号
5. **写 OKR 三铁律**：O 定性 KR 定量 / 50-70% 把握刚好 / 每个 KR 有完成定义（详见 `v1.0-goal-okr.md` 末尾"Goal 模式怎么写"模板）

---

## 6️⃣ 关键文件速查

| 用途 | 路径 |
|---|---|
| OKR 主文档 | `docs/v1.0-goal-okr.md` |
| v62 引擎（段永平） | `lib/analyzeDuan.ts` |
| 管哥（待 v62 化） | `lib/analyzeGuan.ts` |
| 标的字典 | `lib/ticker-dict.ts` |
| 数据源 wrappers | `lib/data/` |
| sage 语录库 | `data/sages-quotes/*.json` |
| 雪球 watcher | `data/xueqiu-watcher/*.sqlite` |
| MCP 服务端 | `mcp/` |
| 历史 handoff | `docs/v62-integration-handoff.md` |

---

## 7️⃣ Owner 视角自查（接手后 24h 内做）

- [ ] 跑 `bun dev` 确认 3401 可用 + 茅台 v62 输出正常
- [ ] 跑 60 标的字典扫一遍，列出哪些已能走 v62 哪些 fallback v61
- [ ] 美股财务源接口测试（先 akshare，不行试 eastmoney）
- [ ] commit 当前 untracked 的 OKR + 本 handoff（让代码库可追溯）

> 因为信任所以简单。新 session 拿这份文档就能直接接手 sprint 1 第一刀——KR1 美股财务源探明。
