// Leaderboard 候选池 — 陪审团对这些 A 股龙头排行
// 每只股票带上"指纹特征"：roe / fcfMargin / 品牌 / 垄断 / 增长 / 周期 / 监管风险 …
// 这样每位大佬的方法论会给出不同的 Top 5（不再千股千面）

import type { CaseInput } from "@/types";

export interface LeaderboardEntry {
  code: string;
  category: string;
  // 财务指纹（用于评分引擎，PE/PB 由实时 API 注入）
  roe?: number;
  fcfMargin?: number;
  netMargin?: number;
  grossMargin?: number;
  divYield?: number;
  // 商业模式指纹
  monopolyLevel?: 1 | 2 | 3 | 4 | 5;
  brandStrength?: 1 | 2 | 3 | 4 | 5;
  consumerStickiness?: 1 | 2 | 3 | 4 | 5;
  repeatedConsumption?: 1 | 2 | 3 | 4 | 5;
  techDisruption?: 1 | 2 | 3 | 4 | 5;
  regulatoryRisk?: 1 | 2 | 3 | 4 | 5;
  managementQuality?: 1 | 2 | 3 | 4 | 5;
  cyclical?: boolean;
  yearsListed?: number;
  // 大佬画像加成
  growthArchetype?: "stable" | "growth" | "cyclical" | "turnaround" | "blackHorse";
}

export const LEADERBOARD_POOL: LeaderboardEntry[] = [
  // ==================== 白酒（高ROE+高FCF+高品牌：李录/景林偏好） ====================
  { code: "600519", category: "白酒", roe: 0.32, fcfMargin: 0.50, netMargin: 0.52, grossMargin: 0.92, divYield: 0.018,
    monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 4, techDisruption: 1,
    regulatoryRisk: 3, managementQuality: 5, cyclical: false, yearsListed: 24, growthArchetype: "stable" }, // 茅台
  { code: "000858", category: "白酒", roe: 0.25, fcfMargin: 0.35, netMargin: 0.36, grossMargin: 0.78, divYield: 0.038,
    monopolyLevel: 4, brandStrength: 5, consumerStickiness: 4, repeatedConsumption: 4, techDisruption: 1,
    regulatoryRisk: 3, managementQuality: 4, cyclical: false, yearsListed: 26, growthArchetype: "stable" }, // 五粮液
  { code: "600809", category: "白酒", roe: 0.35, fcfMargin: 0.28, netMargin: 0.32, grossMargin: 0.75, divYield: 0.022,
    monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 3, techDisruption: 1,
    regulatoryRisk: 3, managementQuality: 4, cyclical: false, yearsListed: 31, growthArchetype: "growth" }, // 山西汾酒
  { code: "000568", category: "白酒", roe: 0.30, fcfMargin: 0.32, netMargin: 0.40, grossMargin: 0.86, divYield: 0.040,
    monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 3, techDisruption: 1,
    regulatoryRisk: 3, managementQuality: 4, cyclical: false, yearsListed: 30, growthArchetype: "stable" }, // 泸州老窖
  { code: "002304", category: "白酒", roe: 0.18, fcfMargin: 0.22, netMargin: 0.30, grossMargin: 0.74, divYield: 0.055,
    monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 3, techDisruption: 1,
    regulatoryRisk: 3, managementQuality: 3, cyclical: false, yearsListed: 16, growthArchetype: "turnaround" }, // 洋河（管我财喜欢逆向）

  // ==================== 食品（消费品牌，景林/段永平最爱） ====================
  { code: "603288", category: "食品", roe: 0.28, fcfMargin: 0.30, netMargin: 0.25, grossMargin: 0.38, divYield: 0.022,
    monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 5, techDisruption: 1,
    regulatoryRisk: 2, managementQuality: 4, cyclical: false, yearsListed: 11, growthArchetype: "stable" }, // 海天
  { code: "600887", category: "食品", roe: 0.22, fcfMargin: 0.18, netMargin: 0.09, grossMargin: 0.32, divYield: 0.038,
    monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 5, techDisruption: 1,
    regulatoryRisk: 2, managementQuality: 4, cyclical: false, yearsListed: 30, growthArchetype: "stable" }, // 伊利
  { code: "603899", category: "文教", roe: 0.20, fcfMargin: 0.10, netMargin: 0.10, grossMargin: 0.27, divYield: 0.014,
    monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 4, techDisruption: 2,
    regulatoryRisk: 2, managementQuality: 4, cyclical: false, yearsListed: 10, growthArchetype: "growth" }, // 晨光

  // ==================== 中药/医药（高壁垒+稀缺，李录偏爱） ====================
  { code: "600436", category: "中药", roe: 0.25, fcfMargin: 0.20, netMargin: 0.28, grossMargin: 0.45, divYield: 0.005,
    monopolyLevel: 5, brandStrength: 5, consumerStickiness: 4, repeatedConsumption: 4, techDisruption: 1,
    regulatoryRisk: 3, managementQuality: 4, cyclical: false, yearsListed: 22, growthArchetype: "stable" }, // 片仔癀（国家保密配方）
  { code: "000538", category: "中药", roe: 0.12, fcfMargin: 0.10, netMargin: 0.10, grossMargin: 0.31, divYield: 0.025,
    monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 3, techDisruption: 2,
    regulatoryRisk: 3, managementQuality: 3, cyclical: false, yearsListed: 32, growthArchetype: "stable" }, // 云南白药
  { code: "600276", category: "医药", roe: 0.15, fcfMargin: 0.10, netMargin: 0.20, grossMargin: 0.85, divYield: 0.005,
    monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 4, techDisruption: 4,
    regulatoryRisk: 4, managementQuality: 4, cyclical: false, yearsListed: 24, growthArchetype: "growth" }, // 恒瑞医药（创新药技术替代风险）

  // ==================== 家电（段永平本行 + 管我财股息派） ====================
  { code: "000333", category: "家电", roe: 0.22, fcfMargin: 0.13, netMargin: 0.10, grossMargin: 0.27, divYield: 0.045,
    monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 3,
    regulatoryRisk: 2, managementQuality: 5, cyclical: false, yearsListed: 12, growthArchetype: "stable" }, // 美的
  { code: "000651", category: "家电", roe: 0.28, fcfMargin: 0.18, netMargin: 0.13, grossMargin: 0.30, divYield: 0.062,
    monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 3,
    regulatoryRisk: 2, managementQuality: 4, cyclical: true, yearsListed: 26, growthArchetype: "turnaround" }, // 格力
  { code: "600690", category: "家电", roe: 0.18, fcfMargin: 0.12, netMargin: 0.07, grossMargin: 0.30, divYield: 0.035,
    monopolyLevel: 3, brandStrength: 4, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 3,
    regulatoryRisk: 2, managementQuality: 4, cyclical: false, yearsListed: 31, growthArchetype: "growth" }, // 海尔

  // ==================== 银行/保险（高股息低估值，管我财/邓晓峰最爱） ====================
  { code: "600036", category: "银行", roe: 0.16, fcfMargin: 0.30, netMargin: 0.42, grossMargin: 1.0, divYield: 0.058,
    monopolyLevel: 4, brandStrength: 3, consumerStickiness: 4, repeatedConsumption: 1, techDisruption: 2,
    regulatoryRisk: 5, managementQuality: 5, cyclical: true, yearsListed: 23, growthArchetype: "stable" }, // 招行
  { code: "601318", category: "保险", roe: 0.12, fcfMargin: 0.05, netMargin: 0.08, grossMargin: 0.20, divYield: 0.060,
    monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 2,
    regulatoryRisk: 5, managementQuality: 3, cyclical: true, yearsListed: 17, growthArchetype: "turnaround" }, // 平安
  { code: "601398", category: "银行", roe: 0.11, fcfMargin: 0.20, netMargin: 0.40, grossMargin: 1.0, divYield: 0.078,
    monopolyLevel: 4, brandStrength: 3, consumerStickiness: 4, repeatedConsumption: 1, techDisruption: 1,
    regulatoryRisk: 5, managementQuality: 3, cyclical: true, yearsListed: 18, growthArchetype: "stable" }, // 工行（最高股息）

  // ==================== 新能源/汽车（王亚伟黑马派 + 风和成长派） ====================
  { code: "300750", category: "新能源", roe: 0.25, fcfMargin: 0.15, netMargin: 0.13, grossMargin: 0.24, divYield: 0.012,
    monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 4,
    regulatoryRisk: 3, managementQuality: 4, cyclical: true, yearsListed: 7, growthArchetype: "growth" }, // 宁德
  { code: "002594", category: "汽车", roe: 0.22, fcfMargin: 0.10, netMargin: 0.05, grossMargin: 0.20, divYield: 0.008,
    monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 4,
    regulatoryRisk: 3, managementQuality: 5, cyclical: true, yearsListed: 14, growthArchetype: "blackHorse" }, // 比亚迪
  { code: "601012", category: "新能源", roe: 0.05, fcfMargin: -0.10, netMargin: -0.08, grossMargin: 0.13, divYield: 0.000,
    monopolyLevel: 3, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 5,
    regulatoryRisk: 3, managementQuality: 3, cyclical: true, yearsListed: 12, growthArchetype: "cyclical" }, // 隆基（亏损）

  // ==================== 软件/AI（技术快速变化） ====================
  { code: "002230", category: "软件", roe: 0.06, fcfMargin: 0.05, netMargin: 0.04, grossMargin: 0.40, divYield: 0.001,
    monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 2, techDisruption: 5,
    regulatoryRisk: 3, managementQuality: 3, cyclical: false, yearsListed: 16, growthArchetype: "blackHorse" }, // 科大讯飞
  { code: "600570", category: "软件", roe: 0.18, fcfMargin: 0.20, netMargin: 0.20, grossMargin: 0.97, divYield: 0.005,
    monopolyLevel: 4, brandStrength: 4, consumerStickiness: 5, repeatedConsumption: 2, techDisruption: 3,
    regulatoryRisk: 4, managementQuality: 4, cyclical: false, yearsListed: 22, growthArchetype: "growth" }, // 恒生电子（金融IT垄断）

  // ==================== 其他龙头 ====================
  { code: "601888", category: "消费", roe: 0.15, fcfMargin: 0.15, netMargin: 0.10, grossMargin: 0.30, divYield: 0.012,
    monopolyLevel: 5, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 2, techDisruption: 2,
    regulatoryRisk: 4, managementQuality: 4, cyclical: false, yearsListed: 16, growthArchetype: "growth" }, // 中免
  { code: "603501", category: "半导体", roe: 0.08, fcfMargin: 0.05, netMargin: 0.03, grossMargin: 0.27, divYield: 0.002,
    monopolyLevel: 3, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 5,
    regulatoryRisk: 4, managementQuality: 4, cyclical: true, yearsListed: 8, growthArchetype: "blackHorse" }, // 韦尔股份
];

// 行业默认值（兜底，当 entry 没填时）
export const SCAN_INDUSTRY_DEFAULTS: Record<string, Partial<CaseInput>> = {
  白酒: { monopolyLevel: 4, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 4, techDisruption: 1 },
  食品: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 5, techDisruption: 1 },
  中药: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 4, techDisruption: 1 },
  医药: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 4, techDisruption: 4, regulatoryRisk: 4 },
  家电: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 3 },
  银行: { monopolyLevel: 4, brandStrength: 3, consumerStickiness: 4, regulatoryRisk: 5, cyclical: true },
  保险: { monopolyLevel: 3, brandStrength: 3, regulatoryRisk: 5 },
  新能源: { monopolyLevel: 3, brandStrength: 3, techDisruption: 4, cyclical: true },
  汽车: { monopolyLevel: 3, brandStrength: 3, techDisruption: 4, cyclical: true },
  软件: { monopolyLevel: 3, brandStrength: 3, techDisruption: 4, regulatoryRisk: 3 },
  消费: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 3 },
  半导体: { monopolyLevel: 4, brandStrength: 4, techDisruption: 5 },
  文教: { monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 4, techDisruption: 2 },
};
