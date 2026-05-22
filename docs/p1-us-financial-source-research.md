# P1.1 美股 10 年财务源 · 探源结论（2026-05-22）

> P1 卡点：sage-jury V1.0 北极星指标要求美股段永平能跑 v62 深度分析（含 10 年 yearly[]）。
> 本文落档已实测验证的接口、字段和坑。

---

## 一、最终选定数据源

**主源：eastmoney datacenter `RPT_USF10_FN_*` 系列**
- 沿用 A 股 `RPT_F10_FINANCE_MAINFINADATA` 套路（无需 akshare 依赖，与现有 fetchFinancials 同构）。
- 域名：`datacenter.eastmoney.com/securities/api/data/v1/get`
- 鉴权：仅需 `User-Agent: Mozilla/5.0`（无需 Cookie）。

## 二、活接口清单（已实测）

| 接口 | 用途 | 状态 | 备注 |
|------|------|------|------|
| `RPT_USF10_FN_INCOME` | 利润表（按 ITEM 行存） | ✅ AAPL 12 年年报全 | 每年多行，按 `STD_ITEM_CODE` 区分字段 |
| `RPT_USF10_FN_BALANCE` | 资产负债表 | ✅ 接口活 | 需要按 ITEM_NAME 反查 |
| `RPT_USF10_FN_GMAININDICATOR` | 派生指标（A 股 MAINFINADATA 对应） | 🟡 columns=ALL 触发风控空响应；显式 columns 也空 | 待用显式 column subset 试 |
| `RPT_USF10_FN_CASHFLOW` 等候选 | 现金流 | ❌ 6 个候选名全 rows=0 | 暂留空，opCashflowPS=null |

## 三、SECUCODE 映射规则

- NASDAQ：`AAPL.O` / `NVDA.O` / `PDD.O` / `NTES.O`
- NYSE：`.N` 后缀（待用 JPM/WMT 验证）
- secid 已在 stock_tools.ts:64 处理：`105.${code}`（即 NASDAQ；NYSE 待补 `106.`）

## 四、年报过滤参数

```
filter=(SECUCODE='AAPL.O')(REPORT_TYPE='年报')
sortColumns=REPORT_DATE
sortTypes=-1
pageSize=15
```

**坑**：
- `FISCAL_YEAR='9-25'` 过滤返回空（格式不明）。
- `REPORT_DATE='2025-09-27'` 过滤也返回空（要带时间？待试）。
- 加 `columns=ALL` 易触发风控空响应；用具体 column 列表更稳。

## 五、已验证字段（STD_ITEM_CODE 字典片段）

| code | ITEM_NAME | 数据示例（AAPL） |
|------|-----------|----------------|
| `004001001` | 主营收入 | 2025=$416.16B, 2014=$182.79B（12 年完整） |

其余字段（净利/毛利/股东权益/总资产/总负债）待 buildDossier 实施时按 ITEM_NAME 模糊匹配反查或扩字典。

## 六、苹果 12 年营收实测（已跑通）

| 财年 | 营收（USD） |
|------|------------|
| 2025 | $416.16B |
| 2024 | $391.04B |
| 2023 | $383.29B |
| 2022 | $394.33B |
| 2021 | $365.82B |
| 2020 | $274.52B |
| 2019 | $260.17B |
| 2018 | $265.60B |
| 2017 | $229.23B |
| 2016 | $215.64B |
| 2015 | $233.72B |
| 2014 | $182.80B |

营收 CAGR(11Y) = 7.7%，符合段永平模型「稳健增长」判定。

## 七、buildDossier US 分支实施策略

**MVP 思路**（管道优先，字段渐进）：
1. **Step 1（MVP）**：fetchUSFinancials 走 `STD_ITEM_CODE='004001001'` 拿 10 年营收 → YearlyFin 只填 `revenue`，其余 null。
2. **Step 2（补字段）**：探明净利 / 毛利 / 股东权益的 STD_ITEM_CODE → 拉对应 ITEM。
3. **Step 3（自算 ROE）**：ROE = parent_netprofit / avg(equity[t], equity[t-1])。
4. **Step 4（fallback）**：现金流接口确实不存在 → opCashflowPS 永久 null，analysis.ts:73 已经处理「null」case。

**所需代码改动**：
- `lib/sage/v62/research.ts`：新增 `fetchUSFinancials(secucode)`，扩 buildDossier 走 US 分支。
- `app/api/chat/v2/stream/route.ts:364`：`useV62 = stock.market === 'A' && sage_id === 'duan-yongping'`
  → `useV62 = ['A','US'].includes(stock.market) && sage_id === 'duan-yongping'`
- `lib/sage/v62/analysis.ts`：无需大改（depth==="full" + yearly.length >= 2 即可走完整路径）。

## 八、与 HANDOFF-v1.0 对齐

完全对齐 KR1「第一刀」：✅ 探明 US 10 年财务源 → 接下来 buildDossier 重构 → 苹果端到端跑通。
