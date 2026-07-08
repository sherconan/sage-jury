// lib/sage/v62/analysis-generic.ts
// v63 通用分析层 —— 让 registry 里任何一位大佬都能产出和段永平/管哥同规格的结构化判决。
//
// 思路：从 10 年真实财务档案算出一组「通用因子」（质地/成长/估值/财务安全/股息/护城河），
// 再把每位大佬自己的 dimensions（registry 里定义，带 label/weight/description）映射到对应因子，
// 按该大佬的权重加权出 preliminarySignal + headline。
// 这样卡片里展示的是「这位大佬自己的框架」，但每条结论都有真实数据支撑——不是套话。
//
// 段永平 / 管哥仍走各自手写的 analyzeDuan / analyzeGuan（更精细），本模块服务其余 8 位。

import type { ResearchDossier } from "./research";
import type { DuanAnalysis, DuanFinding } from "./analysis";
import type { Sage } from "../../../data/sages";

type Sig = DuanFinding["signal"]; // "strong" | "ok" | "weak" | "unknown"
type FactorKey = "quality" | "growth" | "valuation" | "safety" | "dividend" | "moat" | "qualitative";
interface Factor { signal: Sig; note: string; }

const pct = (n: number | null | undefined, d = 1) => (n == null ? "?" : n.toFixed(d) + "%");
const fix = (n: number | null | undefined, d = 1) => (n == null ? "?" : n.toFixed(d));

// 每位大佬的 dimension.key → 通用因子。覆盖当前 10 位 roster 的全部维度键。
// 财务数据覆盖不到的定性维度（管理层/能力圈/情绪/催化剂/纪律）→ qualitative（诚实标"需定性判断"）。
const KEY_TO_FACTOR: Record<string, FactorKey> = {
  // 段永平
  businessModel: "quality", moat: "moat", management: "qualitative", circle: "qualitative", price: "valuation",
  // 管我财
  valuationLevel: "valuation", landmine: "safety", dividendSafety: "dividend", businessSteady: "quality", islandTest: "safety",
  // 冯柳
  expectationGap: "valuation", downsideProtection: "safety", businessQuality: "quality", catalystVisible: "qualitative", marketSentiment: "qualitative",
  // 但斌
  longevity: "moat", brandPower: "quality", compoundingEngine: "growth", managementVision: "qualitative", patience: "qualitative",
  // 老唐
  earningPredictability: "quality", fairValueDiscount: "valuation", moatStable: "moat", mgmtTrust: "qualitative", biasMargin: "qualitative",
  // 林园
  monopoly: "moat", addiction: "quality", repeatedConsumption: "quality", growthCertainty: "growth", valuation: "valuation",
  // 张坤
  fcfQuality: "quality", roic: "quality", industryStability: "moat", competitiveDurability: "moat", concentration: "qualitative",
  // 邱国鹭
  industryGood: "moat", companyGood: "quality", priceGood: "valuation", marginOfSafety: "valuation", noObviousFlaw: "safety",
  // 巴菲特
  economicMoat: "moat", circleOfCompetence: "qualitative", managementIntegrity: "qualitative", intrinsicValue: "valuation", longTermHolding: "moat",
  // 李录
  businessDurability: "moat", compoundingWindow: "growth",
};

function computeFactors(d: ResearchDossier): Record<FactorKey, Factor> {
  const y = d.yearly || [];
  const y0: any = y[0] || {};
  const roeAvg = d.roeAvg5 ?? null;
  const gm = y0.grossMargin ?? null;
  const g5 = d.revenueCAGR5 ?? null;
  const np5 = d.netProfitCAGR5 ?? null;
  const pe = d.peTTM ?? null;
  const ey = d.earningsYield ?? (pe != null && pe > 0 ? 100 / pe : null);
  const debt = y0.debtRatio ?? null;
  const ocf = y0.opCashflowPS ?? null;
  const dy = d.dividendYieldPct ?? null;

  // 质地：ROE + 毛利率
  const qN: string[] = [];
  if (roeAvg != null) qN.push(`近5年ROE均值 ${pct(roeAvg)}`);
  if (gm != null) qN.push(`毛利率 ${pct(gm)}`);
  let qSig: Sig = "ok";
  if (roeAvg != null && gm != null) { if (roeAvg > 15 && gm > 30) qSig = "strong"; else if (roeAvg < 8) qSig = "weak"; }
  else if (roeAvg == null && gm == null) qSig = "unknown";
  const quality: Factor = { signal: qSig, note: qN.join(" · ") || "缺质地数据" };

  // 成长：营收/净利复合增速
  const grN: string[] = [];
  if (g5 != null) grN.push(`营收5年CAGR ${pct(g5)}`);
  if (np5 != null) grN.push(`净利5年CAGR ${pct(np5)}`);
  let grSig: Sig = "ok";
  if (g5 != null) { if (g5 > 15) grSig = "strong"; else if (g5 < 0) grSig = "weak"; } else grSig = "unknown";
  const growth: Factor = { signal: grSig, note: grN.join(" · ") || "缺成长数据" };

  // 估值：PE / EY / PB
  const vN: string[] = [];
  if (pe != null) { vN.push(`PE-TTM ${fix(pe)}`); if (ey != null) vN.push(`EY ${pct(ey)}`); }
  if (d.pbMRQ != null) vN.push(`PB ${fix(d.pbMRQ, 2)}`);
  let vSig: Sig = "ok";
  if (pe != null) { if (pe > 0 && pe < 20) vSig = "strong"; else if (pe > 40 || pe < 0) vSig = "weak"; } else vSig = "unknown";
  const valuation: Factor = { signal: vSig, note: vN.join(" · ") || "缺估值数据" };

  // 财务安全：负债率 + 经营现金流
  const sN: string[] = [];
  if (debt != null) sN.push(`资产负债率 ${pct(debt)}`);
  if (ocf != null) sN.push(`每股经营现金流 ${fix(ocf)}元`);
  let sSig: Sig = "ok";
  if (debt != null && ocf != null) { if (debt < 45 && ocf > 0) sSig = "strong"; else if (debt > 65 || ocf < 0) sSig = "weak"; }
  else if (debt == null && ocf == null) sSig = "unknown";
  const safety: Factor = { signal: sSig, note: sN.join(" · ") || "缺财务安全数据" };

  // 股息
  let dSig: Sig; let dNote: string;
  if (dy == null) { dSig = "unknown"; dNote = "股息数据未取到"; }
  else { dNote = `股息率 ${pct(dy, 2)}`; dSig = dy >= 4 ? "strong" : dy >= 2 ? "ok" : "weak"; }
  const dividend: Factor = { signal: dSig, note: dNote };

  // 护城河（代理）：高且稳的 ROE + 高毛利 + 非强周期
  const roes = y.slice(0, 5).map((r) => r.roe).filter((r): r is number => r != null);
  const yoys = y.map((r) => r.revenueYoY).filter((v): v is number => v != null);
  const mN: string[] = [];
  let roeSpread: number | null = null;
  if (roes.length >= 3) { roeSpread = Math.max(...roes) - Math.min(...roes); mN.push(`近${roes.length}年ROE波动 ${pct(roeSpread)}`); }
  if (gm != null) mN.push(`毛利率 ${pct(gm)}`);
  const cyclical = yoys.length >= 4 && (yoys.filter((v) => v < 0).length >= 3 || (Math.max(...yoys) - Math.min(...yoys)) > 100);
  const stableHighRoe = roeAvg != null && roeAvg > 15 && roeSpread != null && roeSpread < 12;
  let mSig: Sig = "ok";
  if (stableHighRoe && (gm ?? 0) > 30 && !cyclical) mSig = "strong";
  else if (cyclical || (roeAvg != null && roeAvg < 8)) mSig = "weak";
  if (roes.length < 3 && gm == null) mSig = "unknown";
  const moat: Factor = { signal: mSig, note: (cyclical ? "营收强周期波动；" : "") + (mN.join(" · ") || "缺护城河代理数据") };

  const qualitative: Factor = { signal: "unknown", note: "财务数据无法覆盖，需结合定性判断（管理层/品牌/能力圈/情绪等）" };

  return { quality, growth, valuation, safety, dividend, moat, qualitative };
}

const SIG_SCORE: Record<Sig, number> = { strong: 1, ok: 0.62, weak: 0.12, unknown: 0.5 };

export function analyzeGeneric(d: ResearchDossier, sage: Sage): DuanAnalysis {
  const gaps: string[] = [];
  if (d.depth === "thin") gaps.push("非 A 股，仅有实时行情/有限财务——分析深度受限");
  if (d.yearly.length < 5) gaps.push(`仅 ${d.yearly.length} 年财务数据`);
  if (d.peTTM == null) gaps.push("无估值数据");

  const factors = computeFactors(d);

  const findings: DuanFinding[] = sage.dimensions.map((dim) => {
    const fk = KEY_TO_FACTOR[dim.key] || "quality";
    const f = factors[fk];
    const points = [f.note];
    if (dim.description) points.push(`（${sage.name}看重：${dim.description}）`);
    return { dimension: dim.label, signal: f.signal, points };
  });

  let score = 0, wsum = 0;
  for (const dim of sage.dimensions) {
    const fk = KEY_TO_FACTOR[dim.key] || "quality";
    score += SIG_SCORE[factors[fk].signal] * dim.weight;
    wsum += dim.weight;
  }
  score = wsum > 0 ? score / wsum : 0.5;

  const val = factors.valuation.signal;
  const qual = factors.quality.signal;
  const moatSig = factors.moat.signal;
  const short = sage.name;
  let sig: DuanAnalysis["preliminarySignal"];
  let headline: string;

  if (d.depth === "thin" && d.yearly.length < 3) {
    sig = "too_hard";
    headline = `数据不足，按${short}的原则——看不清的不下注`;
  } else if (moatSig === "weak" && (sage.school === "value" || sage.school === "consumer" || sage.school === "moat")) {
    sig = "pass";
    headline = `生意质地/周期性不过关，${short}框架下不碰`;
  } else if (score >= 0.78 && val !== "weak") {
    sig = "buy";
    headline = `质地与估值都过关，${short}框架下值得下手`;
  } else if (score >= 0.6) {
    sig = "watch";
    headline = val === "weak"
      ? `生意不错但价格不便宜——${short}会等更合理的价`
      : `基本面尚可，${short}建议再观察或等更明确的确认`;
  } else if (qual === "weak") {
    sig = "pass";
    headline = `生意本身不够好，再便宜${short}也不碰`;
  } else {
    sig = "watch";
    headline = `中等水平，${short}需要更便宜的价或更多确认`;
  }

  const km: string[] = [];
  if (d.peTTM != null) km.push(`PE ${fix(d.peTTM)}｜EY ${pct(d.earningsYield ?? (d.peTTM > 0 ? 100 / d.peTTM : null))}`);
  if (d.revenueCAGR5 != null) km.push(`营收5年CAGR ${pct(d.revenueCAGR5)}`);
  if (d.roeAvg5 != null) km.push(`ROE5年均 ${pct(d.roeAvg5)}`);
  if (d.yearly[0]?.grossMargin != null) km.push(`毛利率 ${pct(d.yearly[0].grossMargin)}`);
  if (d.dividendYieldPct != null) km.push(`股息率 ${pct(d.dividendYieldPct, 2)}`);
  if (d.yearly[0]?.debtRatio != null) km.push(`负债率 ${pct(d.yearly[0].debtRatio)}`);

  return { preliminarySignal: sig, headline, findings, keyMetrics: km, dataGaps: gaps };
}

// ============ registry → Phase 3 LLM persona（无手写 SKILL.md 的大佬用这个）============
const SCHOOL_LABEL: Record<Sage["school"], string> = {
  value: "价值", reverse: "逆向", growth: "成长", moat: "护城河", concentration: "集中持有", consumer: "消费",
};

export function buildSagePersona(sage: Sage): string {
  const dims = sage.dimensions
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((d) => `- ${d.label}（${(d.weight * 100).toFixed(0)}%）：${d.description}`)
    .join("\n");
  const reds = sage.redFlags
    .map((r) => `- ${r.label}：${r.trigger}（${r.severity === "veto" ? "一票否决" : r.severity === "major" ? "重大警示" : "提示"}）`)
    .join("\n");
  const bonus = sage.bonus.map((b) => `- ${b}`).join("\n");
  const quotes = sage.quotes.map((q) => `「${q}」`).join("\n");
  const warns = (sage.misuseWarnings || []).map((w) => `- ${w}`).join("\n");

  return `你是${sage.name}（${sage.title}），活跃于 ${sage.era}，知名${SCHOOL_LABEL[sage.school]}派投资人。

# 你的投资哲学
${sage.philosophy}
一句话信条：${sage.coreLine}

# 你的分析框架（按你心里的权重排序）
${dims}

# 你绝不碰的红线
${reds}

# 你看重的加分项
${bonus}

# 你的口头禅 / 语气样本（学语气和判断方式，别照抄具体观点和股价）
${quotes}

# 你的方法论边界（诚实告诉用户你不擅长什么，不要硬答）
${warns || "- （无）"}

代表性操作：${sage.representativeTrades.join("；")}。
出处：${sage.bookOrSource}。`;
}
