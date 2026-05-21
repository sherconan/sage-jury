# sage-jury · 项目交接文档

> 接手必读。读完这一份 + 跟着 §10 onboarding 走完，你就能接着开发了。
> 最后更新：2026-05-20（v62.1 上线后）

---

## 1. 项目是什么（1 分钟版）

**让普通投资者和段永平/管哥这种投资大佬"对话"，得到用大佬真实投资逻辑做的深度分析**——
不是泛泛而谈、不是查 PE 拼凑、不是金句复读，而是用 10 年真实财务数据 + 大佬框架算出来的、有数字、有判断、有边界的真分析。

- **在线**：https://sage-jury.vercel.app
- **Repo**：github.com/sherconan/sage-jury
- **当前 maintainer**：@sherconan

---

## 2. 当前状态（一眼看完成度）

```
版本        : v62.1   (commit da586ff)
上线时间    : 2026-05-20
LLM 提供方  : DeepSeek (deepseek-chat / api.deepseek.com)

【深度覆盖】（含 5 个〔〕分层 + 真数字算账）
✅ A 股段永平     茅台/招行/五粮液 等 ~30 只
🟡 美股段永平     thin 档案（仅实时行情，无多年财务）
🟡 港股段永平     thin 档案
🟡 管哥（A/H/US） 全部走旧 v61 简版 pipeline

【北极星】真分析覆盖率
当前 30% (30/120) → V1.0 目标 90% — 详见 docs/v1.0-goal.md
```

---

## 3. 三层架构（v62 核心）

```
用户问 →【Layer 1 研究层】              【Layer 2 分析层】           【Layer 3 表达层】
        buildDossier(ticker)            analyzeDuan(dossier)         LLM 用段永平口吻
        ────────────────────             ─────────────────            5 个〔〕分层
        push2 实时                       4 维度真分析               (结论/生意本质/
        + datacenter 估值              (生意/管理/估值/周期)         现在的价/能力圈
        + datacenter 10×165 字段       基于多年数据算趋势/持续性     +周期/仓位边界)
        →  ResearchDossier              →  DuanAnalysis              600-1000 字
                                         (含 keyMetrics)
```

**A 股段永平**走 v62（useV62 path）。**其他**仍走旧 `gatherFacts + scoreXxx` 简版。

---

## 4. 关键文件清单（接手必读，按重要度）

```
🔥 核心后端
app/api/chat/v2/stream/route.ts        # SSE endpoint, useV62 分支判断
lib/sage/v62/research.ts               # 数据层 buildDossier
lib/sage/v62/analysis.ts               # 分析层 analyzeDuan + formatAnalysis
lib/sage/stock_tools.ts                # resolveTicker (中文/代码→Ticker)
lib/sage/corpus_search.ts              # 段永平历史发言检索（v60.9.3 阈值收紧）

🔥 Sage 资产
public/sages/duan-yongping/SKILL.md    # 段永平身份+框架 (v62 形态)
public/sages/guan-wo-cai/SKILL.md      # 管哥 (旧形态，待 v62 化)
public/sages-quotes/{slug}.json        # 雪球语料（corpus 检索用）

🔥 前端
app/page.tsx                           # chat UI；含 formatSageStructure / drawer

📄 文档（读完 onboard）
docs/v62-architecture-review.md        # 架构审视（V61→V62 为什么重构）
docs/v62-integration-handoff.md        # 给别的产品集成 v62 的对接文档
docs/v1.0-goal.md                      # V1.0 北极星 + 10 Projects + Weekly Tracker
docs/PROJECT-HANDOFF.md                # 本文档
```

---

## 5. 数据源接口（已实测，2026-05）

| 用途 | 接口 | 状态 |
|---|---|---|
| A 股实时价/市值 | `push2.eastmoney.com/api/qt/stock/get?secid=1.{code}` | ✅ 活 |
| A 股估值 | `datacenter.eastmoney.com .../RPT_VALUEANALYSIS_DET` | ✅ 活（注意：无 PE 历史分位） |
| A 股 10 年财务 | `datacenter.eastmoney.com .../RPT_F10_FINANCE_MAINFINADATA` | ✅ 活（165 字段×10年） |
| 港股 | `qt.gtimg.cn/q=hk{code}` | ✅ 活（字段[3]价/[44]市值/[57]PE/[58]PB/[59]股息）|
| 美股实时 | `push2.eastmoney.com .../?secid=105.{ticker}` | ✅ 活（但 f162 PE=0） |
| 美股 PE | `hq.sinajs.cn/list=gb_{ticker小写}` | ✅ 活（字段[14]=PE TTM） |
| **美股 10 年财务** | **未找到免费源** | ❌ V1.0 P1 卡点 |
| **港股 10 年财务** | **未找到免费源** | ❌ V1.0 P2 卡点 |

**⚠️ 黑名单（已 302 废弃）**：
- `emweb.securities.eastmoney.com/PC_HSF10/...`
- `emweb.securities.eastmoney.com/PC_HKF10/...`

---

## 6. 部署 / 环境

**Vercel**（自动 deploy / 也支持手动）：
```bash
git push origin main       # auto deploy
# 或手动
vercel --prod --yes        # 主域名 sage-jury.vercel.app
```

**环境变量**：
```
SAGE_LLM_BASE         = https://api.deepseek.com
SAGE_LLM_KEY          = (找 maintainer 拿，sk-... 开头)
SAGE_LLM_FAST_MODEL   = deepseek-chat
```
- Vercel 上：Project Settings → Environment Variables 已设
- 本机：必须建 `.env.local`（已 .gitignore，不进 repo），否则 LLM 401

---

## 7. 已知 bug / 已知坑（接手前务必知道）

| 坑 | 影响 | Workaround / 修复方向 |
|---|---|---|
| 美股 10 年财务源未找到 | 苹果/英伟达等 thin | 见 v1.0-goal.md P1（akshare 后端代理是 Plan B）|
| 港股 10 年财务源未找到 | 腾讯等 thin | 见 v1.0-goal.md P2 |
| 管哥还在 v61 简版 | 5 个 if-else 打分 | v1.0-goal.md P3 v62 化 |
| `route.ts:51` LLM_KEY fallback 是 `""` | 本机 dev 无 .env 时 401 | 加 .env.local |
| 本机直连 Vercel 被墙（GFW + Clash TUN）| sandbox/node 都连不上 | **用 `npm run dev` 本地端到端测**，别试连线上 |
| Next.js 把 corpus json 警告"超 2MB 不缓存" | warning 而已，不影响功能 | 忽略 |
| Chrome MCP 不可用 | 自动化浏览器测试受限 | 手动浏览器测 |

---

## 8. 历史踩坑（避免重复踩）

```
v60.6  ReAct 8 工具 → LLM 不算账只拼凑 + 工具 hang 10 分钟    ❌  失败
v60.7  压成"80-300 字金句" 反 PPT 八股                         ❌ 矫枉过正
v60.8  两阶段架构(Phase1+LLM voice)                            ✅ 方向对
v60.9.x 一堆小修(港股 PE/corpus 跑题/能力圈外去模板化)         🟡 表达层抛光
v61    输出形态改"先结论+〔〕分层" + 排版                       🟡 表达层抛光
v62    三层架构重做(研究层 + 分析层 + 表达层) — 茅台真分析     ✅ 第一次动架构
v62.1  cycle 阈值修 + dev .env 修                              ✅ 当前线上
```

**最大教训**：61 个版本只抛光表达层 prompt，没动架构 — 直到用户说"V1.0 都没到"才警醒。**写产品 ≠ 改 prompt**。

---

## 9. 下一步路线 = V1.0

见 `docs/v1.0-goal.md`。北极星 30%→90%，10 Projects，12 周。

**最近 3 周该做的**（Sprint 1）：
- P1 美股深度档案 ← 苹果是段永平第一票，V1.0 卡点
- P7 数据源健康巡检 ← 早做，避免又一波接口废了不知道

---

## 10. Onboarding 步骤（按顺序走，1 小时上手）

```bash
# Step 1 — 拿到代码 + 配 env
git clone https://github.com/sherconan/sage-jury.git
cd sage-jury
npm install
cp .env.example .env.local
# 编辑 .env.local 填 SAGE_LLM_KEY（找 @sherconan 拿）

# Step 2 — 跑起来
npm run dev    # 起在 localhost:3401（端口看 package.json）

# Step 3 — 本地端到端测（重要！本机直连 Vercel 被墙，必须本地测）
curl -X POST http://localhost:3401/api/chat/v2/stream \
  -H "Content-Type: application/json" \
  -d '{"sage_id":"duan-yongping","message":"茅台能买吗"}'
# 应该看到 600-1000 字含 5 个〔〕分层的真分析

# Step 4 — 浏览器看 UI
open http://localhost:3401

# Step 5 — 读文档（按顺序）
# 1) docs/v62-architecture-review.md — 为什么 v62 重构
# 2) docs/v1.0-goal.md — V1.0 北极星 + 10 Projects
# 3) docs/v62-integration-handoff.md — 如果要把 v62 嫁接到别的产品
# 4) 本文档（再过一遍）

# Step 6 — 开始第一个 Project
# 推荐 P1（美股深度档案）— 详见 v1.0-goal.md
```

---

## 11. 联系

- Maintainer: @sherconan
- 紧急问题：Discord / 邮箱
- 数据接口废了：先看 §5 黑名单，再 §7 已知坑
- LLM key 失效：DeepSeek 控制台 / 联系 maintainer

---

**End of Handoff. 接手顺利。有问题，先看 §7 已知坑 和 §8 历史踩坑，多数答案在里面。**
