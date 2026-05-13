// lib/sage/stock_tools.ts
// v60.8.2: 抽自 app/api/chat/stream/route.ts，给 v2 endpoint 复用。
// 不再让 LLM 调工具——Python 端主动调，结果送给 LLM 写 voice。
//
// 覆盖：A 股 / 港股 / 美股（美股部分用 Stooq 兜底）

// ============ Ticker 识别 ============

export const NAME_TO_TICKER: Record<string, string> = {
  // A 股
  "茅台": "600519", "贵州茅台": "600519", "五粮液": "000858", "汾酒": "600809",
  "泸州老窖": "000568", "洋河": "002304", "海天": "603288", "海天味业": "603288",
  "伊利": "600887", "片仔癀": "600436", "云南白药": "000538", "恒瑞": "600276",
  "美的": "000333", "格力": "000651", "海尔": "600690", "招行": "600036", "招商银行": "600036",
  "平安": "601318", "工行": "601398", "工商银行": "601398", "宁德时代": "300750",
  "比亚迪": "002594", "隆基": "601012", "中免": "601888", "神华": "601088", "中国神华": "601088",
  "海康": "002415", "中石油": "601857", "万华": "600309",
  // 港股
  "腾讯": "00700", "腾讯控股": "00700",
  "泡泡玛特": "09992", "美团": "03690", "美团-W": "03690", "京东": "09618",
  "阿里": "09988", "阿里巴巴": "09988", "小米": "01810", "小米集团": "01810",
  "中国移动": "00941", "中海油": "00883",
  "建设银行": "00939", "工商银行 H": "01398", "招商银行 H": "03968",
  "中国神华 H": "01088", "中国燃气": "00384", "北京控股": "00392",
  "联邦制药": "03933", "江南布衣": "03306", "首都机场": "00694",
  "惠理集团": "00806", "中国石化 H": "00386",
};

// 美股映射（v60.8.2 新增）
export const NAME_TO_US: Record<string, string> = {
  "苹果": "AAPL", "Apple": "AAPL",
  "特斯拉": "TSLA", "Tesla": "TSLA",
  "英伟达": "NVDA", "Nvidia": "NVDA",
  "网易": "NTES", "NetEase": "NTES",
  "拼多多": "PDD", "PDD": "PDD",
  "亚马逊": "AMZN", "Amazon": "AMZN",
  "Meta": "META", "Facebook": "META",
  "谷歌": "GOOGL", "Google": "GOOGL",
  "微软": "MSFT", "Microsoft": "MSFT",
  "伯克希尔": "BRK.B",
};

export interface Ticker {
  code: string;
  secid: string;
  name: string;
  market: 'A' | 'HK' | 'US';
}

function isHKCode(code: string): boolean {
  return /^0\d{4}$/.test(code) || code === "9992" || code === "00700" || code === "03306";
}

function calcSecid(code: string): string {
  if (isHKCode(code) || code.length === 5) return `116.${code.padStart(5, "0")}`;
  if (code.startsWith("6") || code.startsWith("9")) return `1.${code}`;
  return `0.${code}`;
}

export function resolveTicker(input: string): Ticker | null {
  const v = input.trim();
  // 美股代码（大写英文）
  if (/^[A-Z]{1,5}(\.[A-Z])?$/.test(v)) {
    return { code: v, secid: `105.${v}`, name: v, market: 'US' };
  }
  // A/HK 代码（数字）
  if (/^\d{4,6}$/.test(v)) {
    const code = v.length === 6 ? v : v.padStart(5, "0");
    const market: 'A' | 'HK' = v.length === 6 ? 'A' : 'HK';
    return { code, secid: calcSecid(code), name: code, market };
  }
  // 中文名优先匹配美股（"苹果" → AAPL，不是 A 股）
  for (const [n, c] of Object.entries(NAME_TO_US)) {
    if (v.includes(n) || n === v) {
      return { code: c, secid: `105.${c}`, name: n, market: 'US' };
    }
  }
  // 中文名匹配 A/HK
  for (const [n, c] of Object.entries(NAME_TO_TICKER)) {
    if (v.includes(n) || n === v) {
      const market: 'A' | 'HK' = isHKCode(c) || c.length === 5 ? 'HK' : 'A';
      return { code: c, secid: calcSecid(c), name: n, market };
    }
  }
  return null;
}

// ============ 多市场行情/财务 fetch ============

export interface StockFactsTyped {
  ticker: Ticker;
  // 行情
  price?: number;
  change_today_pct?: number;
  market_cap_billion?: number;
  // 估值
  pe_ttm?: number;
  pb_mrq?: number;
  dividend_yield_pct?: number;
  // 历史分位（A 股）
  pe_pct_5y?: number;
  pe_pct_10y?: number;
  // 财务（最近一年）
  revenue_billion?: number;
  net_income_billion?: number;
  roe_pct?: number;
  gross_margin_pct?: number;
  // 派息
  dividend_history?: { year: string; payout_yuan: number }[];
  // 数据来源
  source: string[];
  errors: string[];
}

const FETCH_TIMEOUT = 8000;
const safeNum = (n: any): number | undefined => typeof n === "number" && !isNaN(n) ? n : undefined;

// === A 股 / 港股: eastmoney push2 ===
async function fetchEastmoneyQuote(t: Ticker): Promise<Partial<StockFactsTyped>> {
  try {
    const u = `https://push2.eastmoney.com/api/qt/stock/get?secid=${t.secid}&fields=f43,f57,f58,f116,f117,f162,f167,f168,f170`;
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) return { errors: [`eastmoney quote ${r.status}`] };
    const d: any = (await r.json()).data;
    if (!d?.f43) return { errors: ["eastmoney no data"] };
    const div100 = (n: any) => safeNum(n) !== undefined ? n / 100 : undefined;
    return {
      price: div100(d.f43),
      pe_ttm: div100(d.f162),
      pb_mrq: div100(d.f167),
      dividend_yield_pct: div100(d.f168),
      change_today_pct: div100(d.f170),
      market_cap_billion: typeof d.f116 === 'number' ? d.f116 / 1e8 : undefined,
      source: [`eastmoney/${t.market}`],
    };
  } catch (e: any) { return { errors: [`eastmoney ${e.message}`] }; }
}

// === A 股: PE 历史分位 ===
async function fetchAPePct(code: string): Promise<Partial<StockFactsTyped>> {
  try {
    const u = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=PE_TTM_5YEARS_PCT,PE_TTM_10YEARS_PCT&filter=(SECURITY_CODE%3D%22${code}%22)&pageSize=1`;
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) return {};
    const j: any = await r.json();
    const row = j?.result?.data?.[0];
    if (!row) return {};
    return { pe_pct_5y: row.PE_TTM_5YEARS_PCT, pe_pct_10y: row.PE_TTM_10YEARS_PCT };
  } catch { return {}; }
}

// === A 股: 财务核心指标 ===
async function fetchAFinancials(code: string): Promise<Partial<StockFactsTyped>> {
  try {
    const market = code.startsWith("6") ? "SH" : "SZ";
    const u = `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/PCWebMainTargetCNew?code=${market}${code}&type=0`;
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://emweb.securities.eastmoney.com/" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) return {};
    const j: any = await r.json();
    const rows: any[] = j?.data || [];
    const yearly = rows.filter(x => x.REPORT_DATE?.endsWith("12-31")).slice(0, 1);
    if (!yearly.length) return {};
    const y = yearly[0];
    return {
      revenue_billion: y.TOTAL_OPERATE_INCOME ? y.TOTAL_OPERATE_INCOME / 1e8 : undefined,
      net_income_billion: y.PARENT_NETPROFIT ? y.PARENT_NETPROFIT / 1e8 : undefined,
      roe_pct: y.ROE_AVG,
      gross_margin_pct: y.GROSS_PROFIT_RATIO,
    };
  } catch { return {}; }
}

// === 港股: F10 财务 ===
async function fetchHKFinancials(code: string): Promise<Partial<StockFactsTyped>> {
  try {
    const u = `https://emweb.securities.eastmoney.com/PC_HKF10/FinancialAnalysis/PageAjax?code=${code}`;
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://emweb.securities.eastmoney.com/" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) return {};
    const j: any = await r.json();
    const yo: any = j?.zyzbAccountingPeriodList?.[0];
    if (!yo) return {};
    return {
      revenue_billion: typeof yo.OPERATING_REVENUE === 'number' ? yo.OPERATING_REVENUE / 1e8 : undefined,
      net_income_billion: typeof yo.HOLDER_PROFIT === 'number' ? yo.HOLDER_PROFIT / 1e8 : undefined,
      roe_pct: typeof yo.ROE_AVG === 'number' ? yo.ROE_AVG : undefined,
      gross_margin_pct: typeof yo.GROSS_PROFIT_RATIO === 'number' ? yo.GROSS_PROFIT_RATIO : undefined,
    };
  } catch { return {}; }
}

// === 美股: Sina hq.sinajs.cn/list=gb_xxx — 字段 14 = PE TTM, 字段 13 = EPS ===
async function fetchUSSina(symbol: string): Promise<Partial<StockFactsTyped>> {
  try {
    const u = `https://hq.sinajs.cn/list=gb_${symbol.toLowerCase()}`;
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://finance.sina.com.cn/" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) return { errors: [`sina-us ${r.status}`] };
    const txt = await r.text();
    const m = txt.match(/var hq_str_gb_[a-z]+="([^"]+)"/i);
    if (!m) return { errors: ["sina-us no match"] };
    const f = m[1].split(",");
    if (f.length < 15) return { errors: ["sina-us fields short"] };
    const eps = parseFloat(f[13]);
    const pe = parseFloat(f[14]);
    const price = parseFloat(f[1]);
    return {
      price: isFinite(price) ? price : undefined,
      pe_ttm: isFinite(pe) && pe > 0 ? pe : undefined,
      source: ["sina-us"],
      errors: [],
    };
  } catch (e: any) { return { errors: [`sina-us ${e.message}`] }; }
}

// === 美股: Stooq fallback ===
async function fetchUSStooq(symbol: string): Promise<Partial<StockFactsTyped>> {
  try {
    const u = `https://stooq.com/q/l/?s=${symbol.toLowerCase()}.us&f=sd2t2ohlcvn&h&e=csv`;
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) return { errors: [`stooq ${r.status}`] };
    const txt = await r.text();
    const lines = txt.trim().split("\n");
    if (lines.length < 2) return { errors: ["stooq no data"] };
    const cols = lines[1].split(",");
    const close = parseFloat(cols[6]);
    return { price: isNaN(close) ? undefined : close, source: ["stooq"] };
  } catch (e: any) { return { errors: [`stooq ${e.message}`] }; }
}

// === 美股: Bocha web_search 提取 PE/ROE 等（用于补 stooq 不足）===
async function fetchUSBocha(symbol: string, name: string): Promise<Partial<StockFactsTyped>> {
  const BOCHA_KEY = process.env.BOCHA_API_KEY || "***BOCHA_KEY_REMOVED***";
  try {
    const q = `${name} ${symbol} PE ratio dividend yield ROE TTM`;
    const r = await fetch("https://api.bochaai.com/v1/web-search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${BOCHA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: q, count: 3 }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!r.ok) return { errors: [`bocha ${r.status}`] };
    const j: any = await r.json();
    // 解析 webPages 里 snippet 找 PE
    const snippets: string[] = (j?.data?.webPages?.value || []).map((p: any) => p.snippet || "").join(" ").split(/[。.,;]/);
    const pe = snippets.find(s => /P\/E|PE\s*\(?TTM/i.test(s));
    const dy = snippets.find(s => /dividend yield/i.test(s));
    // 极简正则提数字
    const m_pe = pe?.match(/(\d+(?:\.\d+)?)\s*(?:倍|x|×|times)?/i);
    const m_dy = dy?.match(/(\d+(?:\.\d+)?)\s*%/);
    return {
      pe_ttm: m_pe ? parseFloat(m_pe[1]) : undefined,
      dividend_yield_pct: m_dy ? parseFloat(m_dy[1]) : undefined,
      source: ["bocha-web"],
    };
  } catch (e: any) { return { errors: [`bocha ${e.message}`] }; }
}

// === Orchestrator: 按市场并行调用最佳数据源 ===
export async function gatherFacts(t: Ticker): Promise<StockFactsTyped> {
  const base: StockFactsTyped = { ticker: t, source: [], errors: [] };
  if (t.market === 'A') {
    const [quote, peP, fin] = await Promise.all([
      fetchEastmoneyQuote(t),
      fetchAPePct(t.code),
      fetchAFinancials(t.code),
    ]);
    return { ...base, ...quote, ...peP, ...fin,
      source: [...(quote.source || []), ...(peP.source || []), ...(fin.source || [])],
      errors: [...(quote.errors || []), ...(peP.errors || []), ...(fin.errors || [])] };
  }
  if (t.market === 'HK') {
    const [quote, fin] = await Promise.all([
      fetchEastmoneyQuote(t),
      fetchHKFinancials(t.code),
    ]);
    return { ...base, ...quote, ...fin,
      source: [...(quote.source || []), ...(fin.source || [])],
      errors: [...(quote.errors || []), ...(fin.errors || [])] };
  }
  // US: 多源融合（v60.8.6 加 sina hq.sinajs.cn 拿 PE TTM）
  const [sina, eastmoneyUS, stooq, bocha] = await Promise.all([
    fetchUSSina(t.code),       // ⭐ sina gb_aapl 端口拿 PE TTM (字段 14)
    fetchEastmoneyQuote(t),     // eastmoney 105.XXX 拿 PB/股息/市值/今日涨幅
    fetchUSStooq(t.code),       // stooq 兜底 price
    fetchUSBocha(t.code, t.name), // Bocha web search 兜底 PE
  ]);
  const merged: Partial<StockFactsTyped> = {
    price: sina.price ?? eastmoneyUS.price ?? stooq.price,
    pe_ttm: sina.pe_ttm ?? ((eastmoneyUS.pe_ttm && eastmoneyUS.pe_ttm > 0) ? eastmoneyUS.pe_ttm : bocha.pe_ttm),
    pb_mrq: eastmoneyUS.pb_mrq,
    dividend_yield_pct: eastmoneyUS.dividend_yield_pct,
    market_cap_billion: eastmoneyUS.market_cap_billion,
    change_today_pct: eastmoneyUS.change_today_pct,
  };
  return { ...base, ...merged,
    source: [...(sina.source || []), ...(eastmoneyUS.source || []), ...(stooq.source || []), ...(bocha.source || [])],
    errors: [...(sina.errors || []), ...(eastmoneyUS.errors || []), ...(stooq.errors || []), ...(bocha.errors || [])] };
}
