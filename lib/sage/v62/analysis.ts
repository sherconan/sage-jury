// lib/sage/v62/analysis.ts
// v62 Layer 2 分析层 —— 用段永平的投资框架，对研究档案做实质分析。
//
// 不是 if-else 打分：每个维度基于「多年真实财务数据」算出趋势/波动/持续性，
// 产出「有数据支撑的发现句」。灵感：ai-hedge-fund 的 analyze_* 函数
// （输出带判断的 details 文字给 LLM，而非纯 score）。

import type { ResearchDossier } from "./research";

export interface DuanFinding {
  dimension: string;
  signal: "strong" | "ok" | "weak" | "unknown";
  points: string[]; // 基于真实数据的发现句
}
export interface DuanAnalysis {
  preliminarySignal: "buy" | "watch" | "pass" | "too_hard";
  headline: string;
  findings: DuanFinding[];
  keyMetrics: string[];
  dataGaps: string[];
}

const pct = (n: number | null | undefined, d = 1) => (n == null ? "?" : n.toFixed(d) + "%");
const fix = (n: number | null | undefined, d = 1) => (n == null ? "?" : n.toFixed(d));

// 维度 1：right business —— 生意本质
function analyzeBusiness(d: ResearchDossier): DuanFinding {
  const pts: string[] = [];
  const yrs = d.yearly;
  if (yrs.length < 3) return { dimension: "生意本质", signal: "unknown", points: ["财务数据不足，无法判断生意质量"] };

  if (d.revenueCAGR5 != null) {
    const g = d.revenueCAGR5;
    pts.push(`近 5 年营收复合增速 ${pct(g)}（${g > 15 ? "高成长" : g > 5 ? "稳健增长" : g > 0 ? "低速增长" : "在萎缩"}）`);
  }
  if (d.netProfitCAGR5 != null) pts.push(`近 5 年净利复合增速 ${pct(d.netProfitCAGR5)}`);

  const gm = yrs[0].grossMargin;
  if (gm != null) {
    const trend = d.grossMarginTrend === "rising" ? "且仍在走高" : d.grossMarginTrend === "falling" ? "但在下滑" : "且保持稳定";
    pts.push(`最新毛利率 ${pct(gm)}${trend}——${gm > 40 ? "高毛利，说明有定价权" : gm > 20 ? "毛利中等" : "毛利偏低，接近大宗商品生意"}`);
  }

  const roes = yrs.slice(0, 5).map((y) => y.roe).filter((r): r is number => r != null);
  if (roes.length >= 3) {
    const allHigh = roes.every((r) => r > 15);
    const avg = roes.reduce((a, b) => a + b, 0) / roes.length;
    pts.push(`近 ${roes.length} 年 ROE 均值 ${pct(avg)}${allHigh ? "，连续高于 15%——资本回报扎实，护城河的财务证据" : roes.every((r) => r < 8) ? "，长期偏低，资本效率差" : ""}`);
  }

  let sig: DuanFinding["signal"] = "ok";
  const g5 = d.revenueCAGR5 ?? 0;
  const roeAvg = d.roeAvg5 ?? 0;
  if (roeAvg > 15 && g5 > 8 && (gm ?? 0) > 30) sig = "strong";
  else if (roeAvg < 8 || g5 < 0) sig = "weak";
  return { dimension: "生意本质", signal: sig, points: pts };
}

// 维度 2：right people —— 管理与资本配置（用财务代理）
function analyzeManagement(d: ResearchDossier): DuanFinding {
  const pts: string[] = [];
  const yrs = d.yearly;
  if (yrs.length < 3) return { dimension: "管理与资本配置", signal: "unknown", points: ["数据不足"] };

  const debt = yrs[0].debtRatio;
  if (debt != null) pts.push(`资产负债率 ${pct(debt)}——${debt < 40 ? "财务保守，没靠杠杆撑业绩" : debt < 60 ? "负债适中" : "负债偏高，要警惕"}`);

  const ocfps = yrs[0].opCashflowPS;
  if (ocfps != null) pts.push(`每股经营现金流 ${fix(ocfps)} 元，${ocfps > 0 ? "经营能实打实造血" : "经营现金流为负，利润质量存疑"}`);

  const roes = yrs.slice(0, 5).map((y) => y.roe).filter((r): r is number => r != null);
  if (roes.length >= 3) {
    const spread = Math.max(...roes) - Math.min(...roes);
    pts.push(`近 ${roes.length} 年 ROE 波动幅度 ${pct(spread)}——${spread < 8 ? "经营高度稳定" : "波动较大"}`);
  }

  let sig: DuanFinding["signal"] = "ok";
  if ((debt ?? 100) < 45 && (ocfps ?? -1) > 0) sig = "strong";
  else if ((debt ?? 0) > 65 || (ocfps ?? 1) < 0) sig = "weak";
  return { dimension: "管理与资本配置", signal: sig, points: pts };
}

// 维度 3：right price —— 估值
function analyzePrice(d: ResearchDossier): DuanFinding {
  if (d.peTTM == null) return { dimension: "现在的价", signal: "unknown", points: ["拿不到 PE 数据"] };
  const pe = d.peTTM;
  const ey = d.earningsYield ?? 100 / pe;
  const pts: string[] = [
    `PE-TTM ${fix(pe)} 倍，盈利收益率（EY）${pct(ey)}`,
    `段永平的锚：PE 25 倍以下他才"感觉舒服"，超 40 倍算贵——当前 ${pe < 25 ? "在舒服区" : pe < 40 ? "偏高，要够好的生意才撑得起" : "明显贵"}`,
  ];
  if (d.pbMRQ != null) pts.push(`PB ${fix(d.pbMRQ, 2)}`);

  let sig: DuanFinding["signal"] = "ok";
  if (pe > 0 && pe < 25) sig = "strong";
  else if (pe > 45 || pe < 0) sig = "weak";
  return { dimension: "现在的价", signal: sig, points: pts };
}

// 维度 4：能力圈与周期
function analyzeCircleCycle(d: ResearchDossier): DuanFinding {
  const pts: string[] = [];
  const yoys = d.yearly.map((y) => y.revenueYoY).filter((v): v is number => v != null);
  let sig: DuanFinding["signal"] = "ok";
  if (yoys.length >= 4) {
    const neg = yoys.filter((v) => v < 0).length;
    const swing = Math.max(...yoys) - Math.min(...yoys);
    // v62.1: 周期判定 — 仅看 neg 年数 + 极端波幅 (>100% 才算强周期，茅台波幅 53% 不算)
    if (neg >= 3 || (neg >= 2 && swing > 100)) {
      pts.push(`营收增速多年大起大落（波幅 ${pct(swing)}，${neg} 年负增长）——典型周期生意，段永平对强周期一向回避`);
      sig = "weak";
    } else if (neg >= 1 || swing > 50) {
      pts.push(`营收增速有波动（波幅 ${pct(swing)}，${neg} 年负增长）——非强周期，但有波动`);
    } else {
      pts.push(`营收增速多年平稳（波幅 ${pct(swing)}）——稳定生意，可预测性好`);
    }
  } else {
    pts.push("数据不足以判断周期性");
  }
  return { dimension: "能力圈与周期", signal: sig, points: pts };
}

export function analyzeDuan(d: ResearchDossier): DuanAnalysis {
  const gaps: string[] = [];
  if (d.depth === "thin") gaps.push("非 A 股，仅有实时行情、无多年财务——分析深度受限");
  if (d.yearly.length < 5) gaps.push(`仅 ${d.yearly.length} 年财务数据`);
  if (d.peTTM == null) gaps.push("无估值数据");

  const business = analyzeBusiness(d);
  const mgmt = analyzeManagement(d);
  const price = analyzePrice(d);
  const cycle = analyzeCircleCycle(d);
  const findings = [business, mgmt, price, cycle];

  let sig: DuanAnalysis["preliminarySignal"];
  let headline: string;
  if (d.depth === "thin") {
    sig = "too_hard";
    headline = "数据不足，按段永平的原则——看不清的不下注";
  } else if (cycle.signal === "weak") {
    sig = "pass";
    headline = "强周期生意，段永平一向回避";
  } else if (business.signal === "strong" && price.signal === "strong") {
    sig = "buy";
    headline = "好生意 + 合理价，段永平框架下值得重注";
  } else if (business.signal === "strong" && price.signal !== "weak") {
    sig = "watch";
    headline = "好生意，但价格不够便宜——好公司也要等合理价";
  } else if (business.signal === "weak") {
    sig = "pass";
    headline = "生意本身不够好，再便宜段永平也不碰";
  } else {
    sig = "watch";
    headline = "中等生意，需要更便宜的价格或更多确认";
  }

  const km: string[] = [];
  if (d.peTTM != null) km.push(`PE ${fix(d.peTTM)}｜EY ${pct(d.earningsYield ?? 100 / d.peTTM)}`);
  if (d.revenueCAGR5 != null) km.push(`营收5年CAGR ${pct(d.revenueCAGR5)}`);
  if (d.roeAvg5 != null) km.push(`ROE5年均 ${pct(d.roeAvg5)}`);
  if (d.yearly[0]?.grossMargin != null) km.push(`毛利率 ${pct(d.yearly[0].grossMargin)}`);
  if (d.yearly[0]?.debtRatio != null) km.push(`负债率 ${pct(d.yearly[0].debtRatio)}`);

  return { preliminarySignal: sig, headline, findings, keyMetrics: km, dataGaps: gaps };
}

// 格式化成给 Phase 3 LLM 的分析素材文本
export function formatAnalysis(a: DuanAnalysis): string {
  const lines: string[] = [];
  lines.push(`初步判断：${a.preliminarySignal} —— ${a.headline}`);
  if (a.keyMetrics.length) lines.push(`关键数字：${a.keyMetrics.join(" ｜ ")}`);
  lines.push("");
  lines.push("各维度发现（基于多年真实财务数据算出，你要在此之上做最终判断和表达）：");
  for (const f of a.findings) {
    lines.push(`【${f.dimension}·${f.signal}】`);
    for (const p of f.points) lines.push(`  - ${p}`);
  }
  if (a.dataGaps.length) lines.push(`\n数据缺口（如实告诉用户，别编）：${a.dataGaps.join("；")}`);
  return lines.join("\n");
}
