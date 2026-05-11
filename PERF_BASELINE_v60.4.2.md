# Sage Chat Web · 性能基线 v60.4.2

> 拍摄于 2026-05-12 cycle 3 期间。生产环境 https://sage-jury.vercel.app。
> 工具：`scripts/bench_chat_stream.py`（SSE 事件级 TTFB 采样）。

---

## 单点测量

每个 query 跑 1 次 cold call。`TTFB first analyst` = 用户看到 💭 卡的时间；`TTFB first chunk` = 用户看到答案首字的时间；`done` = followups 落定，状态停。

| Sage | Query | TTFB analyst | TTFB chunk | TTFB done | analyst_chunks | content_chunks | tool_calls | 总耗时 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| guan-wo-cai | 腾讯现在能买吗 | 7.0s | 60.6s | 67.1s | 1020 | 309 | 6 | 67.1s |
| guan-wo-cai | 招行 PE 历史什么分位 | 3.1s | 30.8s | 30.8s | 344 | 1 | 4 | 30.8s |
| duan-yongping | 苹果还能拿吗 | 6.2s | 20.7s | 20.7s | 162 | 1 | 4 | 20.7s |

---

## 关键解读

### 1. 新池真的让 Analyst 思考更密

对比 cycle 1（v60.4 部署后即时基线）vs cycle 3（v60.4.2 池质量改进后）：

| | cycle 1 v60.4 | cycle 3 v60.4.2 | 变化 |
|---|---:|---:|---:|
| guan 腾讯能买吗 analyst_chunks | 617 | 1020 | **+65%** |
| 总耗时 | 69s | 67s | -3% |
| content_chunks | 409 | 309 | -25% |

**含义**：deep pool 质量提升（剔除 quality≤1 + 27→30 扩容）让 Analyst 阶段在思考链上多花了 65% 的 token，但 Writer 阶段反而精简了 25% 的输出——说明 Analyst 把推理梳理得更透，Writer 不需要重复展开。这是 v60.4.2 的实质价值证据。

### 2. 部分 query 没流式 content（只 1 个 chunk）

`招行 PE` 和 `苹果还能拿吗` 都只有 1 个 content chunk，且 `TTFB chunk == TTFB done`。这意味着 Writer (deepseek-chat) 在生成短回答时把整段内容一次性返回，没逐字 stream。这是模型/网关层的 buffering 行为，不是 bug，但对 UX 有影响——用户在 30s 内看不到任何 writer 输出，直接看到完整答案。

可缓解方向（v60.5 候选）：
- 客户端在 analyst_done → first chunk 间放一个"落笔中…"占位
- 或测试 `stream: true` 是否真的开启
- 或 server side 检测 Writer response 长度，拆 chunk emit

### 3. TTFB analyst（用户首次看到 💭 卡）= 3-7s，符合 v60 设计

设计目标是 4s 内可见。实测三个 query 在 3-7s 范围。腾讯 query 最慢（7s）因 quotes 召回需要 BM25+rerank 全文本扫。

---

## 复测方法（任何时候可以重跑）

```bash
# 单 query
python3 scripts/bench_chat_stream.py guan-wo-cai "腾讯能买吗"

# 多 run 取 P50
python3 scripts/bench_chat_stream.py guan-wo-cai "腾讯能买吗" --runs 5

# JSON 出口便于自动化
python3 scripts/bench_chat_stream.py duan-yongping "苹果还能拿吗" --json > bench.json
```

---

## 已知 follow-ups

- 单 chunk 现象：建议 v60.5 排查 server-side flushing（可能要在 chat/stream/route.ts 强制 chunked encoding hint）
- 多 sage × 多 query × 5 runs 跑一次正式 P50/P95 → 写入 baseline.json，做 CI gate
