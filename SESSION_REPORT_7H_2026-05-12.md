# 7H 自主优化挑战赛 · Session Report

**起止**: 2026-05-12 00:08 → 07:38 GMT+8（约 7.5 小时）
**模式**: 用户离场，纯自主（owner 意识 + 自验证 + 12 个调度循环）
**起 commit**: `6069098 v60.4 — register guan-wo-cai + v60 deep pool, retire lao-tang, fast followups`
**末 commit**: `fba5c4e docs: HANDOFF_WEB_v60.5.md — full session source-of-truth`

---

## 一、量化交付

| 指标 | 数值 |
|---|---:|
| 总 commits | **36** |
| 文件变更 | 41 |
| 代码增减 | +5894 / -833 |
| 新版本 tags | v60.4.1 → v60.5.1（11 个版本） |
| 自主调度 cycles | 12（每 25-30 min wakeup） |
| Prod 部署次数 | ~10 |
| 新 backend endpoints | 1（`/api/jury/stream`） |
| 新 frontend pages | 1（`/jury`） |
| 新 CLI 工具 | 5（mine / gen / bench / gate / smoke） |
| 新文档 | 4（HANDOFF_v60.4 / HANDOFF_v60.5 / PERF_BASELINE / SESSION_REPORT 本文） |
| 真 bug 修复 | 2（"请重试"占位 / 86% 死路） |

---

## 二、按 cycle 时间轴

| Cycle | 起止 (≈) | 主要交付 | Commits |
|---|---|---|---:|
| 1 | 00:08-00:50 | mp.0/.1/.2 baseline + Phase 1+2，web v60.4.1 polish | 4 |
| 2 | 01:00-01:30 | autonomous 推进 mp.3-mp.5 + mp.final 期间，web 端做 v60.4.2 deep pool 质量提升 + mining CLI + HANDOFF_v60.4 | 1 |
| 3 | 01:55-02:30 | bench CLI 落地 + **真 bug fix**: 苹果 query "请重试" 占位 → 595 字符真答案 + chunk splitting | 4 |
| 4 | 02:30-03:00 | baseline.json (16 runs P50/P95) + baseline_gate.py CI gate | 2 |
| 5 | 02:50-03:20 | **86% 死路修复**: 12 个非 corpus sage（feng-liu/buffett/...）从 400 → fallback metadata 角色扮演 | 3 |
| 6 | 03:30-04:20 | UI 暴露 15 sage 给 chat picker（v60.4.8 删 dan-bin/lao-tang + v60.4.9 动态 SAGES） | 3 |
| 7 | 04:30-05:10 | retry smoke 15/15 全活 + 验证 fallback sage 输出质量（buffett/li-lu/邓晓峰 都有签名句+真案例） | 1 |
| 8 | 05:10-05:50 | 发现 sage-jury 名字核心未实现 + 修补 battle/stream（fallback + DSML） | 3 |
| 9 | 06:12-06:42 | **`/api/jury/stream` 真 multi-sage backend**（208 行，3 sage 64s 完成） | 2 |
| 10 | 06:42-07:13 | **`/jury` page UI**（446 行，多列响应式，主页 chip 入口） | 2 |
| 11 | 07:13-07:38 | HANDOFF_WEB_v60.5.md（248 行 source-of-truth）+ full-stack 5/5 验证 | 1 |
| 12 | 07:38-08:08 | SESSION_REPORT 本文 + tasks.md 封口 | TBD |

---

## 三、最高 ROI 三件套（owner-mode）

### 1. 苹果 query "请重试"占位 → 真答案（v60.4.5）

发现：bench 工具采集 SSE TTFB 时偶然发现 `duan-yongping × 苹果还能拿吗` 总返回 13 字符占位 `（本轮回答未生成，请重试）`，且 chunks=1。

蓝军自检：raw curl 抓出 first chunk 内容确认是占位 fallback 字符串，不是真答案。

根因：Round 2 (FAST_MODEL) 偶发返回空 content，老兜底逻辑塞死字符串而不是真 retry。

修法：FAST_MODEL retry + 显式 user msg "请综合工具数据用 sage 口吻写答案"。

实测：13ch 占位 → **595ch 真答案**（"苹果我拿了 20 多年，没想过要卖..."）。

### 2. 86% 死路修复（v60.4.7）

发现：前端 sage 列表展示 4 sage（其中 dan-bin / lao-tang 是 tier=removed 但仍能点击），SAGES_RAW 实际有 14 个 popular/insider sage，其中 12 个不在 SAGE_FILES。点击 feng-liu/buffett/zhang-kun 等 12 个 sage 立刻 400。

修法：v60.4.7 加 fallback path：
- `loadSage` 从 SAGE_BY_ID 兜底拼合成 SageData
- `buildFallbackSkillBlock` 用 dimensions/quotes/redFlags 拼系统 prompt
- 入口检查从 `!SAGE_FILES` 改为 `!SAGE_FILES && !SAGE_BY_ID`

后续 v60.4.9：page.tsx 动态从 SAGES_RAW 派生 15 sage + tier 分组 picker + fallback "元"标。

实测 fallback sage 输出质量：
- buffett："买股票就是买公司" / "Price is what you pay, value is what you get" / 可口可乐 / 苹果 / 茅台
- li-lu：芒格"知道自己不知道什么" / 哥伦比亚商学院 / 福耀玻璃 / 比亚迪
- 邓晓峰：赚生意的钱不是博弈的钱 / 招行 ROE / 海康市占率 30%

15/15 sage 全活。86% → 100%。

### 3. sage-jury 名字核心兑现（v60.5.0 + v60.5.1）

发现：项目名叫 sage-**jury**，但实际 backend 只有 chat/battle 单 sage 模式，frontend 也只有单 sage chat。`battle/route.ts` 461 行 + `battle/stream/route.ts` 399 行存在但 0 frontend 引用。

backend (v60.5.0)：新建 `app/api/jury/stream/route.ts`（208 行）
- 入参 `{ sage_ids: string[2-5], message, history? }`
- 内部并行 fetch `/api/chat/stream`（自动继承 v60.4.7 fallback / v60.4.5 retry / chunk split / DSML 清洗）
- 输出合并 SSE：`jury_event { sage_id, type, payload }`

frontend (v60.5.1)：新建 `app/jury/page.tsx`（446 行）
- sage 多选 chip（按 tier 分组 + 3 PRESETS + 5 starter queries）
- 多列响应式网格（2/3/4 列）
- 每列：💭 思考 / 🛠️ 工具 / 答案 / ✨ followups + 状态指示器
- batched setState 80ms 防多 sage 并发渲染风暴

实测：3 sage 并行 "腾讯能买吗" 64s 完成（串行需 ~150s+）。

---

## 四、新工具链

| Tool | 路径 | 用途 |
|---|---|---|
| Mining | `scripts/mine_deep_posts.py` | sqlite → top-N deep posts → public/sages-quotes |
| Gen Samples | `scripts/gen_deep_thought_samples.py` | pool → samples markdown (zhconv 繁→简) |
| Bench TTFB | `scripts/bench_chat_stream.py` | SSE 事件级延迟采样，--runs N --json |
| Gate Regression | `scripts/baseline_gate.py` | 跑 8 query × 1 run vs baseline.json，exit 1/2 语义化 |
| Smoke All | `scripts/smoke_all_sages.sh` | 15 sage 全量 smoke（http_code + done event 检查）|

baseline 数据 `baseline.json`：16 runs × 8 query。p50 done=36.7s, p95=48.5s。cycle 7 复测 p50=33.6s 反而更快。

---

## 五、Known limitations（留 follow-up）

1. **battle/stream 缺 v60.4.5 retry**：DSML 双声道时 0 chunks。dead code 不深修，建议撤回 endpoint。
2. **battle/route.ts (node runtime)**：未补 fallback path。无 frontend 调用。
3. **jury 64s 偏长**：可优化（去内部 HTTP hop，jury 直接复用 chat/stream agent 逻辑）。
4. **fallback sage 池为空**：search_sage_post 工具对 fallback sage 返回 0 条（预期，prompt 已禁用）。
5. **HANDOFF_WEB_v60.4.md** 与 HANDOFF_WEB_v60.5.md 并存：v60.5 是当前 source of truth。

---

## 六、过程反思

**对了的事**：
- 每 cycle commit + deploy + verify 三件套，没大返工
- bench 工具在 cycle 3 就落地，cycle 3 用它发现占位 bug、cycle 7 用它做 fallback 质量验证、cycle 8 用它发现 DSML 泄漏 — **工具复用率高**
- 复用而非重写：jury 内部 fetch chat/stream 而不是重写 agent loop，所有修复自动继承
- 调度 25 min × 12 cycles 节奏稳定，cache TTL 友好

**错了的事**：
- cycle 6 把 8/15 timeout 误判为"代理问题"。应该 retry 一次再下结论而不是直接归因外部。cycle 7 retry 全过证明是 vercel 部署后冷启动堆积。
- cycle 8 battle/stream 修了 fallback 但没立刻发现 DSML 泄漏，多走一回（v60.4.10 → v60.4.10+）。应该 commit 前直接 curl 测样本。

---

## 七、给下个 session 的 TL;DR

1. 主聊页 `/` 15 sage 全活（含 13 fallback 用 metadata 角色扮演）
2. 陪审团页 `/jury` 多 sage 并行评判 ready
3. 性能基线 + gate 落地
4. dead code `app/api/battle/*` 未来要么撤要么重写
5. jury 性能可优化
6. 推荐下一步：jury 结果 verdict 共识/分歧 visual / 抓更多 sage corpus / 分享导出

完整文档见 `HANDOFF_WEB_v60.5.md`。

---

🤖 自主完成 12 个 cycles。**因为信任所以简单**——交付清单在上，证据在 git log。
