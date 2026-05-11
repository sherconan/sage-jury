# Changelog — sage-jury

> 遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/) 风格。
> 本文件由 `~/projects-mgmt/scaffold` 基于 git log 生成初版，后续手工迭代。

## [Unreleased]

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
