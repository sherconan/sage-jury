// 市场全景扫描配置 — /market 页面会用 lookup API 实时跑这些代码
export interface MarketWatch {
  code: string;
  hint?: string;
  category: string;
}

export const MARKET_WATCHLIST: MarketWatch[] = [
  // 白酒 / 食品饮料
  { code: "600519", hint: "高端白酒龙头", category: "白酒" },
  { code: "000858", hint: "次高端白酒", category: "白酒" },
  { code: "600809", hint: "山西汾酒", category: "白酒" },
  // 家电
  { code: "000333", hint: "美的集团 · 全球家电", category: "家电" },
  { code: "000651", hint: "格力电器", category: "家电" },
  // 医药
  { code: "600436", hint: "片仔癀 · 中药稀缺", category: "中药" },
  { code: "000538", hint: "云南白药", category: "中药" },
  // 银行 / 保险
  { code: "600036", hint: "招商银行", category: "银行" },
  { code: "601318", hint: "中国平安", category: "保险" },
  // 新能源
  { code: "300750", hint: "宁德时代", category: "新能源" },
  { code: "002594", hint: "比亚迪", category: "汽车" },
  { code: "601012", hint: "隆基绿能", category: "新能源" },
];
