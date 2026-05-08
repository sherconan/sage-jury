// 今日热点案件 — 当下市场关注的真实股票，已用 API 实测过判决
// 用户进首页就能看到 4 张完整的陪审团判决书

import type { CaseInput } from "@/types";

export interface TodayCase {
  id: string;
  title: string;
  emojiTag: string;
  hook: string;
  context: string;
  input: CaseInput;
}

export const TODAY_HOT_CASES: TodayCase[] = [
  {
    id: "nvda-now",
    title: "英伟达 NVDA",
    emojiTag: "💻",
    hook: "AI 算力霸主 · 共识看好",
    context: "全球 GPU 垄断 + AI 训练核心算力。市值进入万亿俱乐部，机构一致看多。陪审团怎么看共识？",
    input: {
      ticker: "NVDA", name: "英伟达 NVDA", industry: "半导体 / AI 算力",
      briefBusiness: "GPU 全球垄断 + AI 训练核心算力",
      pe: 48, pb: 35, roe: 0.86, grossMargin: 0.75, netMargin: 0.55, fcfMargin: 0.42,
      yearsListed: 26, capexRatio: 0.04,
      monopolyLevel: 5, brandStrength: 5, consumerStickiness: 4, repeatedConsumption: 3,
      techDisruption: 4, regulatoryRisk: 3, managementQuality: 5,
      inUserCircle: false, cyclical: false, consensusBullish: true, intendedHoldYears: 5,
      userBuyReason: "AI 时代核心受益者",
    },
  },
  {
    id: "byd-now",
    title: "比亚迪 BYD",
    emojiTag: "🔋",
    hook: "新能源车下行周期 · 回撤 35%",
    context: "新能源车需求放缓 + 价格战。冯柳的弱者体系场景？还是张坤的重资产警告？陪审团分歧严重。",
    input: {
      ticker: "002594", name: "比亚迪 BYD", industry: "新能源车",
      briefBusiness: "新能源车整车 + 电池一体化",
      pe: 15, pb: 2.4, roe: 0.18, grossMargin: 0.21, netMargin: 0.06, fcfMargin: 0.05,
      debtToAsset: 0.7, dividendYield: 0.013, yearsListed: 15, capexRatio: 0.18,
      monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1,
      techDisruption: 3, regulatoryRisk: 2, managementQuality: 4,
      inUserCircle: true, cyclical: true, oversoldRecently: true, recentDrawdown: 0.35,
      consensusBullish: false, intendedHoldYears: 5,
      userBuyReason: "新能源车第一龙头被周期错杀",
    },
  },
  {
    id: "pdd-now",
    title: "拼多多 PDD",
    emojiTag: "🛍️",
    hook: "TEMU 海外争议 · 跌 50%",
    context: "TEMU 海外扩张引发监管担忧 + 中概杀估值。利润依然炸裂但市场不信。冯柳左侧抄底案例？",
    input: {
      ticker: "PDD", name: "拼多多 PDD", industry: "电商 + 跨境",
      briefBusiness: "国内主站 + TEMU 海外低价电商",
      pe: 11, pb: 4.5, roe: 0.32, grossMargin: 0.62, netMargin: 0.27, fcfMargin: 0.32,
      debtToAsset: 0.4, yearsListed: 7, capexRatio: 0.02,
      monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 4,
      techDisruption: 2, regulatoryRisk: 4, managementQuality: 4,
      inUserCircle: true, cyclical: false, oversoldRecently: true, recentDrawdown: 0.5,
      consensusBullish: false, catalystVisible: true, intendedHoldYears: 3,
      userBuyReason: "PE 11 倍 + ROE 32% + 跌 50%——价值派最爱",
    },
  },
  {
    id: "sugon-now",
    title: "中科曙光",
    emojiTag: "🤖",
    hook: "AI 服务器国产替代 · 概念股",
    context: "AI 算力国产化政策受益 + 新概念追捧。PE 62 但 ROE 13%。陪审团 4 票 F——典型故事股？",
    input: {
      ticker: "603019", name: "中科曙光", industry: "AI 服务器",
      briefBusiness: "国产 AI 服务器 + 算力基础设施",
      pe: 62, pb: 7.8, roe: 0.13, grossMargin: 0.27, netMargin: 0.09, fcfMargin: 0.04,
      debtToAsset: 0.42, yearsListed: 11, capexRatio: 0.12,
      monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 2,
      techDisruption: 3, regulatoryRisk: 3, managementQuality: 3,
      inUserCircle: false, cyclical: false, consensusBullish: true, intendedHoldYears: 3,
      userBuyReason: "国产替代政策红利",
    },
  },
];
