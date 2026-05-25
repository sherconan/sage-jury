// lib/sage/v62/analysis-guan.ts
// v62 Layer 2 分析层 ——「管我财」（香港价值投资派低估逆向定量代表）的 5 维度真分析。
//
// 5 维度（按管哥本人风格命名）：
//   1. 分位（right price）：PE/PB/EY 当前位置 + 与无风险利率对比
//   2. 排雷（landmine）：财务雷点扫描 — 排雷胜选股是管哥核心原则
//   3. 股息（dividend）：股息率 + 派息持续性 — 「下行没保护就不投」
//   4. 稳态（stability）：ROE 与营收净利波动 — 稳态生意才能定量估值
//   5. 荒岛（island）：「假设断网 10 年生意还在不在」 — 商业模式生命力
//
// 与 analyzeDuan 不同：管哥更看下行保护（股息+排雷），段永平更看上行（生意本质）。

import type { ResearchDossier } from "./research";

export interface GuanFinding {
  dimension: string;
  signal: "strong" | "ok" | "weak" | "unknown";
  points: string[];
}

export interface GuanAnalysis {
  preliminarySignal: "buy" | "watch" | "pass" | "too_hard";
  headline: string;
  findings: GuanFinding[];
  keyMetrics: string[];
  dataGaps: string[];
}

const pct = (n: number | null | undefined, d = 1) => (n == null ? "?" : n.toFixed(d) + "%");
const fix = (n: number | null | undefined, d = 1) => (n == null ? "?" : n.toFixed(d));

// 无风险利率基准（管哥常用对比 EY）
const RISK_FREE: Record<"A" | "HK" | "US", number> = { A: 2.5, HK: 4.5, US: 4.3 };

// 维度 1: 分位（right price）
function analyzePosition(d: ResearchDossier): GuanFinding {
  const pts: string[] = [];
  const pe = d.peTTM;
  const pb = d.pbMRQ;
  const ey = d.earningsYield ?? (pe && pe > 0 ? 100 / pe : null);
  const rf = RISK_FREE[d.ticker.market];

  if (pe != null) {
    pts.push(`PE-TTM ${fix(pe)} 倍${pe < 8 ? "（深度低估区）" : pe < 15 ? "（便宜，管哥的舒服区）" : pe < 25 ? "（中性偏贵）" : pe < 40 ? "（贵）" : "（极贵）"}`);
  }
  if (ey != null) {
    const spread = ey - rf;
    pts.push(`盈利收益率 EY ${pct(ey)} vs ${d.ticker.market} 10Y 国债 ${pct(rf)} = 利差 ${pct(spread)}${spread > 4 ? "（息差厚，有安全垫）" : spread > 1 ? "（息差薄，凑合）" : spread > -1 ? "（追平国债，无超额）" : "（负息差，吃亏了）"}`);
  }
  if (pb != null) {
    pts.push(`PB ${fix(pb, 2)}${pb < 1 ? "（破净！下行有底）" : pb < 2 ? "（便宜）" : pb < 5 ? "（中等）" : "（PB 高 = 估值贵）"}`);
  }

  let sig: GuanFinding["signal"] = "ok";
  if ((pe ?? 100) < 15 && (pb ?? 100) < 2 && ey != null && ey - rf > 3) sig = "strong";
  else if ((pe ?? 0) > 40 || (ey != null && ey - rf < -1)) sig = "weak";
  if (pe == null && pb == null) sig = "unknown";
  return { dimension: "分位（现在贵不贵）", signal: sig, points: pts };
}

// 维度 2: 排雷（landmine）—— 权重最高，一票否决
function analyzeLandmine(d: ResearchDossier): GuanFinding {
  const pts: string[] = [];
  const red: string[] = [];
  const yrs = d.yearly;

  if (yrs.length === 0) {
    return { dimension: "排雷（看有没有坑）", signal: "unknown", points: ["无多年财务数据 — 排不了雷，管哥的原则：看不清的不下注"] };
  }

  // 雷 1: 净利亏损
  const npLatest = yrs[0]?.netProfit;
  if (npLatest != null && npLatest < 0) red.push(`最新年度净利亏损 ${fix(npLatest)}亿`);

  // 雷 2: ROE 长期偏低
  const roes = yrs.slice(0, 5).map(y => y.roe).filter((r): r is number => r != null);
  if (roes.length >= 3 && roes.every(r => r < 5)) red.push(`近 ${roes.length} 年 ROE 连续 <5%，资本回报差`);

  // 雷 3: 营收多年负增长
  const yoys = yrs.map(y => y.revenueYoY).filter((v): v is number => v != null);
  const negYears = yoys.filter(v => v < 0).length;
  if (yoys.length >= 4 && negYears >= 3) red.push(`近 ${yoys.length} 年 ${negYears} 年营收负增长，业务收缩`);

  // 雷 4: 毛利率持续下滑
  const gms = yrs.map(y => y.grossMargin).filter((v): v is number => v != null);
  if (gms.length >= 3 && gms[0] != null && gms[2] != null && gms[0] - gms[2] < -8) {
    red.push(`毛利率 3 年从 ${pct(gms[2])} 跌到 ${pct(gms[0])}，定价权丢失`);
  }

  // 雷 5: 港股低股息高 PE（管哥经典）
  const dy = d.dividendYieldPct;
  if (d.ticker.market === "HK" && dy != null && dy < 0.5 && (d.peTTM ?? 0) > 25) {
    red.push(`港股 PE>${d.peTTM?.toFixed(0)} 但股息率 ${pct(dy)} <0.5%，下行无保护`);
  }

  // 雷 6: PE 极端高
  if (d.peTTM != null && d.peTTM > 80) red.push(`PE ${fix(d.peTTM)} > 80，估值脱离基本面`);

  if (red.length === 0) {
    pts.push("近年财务无明显雷点：净利为正、ROE 不低、营收未明显萎缩、毛利稳定");
    return { dimension: "排雷（看有没有坑）", signal: "strong", points: pts };
  }
  red.forEach(r => pts.push(`⚠️ ${r}`));
  return { dimension: "排雷（看有没有坑）", signal: red.length >= 2 ? "weak" : "ok", points: pts };
}

// 维度 3: 股息（dividend）
function analyzeDividend(d: ResearchDossier): GuanFinding {
  const dy = d.dividendYieldPct;
  if (dy == null) return { dimension: "股息（下行有没有保护）", signal: "unknown", points: ["拿不到股息率数据"] };

  const pts: string[] = [`股息率 ${pct(dy, 2)}${dy >= 5 ? "（≥5%，下行保护到位，管哥很喜欢）" : dy >= 3 ? "（3-5%，过得去）" : dy >= 1 ? "（1-3%，弱）" : "（<1%，几乎无股息，下行没保护）"}`];

  // 与无风险利率对比
  const rf = RISK_FREE[d.ticker.market];
  if (dy > 0) {
    const ratio = dy / rf;
    pts.push(`股息 ${pct(dy)} ${dy >= rf ? "≥" : "<"} 10Y 国债 ${pct(rf)} ${ratio < 0.3 ? "（拿股票当债劵亏太多）" : ratio < 0.6 ? "（追不上无风险）" : ratio < 1 ? "（接近国债）" : "（超过国债，纯股息逻辑成立）"}`);
  }

  let sig: GuanFinding["signal"] = "ok";
  if (dy >= 5) sig = "strong";
  else if (dy < 1) sig = "weak";
  return { dimension: "股息（下行有没有保护）", signal: sig, points: pts };
}

// 维度 4: 稳态（stability）
function analyzeStability(d: ResearchDossier): GuanFinding {
  const pts: string[] = [];
  const yrs = d.yearly;
  if (yrs.length < 3) return { dimension: "稳态（生意稳不稳）", signal: "unknown", points: ["财务数据不足，难判稳态"] };

  // ROE 波动
  const roes = yrs.slice(0, 5).map(y => y.roe).filter((r): r is number => r != null);
  if (roes.length >= 3) {
    const spread = Math.max(...roes) - Math.min(...roes);
    const avg = roes.reduce((a, b) => a + b, 0) / roes.length;
    pts.push(`近 ${roes.length} 年 ROE 均值 ${pct(avg)}，波幅 ${pct(spread)}${spread < 8 ? "（稳态可定量）" : spread < 20 ? "（中度波动）" : "（大幅波动 — 不能用过去推未来）"}`);
  }

  // 营收 YoY 波动
  const yoys = yrs.map(y => y.revenueYoY).filter((v): v is number => v != null);
  if (yoys.length >= 4) {
    const swing = Math.max(...yoys) - Math.min(...yoys);
    const neg = yoys.filter(v => v < 0).length;
    pts.push(`近 ${yoys.length} 年营收增速波幅 ${pct(swing)}，${neg} 年负增长${swing < 30 && neg === 0 ? "（稳态生意）" : swing > 80 ? "（强周期，定量估值要打折）" : "（一般波动）"}`);
  }

  let sig: GuanFinding["signal"] = "ok";
  const roeAvg = d.roeAvg5;
  if (roeAvg != null && roeAvg > 12 && yoys.filter(v => v < 0).length <= 1) sig = "strong";
  else if (roeAvg != null && roeAvg < 5) sig = "weak";
  return { dimension: "稳态（生意稳不稳）", signal: sig, points: pts };
}

// 维度 5: 荒岛（island）—— 假设断网 10 年生意还在不在
function analyzeIsland(d: ResearchDossier): GuanFinding {
  const pts: string[] = [];
  const yrs = d.yearly;
  if (yrs.length < 3) return { dimension: "荒岛（10 年后还在不在）", signal: "unknown", points: ["数据不足以做长周期判断"] };

  // 营收持续性
  const cagr5 = d.revenueCAGR5;
  if (cagr5 != null) {
    pts.push(`近 5 年营收复合 ${pct(cagr5)}${cagr5 > 8 ? "（生意在长）" : cagr5 > 0 ? "（生意没死）" : "（生意在缩，10 年后存疑）"}`);
  }

  // 毛利率持续性
  const gms = yrs.map(y => y.grossMargin).filter((v): v is number => v != null);
  if (gms.length >= 3) {
    const trend = d.grossMarginTrend;
    pts.push(`毛利率 ${pct(gms[0])} ${trend === "rising" ? "走高（护城河变宽）" : trend === "falling" ? "走低（护城河变窄 — 10 年后可能更薄）" : "稳定（生意特性不变）"}`);
  }

  // ROE 持续性
  const roes = yrs.slice(0, 5).map(y => y.roe).filter((r): r is number => r != null);
  if (roes.length >= 3) {
    const allOk = roes.every(r => r > 8);
    pts.push(`5 年 ROE${allOk ? "持续 > 8% — 资本回报体系扎实，10 年范围大概率延续" : "起伏明显 — 10 年是否延续不确定"}`);
  }

  let sig: GuanFinding["signal"] = "ok";
  const allHighRoe = roes.length >= 3 && roes.every(r => r > 12);
  const stableGm = d.grossMarginTrend !== "falling";
  if ((cagr5 ?? -1) > 5 && allHighRoe && stableGm) sig = "strong";
  else if ((cagr5 ?? 0) < 0 || d.grossMarginTrend === "falling") sig = "weak";
  return { dimension: "荒岛（10 年后还在不在）", signal: sig, points: pts };
}

export function analyzeGuan(d: ResearchDossier): GuanAnalysis {
  const gaps: string[] = [];
  if (d.depth === "thin") gaps.push("仅有当期估值，无多年财务 — 管哥的定量估值玩不起来");
  if (d.peTTM == null) gaps.push("无 PE — 分位判断受限");
  if (d.dividendYieldPct == null) gaps.push("无股息率 — 股息维度跳过");

  const position = analyzePosition(d);
  const landmine = analyzeLandmine(d);
  const dividend = analyzeDividend(d);
  const stability = analyzeStability(d);
  const island = analyzeIsland(d);
  const findings = [position, landmine, dividend, stability, island];

  // 管哥决策逻辑：排雷一票否决
  let sig: GuanAnalysis["preliminarySignal"];
  let headline: string;
  if (d.depth === "thin") {
    sig = "too_hard";
    headline = "数据不足，管哥的原则——拿不到 10 年财务的票根本不看";
  } else if (landmine.signal === "weak") {
    sig = "pass";
    headline = "踩雷，再便宜也不要 — 管哥的『排雷胜选股』";
  } else if (position.signal === "strong" && dividend.signal === "strong" && stability.signal !== "weak") {
    sig = "buy";
    headline = "便宜 + 高股息 + 稳态 — 管哥的低估逆向典型对象";
  } else if (position.signal === "strong" && stability.signal !== "weak") {
    sig = "buy";
    headline = "估值在便宜区且生意稳态，可以买入并等股息";
  } else if (position.signal === "weak") {
    sig = "pass";
    headline = "贵就是贵，管哥从不为成长付溢价";
  } else if (dividend.signal === "weak" && position.signal !== "strong") {
    sig = "watch";
    headline = "无股息保护 + 估值不够便宜 — 看戏不下注";
  } else {
    sig = "watch";
    headline = "中性 — 等更便宜或更高股息";
  }

  const km: string[] = [];
  if (d.peTTM != null) km.push(`PE ${fix(d.peTTM)}｜EY ${pct(d.earningsYield ?? 100 / d.peTTM)}`);
  if (d.pbMRQ != null) km.push(`PB ${fix(d.pbMRQ, 2)}`);
  if (d.dividendYieldPct != null) km.push(`股息率 ${pct(d.dividendYieldPct, 2)}`);
  if (d.roeAvg5 != null) km.push(`ROE5年均 ${pct(d.roeAvg5)}`);
  if (d.revenueCAGR5 != null) km.push(`营收5年CAGR ${pct(d.revenueCAGR5)}`);

  return { preliminarySignal: sig, headline, findings, keyMetrics: km, dataGaps: gaps };
}

// 格式化成给 Phase 3 LLM 的分析素材文本（管哥版）
export function formatAnalysisGuan(a: GuanAnalysis): string {
  const lines: string[] = [];
  lines.push(`管哥初步判断：${a.preliminarySignal} —— ${a.headline}`);
  if (a.keyMetrics.length) lines.push(`关键数字：${a.keyMetrics.join(" ｜ ")}`);
  lines.push("");
  lines.push("5 维度发现（基于多年真实财务数据算出，你用粤语→普通话的口吻写最终答案）：");
  for (const f of a.findings) {
    lines.push(`【${f.dimension}·${f.signal}】`);
    for (const p of f.points) lines.push(`  - ${p}`);
  }
  if (a.dataGaps.length) lines.push(`\n数据缺口（如实告诉用户，别编）：${a.dataGaps.join("；")}`);
  return lines.join("\n");
}
