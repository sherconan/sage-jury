# Sage Chat · Web 项目 · v60.4 Handoff

> 衔接 v60.3 → v60.4。本文修复 v60.3 的几处偏差，记录 v60.4/v60.4.1/v60.4.2 的实际产线状态，并固化 deep pool 维护工具链。
> 起 HEAD: `6069098 v60.4 — register guan-wo-cai + v60 deep pool, retire lao-tang, fast followups`
> 当前 HEAD: `e5ab6c8` 之后（miniprogram v60.5-mp.5 已在 main 分支，web 端 v60.4.x 数据增强未单独 commit，本次一并 ship）

---

## 一、HANDOFF_v60.3 的偏差修订

| v60.3 的描述 | 真实情况 | 处理 |
|---|---|---|
| "管我财 SKILL.md 没 v60 升级（还是 May 9 老版）" | 管我财 **根本没注册到 `data/sages/index.ts` SAGES_RAW**，前端 sage 列表完全不显示他 | v60.4 一次性补完 SAGES_RAW 注册 + SKILL.md v60 升级 + deep pool 挖矿 |
| "但斌 SKILL.md 没 v60 升级" | 但斌在 `index.ts` 早已 `tier: "removed"`，sage 列表里看不到 | 无需动；mp 端 `app.js` 也已剔除 |
| "老唐 corpus 几近为空（>500 字仅 3 条）" | 准确。无法支撑 v60 质量 | 一并 `tier: "removed"`；mp 端 `app.js` 同步剔除 |
| "followups 还在用 LLM_MODEL (v4-pro)" | 准确，导致 `done` 前白等 5-10s | `chat/stream/route.ts:1254` `LLM_MODEL → LLM_FAST_MODEL` |

---

## 二、v60.4 完整变更清单（已上线 https://sage-jury.vercel.app）

### A. SAGES_RAW 校准（`data/sages/index.ts`）
- 新增 `id: "guan-wo-cai"` 完整 entry（philosophy / coreLine / 5 dimensions / 5 redFlags / 5 bonus / 7 quotes / 3 misuseWarnings / complementarySages / avatar / color）
- `id: "lao-tang"` `tier: popular → removed`
- 但斌、林园、王亚伟早已 removed，无改动

### B. 管我财 v60 sage skill 文件包（`public/sages/guan-wo-cai/`）
- `SKILL.md` v2 → v60：新增 🚨 收尾铁律（禁止复读机，8 种轮换收尾）+ 🎯 深度铁律（5 维度强制铺开）
- `deep_thought_samples.md` 新建：8 条经典深帖（2016-10-23 manifesto / 荒岛 16-26 / 重资产投资 / 早期茅台）

### C. 管我财 deep_analysis_originals 池（`public/sages-quotes/guan-wo-cai.json`）
- 从 0 条 → 30 条
- 数据源：`data/xueqiu-watcher/guan-wo-cai.sqlite` 33877 条 → 文本 >= 500 字筛 550 候选 → engagement 排序 + 粤语过滤 + 质量分 + 去重 → top 30
- 质量分 ≥ 2 全部通过（数字 + 持仓 + 结构标识 + 长度），无 quality<=1 噪音

### D. 段永平 deep pool 扩容
- 27 条 → 30 条（quality ≥ 2 一刀切）
- 与管我财 parity

### E. followups 模型切换（`app/api/chat/stream/route.ts:1254`）
- `model: LLM_MODEL` (v4-pro thinking) → `model: LLM_FAST_MODEL` (deepseek-chat 非 thinking)
- 实测 done 前后台等待时间从 5-10s → ~1s

### F. v60.4.1（commit 2e9c228）
- `deep_thought_samples.md` 重生：之前手写繁简 map 覆盖率 ~70%，残留繁体导致 Analyst 偶尔输出夹生
- 切到 zhconv 全量繁→简，残余等价字符 = 0

### G. v60.4.2（本 HANDOFF 一并 ship）
- `scripts/mine_deep_posts.py`：可复用 mining CLI，参数化 top/min-len/min-quality/cantonese，支持 `--all`
- `scripts/gen_deep_thought_samples.py`：从 pool 生成 samples md，主题 tag 自动打标
- 段永平 pool 重挖（27 → 30），管我财 pool 重挖（旧 30 中剔除 2 条 quality≤1，新挖 2 条填补）

---

## 三、生产架构（与 v60.3 一致，无破坏性变更）

```
用户 query
  ↓
┌─ Round 0 ─────────────────────────────────────────┐
│ deepseek-v4-pro (thinking)                         │
│ ↓ reasoning_content → analyst_chunk SSE           │  ← 4s 内 💭 卡可见
│ ↓ 决定调哪些工具 (并行)                            │
└────────────────────────────────────────────────────┘
  ↓ tool_call / tool_result SSE
┌─ Round 1 ─────────────────────────────────────────┐
│ deepseek-v4-pro (thinking) 继续 / 决定转合成       │
└────────────────────────────────────────────────────┘
  ↓
┌─ Round 2 (Last, no tools) ────────────────────────┐
│ deepseek-chat (FAST, 非 thinking)                  │
│ ↓ content → chunk SSE                              │  ← ~20s 内答案流
└────────────────────────────────────────────────────┘
  ↓
  citation audit → done event (followups via FAST_MODEL，无白等)
```

SSE events 不变：`quotes` / `tool_call` / `tool_result` / `analyst_chunk` / `analyst_done` / `chunk` / `phase` / `citation_audit` / `done` / `error`。

---

## 四、核心文件指针

```
app/api/chat/stream/route.ts                  ~1290 行 主 agent loop
app/page.tsx                                  ~770 行  前端
public/sages/duan-yongping/SKILL.md           v60 模板基准
public/sages/duan-yongping/deep_thought_samples.md  8 个深推样本
public/sages-quotes/duan-yongping.json        含 deep_analysis_originals 30 条
public/sages/guan-wo-cai/SKILL.md             v60 (新增收尾铁律 + 深度铁律)
public/sages/guan-wo-cai/deep_thought_samples.md  8 个深推样本 (zhconv 繁→简)
public/sages-quotes/guan-wo-cai.json          含 deep_analysis_originals 30 条
data/sages/index.ts                           SAGES_RAW + tier 过滤
scripts/mine_deep_posts.py                    ⭐ NEW: 池挖矿 CLI
scripts/gen_deep_thought_samples.py           ⭐ NEW: samples md 生成 CLI
```

---

## 五、Deep pool 维护流程（新 sage 上线 SOP）

```bash
# 1. xueqiu_watcher 抓 corpus
python3 scripts/xueqiu_watcher/fetch_incremental.py <slug>

# 2. 挖深度帖入池（默认 top 30）
python3 scripts/mine_deep_posts.py <slug>

# 3. 生成 Analyst 模仿样本
/opt/homebrew/bin/python3.13 scripts/gen_deep_thought_samples.py <slug>

# 4. 复制段永平 SKILL.md 模板到 public/sages/<slug>/SKILL.md，按 sage 个性化
# 5. 在 data/sages/index.ts SAGES_RAW 追加 entry
# 6. 在 app/api/chat/stream/route.ts SAGE_FILES 加 mapping（如果 slug 不规范）
# 7. miniprogram/app.js sages 列表追加（如果要小程序也用）
# 8. TS check + 部署
```

---

## 六、回归测试 query 集（每个 sage 至少跑一遍）

| sage | 询问 | 期望命中 |
|---|---|---|
| 段永平 | 苹果还能拿吗？ | `search_sage_post` 命中 2024-10 苹果发言；deep_thought 模仿密度 |
| 段永平 | 你为什么换神华去泡泡玛特？ | search_sage_post 命中 2023-12 神华→泡泡玛特换仓 |
| 管我财 | 腾讯现在能买吗？ | 命中 2026-04-30 "480-500 合理价" 原帖；输出含分位/股息/排雷三维度 |
| 管我财 | 26 年荒岛策略选什么？ | 命中 2025-12-31 荒岛26 帖 + AH 折价分析 |
| 管我财 | 招行 PE 历史什么分位？ | get_realtime_quote + get_pe_history_pct 双调用 |

---

## 七、已知 follow-ups（v60.5+）

1. 其他 popular sage（冯柳、张坤、巴菲特、邱国鹭）目前**无 corpus 也无 SKILL.md**，仅靠 index.ts 内置 quotes/dimensions 跑。如果想纳入 v60 体验，需先建 xueqiu_watcher 抓取（巴菲特无雪球账号，可考虑 Berkshire 信件 corpus 替代源）。
2. mining CLI 当前按 engagement 单维度排序；可考虑加入 importance_score 二次重排或 LLM-as-judge 质量过滤。
3. followups 速度 v60.3 → v60.4 没采 TTFB baseline 对比；下次回归用 100 query 跑 P50/P95 落档。
4. v60.4 部署后 prod alias 已 ready；如果发现 CSS/JS chunk 没刷新，强制 `vercel --prod` 一次。
