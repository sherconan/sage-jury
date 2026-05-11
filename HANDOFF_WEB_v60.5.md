# Sage Chat · Web 项目 · v60.5 Handoff

> 衔接 v60.4 → v60.5。本文记录 v60.4.x（5 个补丁）+ v60.5.x（jury endpoint + frontend）全部产线状态，并整合本轮 7H 挑战赛新增的 5 个 CLI 工具 + 1 套 baseline gate。
> 起 HEAD: `6069098 v60.4 — register guan-wo-cai + v60 deep pool, retire lao-tang, fast followups`
> 当前 HEAD: `7cec74a docs(changelog): v60.5.1 jury page UI shipped + verified`

---

## 一、产线变更全景（按版本）

| 版本 | 类型 | 内容 |
|---|---|---|
| v60.4   | feat   | guan-wo-cai 注册 SAGES_RAW + v60 SKILL.md + 30 deep pool / 老唐 removed / followups → FAST_MODEL |
| v60.4.1 | fix    | guan deep_thought_samples zhconv 全量繁→简 |
| v60.4.2 | feat   | duan pool 27→30、guan 重挖剔噪声、`mine_deep_posts.py` + `gen_deep_thought_samples.py` 工具 + `.gitignore` 卫生 |
| v60.4.3 | feat   | `bench_chat_stream.py` SSE TTFB 采样 CLI + PERF baseline 文档 |
| v60.4.4 | fix    | outSeg 切 80 字符段，避免 DeepSeek 上游打包成单 chunk |
| v60.4.5 | **fix** | **真 bug**：Round 2 偶发空 content 触发"请重试"占位 → FAST_MODEL retry + 显式指令 |
| v60.4.6 | feat   | `baseline.json` 16 runs P50/P95 + `baseline_gate.py` CI 回归 gate |
| v60.4.7 | **fix** | **86% 死路修复**：12 个非 corpus sage（feng-liu/buffett/...）从 400 → fallback metadata 角色扮演 |
| v60.4.8 | refactor | page.tsx SAGES 删 dan-bin / lao-tang（与 SAGES_RAW.tier=removed 对齐） |
| v60.4.9 | feat   | page.tsx 动态从 SAGES_RAW 派生 15 sage + tier 分组 picker + fallback "元" 标签 |
| v60.4.10 | fix   | battle/stream 同步 v60.4.7 fallback + emitBuf DSML 状态机 + 80 字符切片 |
| **v60.5.0** | **feat** | **`/api/jury/stream` 真 multi-sage endpoint**（sage-jury 名字核心兑现） |
| **v60.5.1** | **feat** | **`/jury` page UI** 446 行 React，多列响应式，2-5 sage 并行陪审 |

---

## 二、关键产品改进点（owner-mode）

### A. 死路修复（cycle 5）—— **86% 入口活了**

之前：前端列表 4 sage（其中 2 个 tier=removed 仍能点击）实际 SAGE_FILES 只有 4，点 feng-liu/buffett/... 12 个 sage 立刻 400。
现在：v60.4.7 加 fallback path，loadSage 从 SAGE_BY_ID 兜底拼合成 SageData，buildFallbackSkillBlock 用 dimensions/quotes/redFlags 拼系统 prompt。15/15 sage 全活。

实测 fallback sage 输出质量：
- buffett："买股票就是买公司" / "Price is what you pay, value is what you get" / 可口可乐
- li-lu：芒格"知道自己不知道什么" / 哥伦比亚商学院 / 福耀玻璃 / 比亚迪
- 邓晓峰：赚生意的钱不是博弈的钱 / 招行 ROE / 海康市占率 30%

### B. 真 bug fix（cycle 3）—— "请重试"占位 → 真答案

bench 测试发现 `duan-yongping × 苹果还能拿吗` 一直返回 13 字符占位 `（本轮回答未生成，请重试）`。根因是 Round 2 (FAST_MODEL) 偶发返回空 content，原代码兜底是塞死字符串。

v60.4.5 改成真 retry：FAST_MODEL + 显式 user msg "请综合工具数据用 sage 口吻写答案"，实测苹果 query 13ch → **595ch 真答案**（"苹果我拿了 20 多年..."）。

### C. sage-jury 名字核心兑现（cycle 9-10）

之前：项目名叫 sage-**jury**，但实际只能 1v1 单 sage chat，没有 jury 概念。`app/api/battle/route.ts`（461 行）+ `battle/stream/route.ts`（399 行）是单 sage 模式且无 frontend 调用。

现在：
- backend `/api/jury/stream`（208 行）：2-5 sage 并行调用 chat/stream，SSE 多路合并加 sage_id 标签
- frontend `/jury` page（446 行）：响应式多列网格，每位 sage 实时流式

实测 3 sage 并行 "腾讯能买吗" 64s 完成（串行需 ~150s+），422KB SSE 流。**fallback sage 也能 jury（v60.4.7 自动继承）**。

### D. 池质量 + 工具链（cycle 2-4）

- 段永平 deep pool 27→30 + guan 重挖剔 2 条 quality≤1 噪声
- 4 个新 CLI 工具固化：
  - `scripts/mine_deep_posts.py` — 通用 mining，支持 --all / --top / --min-quality
  - `scripts/gen_deep_thought_samples.py` — 池 → markdown 样本生成
  - `scripts/bench_chat_stream.py` — SSE 事件级 TTFB 采样
  - `scripts/baseline_gate.py` — 部署后回归 gate（exit 1/2 语义化）
  - `scripts/smoke_all_sages.sh` — 15 sage 全量 smoke

---

## 三、生产架构 v60.5 全景

```
                              ┌─────────────────────────────────┐
                              │       chat/stream agent loop    │
                              │  ┌───── Round 0 ─────────────┐  │
                              │  │ deepseek-v4-pro thinking  │  │ ← 4s 内 💭 卡可见
                              │  │ → reasoning (analyst_chunk)│  │
                              │  │ → tool_calls (并行)        │  │
                              │  └───────────────────────────┘  │
                              │  ┌───── Round 1 ─────────────┐  │
                              │  │ thinking 继续 / 决定合成    │  │
                              │  └───────────────────────────┘  │
                              │  ┌───── Round 2 (FAST) ──────┐  │
                              │  │ deepseek-chat 写答案       │  │
                              │  │ + retry 兜底（v60.4.5）   │  │
                              │  │ + emitBuf DSML 保护        │  │
                              │  │ + 80 字符切片（v60.4.4）  │  │
                              │  └───────────────────────────┘  │
                              │  done event { followups, fullReply } │
                              └─────────────────────────────────┘
                                         ↑                    ↑
                                         │                    │
                       /api/chat/stream  │                    │  /api/jury/stream
                       (1 sage)          │                    │  (2-5 sage 并行)
                                         │                    │
                              ┌──────────┴──────────┐  ┌──────┴──────────────┐
                              │   /                 │  │   /jury             │
                              │   page.tsx 单 sage  │  │   page.tsx 多列网格 │
                              │   15 sage picker    │  │   2-5 sage 并行流   │
                              └─────────────────────┘  └─────────────────────┘
```

SSE events（不变）：`quotes / tool_call / tool_result / analyst_chunk / analyst_done / chunk / phase / citation_audit / done / error`

jury 包络事件（新增）：`jury_start / jury_event / jury_done`

---

## 四、性能基线（v60.5.x）

参见 `baseline.json` + `PERF_BASELINE_v60.4.2.md`。

| 指标 | p50 | p95 | max | n |
|---|---:|---:|---:|---:|
| TTFB first analyst | 4.3s | 11.9s | 12.7s | 16 |
| TTFB first chunk | 31.5s | 39.1s | 43.3s | 16 |
| TTFB done | 36.7s | 48.5s | 53.6s | 16 |
| chunks/run | 330 | 489 | 857 | 16 |
| analyst_chunks/run | 261 | 663 | 762 | 16 |

cycle 7 复测：p50 done **33.6s**（比 baseline 36.7s 快），0 fallback 命中。
cycle 8 跑 baseline_gate 8 query：p50 33.6s 通过。

jury 实测：3 sage 并行 64s 完成。

---

## 五、Known limitations（留 follow-up）

1. **battle/stream 缺 v60.4.5 retry**：model 用 DSML 双声道时 0 chunks。dead code 不深修，建议直接撤回 endpoint 或重写。
2. **battle/route.ts (node runtime)**：未补 fallback path。无 frontend 调用。
3. **jury 性能**：3 sage 并行 64s 偏长。可考虑 jury endpoint 内部直接复用 chat/stream agent 逻辑而非内部 fetch（去掉一次 HTTP hop）。
4. **fallback sage 池为空**：search_sage_post 工具对 fallback sage 返回 0 条。这是预期，prompt 已禁用该工具。
5. **HANDOFF_WEB_v60.4.md** 与本文档并存：v60.4 文档保留作中间状态参考，本文档是当前 source of truth。

---

## 六、新 sage 上线 SOP（v60.5 版）

```bash
# 1. xueqiu_watcher 抓 corpus
python3 scripts/xueqiu_watcher/fetch_incremental.py <slug>

# 2. 挖深度帖入池
python3 scripts/mine_deep_posts.py <slug> --top 30 --min-quality 2

# 3. 生成 Analyst 模仿样本（zhconv 全量繁→简）
/opt/homebrew/bin/python3.13 scripts/gen_deep_thought_samples.py <slug>

# 4. 复制 duan-yongping SKILL.md 模板到 public/sages/<slug>/SKILL.md
# 5. 在 data/sages/index.ts SAGES_RAW 追加 entry（v60.4.7 后会自动 fallback；
#    要走 corpus 路径需补 SAGE_FILES 映射）
# 6. 部署
git add -A && git commit -m "feat: add <slug>" && vercel --prod --yes

# 7. 部署后回归
./scripts/smoke_all_sages.sh "你好"
python3 scripts/baseline_gate.py
```

无 corpus sage 一行也不用动 — 已被 v60.4.7 fallback 自动接住。

---

## 七、回归测试 query 集（v60.5 版）

| sage | 询问 | 期望 |
|---|---|---|
| 段永平 | 苹果还能拿吗？ | 595+ 字符（**v60.4.5 修复后绝不再返回"请重试"**），含 search_sage_post 命中 |
| 段永平 | 你为什么换神华去泡泡玛特？ | 命中 2023-12 神华→泡泡玛特换仓 |
| 管我财 | 腾讯能买吗？ | 命中 2026-04-30 "480-500 合理价"原帖 |
| 管我财 | 26 年荒岛策略选什么？ | 命中 2025-12-31 荒岛26 |
| feng-liu | 医药 CXO 现在是逆向机会吗？ | fallback path，含弱者体系 / 预期差 / 药明 17.4 PE |
| buffett | 伯克希尔现金仓位你怎么解读？ | fallback path，含 Berkshire / 等机会 |
| jury | 段+管+冯柳 × 腾讯能买吗 | 3 列并行，~64s，每列 500+ chunks |

回归命令：
```bash
./scripts/smoke_all_sages.sh           # 15 sage smoke
python3 scripts/baseline_gate.py        # 8 query × 1 run vs baseline.json
python3 scripts/bench_chat_stream.py guan-wo-cai "腾讯能买吗" --runs 3  # 单 query 性能
```

---

## 八、文件指针总览

```
app/page.tsx                                  /  主聊页（v60.4.9 动态 15 sage picker）
app/jury/page.tsx                             /jury  陪审团页（v60.5.1 多列网格）
app/api/chat/stream/route.ts                  /api/chat/stream  ~1300 行 主 agent loop
app/api/jury/stream/route.ts                  /api/jury/stream  208 行 多 sage SSE 多路合并
app/api/battle/stream/route.ts                /api/battle/stream  399 行 (dead code, 修了 fallback+DSML)
app/api/battle/route.ts                       /api/battle  461 行 (dead code, 未修)
data/sages/index.ts                           SAGES_RAW + SAGE_BY_ID
public/sages/duan-yongping/                   v60 完整 sage skill 包（9 文件）
public/sages/guan-wo-cai/                     v60 完整 sage skill 包（9 文件）
public/sages-quotes/{duan,guan}.json          含 deep_analysis_originals 30 条

scripts/mine_deep_posts.py                    可复用 mining CLI
scripts/gen_deep_thought_samples.py           samples md 生成（zhconv）
scripts/bench_chat_stream.py                  SSE TTFB 采样
scripts/baseline_gate.py                      部署后回归 gate
scripts/smoke_all_sages.sh                    15 sage smoke

baseline.json                                 P50/P95 baseline（16 runs）
CHANGELOG.md                                  完整版本日志（v60.4 → v60.5.1）
PERF_BASELINE_v60.4.2.md                      性能 evidence 文档
HANDOFF_WEB_v60.4.md                          中间状态文档（保留参考）
HANDOFF_WEB_v60.5.md                          ⭐ 本文，当前 source of truth
```

---

## 九、CLI 工具速查

```bash
# 挖矿（如果 sqlite 已有）
python3 scripts/mine_deep_posts.py <slug>                         # top 30
python3 scripts/mine_deep_posts.py --all --dry-run                # 全 sage 预演

# 样本生成
/opt/homebrew/bin/python3.13 scripts/gen_deep_thought_samples.py <slug>

# 性能 bench
python3 scripts/bench_chat_stream.py <slug> "<query>" --runs 3 --json
python3 scripts/baseline_gate.py --tolerance 1.30

# Smoke
./scripts/smoke_all_sages.sh "<query>"

# Deploy + verify
vercel --prod --yes
sleep 5
./scripts/smoke_all_sages.sh "你好" && python3 scripts/baseline_gate.py
```

---

## 十、TL;DR for next session

如果你接手这个 repo：

1. ✅ 主聊页 `/` 15 sage picker 全活（含 13 fallback 用 metadata 角色扮演）
2. ✅ 陪审团页 `/jury` 实现多 sage 并行评判（2-5 sage）
3. ✅ 性能基线 + 回归 gate 落地，CI-ready
4. ⚠️ `app/api/battle/*` 是 dead code，未来要么撤要么重写
5. ⚠️ jury 当前 64s 偏长，可优化（去内部 HTTP hop）
6. 🚀 推荐下一步：a) jury 结果 verdict 共识/分歧 visual; b) 抓更多 sage 的 corpus（如果能找到他们公开账号）; c) jury 结果分享/导出
