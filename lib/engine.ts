// 评估引擎 — 每位大佬的评分函数 + 综合判决

import { SAGES, SAGE_BY_ID, type Sage } from "../data/sages";
import type {
  CaseInput,
  SageVerdict,
  DimensionScore,
  RedFlagHit,
  JuryReport,
  Verdict,
} from "../types";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

const def = <T>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v);

const scoreToGrade = (score: number): SageVerdict["letterGrade"] => {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
};

const scoreToVerdict = (score: number): { verdict: Verdict; label: string } => {
  if (score >= 85) return { verdict: "STRONG_BUY", label: "强烈推荐 · 拍板买入" };
  if (score >= 70) return { verdict: "BUY", label: "可买 · 仓位可加" };
  if (score >= 50) return { verdict: "HOLD", label: "观望 · 看清再说" };
  if (score >= 30) return { verdict: "AVOID", label: "不建议 · 远离" };
  return { verdict: "STRONG_AVOID", label: "强烈回避 · 别碰" };
};

const pickQuote = (sage: Sage, score: number): string => {
  const idx = score >= 75 ? 0 : score >= 50 ? 1 : score >= 30 ? 2 : sage.quotes.length - 1;
  return sage.quotes[Math.min(idx, sage.quotes.length - 1)];
};

interface ScoreContext {
  input: CaseInput;
  notes: string[];
  hits: RedFlagHit[];
  bonus: string[];
}

// =======================
// 段永平 — 价值投资派
// =======================
function scoreDuanYongping(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["duan-yongping"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  // 商业模式 (35%)
  let bm = 50;
  const reasonsBM: string[] = [];
  const fcfMargin = def(input.fcfMargin, undefined);
  if (fcfMargin !== undefined) {
    if (fcfMargin > 0.2) { bm += 25; reasonsBM.push(`FCF 利润率 ${(fcfMargin * 100).toFixed(0)}% 健康`); }
    else if (fcfMargin > 0.1) { bm += 15; reasonsBM.push("现金流尚可"); }
    else if (fcfMargin < 0) { bm -= 25; reasonsBM.push("自由现金流为负——红灯"); }
  }
  if (input.netMargin !== undefined) {
    if (input.netMargin > 0.2) bm += 10;
    else if (input.netMargin < 0.05) bm -= 10;
  }
  if (input.grossMargin !== undefined && input.grossMargin > 0.5) {
    bm += 5; reasonsBM.push(`毛利率 ${(input.grossMargin * 100).toFixed(0)}%`);
  }
  if (reasonsBM.length === 0) reasonsBM.push("基于行业平均假设打分");
  dims.push({
    key: "businessModel", label: "商业模式", weight: 0.35,
    rawScore: clamp(bm), weightedScore: clamp(bm) * 0.35,
    reason: reasonsBM.join("；"),
  });

  // 差异化/护城河 (25%)
  let moat = 50;
  const reasonsMoat: string[] = [];
  if (input.brandStrength) {
    moat += (input.brandStrength - 3) * 12;
    reasonsMoat.push(`品牌强度 ${input.brandStrength}/5`);
  }
  if (input.roe !== undefined) {
    if (input.roe > 0.2) { moat += 15; reasonsMoat.push(`ROE ${(input.roe * 100).toFixed(0)}% 显示护城河`); }
    else if (input.roe < 0.1) { moat -= 10; reasonsMoat.push("ROE 偏低"); }
  }
  if (input.monopolyLevel) moat += (input.monopolyLevel - 3) * 6;
  dims.push({
    key: "moat", label: "差异化/护城河", weight: 0.25,
    rawScore: clamp(moat), weightedScore: clamp(moat) * 0.25,
    reason: reasonsMoat.join("；") || "需要更多行业信息",
  });

  // 管理层 (15%)
  let mgmt = 50 + ((input.managementQuality || 3) - 3) * 15;
  dims.push({
    key: "management", label: "管理层与企业文化", weight: 0.15,
    rawScore: clamp(mgmt), weightedScore: clamp(mgmt) * 0.15,
    reason: input.managementQuality ? `管理层评分 ${input.managementQuality}/5` : "无明确管理层信号",
  });

  // 能力圈 (15%)
  let circle = input.inUserCircle === true ? 85 : input.inUserCircle === false ? 25 : 50;
  if (input.inUserCircle === false) {
    hits.push({
      key: "out_of_circle", label: "超出能力圈",
      severity: "veto",
      reason: "段永平最重要的原则——不懂不投。这条踩线直接一票否决。",
    });
  }
  dims.push({
    key: "circle", label: "在能力圈内", weight: 0.15,
    rawScore: circle, weightedScore: circle * 0.15,
    reason: input.inUserCircle === true ? "用户能清晰说出生意逻辑" : input.inUserCircle === false ? "用户承认看不懂" : "未明确",
  });

  // 估值 (10%)
  let priceScore = 60;
  const reasonsPrice: string[] = [];
  if (input.pe !== undefined) {
    if (input.pe < 15) { priceScore = 80; reasonsPrice.push(`PE ${input.pe} 偏低`); }
    else if (input.pe < 25) { priceScore = 70; reasonsPrice.push(`PE ${input.pe} 合理`); }
    else if (input.pe < 40) { priceScore = 50; reasonsPrice.push(`PE ${input.pe} 偏高`); }
    else if (input.pe < 100) { priceScore = 30; reasonsPrice.push(`PE ${input.pe} 高估`); }
    else { priceScore = 15; reasonsPrice.push(`PE > 100 是讲故事`); }
  }
  dims.push({
    key: "price", label: "合理估值", weight: 0.10,
    rawScore: priceScore, weightedScore: priceScore * 0.10,
    reason: reasonsPrice.join("；") || "无 PE 数据",
  });

  // 红旗
  if (input.debtToAsset !== undefined && input.debtToAsset > 0.7) {
    hits.push({ key: "leverage_buyout", label: "高杠杆扩张",
      severity: "major",
      reason: `资产负债率 ${(input.debtToAsset * 100).toFixed(0)}%——段不喜欢借钱扩张的生意。` });
  }
  if (input.pe !== undefined && input.pe > 100 && (!input.netMargin || input.netMargin < 0.05)) {
    hits.push({ key: "story_stock", label: "讲故事股",
      severity: "major",
      reason: "PE 极高且盈利稀薄——段说便宜不是买入理由，但贵 + 没赚钱更不是。" });
  }

  // 加分项
  if (input.roe !== undefined && input.roe > 0.15) bonusHits.push(`ROE 长期 > 15%（${(input.roe * 100).toFixed(0)}%）`);
  if (input.yearsListed !== undefined && input.yearsListed > 10) bonusHits.push(`上市 ${input.yearsListed} 年仍在`);
  if (input.brandStrength && input.brandStrength >= 4) bonusHits.push("用户日常使用并喜欢的产品");

  // 计算总分
  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 12;
    else final -= 4;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "好生意 + 看得懂 + 价格合理。可以下重手。";
  else if (final >= 60) oneLine = "生意还行但不够诱人，再等等价格或再看清楚一点。";
  else if (final >= 40) oneLine = "你看清楚了吗？我宁可错过也不会乱出手。";
  else oneLine = "stop doing list 上的典型——这个我不会买。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final),
    letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label,
    oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 冯柳 — 弱者体系
// =======================
function scoreFengLiu(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["feng-liu"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  // 预期差 (30%)
  let expectGap = 50;
  const reasonsEG: string[] = [];
  if (input.consensusBullish === true) {
    expectGap = 20;
    reasonsEG.push("市场已经一致看多——弱者体系最讨厌共识");
  } else if (input.consensusBullish === false) {
    expectGap = 80;
    reasonsEG.push("市场情绪低迷，预期差可能存在");
  }
  if (input.recentDrawdown !== undefined && input.recentDrawdown > 0.4) {
    expectGap += 10;
    reasonsEG.push(`近期回撤 ${(input.recentDrawdown * 100).toFixed(0)}%`);
  }
  dims.push({ key: "expectationGap", label: "预期差", weight: 0.30,
    rawScore: clamp(expectGap), weightedScore: clamp(expectGap) * 0.30,
    reason: reasonsEG.join("；") || "情绪信号未明" });

  // 下行保护 (25%)
  let downside = 50;
  const reasonsDS: string[] = [];
  if (input.pb !== undefined) {
    if (input.pb < 1.5) { downside = 80; reasonsDS.push(`PB ${input.pb}—接近账面价值`); }
    else if (input.pb < 3) { downside = 65; reasonsDS.push(`PB ${input.pb} 合理`); }
    else if (input.pb > 8) { downside = 25; reasonsDS.push(`PB ${input.pb}—下跌空间大`); }
  }
  if (input.dividendYield !== undefined && input.dividendYield > 0.04) {
    downside += 10; reasonsDS.push(`股息 ${(input.dividendYield * 100).toFixed(1)}% 提供保护`);
  }
  dims.push({ key: "downsideProtection", label: "下行保护", weight: 0.25,
    rawScore: clamp(downside), weightedScore: clamp(downside) * 0.25,
    reason: reasonsDS.join("；") || "估值/股息信息不全" });

  // 生意质量 (20%)
  let bizQ = 50;
  if (input.roe !== undefined) {
    if (input.roe > 0.15) bizQ = 75;
    else if (input.roe > 0.1) bizQ = 60;
    else if (input.roe < 0) bizQ = 20;
  }
  if (input.grossMargin !== undefined && input.grossMargin > 0.4) bizQ += 5;
  dims.push({ key: "businessQuality", label: "生意质量", weight: 0.20,
    rawScore: clamp(bizQ), weightedScore: clamp(bizQ) * 0.20,
    reason: input.roe !== undefined ? `ROE ${(input.roe * 100).toFixed(0)}%` : "盈利能力数据不全" });

  // 反转催化剂 (15%)
  let cat = input.catalystVisible === true ? 80 : input.catalystVisible === false ? 30 : 50;
  dims.push({ key: "catalystVisible", label: "反转催化剂", weight: 0.15,
    rawScore: cat, weightedScore: cat * 0.15,
    reason: input.catalystVisible === true ? "12 个月内有可见催化剂" : "催化剂不明" });

  // 情绪极致 (10%)
  let sent = 50;
  if (input.oversoldRecently === true) { sent = 80; bonusHits.push("近期超卖"); }
  if (input.consensusBullish === true) sent = 25;
  dims.push({ key: "marketSentiment", label: "情绪极致", weight: 0.10,
    rawScore: clamp(sent), weightedScore: clamp(sent) * 0.10,
    reason: input.oversoldRecently ? "近期被市场抛弃" : input.consensusBullish ? "情绪过热" : "情绪中性" });

  // 红旗
  if (input.roe !== undefined && input.roe < 0 && input.catalystVisible !== true) {
    hits.push({ key: "fundamental_collapse", label: "基本面崩塌",
      severity: "veto",
      reason: "ROE 转负且无反转催化剂——这是无底洞，不是预期差。" });
  }
  if (input.consensusBullish === true) {
    hits.push({ key: "consensus_buy", label: "共识买入",
      severity: "major",
      reason: "卖方一致看多——弱者体系明确不参与热门赛道。" });
  }
  if (input.recentDrawdown !== undefined && input.recentDrawdown > 0.7 && input.catalystVisible !== true) {
    hits.push({ key: "left_side_no_bottom", label: "左侧无底",
      severity: "major",
      reason: `回撤 > 70% 但没有催化剂信号——可能不是反转，是消亡。` });
  }

  if (input.pb !== undefined && input.pb < 2) bonusHits.push(`PB ${input.pb} 接近底部`);
  if (input.recentDrawdown !== undefined && input.recentDrawdown > 0.4 && input.recentDrawdown < 0.7) {
    bonusHits.push("跌幅可观但商业模式未变");
  }

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 10;
  });
  bonusHits.forEach(() => (final += 4));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 75) oneLine = "正是被市场抛弃的好货——弱者体系下手就在此时。";
  else if (final >= 55) oneLine = "有点意思但还不到下手时——再等情绪更悲观。";
  else if (final >= 35) oneLine = "热门或者基本面糟糕，弱者体系不参与。";
  else oneLine = "右侧 + 共识 + 高估，三连违反——这种我从来不碰。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final),
    letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 但斌 — 时间的玫瑰
// =======================
function scoreDanBin(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["dan-bin"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let lon = 50;
  const reasonsLon: string[] = [];
  if (input.yearsListed !== undefined && input.yearsListed > 20) { lon = 80; reasonsLon.push(`公司存在 ${input.yearsListed} 年`); }
  else if (input.yearsListed !== undefined && input.yearsListed > 10) { lon = 65; }
  if (input.techDisruption && input.techDisruption >= 4) {
    lon -= 25; reasonsLon.push("强技术替代风险");
    hits.push({ key: "tech_obsolescence", label: "技术替代风险",
      severity: "major",
      reason: "时间是优秀公司的朋友——但技术革命会让平庸公司死得更快。" });
  }
  dims.push({ key: "longevity", label: "生意可持续性", weight: 0.30,
    rawScore: clamp(lon), weightedScore: clamp(lon) * 0.30,
    reason: reasonsLon.join("；") || "未提供历史经营信息" });

  let brand = 50 + ((input.brandStrength || 3) - 3) * 15;
  if (input.grossMargin !== undefined && input.grossMargin > 0.6) brand += 10;
  dims.push({ key: "brandPower", label: "品牌/消费惯性", weight: 0.25,
    rawScore: clamp(brand), weightedScore: clamp(brand) * 0.25,
    reason: input.brandStrength ? `品牌 ${input.brandStrength}/5` : "品牌信号未明" });

  let comp = 50;
  if (input.roe !== undefined) {
    if (input.roe > 0.2) comp = 85;
    else if (input.roe > 0.15) comp = 70;
    else if (input.roe < 0.08) comp = 30;
  }
  if (input.dividendYield !== undefined && input.dividendYield > 0.02) comp += 5;
  dims.push({ key: "compoundingEngine", label: "复利引擎", weight: 0.20,
    rawScore: clamp(comp), weightedScore: clamp(comp) * 0.20,
    reason: input.roe !== undefined ? `ROE ${(input.roe * 100).toFixed(0)}%` : "ROE 数据缺失" });

  let mgmtVision = 50 + ((input.managementQuality || 3) - 3) * 12;
  dims.push({ key: "managementVision", label: "管理层格局", weight: 0.15,
    rawScore: clamp(mgmtVision), weightedScore: clamp(mgmtVision) * 0.15,
    reason: input.managementQuality ? `管理层 ${input.managementQuality}/5` : "管理层信息有限" });

  let pat = 50;
  if (input.intendedHoldYears !== undefined) {
    if (input.intendedHoldYears >= 10) pat = 85;
    else if (input.intendedHoldYears >= 5) pat = 65;
    else if (input.intendedHoldYears < 3) {
      pat = 25;
      hits.push({ key: "short_term_holder", label: "短期心态",
        severity: "warning",
        reason: "时间的玫瑰要时间——你打算 3 年内就走，那别用我的方法论。" });
    }
  }
  dims.push({ key: "patience", label: "投资者耐心", weight: 0.10,
    rawScore: clamp(pat), weightedScore: clamp(pat) * 0.10,
    reason: input.intendedHoldYears ? `预计持有 ${input.intendedHoldYears} 年` : "持有时间未表述" });

  if (input.regulatoryRisk && input.regulatoryRisk >= 4) {
    hits.push({ key: "regulatory_risk", label: "强监管行业",
      severity: "major",
      reason: "教育、游戏、互金这些政策敏感行业——时间未必是朋友。" });
  }

  if (input.dividendYield !== undefined && input.dividendYield > 0.03) bonusHits.push(`高分红 ${(input.dividendYield * 100).toFixed(1)}%`);
  if (input.roe !== undefined && input.roe > 0.2) bonusHits.push("持续高 ROE");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "major") final -= 10;
    else if (h.severity === "warning") final -= 4;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "可以拿 20 年的好资产——时间会回报你。";
  else if (final >= 60) oneLine = "时间也许会盛开玫瑰，但你得有耐心和定力。";
  else if (final >= 40) oneLine = "这个不是时间的朋友——拿不住。";
  else oneLine = "时间反而是它的敌人——别用我的方法论买。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final),
    letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 林园 — 嘴巴股专家
// =======================
function scoreLinYuan(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["lin-yuan"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let mono = 50 + ((input.monopolyLevel || 3) - 3) * 15;
  dims.push({ key: "monopoly", label: "垄断属性", weight: 0.30,
    rawScore: clamp(mono), weightedScore: clamp(mono) * 0.30,
    reason: input.monopolyLevel ? `垄断 ${input.monopolyLevel}/5` : "垄断地位未明" });

  let stick = 50 + ((input.consumerStickiness || 3) - 3) * 15;
  dims.push({ key: "addiction", label: "上瘾性/刚需", weight: 0.25,
    rawScore: clamp(stick), weightedScore: clamp(stick) * 0.25,
    reason: input.consumerStickiness ? `用户黏性 ${input.consumerStickiness}/5` : "黏性信号未明" });

  let rep = 50 + ((input.repeatedConsumption || 3) - 3) * 15;
  dims.push({ key: "repeatedConsumption", label: "重复消费", weight: 0.20,
    rawScore: clamp(rep), weightedScore: clamp(rep) * 0.20,
    reason: input.repeatedConsumption ? `复购 ${input.repeatedConsumption}/5` : "复购未明" });

  let growth = 50;
  if (input.netMargin !== undefined && input.netMargin > 0.2) growth = 75;
  if (input.grossMargin !== undefined && input.grossMargin > 0.6) growth += 10;
  dims.push({ key: "growthCertainty", label: "增长确定性", weight: 0.15,
    rawScore: clamp(growth), weightedScore: clamp(growth) * 0.15,
    reason: "基于盈利水平推算" });

  let val = 60;
  if (input.pe !== undefined) {
    if (input.pe < 30) val = 75;
    else if (input.pe < 50) val = 60;
    else val = 30;
  }
  dims.push({ key: "valuation", label: "估值合理", weight: 0.10,
    rawScore: val, weightedScore: val * 0.10,
    reason: input.pe ? `PE ${input.pe}` : "估值数据缺失" });

  if (input.monopolyLevel !== undefined && input.monopolyLevel <= 2) {
    hits.push({ key: "no_monopoly", label: "无垄断地位",
      severity: "major",
      reason: "我的方法论第一条是垄断——红海生意我从来不碰。" });
  }
  if (input.repeatedConsumption !== undefined && input.repeatedConsumption <= 2) {
    hits.push({ key: "low_freq_consumption", label: "低频消费",
      severity: "major",
      reason: "三年才用一次的东西，赚钱机器不够厚。" });
  }
  if (input.techDisruption && input.techDisruption >= 4) {
    hits.push({ key: "tech_dependency", label: "强技术依赖",
      severity: "warning",
      reason: "我不懂科技，所以不投——你确定要替我做这个判断？" });
  }

  if (input.grossMargin !== undefined && input.grossMargin > 0.6) bonusHits.push(`毛利率 ${(input.grossMargin * 100).toFixed(0)}%`);
  if (input.industry && /酒|药|食|饮/i.test(input.industry)) bonusHits.push("嘴巴生意类目");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "major") final -= 12;
    else if (h.severity === "warning") final -= 4;
  });
  bonusHits.forEach(() => (final += 4));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "垄断 + 上瘾 + 重复消费——三个都占，闭眼买。";
  else if (final >= 60) oneLine = "嘴巴生意属性还行，但还差点意思。";
  else if (final >= 40) oneLine = "三个都不全占，林园不出手。";
  else oneLine = "这哪是嘴巴股？这是科技股或者周期股，不投。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final),
    letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 张坤 — 集中持股
// =======================
function scoreZhangKun(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["zhang-kun"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let fcf = 50;
  const reasonsFCF: string[] = [];
  if (input.fcfMargin !== undefined) {
    if (input.fcfMargin > 0.2) fcf = 85;
    else if (input.fcfMargin > 0.1) fcf = 70;
    else if (input.fcfMargin > 0) fcf = 55;
    else { fcf = 20;
      hits.push({ key: "fcf_negative", label: "自由现金流为负",
        severity: "veto",
        reason: "FCF 是企业最诚实的指标——为负我直接出局。" });
    }
    reasonsFCF.push(`FCF/Revenue ${(input.fcfMargin * 100).toFixed(0)}%`);
  }
  dims.push({ key: "fcfQuality", label: "自由现金流质量", weight: 0.30,
    rawScore: clamp(fcf), weightedScore: clamp(fcf) * 0.30,
    reason: reasonsFCF.join("；") || "无 FCF 数据" });

  let roic = 50;
  if (input.roic !== undefined) {
    if (input.roic > 0.2) roic = 85;
    else if (input.roic > 0.15) roic = 70;
    else if (input.roic < 0.08) roic = 30;
  } else if (input.roe !== undefined) {
    if (input.roe > 0.2) roic = 75;
    else if (input.roe > 0.15) roic = 65;
    else if (input.roe < 0.08) roic = 35;
  }
  dims.push({ key: "roic", label: "投入资本回报", weight: 0.25,
    rawScore: clamp(roic), weightedScore: clamp(roic) * 0.25,
    reason: input.roic ? `ROIC ${(input.roic * 100).toFixed(0)}%` : input.roe ? `代用 ROE ${(input.roe * 100).toFixed(0)}%` : "无回报率数据" });

  let stab = 50;
  if (input.cyclical === true) stab = 30;
  else if (input.cyclical === false) stab = 75;
  if (input.regulatoryRisk && input.regulatoryRisk >= 4) stab -= 15;
  dims.push({ key: "industryStability", label: "行业稳定性", weight: 0.20,
    rawScore: clamp(stab), weightedScore: clamp(stab) * 0.20,
    reason: input.cyclical === true ? "强周期" : input.cyclical === false ? "需求稳定" : "周期性未明" });

  let durability = 50 + ((input.brandStrength || 3) - 3) * 12;
  if (input.techDisruption && input.techDisruption >= 4) durability -= 15;
  dims.push({ key: "competitiveDurability", label: "竞争优势持续", weight: 0.15,
    rawScore: clamp(durability), weightedScore: clamp(durability) * 0.15,
    reason: "基于品牌强度与技术稳定性" });

  let conc = 50;
  if (input.marketCap !== undefined && input.marketCap > 100_000_000_000) conc = 70;
  dims.push({ key: "concentration", label: "集中度匹配", weight: 0.10,
    rawScore: conc, weightedScore: conc * 0.10,
    reason: "Top 10 仓位需要流动性与确定性" });

  if (input.capexRatio !== undefined && input.capexRatio > 0.3) {
    hits.push({ key: "high_capex", label: "重资产高资本开支",
      severity: "major",
      reason: `Capex/Revenue ${(input.capexRatio * 100).toFixed(0)}%——重资产烧钱不是我的偏好。` });
  }
  if (input.cyclical === true) {
    hits.push({ key: "cyclical_extreme", label: "强周期股",
      severity: "warning",
      reason: "强周期股我尽量回避——预测不了的不投。" });
  }

  if (input.roic !== undefined && input.roic > 0.2) bonusHits.push("ROIC > 20%");
  if (input.dividendYield !== undefined && input.dividendYield > 0.02) bonusHits.push("稳定派息");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 12;
    else if (h.severity === "warning") final -= 4;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "自由现金流和资本回报都过线——可以放进 Top 10。";
  else if (final >= 60) oneLine = "现金流尚可但还不到我集中持股的标准。";
  else if (final >= 40) oneLine = "回报率不达标——少即是多，多了拖累整体。";
  else oneLine = "这种公司在我的组合里没有位置。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final),
    letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 巴菲特 — 经济护城河
// =======================
function scoreBuffett(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["buffett"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let moat = 50;
  const reasonsMoat: string[] = [];
  if (input.brandStrength) { moat += (input.brandStrength - 3) * 12; reasonsMoat.push(`品牌 ${input.brandStrength}/5`); }
  if (input.monopolyLevel) moat += (input.monopolyLevel - 3) * 6;
  if (input.roe !== undefined && input.roe > 0.2) moat += 10;
  if (input.grossMargin !== undefined && input.grossMargin > 0.5) moat += 5;
  if (moat < 35) {
    hits.push({ key: "no_moat", label: "无护城河",
      severity: "veto",
      reason: "I don't buy commodity businesses—没有护城河直接出局。" });
  }
  dims.push({ key: "economicMoat", label: "经济护城河", weight: 0.30,
    rawScore: clamp(moat), weightedScore: clamp(moat) * 0.30,
    reason: reasonsMoat.join("；") || "护城河信号不足" });

  let circle = input.inUserCircle === true ? 85 : input.inUserCircle === false ? 25 : 55;
  if (input.inUserCircle === false) {
    hits.push({ key: "out_of_circle", label: "能力圈外",
      severity: "major",
      reason: "Risk comes from not knowing what you're doing." });
  }
  dims.push({ key: "circleOfCompetence", label: "能力圈", weight: 0.20,
    rawScore: circle, weightedScore: circle * 0.20,
    reason: input.inUserCircle === true ? "用户清楚生意逻辑" : "能力圈未明" });

  let mgmt = 50 + ((input.managementQuality || 3) - 3) * 14;
  dims.push({ key: "managementIntegrity", label: "管理层正直能干", weight: 0.20,
    rawScore: clamp(mgmt), weightedScore: clamp(mgmt) * 0.20,
    reason: input.managementQuality ? `管理层 ${input.managementQuality}/5` : "管理层信息缺失" });

  let value = 50;
  const reasonsVal: string[] = [];
  if (input.pe !== undefined && input.roe !== undefined) {
    const peg = input.pe / Math.max(input.roe * 100, 1);
    if (peg < 1) { value = 80; reasonsVal.push(`PE/ROE ${peg.toFixed(2)} 有安全边际`); }
    else if (peg < 1.5) { value = 65; reasonsVal.push(`PE/ROE ${peg.toFixed(2)} 合理`); }
    else { value = 35; reasonsVal.push(`PE/ROE ${peg.toFixed(2)} 偏贵`); }
  } else if (input.pe !== undefined) {
    if (input.pe < 15) value = 75;
    else if (input.pe < 25) value = 60;
    else value = 40;
  }
  if (input.pricedFairly) value += (input.pricedFairly - 3) * 8;
  dims.push({ key: "intrinsicValue", label: "内在价值折扣", weight: 0.20,
    rawScore: clamp(value), weightedScore: clamp(value) * 0.20,
    reason: reasonsVal.join("；") || "估值/内在价值数据缺失" });

  let lt = input.intendedHoldYears !== undefined && input.intendedHoldYears >= 10 ? 80 :
           input.intendedHoldYears !== undefined && input.intendedHoldYears >= 5 ? 60 :
           input.intendedHoldYears !== undefined && input.intendedHoldYears < 3 ? 30 : 55;
  dims.push({ key: "longTermHolding", label: "可长期持有", weight: 0.10,
    rawScore: lt, weightedScore: lt * 0.10,
    reason: input.intendedHoldYears ? `预计持有 ${input.intendedHoldYears} 年` : "持有期未明" });

  if (input.managementQuality && input.managementQuality <= 2) {
    hits.push({ key: "weak_management", label: "管理层有问题",
      severity: "major",
      reason: "管理层不诚信或资本分配差——再好的生意也救不回来。" });
  }

  if (input.roe !== undefined && input.roe > 0.15 && input.yearsListed && input.yearsListed > 10) {
    bonusHits.push("10 年以上 ROE > 15%");
  }
  if (input.dividendYield !== undefined && input.dividendYield > 0.02) bonusHits.push("派息稳定");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 10;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "Wonderful company at a fair price — I'd hold it forever.";
  else if (final >= 60) oneLine = "Decent moat but I'd wait for a better entry.";
  else if (final >= 40) oneLine = "Not in my circle. I'll pass.";
  else oneLine = "Risk comes from not knowing what you're doing — and this is exactly that.";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final),
    letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 综合评论生成
// =======================
function buildComment(
  sage: Sage,
  dims: DimensionScore[],
  hits: RedFlagHit[],
  bonus: string[],
  final: number,
): string {
  const top = [...dims].sort((a, b) => b.rawScore - a.rawScore)[0];
  const bottom = [...dims].sort((a, b) => a.rawScore - b.rawScore)[0];
  const lines: string[] = [];

  if (top) lines.push(`✓ 强项：${top.label}（${top.rawScore.toFixed(0)}/100）— ${top.reason}`);
  if (bottom && bottom.rawScore < 60) lines.push(`✗ 软肋：${bottom.label}（${bottom.rawScore.toFixed(0)}/100）— ${bottom.reason}`);
  hits.forEach((h) => {
    const tag = h.severity === "veto" ? "🚨 一票否决" : h.severity === "major" ? "⚠️ 重大警示" : "💡 提示";
    lines.push(`${tag}：${h.label} — ${h.reason}`);
  });
  if (bonus.length > 0) lines.push(`✦ 加分项：${bonus.slice(0, 3).join(" / ")}`);
  return lines.join("\n");
}

// =======================
// 主入口
// =======================
// =======================
// 邱国鹭 — 投资三大思路
// =======================
function scoreQiuGuolu(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["qiu-guolu"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  // 好行业 (30%)
  let ind = 50;
  const reasonsInd: string[] = [];
  if (input.cyclical === true) { ind -= 20; reasonsInd.push("强周期行业 — 三不投之一"); }
  if (input.techDisruption && input.techDisruption >= 4) { ind -= 15; reasonsInd.push("巨变行业风险"); }
  if (input.regulatoryRisk && input.regulatoryRisk >= 4) { ind -= 10; reasonsInd.push("强监管"); }
  if (input.monopolyLevel && input.monopolyLevel >= 4) { ind += 15; reasonsInd.push(`格局集中度 ${input.monopolyLevel}/5`); }
  if (input.repeatedConsumption && input.repeatedConsumption >= 4) { ind += 10; }
  dims.push({ key: "industryGood", label: "好行业", weight: 0.30,
    rawScore: clamp(ind), weightedScore: clamp(ind) * 0.30,
    reason: reasonsInd.join("；") || "行业属性一般" });

  // 好公司 (30%)
  let comp = 50;
  if (input.roe !== undefined) {
    if (input.roe > 0.2) comp = 80;
    else if (input.roe > 0.15) comp = 70;
    else if (input.roe > 0.1) comp = 55;
    else comp = 30;
  }
  if (input.brandStrength) comp += (input.brandStrength - 3) * 8;
  if (input.managementQuality) comp += (input.managementQuality - 3) * 6;
  dims.push({ key: "companyGood", label: "好公司", weight: 0.30,
    rawScore: clamp(comp), weightedScore: clamp(comp) * 0.30,
    reason: input.roe !== undefined ? `ROE ${(input.roe * 100).toFixed(0)}%` : "无 ROE 数据" });

  // 好价格 (25%)
  let price = 60;
  if (input.pe !== undefined) {
    if (input.pe < 12) price = 85;
    else if (input.pe < 20) price = 70;
    else if (input.pe < 30) price = 50;
    else if (input.pe < 50) price = 30;
    else price = 15;
  }
  if (input.dividendYield !== undefined && input.dividendYield > 0.03) price += 8;
  dims.push({ key: "priceGood", label: "好价格", weight: 0.25,
    rawScore: clamp(price), weightedScore: clamp(price) * 0.25,
    reason: input.pe ? `PE ${input.pe}` : "无 PE 数据" });

  // 安全边际 (10%)
  let safety = 50;
  if (input.recentDrawdown !== undefined && input.recentDrawdown > 0.3) safety += 20;
  if (input.pb !== undefined && input.pb < 2) safety += 15;
  dims.push({ key: "marginOfSafety", label: "安全边际", weight: 0.10,
    rawScore: clamp(safety), weightedScore: clamp(safety) * 0.10,
    reason: "基于回撤 + 估值底部" });

  // 无明显瑕疵 (5%)
  let flaw = 80;
  if (input.cyclical === true) flaw -= 30;
  if (input.debtToAsset !== undefined && input.debtToAsset > 0.7) flaw -= 30;
  dims.push({ key: "noObviousFlaw", label: "无明显瑕疵", weight: 0.05,
    rawScore: clamp(flaw), weightedScore: clamp(flaw) * 0.05,
    reason: "三不投检查" });

  // 红旗
  if (input.cyclical === true) {
    hits.push({ key: "bad_industry", label: "强周期行业", severity: "veto",
      reason: "强周期是邱国鹭三不投之一——一票否决。" });
  }
  if (input.debtToAsset !== undefined && input.debtToAsset > 0.7) {
    hits.push({ key: "high_leverage", label: "高负债", severity: "major",
      reason: `资产负债率 ${(input.debtToAsset * 100).toFixed(0)}% — 三不投之一。` });
  }
  if (input.techDisruption && input.techDisruption >= 4) {
    hits.push({ key: "industry_decline", label: "巨变行业", severity: "major",
      reason: "技术替代风险高 — 三不投之一。" });
  }

  if (input.roe !== undefined && input.roe > 0.15) bonusHits.push(`ROE 稳定 ${(input.roe * 100).toFixed(0)}%`);
  if (input.grossMargin !== undefined && input.grossMargin > 0.5) bonusHits.push("高毛利");
  if (input.dividendYield !== undefined && input.dividendYield > 0.03) bonusHits.push("持续高分红");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 11;
    else final -= 4;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "好行业 + 好公司 + 好价格——三件齐了，下手吧。";
  else if (final >= 60) oneLine = "三件套差一项，再等等。";
  else if (final >= 40) oneLine = "踩到三不投之一了——便宜也别贪。";
  else oneLine = "强周期 / 高负债 / 巨变——这种我从来不投。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 唐朝 — 老唐估值法
// =======================
function scoreLaoTang(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["lao-tang"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  // 三年盈利可预测 (30%)
  let pred = input.inUserCircle === true ? 80 : input.inUserCircle === false ? 25 : 50;
  if (input.cyclical === true) pred -= 20;
  if (input.techDisruption && input.techDisruption >= 4) pred -= 15;
  if (input.netMargin !== undefined && input.netMargin < 0) pred -= 25;
  dims.push({ key: "earningPredictability", label: "三年盈利可预测", weight: 0.30,
    rawScore: clamp(pred), weightedScore: clamp(pred) * 0.30,
    reason: input.inUserCircle === true ? "用户能说清生意逻辑" : input.inUserCircle === false ? "超出能力圈" : "可预测性中等" });

  if (pred < 30 && input.inUserCircle === false) {
    hits.push({ key: "unpredictable", label: "未来不可预测", severity: "veto",
      reason: "老唐估值法依赖三年后净利润——算不出就不在能力圈内。" });
  }

  // 合理估值折扣 (25%)
  let valDisc = 50;
  if (input.pe !== undefined && input.roe !== undefined && input.roe > 0) {
    // 老唐式：合理估值 ≈ PE 25-30 × 利润；安全 = 现价 < 合理估值 × 70%
    const peRatio = input.pe / 25;  // 现价 / 合理 PE 的比值
    if (peRatio < 0.5) valDisc = 90;       // 现价 < 5 折
    else if (peRatio < 0.7) valDisc = 75;  // 5-7 折
    else if (peRatio < 1.0) valDisc = 55;  // 7-10 折
    else if (peRatio < 1.5) valDisc = 30;
    else valDisc = 15;
  } else if (input.pe !== undefined) {
    if (input.pe < 15) valDisc = 75;
    else if (input.pe < 25) valDisc = 55;
    else valDisc = 30;
  }
  dims.push({ key: "fairValueDiscount", label: "合理估值折扣", weight: 0.25,
    rawScore: clamp(valDisc), weightedScore: clamp(valDisc) * 0.25,
    reason: input.pe ? `PE ${input.pe} vs 老唐合理 25 = ${(input.pe / 25).toFixed(2)} 折` : "无估值数据" });

  if (input.pe !== undefined && input.pe > 35) {
    hits.push({ key: "overvalued", label: "现价高估", severity: "major",
      reason: `PE ${input.pe} > 老唐合理估值的 70% — 跌一半才接。` });
  }

  // 护城河稳定 (20%)
  let moat = 50 + ((input.brandStrength || 3) - 3) * 12;
  if (input.techDisruption && input.techDisruption >= 4) {
    moat -= 20;
    hits.push({ key: "shrinking_moat", label: "护城河收窄", severity: "major",
      reason: "技术替代风险高 — 三年后护城河可能变浅。" });
  }
  if (input.monopolyLevel) moat += (input.monopolyLevel - 3) * 6;
  dims.push({ key: "moatStable", label: "护城河稳定", weight: 0.20,
    rawScore: clamp(moat), weightedScore: clamp(moat) * 0.20,
    reason: "品牌 + 垄断 + 技术替代综合" });

  // 管理层可信 (15%)
  let mgmt = 50 + ((input.managementQuality || 3) - 3) * 14;
  if (input.managementQuality && input.managementQuality <= 2) {
    hits.push({ key: "untrustworthy_mgmt", label: "管理层不可信", severity: "major",
      reason: "管理层是巴菲特+老唐都看重的——不诚信直接放弃。" });
  }
  dims.push({ key: "mgmtTrust", label: "管理层可信", weight: 0.15,
    rawScore: clamp(mgmt), weightedScore: clamp(mgmt) * 0.15,
    reason: input.managementQuality ? `管理层 ${input.managementQuality}/5` : "未评" });

  // 买卖纪律 (10%)
  let disc = 60;
  if (input.intendedHoldYears !== undefined && input.intendedHoldYears >= 5) disc += 15;
  else if (input.intendedHoldYears !== undefined && input.intendedHoldYears < 3) disc -= 25;
  dims.push({ key: "biasMargin", label: "买卖纪律", weight: 0.10,
    rawScore: clamp(disc), weightedScore: clamp(disc) * 0.10,
    reason: input.intendedHoldYears ? `预计持有 ${input.intendedHoldYears} 年` : "持有期未表" });

  if (input.roe !== undefined && input.roe > 0.2) bonusHits.push("ROE > 20% 稳定");
  if (input.dividendYield !== undefined && input.dividendYield > 0.03) bonusHits.push("现金分红 > 3%");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 10;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "三年后合理估值 × 50% 折扣，敢下手。";
  else if (final >= 60) oneLine = "好公司，但等到合理估值 5 折再说。";
  else if (final >= 40) oneLine = "算不清三年后利润——能力圈外。";
  else oneLine = "现价高估或不可预测——老唐不接。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 李录 — 巴菲特圈内中国人 · 价值深度派
// =======================
function scoreLiLu(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["li-lu"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let dur = 50;
  if (input.brandStrength) dur += (input.brandStrength - 3) * 12;
  if (input.monopolyLevel) dur += (input.monopolyLevel - 3) * 8;
  if (input.techDisruption && input.techDisruption >= 4) dur -= 20;
  if (input.yearsListed && input.yearsListed > 15) dur += 10;
  dims.push({ key: "businessDurability", label: "商业模式持久性", weight: 0.30,
    rawScore: clamp(dur), weightedScore: clamp(dur) * 0.30,
    reason: "10-20 年视角的护城河演变" });

  let safety = 60;
  if (input.pe !== undefined && input.roe !== undefined && input.roe > 0) {
    const peg = input.pe / Math.max(input.roe * 100, 1);
    if (peg < 0.8) safety = 85;
    else if (peg < 1.2) safety = 65;
    else if (peg > 2) safety = 25;
  }
  if (input.pricedFairly) safety += (input.pricedFairly - 3) * 8;
  dims.push({ key: "marginOfSafety", label: "安全边际+合理估值", weight: 0.25,
    rawScore: clamp(safety), weightedScore: clamp(safety) * 0.25,
    reason: input.pe ? `PE/ROE 比值 ${(input.pe / Math.max((input.roe || 0.1) * 100, 1)).toFixed(2)}` : "无估值" });

  let circle = input.inUserCircle === true ? 85 : input.inUserCircle === false ? 20 : 55;
  if (input.inUserCircle === false) {
    hits.push({ key: "out_of_circle", label: "看不懂", severity: "veto",
      reason: "李录最重要的话——投资中最重要的事是知道自己不知道什么。" });
  }
  dims.push({ key: "circleOfCompetence", label: "能力圈范围", weight: 0.20,
    rawScore: circle, weightedScore: circle * 0.20,
    reason: input.inUserCircle === true ? "用户能清晰描述生意" : "未明" });

  let mgmt = 50 + ((input.managementQuality || 3) - 3) * 14;
  dims.push({ key: "managementIntegrity", label: "管理层正直", weight: 0.15,
    rawScore: clamp(mgmt), weightedScore: clamp(mgmt) * 0.15,
    reason: input.managementQuality ? `管理层 ${input.managementQuality}/5` : "未评" });

  let comp = input.intendedHoldYears !== undefined && input.intendedHoldYears >= 10 ? 90 :
             input.intendedHoldYears !== undefined && input.intendedHoldYears >= 5 ? 70 :
             input.intendedHoldYears !== undefined && input.intendedHoldYears < 3 ? 25 : 55;
  if (input.intendedHoldYears !== undefined && input.intendedHoldYears < 3) {
    hits.push({ key: "short_term", label: "短期投机", severity: "major",
      reason: "李录持有期 5-10 年，3 年内不出手。" });
  }
  dims.push({ key: "compoundingWindow", label: "复利时间窗口", weight: 0.10,
    rawScore: comp, weightedScore: comp * 0.10,
    reason: `预计持有 ${input.intendedHoldYears || "?"} 年` });

  if (input.debtToAsset !== undefined && input.debtToAsset > 0.6) {
    hits.push({ key: "high_leverage", label: "高杠杆", severity: "major",
      reason: `资产负债率 ${(input.debtToAsset * 100).toFixed(0)}% — 李录避免高杠杆。` });
  }
  if (input.roe !== undefined && input.roe > 0.15) bonusHits.push("ROE > 15% 长期");
  if (input.yearsListed && input.yearsListed > 20) bonusHits.push("穿越多个周期");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 10;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "10-20 年视角的好生意 + 合理估值——值得跟时间做朋友。";
  else if (final >= 60) oneLine = "好公司，但等到更好的价格。";
  else if (final >= 40) oneLine = "看不清未来 10 年——错过比错买好。";
  else oneLine = "Mr. Market 现在不是你的仆人——别听他的。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 风和资本 (吴任昊) — 集中长持
// =======================
function scoreFengHe(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["fenghe-wu"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let space = 50;
  if (input.cyclical === true) space -= 15;
  if (input.monopolyLevel && input.monopolyLevel >= 4) space += 20;
  if (input.repeatedConsumption && input.repeatedConsumption >= 4) space += 10;
  if (input.techDisruption && input.techDisruption >= 4) space -= 15;
  dims.push({ key: "industrySpace", label: "行业 5-10 年空间", weight: 0.25,
    rawScore: clamp(space), weightedScore: clamp(space) * 0.25,
    reason: "5-10 年视角的行业演变" });

  let moat = 50 + ((input.brandStrength || 3) - 3) * 12;
  if (input.roe !== undefined && input.roe > 0.18) moat += 15;
  if (input.techDisruption && input.techDisruption >= 4) moat -= 15;
  dims.push({ key: "moatEvolution", label: "护城河演变", weight: 0.25,
    rawScore: clamp(moat), weightedScore: clamp(moat) * 0.25,
    reason: "品牌 + ROE + 技术风险综合" });

  let conc = 50;
  if (input.marketCap !== undefined && input.marketCap > 100_000_000_000) conc = 75;
  else if (input.marketCap !== undefined && input.marketCap < 10_000_000_000) {
    conc = 30;
    hits.push({ key: "low_liquidity", label: "流动性不足", severity: "warning",
      reason: "风和规模大，< 100 亿市值不进 Top 5。" });
  } else conc = 60;
  dims.push({ key: "concentrationFit", label: "集中头寸适合度", weight: 0.20,
    rawScore: clamp(conc), weightedScore: clamp(conc) * 0.20,
    reason: "Top 5 仓位需要确定性 + 流动性" });

  let mgmt = 50 + ((input.managementQuality || 3) - 3) * 16;
  if (input.managementQuality && input.managementQuality <= 2) {
    hits.push({ key: "untrusted_mgmt", label: "管理层不可信", severity: "veto",
      reason: "风和重仓的核心是管理层——不可信直接 veto。" });
  }
  dims.push({ key: "managementLongTerm", label: "管理层长期可信", weight: 0.15,
    rawScore: clamp(mgmt), weightedScore: clamp(mgmt) * 0.15,
    reason: input.managementQuality ? `管理层 ${input.managementQuality}/5` : "未评" });

  let val = 60;
  if (input.pe !== undefined) {
    if (input.pe < 20) val = 75;
    else if (input.pe < 35) val = 60;
    else val = 35;
  }
  dims.push({ key: "valueRationality", label: "估值合理性", weight: 0.15,
    rawScore: val, weightedScore: val * 0.15,
    reason: input.pe ? `PE ${input.pe}` : "无估值" });

  if (input.consensusBullish === true && input.pe !== undefined && input.pe > 35) {
    hits.push({ key: "short_term_hot", label: "短期热点", severity: "major",
      reason: "热门赛道 + 高估值 — 风和不参与拥挤交易。" });
  }
  if (input.roe !== undefined && input.roe > 0.18) bonusHits.push("ROIC 长期 > 15%");
  if (input.monopolyLevel && input.monopolyLevel >= 4) bonusHits.push("集中市场");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 10;
    else final -= 4;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "5-10 年视角的好公司——可以放进 Top 5 重仓。";
  else if (final >= 60) oneLine = "研究透了再说，集中头寸不轻易给。";
  else if (final >= 40) oneLine = "5 年看不清的不进我们的组合。";
  else oneLine = "拥挤交易 + 不确定 — 风和不参与。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 邓晓峰 (高毅) — 深度研究派
// =======================
function scoreDengXiaofeng(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["deng-xiaofeng"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let pos = 50 + ((input.monopolyLevel || 3) - 3) * 14;
  if (input.brandStrength) pos += (input.brandStrength - 3) * 6;
  if (input.monopolyLevel !== undefined && input.monopolyLevel <= 2) {
    hits.push({ key: "marginal_industry", label: "行业地位边缘", severity: "veto",
      reason: "邓晓峰只投行业第一/第二——边缘公司直接 veto。" });
  }
  dims.push({ key: "industryPosition", label: "行业地位", weight: 0.30,
    rawScore: clamp(pos), weightedScore: clamp(pos) * 0.30,
    reason: input.monopolyLevel ? `市占率 ${input.monopolyLevel}/5` : "未明" });

  let roe = 50;
  if (input.roe !== undefined) {
    if (input.roe > 0.20) roe = 85;
    else if (input.roe > 0.15) roe = 70;
    else if (input.roe > 0.10) roe = 55;
    else roe = 30;
  }
  dims.push({ key: "longTermRoe", label: "长期 ROE 稳定", weight: 0.25,
    rawScore: clamp(roe), weightedScore: clamp(roe) * 0.25,
    reason: input.roe !== undefined ? `ROE ${(input.roe * 100).toFixed(0)}%` : "无 ROE" });

  let mgmt = 50 + ((input.managementQuality || 3) - 3) * 14;
  if (input.managementQuality && input.managementQuality <= 2) {
    hits.push({ key: "biz_thrash", label: "频繁折腾业务", severity: "major",
      reason: "邓晓峰要求管理层不折腾、不乱并购。" });
  }
  dims.push({ key: "managementQuality", label: "管理层质量", weight: 0.20,
    rawScore: clamp(mgmt), weightedScore: clamp(mgmt) * 0.20,
    reason: input.managementQuality ? `管理层 ${input.managementQuality}/5` : "未评" });

  let val = 60;
  if (input.pe !== undefined) {
    if (input.pe < 15) val = 75;
    else if (input.pe < 25) val = 60;
    else if (input.pe < 40) val = 45;
    else val = 25;
  }
  dims.push({ key: "valuation", label: "估值合理", weight: 0.15,
    rawScore: val, weightedScore: val * 0.15,
    reason: input.pe ? `PE ${input.pe}` : "无估值" });

  let conc = 50;
  if (input.marketCap !== undefined && input.marketCap > 100_000_000_000) conc = 75;
  dims.push({ key: "concentrationDiscipline", label: "持仓集中度", weight: 0.10,
    rawScore: conc, weightedScore: conc * 0.10,
    reason: "Top 10 持仓需要研究深度匹配" });

  if (input.fcfMargin !== undefined && input.fcfMargin > 0 && input.netMargin !== undefined &&
      input.netMargin > 0 && input.fcfMargin / input.netMargin < 0.6) {
    hits.push({ key: "fcf_unstable", label: "现金流不稳", severity: "major",
      reason: "FCF/净利润 < 0.6 — 业绩质量打折扣。" });
  }
  if (input.roe !== undefined && input.roe > 0.20) bonusHits.push("长期 ROE > 20%");
  if (input.dividendYield !== undefined && input.dividendYield > 0.03) bonusHits.push("现金分红 > 30%");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 10;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "行业龙头 + 长期 ROE 稳定——值得深度研究后重仓。";
  else if (final >= 60) oneLine = "好公司，但还要更深的研究才敢加仓。";
  else if (final >= 40) oneLine = "行业地位不够稳，赚不到生意的钱。";
  else oneLine = "深度研究后我宁愿错过也不会乱买。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 赵军 (淡水泉) — 逆向 + Fundamental
// =======================
function scoreZhaoJun(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["zhao-jun"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let turn = 50;
  if (input.catalystVisible === true) turn = 80;
  if (input.catalystVisible === false) turn = 25;
  if (input.oversoldRecently === true && input.catalystVisible === true) turn += 10;
  if (input.roe !== undefined && input.roe < 0 && input.catalystVisible !== true) {
    turn = 15;
    hits.push({ key: "no_turning_signal", label: "无业绩拐点信号", severity: "veto",
      reason: "赵军只买'便宜+业绩拐点'——光便宜不够。" });
  }
  dims.push({ key: "earningsTurning", label: "业绩拐点信号", weight: 0.30,
    rawScore: clamp(turn), weightedScore: clamp(turn) * 0.30,
    reason: input.catalystVisible === true ? "12-24 个月内有催化剂" : "拐点信号不明" });

  let mgmt = 50 + ((input.managementQuality || 3) - 3) * 14;
  if (input.managementQuality && input.managementQuality <= 2) {
    hits.push({ key: "governance_decline", label: "公司治理恶化", severity: "major",
      reason: "管理层不行 — 业绩拐点也救不回来。" });
  }
  dims.push({ key: "mgmtChange", label: "管理层变革", weight: 0.20,
    rawScore: clamp(mgmt), weightedScore: clamp(mgmt) * 0.20,
    reason: "新管理层 / 战略变革加分" });

  let val = 50;
  if (input.pb !== undefined && input.pb < 1.5) val = 80;
  else if (input.pb !== undefined && input.pb < 3) val = 60;
  else if (input.pb !== undefined && input.pb > 8) val = 25;
  if (input.recentDrawdown !== undefined && input.recentDrawdown > 0.4) val += 10;
  dims.push({ key: "valueBottom", label: "估值底部", weight: 0.20,
    rawScore: clamp(val), weightedScore: clamp(val) * 0.20,
    reason: input.pb ? `PB ${input.pb} ${input.recentDrawdown ? `+ 回撤${(input.recentDrawdown*100).toFixed(0)}%` : ""}` : "无估值" });

  let fund = 50;
  if (input.cyclical === true && input.oversoldRecently === true) fund = 65;
  if (input.regulatoryRisk && input.regulatoryRisk >= 4 && input.catalystVisible !== true) fund -= 15;
  if (input.techDisruption && input.techDisruption >= 4) {
    fund -= 15;
    hits.push({ key: "industry_decline", label: "行业持续恶化", severity: "major",
      reason: "技术替代风险高 — 行业 fundamental 不支持。" });
  }
  dims.push({ key: "industryFundamental", label: "行业 fundamental", weight: 0.20,
    rawScore: clamp(fund), weightedScore: clamp(fund) * 0.20,
    reason: "行业触底回升信号" });

  let timing = input.oversoldRecently === true ? 80 : input.consensusBullish === true ? 25 : 55;
  dims.push({ key: "timing", label: "时点选择", weight: 0.10,
    rawScore: clamp(timing), weightedScore: clamp(timing) * 0.10,
    reason: input.oversoldRecently ? "情绪极端低点" : input.consensusBullish ? "共识高位" : "中性" });

  if (input.managementQuality && input.managementQuality >= 4) bonusHits.push("管理层强");
  if (input.recentDrawdown !== undefined && input.recentDrawdown > 0.4 && input.catalystVisible) bonusHits.push("跌深+有催化剂");
  if (input.pb !== undefined && input.pb < 2) bonusHits.push("PB 历史 20 分位");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "veto") final = Math.min(final, 25);
    else if (h.severity === "major") final -= 10;
  });
  bonusHits.forEach(() => (final += 4));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "便宜 + 业绩拐点 + 管理层变革——三重共振，下手。";
  else if (final >= 60) oneLine = "拐点初现，再等一个验证信号。";
  else if (final >= 40) oneLine = "光便宜不够，没拐点不会买。";
  else oneLine = "便宜不是理由——我们买的是改变。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 蒋锦志 (景林) — 全球价值派
// =======================
function scoreJiang(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["jiang-jinzhi"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let global = 50;
  if (input.brandStrength) global += (input.brandStrength - 3) * 12;
  if (input.monopolyLevel && input.monopolyLevel >= 4) global += 15;
  if (input.monopolyLevel !== undefined && input.monopolyLevel <= 2) {
    global -= 20;
    hits.push({ key: "weak_global_position", label: "全球地位弱", severity: "major",
      reason: "景林偏好全球 Top 3 — 本土边缘不投。" });
  }
  dims.push({ key: "globalCompetitiveness", label: "全球竞争力", weight: 0.30,
    rawScore: clamp(global), weightedScore: clamp(global) * 0.30,
    reason: "品牌 + 垄断 综合" });

  let brand = 50 + ((input.brandStrength || 3) - 3) * 14;
  if (input.repeatedConsumption && input.repeatedConsumption >= 4) brand += 10;
  dims.push({ key: "consumerBrand", label: "消费品牌力", weight: 0.25,
    rawScore: clamp(brand), weightedScore: clamp(brand) * 0.25,
    reason: input.brandStrength ? `品牌 ${input.brandStrength}/5` : "未评" });

  let fcf = 50;
  if (input.fcfMargin !== undefined) {
    if (input.fcfMargin > 0.2) fcf = 80;
    else if (input.fcfMargin > 0.1) fcf = 65;
    else if (input.fcfMargin < 0) {
      fcf = 25;
      hits.push({ key: "fcf_uncertain", label: "现金流不可见", severity: "major",
        reason: "FCF 为负 — 长期价值不可估。" });
    }
  }
  dims.push({ key: "longTermFcf", label: "长期自由现金流", weight: 0.20,
    rawScore: clamp(fcf), weightedScore: clamp(fcf) * 0.20,
    reason: input.fcfMargin !== undefined ? `FCF/收入 ${(input.fcfMargin * 100).toFixed(0)}%` : "无 FCF" });

  let macro = 60;
  if (input.techDisruption && input.techDisruption >= 4) {
    macro -= 15;
    hits.push({ key: "tech_disruption_high", label: "技术替代风险", severity: "major",
      reason: "5 年内被颠覆 — 全球趋势不利。" });
  }
  if (input.cyclical === true) macro -= 10;
  dims.push({ key: "macroAlignment", label: "宏观契合度", weight: 0.15,
    rawScore: clamp(macro), weightedScore: clamp(macro) * 0.15,
    reason: "宏观趋势契合" });

  let val = 60;
  if (input.pe !== undefined) {
    if (input.pe < 25) val = 75;
    else if (input.pe < 40) val = 55;
    else val = 30;
  }
  dims.push({ key: "valuation", label: "估值合理", weight: 0.10,
    rawScore: val, weightedScore: val * 0.10,
    reason: input.pe ? `PE ${input.pe}` : "无估值" });

  if (input.brandStrength && input.brandStrength >= 4 && input.monopolyLevel && input.monopolyLevel >= 4) bonusHits.push("全球 Top 3 行业地位");
  if (input.repeatedConsumption && input.repeatedConsumption >= 4) bonusHits.push("跨周期消费品");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "major") final -= 10;
  });
  bonusHits.forEach(() => (final += 4));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "全球视野下的中国资产 — 值得长期持有。";
  else if (final >= 60) oneLine = "好公司，但还要更明确的全球地位。";
  else if (final >= 40) oneLine = "本土地位足够，但全球竞争力差点意思。";
  else oneLine = "在我的全球框架下还看不到位置。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 王亚伟 (千合资本) — 黑马成长派
// =======================
function scoreWangYawei(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["wang-yawei"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let unique = 50;
  if (input.consensusBullish === true) {
    unique = 25;
    hits.push({ key: "consensus_already", label: "已成共识", severity: "major",
      reason: "王亚伟找的是黑马 — 已成共识就晚了。" });
  } else if (input.consensusBullish === false) {
    unique = 75;
  }
  if (input.oversoldRecently === true) unique += 5;
  dims.push({ key: "uniqueOpportunity", label: "独特机会", weight: 0.30,
    rawScore: clamp(unique), weightedScore: clamp(unique) * 0.30,
    reason: input.consensusBullish === false ? "市场尚未充分认知" : "已被市场认知" });

  let mgmt = 50 + ((input.managementQuality || 3) - 3) * 16;
  if (input.managementQuality && input.managementQuality <= 2) {
    hits.push({ key: "weak_mgmt", label: "管理层平庸", severity: "major",
      reason: "黑马的核心是管理层 — 平庸直接出局。" });
  }
  dims.push({ key: "managementVision", label: "管理层格局", weight: 0.25,
    rawScore: clamp(mgmt), weightedScore: clamp(mgmt) * 0.25,
    reason: input.managementQuality ? `管理层 ${input.managementQuality}/5` : "未评" });

  let cat = input.catalystVisible === true ? 80 : input.catalystVisible === false ? 25 : 50;
  if (input.catalystVisible === false) {
    hits.push({ key: "no_catalyst", label: "无催化剂", severity: "major",
      reason: "12-36 个月看不到业绩催化 — 不是黑马题材。" });
  }
  dims.push({ key: "growthCatalyst", label: "成长催化剂", weight: 0.20,
    rawScore: cat, weightedScore: cat * 0.20,
    reason: input.catalystVisible === true ? "12-36 个月可见" : "无" });

  let asym = 50;
  if (input.recentDrawdown !== undefined && input.recentDrawdown > 0.4) asym = 75;
  if (input.pb !== undefined && input.pb < 2) asym += 10;
  dims.push({ key: "valuationAsymmetry", label: "估值不对称", weight: 0.15,
    rawScore: clamp(asym), weightedScore: clamp(asym) * 0.15,
    reason: "下跌空间 vs 上涨空间" });

  let tail = 50;
  if (input.cyclical === true && input.oversoldRecently === true) tail = 65;
  if (input.regulatoryRisk && input.regulatoryRisk >= 4) tail -= 10;
  dims.push({ key: "industryTailwind", label: "行业顺风", weight: 0.10,
    rawScore: clamp(tail), weightedScore: clamp(tail) * 0.10,
    reason: "行业景气度" });

  if (input.consensusBullish === false) bonusHits.push("市场覆盖率低");
  if (input.managementQuality && input.managementQuality >= 4) bonusHits.push("管理层强");
  if (input.catalystVisible === true) bonusHits.push("有明确催化剂");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => {
    if (h.severity === "major") final -= 10;
  });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = "";
  if (final >= 80) oneLine = "市场没看到的好公司 + 强管理层 + 催化剂 — 黑马就该这样。";
  else if (final >= 60) oneLine = "有黑马气质，但还要再确认管理层。";
  else if (final >= 40) oneLine = "已经被市场看到，黑马已不黑马。";
  else oneLine = "已成共识或没催化剂 — 不是我要找的黑马。";

  return {
    sageId: sage.id, sageName: sage.name,
    finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits,
    signatureQuote: pickQuote(sage, final),
  };
}

// =======================
// 陈光明 (睿远) — 三好+FCF
// =======================
function scoreChenGuangming(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["chen-guangming"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let biz = 50;
  if (input.cyclical === true) {
    biz -= 25;
    hits.push({ key: "weak_industry", label: "强周期", severity: "major", reason: "陈光明远离强周期。" });
  }
  if (input.monopolyLevel) biz += (input.monopolyLevel - 3) * 12;
  if (input.brandStrength) biz += (input.brandStrength - 3) * 8;
  dims.push({ key: "biz", label: "好行业 / 好公司", weight: 0.30, rawScore: clamp(biz), weightedScore: clamp(biz) * 0.30, reason: "行业 + 公司双重过滤" });

  let price = 60;
  if (input.pe !== undefined) {
    if (input.pe < 15) price = 80;
    else if (input.pe < 25) price = 65;
    else if (input.pe < 40) price = 45;
    else price = 25;
  }
  dims.push({ key: "price", label: "好价格", weight: 0.25, rawScore: price, weightedScore: price * 0.25, reason: input.pe ? `PE ${input.pe}` : "无" });

  let fcf = 50;
  if (input.fcfMargin !== undefined) {
    if (input.fcfMargin > 0.2) fcf = 85;
    else if (input.fcfMargin > 0.1) fcf = 70;
    else if (input.fcfMargin > 0) fcf = 55;
    else { fcf = 20; hits.push({ key: "fcf_neg", label: "FCF 为负", severity: "veto", reason: "陈光明对 FCF 为负的公司 veto。" }); }
  }
  dims.push({ key: "fcf", label: "自由现金流", weight: 0.20, rawScore: clamp(fcf), weightedScore: clamp(fcf) * 0.20, reason: input.fcfMargin !== undefined ? `${(input.fcfMargin * 100).toFixed(0)}%` : "无 FCF" });

  let roe = 50;
  if (input.roe !== undefined) {
    if (input.roe > 0.20) roe = 85;
    else if (input.roe > 0.15) roe = 70;
    else if (input.roe > 0.10) roe = 55;
    else roe = 25;
  }
  dims.push({ key: "roe", label: "长期 ROE", weight: 0.15, rawScore: clamp(roe), weightedScore: clamp(roe) * 0.15, reason: input.roe !== undefined ? `ROE ${(input.roe * 100).toFixed(0)}%` : "无" });

  let lt = input.intendedHoldYears !== undefined && input.intendedHoldYears >= 5 ? 80 : input.intendedHoldYears !== undefined && input.intendedHoldYears >= 3 ? 60 : 40;
  dims.push({ key: "longTerm", label: "长期持有意愿", weight: 0.10, rawScore: lt, weightedScore: lt * 0.10, reason: `预计 ${input.intendedHoldYears || "?"} 年` });

  if (input.roe !== undefined && input.roe > 0.15) bonusHits.push("ROE > 15% 长期");
  if (input.dividendYield !== undefined && input.dividendYield > 0.03) bonusHits.push("现金分红 > 3%");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => { if (h.severity === "veto") final = Math.min(final, 25); else final -= 10; });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = final >= 80 ? "好行业 + 好公司 + 好价格 + 现金流——三好齐聚，下手。" :
                 final >= 60 ? "三好缺一项，再等等。" :
                 final >= 40 ? "认知没到位，宁可错过。" :
                              "投资是认知的变现——这个我看不到。";

  return { sageId: sage.id, sageName: sage.name, finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits, signatureQuote: pickQuote(sage, final) };
}

// =======================
// 谢治宇 (兴证全球) — 行业景气+成长
// =======================
function scoreXieZhiyu(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["xie-zhiyu"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let upcycle = 50;
  if (input.cyclical === true && input.oversoldRecently === true) upcycle = 70;
  if (input.cyclical === true && input.oversoldRecently !== true) upcycle = 35;
  if (input.techDisruption && input.techDisruption >= 4) {
    upcycle -= 15;
    hits.push({ key: "industry_decline", label: "行业可能下行", severity: "major", reason: "技术替代风险高。" });
  }
  dims.push({ key: "industryUpcycle", label: "行业景气向上", weight: 0.30, rawScore: clamp(upcycle), weightedScore: clamp(upcycle) * 0.30, reason: "行业景气度判断" });

  let bm = 50 + ((input.brandStrength || 3) - 3) * 12;
  if (input.fcfMargin !== undefined && input.fcfMargin > 0.1) bm += 10;
  dims.push({ key: "bizModel", label: "商业模式", weight: 0.25, rawScore: clamp(bm), weightedScore: clamp(bm) * 0.25, reason: "可持续盈利" });

  let growth = 50;
  if (input.roe !== undefined) {
    if (input.roe > 0.20) growth = 80;
    else if (input.roe > 0.15) growth = 65;
    else if (input.roe < 0.10) {
      growth = 30;
      hits.push({ key: "no_growth", label: "无增长", severity: "major", reason: "ROE < 10% 不符合谢治宇成长标准。" });
    }
  }
  dims.push({ key: "growth", label: "增长可见性", weight: 0.20, rawScore: clamp(growth), weightedScore: clamp(growth) * 0.20, reason: input.roe !== undefined ? `ROE ${(input.roe * 100).toFixed(0)}%` : "无" });

  let valFit = 50;
  if (input.pe !== undefined && input.roe !== undefined && input.roe > 0) {
    const peg = input.pe / Math.max(input.roe * 100, 1);
    if (peg < 1) valFit = 80;
    else if (peg < 1.5) valFit = 60;
    else valFit = 30;
    if (input.pe > 50 && input.roe < 0.3) {
      hits.push({ key: "overvalued", label: "过度高估", severity: "major", reason: "PE > 50 但增速跟不上。" });
    }
  }
  dims.push({ key: "valuationFit", label: "估值匹配", weight: 0.15, rawScore: clamp(valFit), weightedScore: clamp(valFit) * 0.15, reason: "PEG 合理性" });

  let mgmt = 50 + ((input.managementQuality || 3) - 3) * 12;
  dims.push({ key: "mgmtVision", label: "管理层格局", weight: 0.10, rawScore: clamp(mgmt), weightedScore: clamp(mgmt) * 0.10, reason: input.managementQuality ? `管理层 ${input.managementQuality}/5` : "未评" });

  if (input.roe !== undefined && input.roe > 0.20) bonusHits.push("ROE > 20%");
  if (input.fcfMargin !== undefined && input.fcfMargin > 0.15) bonusHits.push("现金流充沛");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => { final -= 10; });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = final >= 80 ? "行业景气向上 + 增长可见 + 估值合理——值得 5 年持有。" :
                 final >= 60 ? "好公司，但行业景气度还不够明确。" :
                 final >= 40 ? "增长跟不上估值，再等。" :
                              "我选的是未来 5 年还在变好的公司——不是这个。";

  return { sageId: sage.id, sageName: sage.name, finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits, signatureQuote: pickQuote(sage, final) };
}

// =======================
// 杨东 (宁泉) — 安全边际择时派
// =======================
function scoreYangDong(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["yang-dong"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  let down = 50;
  if (input.pb !== undefined) {
    if (input.pb < 1.5) down = 85;
    else if (input.pb < 3) down = 65;
    else if (input.pb > 6) down = 25;
  }
  if (input.dividendYield !== undefined && input.dividendYield > 0.04) down += 10;
  if (input.recentDrawdown !== undefined && input.recentDrawdown > 0.4) down += 10;
  dims.push({ key: "downsideProtection", label: "下行保护", weight: 0.30, rawScore: clamp(down), weightedScore: clamp(down) * 0.30, reason: input.pb ? `PB ${input.pb}` : "无 PB" });

  let asym = 50;
  if (input.oversoldRecently === true) asym = 75;
  if (input.consensusBullish === true) asym = 25;
  if (input.pe !== undefined && input.pe > 30 && input.pb !== undefined && input.pb > 5) {
    hits.push({ key: "high_pe_high_pb", label: "高估值组合", severity: "major", reason: "PE > 30 + PB > 5 — 风险大于回报。" });
  }
  dims.push({ key: "asymRiskReturn", label: "风险收益不对称", weight: 0.25, rawScore: clamp(asym), weightedScore: clamp(asym) * 0.25, reason: "下跌空间 vs 上涨空间" });

  let macro = 60;
  if (input.regulatoryRisk && input.regulatoryRisk >= 4) {
    macro -= 15;
    hits.push({ key: "macro_headwind", label: "宏观逆风", severity: "major", reason: "强监管 — 宏观环境不利。" });
  }
  if (input.cyclical === true) macro -= 10;
  dims.push({ key: "macroSafety", label: "宏观安全度", weight: 0.20, rawScore: clamp(macro), weightedScore: clamp(macro) * 0.20, reason: "监管 + 周期" });

  let liq = 60;
  if (input.debtToAsset !== undefined && input.debtToAsset > 0.7) {
    liq = 25;
    hits.push({ key: "leverage_high", label: "高杠杆", severity: "veto", reason: "杨东对资产负债率 > 70% veto。" });
  } else if (input.debtToAsset !== undefined && input.debtToAsset < 0.4) liq = 80;
  dims.push({ key: "liquidityBuffer", label: "流动性缓冲", weight: 0.15, rawScore: clamp(liq), weightedScore: clamp(liq) * 0.15, reason: "财务健康度" });

  let pat = input.intendedHoldYears !== undefined && input.intendedHoldYears >= 5 ? 80 : input.intendedHoldYears !== undefined && input.intendedHoldYears >= 3 ? 60 : 40;
  dims.push({ key: "patience", label: "持有耐心", weight: 0.10, rawScore: pat, weightedScore: pat * 0.10, reason: `预计 ${input.intendedHoldYears || "?"} 年` });

  if (input.pb !== undefined && input.pb < 2) bonusHits.push("PB < 2 安全边际");
  if (input.dividendYield !== undefined && input.dividendYield > 0.03) bonusHits.push("派息 > 3%");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => { if (h.severity === "veto") final = Math.min(final, 25); else final -= 10; });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = final >= 80 ? "下行有保护 + 风险收益不对称 — 活下来比赚得多重要。" :
                 final >= 60 ? "有点意思但还不够安全。" :
                 final >= 40 ? "宏观逆风或估值偏高 — 我宁愿等。" :
                              "我宁可错过 100% 的涨幅，也不愿承担 50% 亏损。";

  return { sageId: sage.id, sageName: sage.name, finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits, signatureQuote: pickQuote(sage, final) };
}

// =======================
// 马自铭 (雪湖资本) — 研究深度 + 生产效率派
// =======================
function scoreMaZibing(input: CaseInput): SageVerdict {
  const sage = SAGE_BY_ID["ma-zibing"];
  const dims: DimensionScore[] = [];
  const hits: RedFlagHit[] = [];
  const bonusHits: string[] = [];

  // 研究深度 (30%) — 用户是否真的清楚生意逻辑
  let depth = input.inUserCircle === true ? 80 : input.inUserCircle === false ? 20 : 50;
  if (input.inUserCircle === false) {
    hits.push({ key: "no_research", label: "研究不透", severity: "major", reason: "雪湖坚持研究透才下手 — 不在能力圈直接出局。" });
  }
  dims.push({ key: "researchDepth", label: "研究深度", weight: 0.30, rawScore: depth, weightedScore: depth * 0.30, reason: input.inUserCircle === true ? "用户能讲清楚商业模式" : "未明" });

  // 生产效率提升 (25%) — 创新能否带来行业利润率提升
  let prod = 50;
  if (input.brandStrength) prod += (input.brandStrength - 3) * 8;
  if (input.monopolyLevel && input.monopolyLevel >= 4) prod += 12;
  if (input.netMargin !== undefined && input.netMargin > 0.18) prod += 10;
  if (input.netMargin !== undefined && input.netMargin < 0.05) {
    prod -= 15;
    hits.push({ key: "low_margin_trend", label: "净利率偏低", severity: "major", reason: "净利率 < 5% — 无明显生产效率优势。" });
  }
  dims.push({ key: "productivityLeverage", label: "生产效率提升", weight: 0.25, rawScore: clamp(prod), weightedScore: clamp(prod) * 0.25, reason: input.netMargin !== undefined ? `净利率 ${(input.netMargin * 100).toFixed(0)}%` : "无" });

  // 产业链合理性 (20%)
  let chain = 50 + ((input.monopolyLevel || 3) - 3) * 10;
  if (input.cyclical === true) chain -= 10;
  if (input.fcfMargin !== undefined && input.fcfMargin > 0.15) chain += 10;
  if (input.fcfMargin !== undefined && input.fcfMargin < 0) {
    chain -= 20;
    hits.push({ key: "fake_growth", label: "FCF 为负 + 增长可疑", severity: "veto", reason: "雪湖做空的就是这种 — 增长靠融资烧钱不是真增长。" });
  }
  dims.push({ key: "industrialChain", label: "产业链合理性", weight: 0.20, rawScore: clamp(chain), weightedScore: clamp(chain) * 0.20, reason: input.fcfMargin !== undefined ? `FCF/收入 ${(input.fcfMargin * 100).toFixed(0)}%` : "无" });

  // 多空对称风险 (15%)
  let asym = 50;
  if (input.consensusBullish === true && input.pe !== undefined && input.pe > 50) asym = 25;
  if (input.oversoldRecently === true && input.catalystVisible === true) asym = 75;
  dims.push({ key: "asymRisk", label: "多空对称风险", weight: 0.15, rawScore: clamp(asym), weightedScore: clamp(asym) * 0.15, reason: "适合做多还是做空？" });

  // 长期持有 (10%)
  let lt = input.intendedHoldYears !== undefined && input.intendedHoldYears >= 5 ? 75 : input.intendedHoldYears !== undefined && input.intendedHoldYears >= 3 ? 60 : 40;
  dims.push({ key: "longTerm", label: "长期持有意愿", weight: 0.10, rawScore: lt, weightedScore: lt * 0.10, reason: `预计 ${input.intendedHoldYears || "?"} 年` });

  if (input.roe !== undefined && input.roe > 0.18) bonusHits.push("ROE > 18% 长期");
  if (input.brandStrength && input.brandStrength >= 4) bonusHits.push("产业链话语权强");

  let final = dims.reduce((s, d) => s + d.weightedScore, 0);
  hits.forEach((h) => { if (h.severity === "veto") final = Math.min(final, 25); else final -= 10; });
  bonusHits.forEach(() => (final += 3));
  final = clamp(final);

  const v = scoreToVerdict(final);
  let oneLine = final >= 80 ? "研究透了 + 生产效率提升 + 产业链合理 — 雪湖会做多。" :
                 final >= 60 ? "好公司但还没研究透到能下手。" :
                 final >= 40 ? "增长可疑或没创新 — 雪湖看做空机会。" :
                              "我们不预测市场，我们识别欺骗 — 这种我会做空。";

  return { sageId: sage.id, sageName: sage.name, finalScore: Math.round(final), letterGrade: scoreToGrade(final),
    verdict: v.verdict, verdictLabel: v.label, oneLine,
    comment: buildComment(sage, dims, hits, bonusHits, final),
    dimensions: dims, redFlags: hits, bonusHits, signatureQuote: pickQuote(sage, final) };
}

const SCORE_FUNCS: Record<string, (i: CaseInput) => SageVerdict> = {
  "duan-yongping": scoreDuanYongping,
  "feng-liu": scoreFengLiu,
  "dan-bin": scoreDanBin,
  "lin-yuan": scoreLinYuan,
  "zhang-kun": scoreZhangKun,
  "buffett": scoreBuffett,
  "qiu-guolu": scoreQiuGuolu,
  "lao-tang": scoreLaoTang,
  "li-lu": scoreLiLu,
  "fenghe-wu": scoreFengHe,
  "deng-xiaofeng": scoreDengXiaofeng,
  "zhao-jun": scoreZhaoJun,
  "jiang-jinzhi": scoreJiang,
  "wang-yawei": scoreWangYawei,
  "chen-guangming": scoreChenGuangming,
  "xie-zhiyu": scoreXieZhiyu,
  "yang-dong": scoreYangDong,
  "ma-zibing": scoreMaZibing,
};

export function evaluate(input: CaseInput, sageIds?: string[]): JuryReport {
  const ids = sageIds && sageIds.length > 0 ? sageIds : SAGES.map((s) => s.id);
  const verdicts = ids.map((id) => SCORE_FUNCS[id](input));
  const consensus = verdicts.reduce((s, v) => s + v.finalScore, 0) / verdicts.length;
  const cv = scoreToVerdict(consensus);

  const buys = verdicts.filter((v) => v.verdict === "BUY" || v.verdict === "STRONG_BUY").length;
  const avoids = verdicts.filter((v) => v.verdict === "AVOID" || v.verdict === "STRONG_AVOID").length;
  const total = verdicts.length;
  let agreement: JuryReport["agreementLevel"];
  if (buys === total || avoids === total) agreement = "UNANIMOUS";
  else if (buys >= total * 0.66 || avoids >= total * 0.66) agreement = "MAJORITY";
  else if (buys > 0 && avoids > 0 && Math.abs(buys - avoids) <= 1) agreement = "CONTROVERSIAL";
  else agreement = "SPLIT";

  const sortedHigh = [...verdicts].sort((a, b) => b.finalScore - a.finalScore);
  const sortedLow = [...verdicts].sort((a, b) => a.finalScore - b.finalScore);
  const topPro = `${sortedHigh[0].sageName} 给 ${sortedHigh[0].finalScore} 分：${sortedHigh[0].oneLine}`;
  const topCon = `${sortedLow[0].sageName} 给 ${sortedLow[0].finalScore} 分：${sortedLow[0].oneLine}`;

  let finalJudgment = "";
  if (agreement === "UNANIMOUS" && buys === total) {
    finalJudgment = "六位陪审员一致看好——这是难得一见的高度共识，但请记住：共识本身就是风险信号之一（冯柳会提醒你）。";
  } else if (agreement === "UNANIMOUS" && avoids === total) {
    finalJudgment = `六位陪审员一致回避——历史上每一次"事后看很傻"的崩盘，都是从全员一致回避开始。但这不是抄底信号。`;
  } else if (agreement === "MAJORITY") {
    finalJudgment = `多数陪审员${buys >= avoids ? "看好" : "回避"}——主流方向已经形成，但请关注少数派的反对意见，那往往才是真正的风险。`;
  } else if (agreement === "CONTROVERSIAL") {
    finalJudgment = `陪审团出现严重分歧——这是个真正的争议性案例。这种时候你需要回答的不是"该不该买"，而是"你是哪一派"。`;
  } else {
    finalJudgment = "陪审员看法分散，无明显共识——案例信息不足或方向不明。先把信息补全再下判断。";
  }

  return {
    caseInput: input,
    verdicts,
    consensusScore: Math.round(consensus),
    consensusVerdict: cv.verdict,
    consensusLabel: cv.label,
    agreementLevel: agreement,
    topPro,
    topCon,
    finalJudgment,
    generatedAt: new Date().toISOString(),
  };
}

export { SAGES, SAGE_BY_ID };
