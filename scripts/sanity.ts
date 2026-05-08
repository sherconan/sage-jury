import { evaluate } from "../lib/engine";

const moutaiLike = {
  ticker: "600519", name: "贵州茅台", industry: "白酒",
  briefBusiness: "高端白酒龙头，品牌护城河深厚",
  pe: 28, pb: 9, roe: 0.28, grossMargin: 0.92, netMargin: 0.5,
  fcfMargin: 0.45, debtToAsset: 0.18, dividendYield: 0.025,
  yearsListed: 24, capexRatio: 0.05,
  monopolyLevel: 5 as const, brandStrength: 5 as const,
  consumerStickiness: 5 as const, repeatedConsumption: 5 as const,
  techDisruption: 1 as const, regulatoryRisk: 2 as const,
  managementQuality: 4 as const,
  inUserCircle: true, cyclical: false, oversoldRecently: false,
  consensusBullish: true, intendedHoldYears: 10,
};

const oversoldTech = {
  name: "某中概互联网", industry: "互联网",
  briefBusiness: "电商平台，被监管和宏观双杀",
  pe: 12, pb: 1.6, roe: 0.13, grossMargin: 0.42, netMargin: 0.08,
  fcfMargin: 0.15, debtToAsset: 0.35,
  monopolyLevel: 4 as const, brandStrength: 4 as const,
  techDisruption: 3 as const, regulatoryRisk: 4 as const,
  managementQuality: 3 as const,
  inUserCircle: true, cyclical: false,
  oversoldRecently: true, recentDrawdown: 0.6,
  consensusBullish: false, catalystVisible: true,
  intendedHoldYears: 3,
};

const storyStock = {
  name: "某 AI 概念新股", industry: "AI 应用",
  briefBusiness: "纯概念，无实际收入",
  pe: 250, pb: 15, roe: -0.05, grossMargin: 0.3, netMargin: -0.2,
  fcfMargin: -0.3, debtToAsset: 0.55,
  monopolyLevel: 2 as const, brandStrength: 2 as const,
  techDisruption: 5 as const, managementQuality: 3 as const,
  inUserCircle: false, cyclical: false,
  consensusBullish: true, intendedHoldYears: 1,
};

[
  ["茅台风格", moutaiLike],
  ["暴跌科技股", oversoldTech],
  ["讲故事股", storyStock],
].forEach(([label, c]: any) => {
  const r = evaluate(c);
  console.log(`\n===== ${label} =====`);
  console.log(`综合 ${r.consensusScore} | ${r.consensusLabel} | ${r.agreementLevel}`);
  r.verdicts.forEach((v: any) => {
    console.log(`  ${v.sageName.padEnd(6)} ${v.letterGrade} ${String(v.finalScore).padStart(3)}  ${v.verdictLabel}`);
  });
  console.log(`  ⇒ ${r.finalJudgment}`);
});
