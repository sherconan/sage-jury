# Changelog — sage-jury

> 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 风格。
> 本文件由 `~/projects-mgmt/scaffold` 基于 git log 生成初版，后续手工迭代。

## [Unreleased]

## [v60.4.10] - 2026-05-12

### Fixed
- `app/api/battle/stream/route.ts` 同步 v60.4.7 fallback path（`SAGE_BY_ID` 入口检查 + `buildFallbackSkillBlock`），feng-liu 等 12 个 fallback sage 不再 400
- battle/stream 加 chat/stream v60.2 同等 emitBuf + DSML 状态机（之前会泄漏 raw `<｜｜DSML｜｜tool_calls>` 给前端）+ 80 字符切片

### Known limitations
- battle/stream 缺 v60.4.5 Round 2 retry 兜底；如果 model 用 DSML 双声道（content + OpenAI tool_calls 同时），content 全被 emitBuf suppress 后 0 chunks。退化成单 sage chat 完全的等价路径建议 follow-up（或直接撤回该 endpoint）
- `app/api/battle/route.ts`（node runtime, 非 stream）尚未补 fallback；当前没 frontend 调用，留作技术债

### Notes
- 没有 frontend 调用 `/api/battle*`；本次修复主要是 backend 一致性 + 偶发外部测试可用

## [v60.4.9] - 2026-05-12

### Added
- chat 主页 sage picker 暴露 15 个 live sage（之前只有 4 个静态 hardcode）
- 新 `SagePickerRow` 子组件 + 按 tier 分 3 组（大众派有 corpus / 大众派元 / 圈内派元）
- 13 个 fallback sage 显示"元"小标签 + "无历史发言池"提示
- `STARTERS_FALLBACK` 给每个 fallback sage 2 个定制 starter
- header bar `hasCorpus` 条件文案：`基于 N 条雪球发言` 或 `元数据角色`

### Verified
- 15/15 sages smoke test 全过（query 复杂如"讲讲你的核心方法论"也跑通）
- baseline_gate 跑 8 query：p50=33.6s（基线 36.7s 还更快）、0 fallback、max 66.7s 在阈值 69.6s 内
- 实测 fallback sage 输出质量：buffett 1233 字符（含"买股票就是买公司" / "Price is what you pay"）、li-lu 1079（芒格"知道自己不知道什么" / 福耀玻璃 / 比亚迪）、deng-xiaofeng 702（招行 ROE / 海康市占率 30%）

### Changed
- `app/page.tsx` SAGES 从 hardcode 改为 SAGES_RAW 派生 + tier/hasCorpus 字段
- `gradientForSage()` 给每个 sage 配 tailwind 渐变

## [v60.4.8] - 2026-05-12

### Changed
- `app/page.tsx` SAGES 删 dan-bin / lao-tang（与 SAGES_RAW.tier="removed" 对齐；mp app.js 早已删过）
- guan total_posts 33853 → 33877（与最新 mp app.js 同步）

## [v60.4.7] - 2026-05-12

### Fixed
- **重要 bug**：前端 sage 列表展示 14 个 sage（popular+insider），但 `SAGE_FILES` 只配了 2 个有 corpus 的（duan/guan）；其余 12 个点击会立刻 `400 Unknown sage`，**86% 入口是死的**

### Added
- `loadSage` 增加 fallback：SAGE_FILES 不命中时从 `SAGE_BY_ID` metadata 拼合成 SageData
- `buildFallbackSkillBlock` 函数：用 `dimensions`/`redFlags`/`quotes`/`representativeTrades`/`misuseWarnings` 拼系统 prompt
- fallback prompt 明确禁止 `search_sage_post`（避免空数据池查询）和"我 2023 年说过 X"造假
- 仍可调 `web_search` / `get_realtime_quote` 等公开数据工具

### Verified
- feng-liu × "医药 CXO 现在是逆向机会吗" → 957 字符冯柳口吻（弱者体系 / 预期差 / 药明 17.4 倍 PE）
- buffett × "伯克希尔现金仓位" → 998 字符巴菲特口吻（现金堆 + 等机会）
- 不存在 sage 仍然 400
- `baseline_gate.py` 跑 8 query：p50 30.1s（基线 36.7s）、0 fallback 命中，无回归

## [v60.4.6] - 2026-05-12

### Added
- `baseline.json` 性能基线（16 runs × 8 queries × 2 sages，p50 done=36.7s）
- `scripts/baseline_gate.py` 部署后回归 gate（fallback 检测 + TTFB 阈值 + exit code 语义化）

## [v60.4.5] - 2026-05-12

### Fixed
- **真 bug**：duan+苹果 query 触发 `（本轮回答未生成，请重试）` 占位（Round 2 偶发空 content）
- 改用 FAST_MODEL retry + 显式"请综合写答案"指令；实测 13ch 假占位 → 595ch 真答案

## [v60.4.4] - 2026-05-12

### Changed
- `chat/stream/route.ts` outSeg 切 80 字符段后再 enqueue，避免 DeepSeek/Vercel 上游打包成单 SSE chunk
- 实测：招行 PE query 1 chunk → 315 chunks 流式

## [v60.4.3] - 2026-05-12

### Added
- `scripts/bench_chat_stream.py` SSE 事件级 TTFB 采样
- `PERF_BASELINE_v60.4.2.md` cycle 1 → cycle 3 对比文档

## [v60.4.2] - 2026-05-12

### Added
- `scripts/mine_deep_posts.py` 可复用 mining CLI（top/min-len/quality/cantonese/--all）
- `scripts/gen_deep_thought_samples.py` samples md 生成（zhconv 繁→简 + 主题 tag）
- `HANDOFF_WEB_v60.4.md` 修 v60.3 文档偏差 + 新 sage 上线 SOP

### Changed
- 段永平 deep_analysis_originals 27 → 30（与管我财 parity）
- 管我财 deep_analysis_originals 重挖：剔除 2 条 quality≤1 噪音
- 两 sage 池 100% quality ≥ 2（数字 + 持仓 + 结构 + 长度）

### Fixed
- `.gitignore` 加 `*.tsbuildinfo`/`*.sqlite-journal`/watcher logs/__pycache__；`git rm --cached tsconfig.tsbuildinfo`

## [v60.4.1] - 2026-05-12

### Changed
- 管我财 `deep_thought_samples.md` 重生：手写繁简 map → zhconv 全量，残余繁体字符 0

## [v60.4] - 2026-05-11

### Added
- 管我财注册到 SAGES_RAW（之前数据齐全但未接入，前端不显示）
- 管我财 SKILL.md v60：禁止复读机 + 5 维度深度铁律
- 管我财 deep_analysis_originals 30 条（mine from 550 候选）
- 管我财 deep_thought_samples.md 8 条经典深帖

### Changed
- followups 从 LLM_MODEL（v4-pro thinking）切到 LLM_FAST_MODEL（deepseek-chat），done 前白等 5-10s → ~1s
- 老唐 tier popular → removed（corpus 3 条空壳，硬撑欺骗用户）

## [Earlier] (v46-v59)
（之前由 scaffold 自动生成的初版条目，下方保留）

### Added
- v54.1 add HANDOFF.md for next session
- v50.1 add .npmrc legacy-peer-deps for Vercel

### Changed
- v54 — inline citation chips + force methodology analysis when asked '怎么操作'
- v53 — fix HK stocks (03306 等) + force paragraph breaks
- v52 — Skill v3 (3 反射式文件 × 2 sage) + Tool v3 (4 新工具)
- v53 — 小程序 empty state 加 4 sage 横排选择卡 (默认不可见的 dropdown picker → 永远可见)
- v52 — 小程序 header 布局修复 (中文字符撑垮 flex 导致竖排 bug)
- v51 — 小程序同步 web v46-v50 改动
- v51 — sage 风格强约束: few-shot examples + 兜底 synthesis pass
- v50 — sage 风格大改: 去 checklist/表格化 + 加 markdown 渲染

---

## [0.1.0] - 2026-05-11

### Added
- 初版（CHANGELOG 起始）
