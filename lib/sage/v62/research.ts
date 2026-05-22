// lib/sage/v62/research.ts
// v62 Layer 1 数据层 —— 把一家公司"研究"成多年、多维度的研究档案（ResearchDossier）。
//
// A股数据源（均为活接口，2026-05 实测验证）：
//   - push2.eastmoney.com                         实时价 + 总市值
//   - datacenter RPT_VALUEANALYSIS_DET            PE_TTM / PB_MRQ / PS_TTM / PCF_OCF_TTM
//   - datacenter RPT_F10_FINANCE_MAINFINADATA     10 年 × 165 字段财务（年报）
//
// ⚠️ 旧 PC_HSF10 的 F10 接口（PCWebMainTargetCNew 等）已被东财 302 改版废弃，勿用。
// v62 第一版只做 A 股深度档案；港股/美股返回薄档案，待后续接入。

import type { Ticker } from "../stock_tools";

const TIMEOUT = 9000;
const UA = "Mozilla/5.0";
const num = (v: any): number | null => (typeof v === "number" && isFinite(v) ? v : null);

// 单年财务切片
export interface YearlyFin {
  year: string;
  revenue: number;             // 营收（亿元）
  netProfit: number;           // 归母净利（亿元）
  revenueYoY: number | null;   // 营收同比 %
  netProfitYoY: number | null; // 净利同比 %
  roe: number | null;          // 加权 ROE %
  roic: number | null;         // ROIC %
  grossMargin: number | null;  // 销售毛利率 %
  netMargin: number | null;    // 销售净利率 %
  debtRatio: number | null;    // 资产负债率 %
  opCashflowPS: number | null; // 每股经营现金流（元）
}

// 一份完整的公司研究档案
export interface ResearchDossier {
  ticker: { code: string; name: string; market: "A" | "HK" | "US" };
  asOf: string;
  // 实时
  price?: number;
  marketCapBillion?: number;
  // 估值
  peTTM?: number;
  pbMRQ?: number;
  psTTM?: number;
  pcfTTM?: number;
  // 多年财务（最近年报在前，最多 10 年）
  yearly: YearlyFin[];
  // 数据层算出的客观派生事实（不是 sage 判断）
  revenueCAGR3?: number;       // 近 3 年营收复合增速 %
  revenueCAGR5?: number;       // 近 5 年营收复合增速 %
  netProfitCAGR5?: number;     // 近 5 年净利复合增速 %
  grossMarginTrend?: "rising" | "stable" | "falling";
  roeAvg5?: number;            // 近 5 年平均 ROE %
  earningsYield?: number;      // 盈利收益率 = 1/PE %
  depth: "full" | "thin";      // full = A股深度档案，thin = 仅实时行情
  source: string[];
  errors: string[];
}

// --- push2 实时行情 ---
async function fetchQuote(secid: string): Promise<{ price?: number; mktcap?: number; err?: string }> {
  try {
    const u = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f116`;
    const r = await fetch(u, {
      headers: { "User-Agent": UA, Referer: "https://quote.eastmoney.com/" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) return { err: `push2 ${r.status}` };
    const d: any = (await r.json())?.data;
    if (!d) return { err: "push2 no data" };
    return {
      price: num(d.f43) != null ? d.f43 / 100 : undefined,
      mktcap: num(d.f116) != null ? d.f116 / 1e8 : undefined,
    };
  } catch (e: any) { return { err: `push2 ${e.message}` }; }
}

// --- datacenter 估值 ---
async function fetchValuation(code: string): Promise<{ peTTM?: number; pbMRQ?: number; psTTM?: number; pcfTTM?: number; err?: string }> {
  try {
    const u = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=PE_TTM,PB_MRQ,PS_TTM,PCF_OCF_TTM&filter=(SECURITY_CODE%3D%22${code}%22)&pageSize=1`;
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return { err: `valuation ${r.status}` };
    const row: any = (await r.json())?.result?.data?.[0];
    if (!row) return { err: "valuation no data" };
    return {
      peTTM: num(row.PE_TTM) ?? undefined,
      pbMRQ: num(row.PB_MRQ) ?? undefined,
      psTTM: num(row.PS_TTM) ?? undefined,
      pcfTTM: num(row.PCF_OCF_TTM) ?? undefined,
    };
  } catch (e: any) { return { err: `valuation ${e.message}` }; }
}

// --- datacenter 10 年财务 ---
async function fetchFinancials(secucode: string): Promise<{ yearly: YearlyFin[]; err?: string }> {
  try {
    const u = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=ALL&filter=(SECUCODE%3D%22${secucode}%22)&pageSize=50&sortColumns=REPORT_DATE&sortTypes=-1`;
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return { yearly: [], err: `financials ${r.status}` };
    const rows: any[] = (await r.json())?.result?.data || [];
    const annual = rows.filter((x) => x.REPORT_TYPE === "年报").slice(0, 10);
    const yearly: YearlyFin[] = annual.map((y) => ({
      year: String(y.REPORT_DATE || "").slice(0, 4),
      revenue: (num(y.TOTALOPERATEREVE) ?? 0) / 1e8,
      netProfit: (num(y.PARENTNETPROFIT) ?? 0) / 1e8,
      revenueYoY: num(y.TOTALOPERATEREVETZ),
      netProfitYoY: num(y.PARENTNETPROFITTZ),
      roe: num(y.ROEJQ),
      roic: num(y.ROIC),
      grossMargin: num(y.XSMLL),
      netMargin: num(y.XSJLL),
      debtRatio: num(y.ZCFZL),
      opCashflowPS: num(y.MGJYXJJE),
    }));
    return { yearly };
  } catch (e: any) { return { yearly: [], err: `financials ${e.message}` }; }
}

// --- US push2 实时价（f43 美股是 ×1000，与 A 股 ×100 不同；2026-05-22 实测）---
async function fetchQuoteUS(secid: string): Promise<{ price?: number; mktcap?: number; err?: string }> {
  try {
    const u = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f116`;
    const r = await fetch(u, {
      headers: { "User-Agent": UA, Referer: "https://quote.eastmoney.com/" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) return { err: `push2-us ${r.status}` };
    const d: any = (await r.json())?.data;
    if (!d) return { err: "push2-us no data" };
    return {
      price: num(d.f43) != null ? d.f43 / 1000 : undefined,
      mktcap: num(d.f116) != null ? d.f116 / 1e8 : undefined, // 亿美元
    };
  } catch (e: any) { return { err: `push2-us ${e.message}` }; }
}

// --- US datacenter 单字段查询（row-store schema，一字段一 query）---
// 美股 RPT_USF10_FN_* 接口是「行存」：每个 STD_ITEM_CODE 一行 × 多年。
// 与 A 股 RPT_F10_FINANCE_MAINFINADATA 一行多列不同，必须按字段并发查。
async function fetchUSItem(
  table: "INCOME" | "BALANCE",
  stdCode: string,
  secucode: string
): Promise<Array<{ year: string; amount: number }>> {
  try {
    const u = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_USF10_FN_${table}&columns=REPORT_DATE,AMOUNT&filter=(SECUCODE%3D%22${secucode}%22)(REPORT_TYPE%3D%22%E5%B9%B4%E6%8A%A5%22)(STD_ITEM_CODE%3D%22${stdCode}%22)&pageSize=15&sortColumns=REPORT_DATE&sortTypes=-1`;
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return [];
    const rows: any[] = (await r.json())?.result?.data || [];
    return rows
      .map((x) => ({ year: String(x.REPORT_DATE || "").slice(0, 4), amount: num(x.AMOUNT) ?? 0 }))
      .filter((x) => x.year);
  } catch { return []; }
}

// --- US 10 年财务（4 字段并发：营收/净利/毛利/股东权益）---
// STD_ITEM_CODE 字典（2026-05-22 实测验证 AAPL/NVDA）：
//   INCOME  004001001 = 主营收入
//   INCOME  004013999 = 净利润
//   INCOME  004005999 = 毛利
//   BALANCE 004013999 = 归属于母公司股东权益
// ROE / 毛利率 / 净利率 / YoY 自算；资产负债率 / 现金流 datacenter US 接口未暴露，留 null。
async function fetchUSFinancials(secucode: string): Promise<{ yearly: YearlyFin[]; err?: string }> {
  try {
    const [rev, np, gp, eq] = await Promise.all([
      fetchUSItem("INCOME", "004001001", secucode),
      fetchUSItem("INCOME", "004013999", secucode),
      fetchUSItem("INCOME", "004005999", secucode),
      fetchUSItem("BALANCE", "004013999", secucode),
    ]);
    if (!rev.length) return { yearly: [], err: `US financials no data (${secucode})` };

    const toMap = (arr: Array<{ year: string; amount: number }>) =>
      new Map(arr.map((x) => [x.year, x.amount]));
    const mRev = toMap(rev), mNp = toMap(np), mGp = toMap(gp), mEq = toMap(eq);
    const years = Array.from(mRev.keys()).sort((a, b) => b.localeCompare(a)).slice(0, 12);

    const yearly: YearlyFin[] = years.map((yr, i) => {
      const prev = years[i + 1];
      const r = mRev.get(yr) ?? 0;
      const r_p = prev ? mRev.get(prev) ?? null : null;
      const n = mNp.get(yr) ?? null;
      const n_p = prev ? mNp.get(prev) ?? null : null;
      const g = mGp.get(yr) ?? null;
      const e = mEq.get(yr) ?? null;
      const e_p = prev ? mEq.get(prev) ?? null : null;
      // ROE 用平均权益（期初+期末）/2；首年无期初，退化为期末
      const avgEq = e != null && e_p != null ? (e + e_p) / 2 : e;
      return {
        year: yr,
        revenue: r / 1e8,                                                        // 亿美元
        netProfit: (n ?? 0) / 1e8,                                               // 亿美元
        revenueYoY: r > 0 && r_p && r_p > 0 ? ((r - r_p) / r_p) * 100 : null,
        netProfitYoY: n != null && n_p != null && n_p !== 0 ? ((n - n_p) / Math.abs(n_p)) * 100 : null,
        roe: n != null && avgEq != null && avgEq > 0 ? (n / avgEq) * 100 : null,
        roic: null,
        grossMargin: g != null && r > 0 ? (g / r) * 100 : null,
        netMargin: n != null && r > 0 ? (n / r) * 100 : null,
        debtRatio: null,
        opCashflowPS: null,
      };
    });
    return { yearly };
  } catch (e: any) {
    return { yearly: [], err: `US financials ${e.message}` };
  }
}

// --- HK datacenter 单字段查询（与 US 同 schema，不同 STD_ITEM_CODE 字典）---
// HK schema 字典（2026-05-22 实测验证 POP MART 09992 + 腾讯 00700）：
//   INCOME 004001001 = 营业额（港股术语）
//   INCOME 004007999 = 毛利
//   INCOME 004025002 = 股东应占溢利（即净利，港股术语）
//   BALANCE 004013999 = 归属于母公司股东权益
async function fetchHKItem(
  table: "INCOME" | "BALANCE",
  stdCode: string,
  secucode: string
): Promise<Array<{ year: string; amount: number }>> {
  try {
    const u = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_HKF10_FN_${table}&columns=REPORT_DATE,AMOUNT&filter=(SECUCODE%3D%22${secucode}%22)(REPORT_TYPE%3D%22%E5%B9%B4%E6%8A%A5%22)(STD_ITEM_CODE%3D%22${stdCode}%22)&pageSize=15&sortColumns=REPORT_DATE&sortTypes=-1`;
    const r = await fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) return [];
    const rows: any[] = (await r.json())?.result?.data || [];
    return rows
      .map((x) => ({ year: String(x.REPORT_DATE || "").slice(0, 4), amount: num(x.AMOUNT) ?? 0 }))
      .filter((x) => x.year);
  } catch { return []; }
}

// --- HK 10 年财务（4 字段并发，港股专用 STD_ITEM_CODE）---
async function fetchHKFinancials(secucode: string): Promise<{ yearly: YearlyFin[]; err?: string }> {
  try {
    const [rev, np, gp, eq] = await Promise.all([
      fetchHKItem("INCOME", "004001001", secucode),   // 营业额
      fetchHKItem("INCOME", "004025002", secucode),   // 股东应占溢利（净利）
      fetchHKItem("INCOME", "004007999", secucode),   // 毛利
      fetchHKItem("BALANCE", "004013999", secucode),  // 股东权益
    ]);
    if (!rev.length) return { yearly: [], err: `HK financials no data (${secucode})` };

    const toMap = (arr: Array<{ year: string; amount: number }>) =>
      new Map(arr.map((x) => [x.year, x.amount]));
    const mRev = toMap(rev), mNp = toMap(np), mGp = toMap(gp), mEq = toMap(eq);
    const years = Array.from(mRev.keys()).sort((a, b) => b.localeCompare(a)).slice(0, 12);

    const yearly: YearlyFin[] = years.map((yr, i) => {
      const prev = years[i + 1];
      const r = mRev.get(yr) ?? 0;
      const r_p = prev ? mRev.get(prev) ?? null : null;
      const n = mNp.get(yr) ?? null;
      const n_p = prev ? mNp.get(prev) ?? null : null;
      const g = mGp.get(yr) ?? null;
      const e = mEq.get(yr) ?? null;
      const e_p = prev ? mEq.get(prev) ?? null : null;
      const avgEq = e != null && e_p != null ? (e + e_p) / 2 : e;
      return {
        year: yr,
        revenue: r / 1e8,                                                        // 亿港元
        netProfit: (n ?? 0) / 1e8,
        revenueYoY: r > 0 && r_p && r_p > 0 ? ((r - r_p) / r_p) * 100 : null,
        netProfitYoY: n != null && n_p != null && n_p !== 0 ? ((n - n_p) / Math.abs(n_p)) * 100 : null,
        roe: n != null && avgEq != null && avgEq > 0 ? (n / avgEq) * 100 : null,
        roic: null,
        grossMargin: g != null && r > 0 ? (g / r) * 100 : null,
        netMargin: n != null && r > 0 ? (n / r) * 100 : null,
        debtRatio: null,
        opCashflowPS: null,
      };
    });
    return { yearly };
  } catch (e: any) {
    return { yearly: [], err: `HK financials ${e.message}` };
  }
}

// --- 派生计算 ---
// series 最近在前；算最早→最近的复合年增速
function cagr(series: number[]): number | null {
  const v = series.filter((x) => isFinite(x) && x > 0);
  if (v.length < 2) return null;
  const years = v.length - 1;
  return (Math.pow(v[0] / v[v.length - 1], 1 / years) - 1) * 100;
}
function marginTrend(margins: (number | null)[]): "rising" | "stable" | "falling" | undefined {
  const v = margins.filter((m): m is number => m != null).slice(0, 3);
  if (v.length < 3) return undefined;
  const diff = v[0] - v[2]; // 最近 - 3年前
  if (diff > 2) return "rising";
  if (diff < -2) return "falling";
  return "stable";
}

// --- 主函数：构建研究档案 ---
export async function buildDossier(ticker: Ticker): Promise<ResearchDossier> {
  const base: ResearchDossier = {
    ticker: { code: ticker.code, name: ticker.name, market: ticker.market },
    asOf: new Date().toISOString().slice(0, 10),
    yearly: [],
    depth: "thin",
    source: [],
    errors: [],
  };

  // 港股：实时价 + 10 年财务并行（P2 / 2026-05-22 上线）
  // datacenter RPT_HKF10_FN_* 与美股 USF10 同 schema，STD_ITEM_CODE 字典不同。
  if (ticker.market === "HK") {
    const secucodeHK = `${ticker.code.padStart(5, "0")}.HK`; // 00700.HK / 09992.HK
    const [q, fin] = await Promise.all([
      fetchQuote(ticker.secid),
      fetchHKFinancials(secucodeHK),
    ]);
    base.price = q.price;
    base.marketCapBillion = q.mktcap;
    base.yearly = fin.yearly;
    base.source = ["push2", "datacenter/hkf10-income", "datacenter/hkf10-balance"];
    if (q.err) base.errors.push(q.err);
    if (fin.err) base.errors.push(fin.err);

    if (fin.yearly.length >= 2) {
      base.depth = "full";
      const rev = fin.yearly.map((y) => y.revenue);
      const np = fin.yearly.map((y) => y.netProfit);
      base.revenueCAGR3 = cagr(rev.slice(0, 4)) ?? undefined;
      base.revenueCAGR5 = cagr(rev.slice(0, 6)) ?? undefined;
      base.netProfitCAGR5 = cagr(np.slice(0, 6)) ?? undefined;
      base.grossMarginTrend = marginTrend(fin.yearly.map((y) => y.grossMargin));
      const roes = fin.yearly.slice(0, 5).map((y) => y.roe).filter((r): r is number => r != null);
      base.roeAvg5 = roes.length ? roes.reduce((a, b) => a + b, 0) / roes.length : undefined;
    }
    // PE/PB 港股走 gtimg-hk（stock_tools.ts 已有 fetchGtimgHK），buildDossier 暂不取 PE（thin 时也没取），
    // 待 valuation 层统一接入再补；analysis.ts:87 看 d.peTTM == null 直接判 unknown 不会崩。
    return base;
  }

  // 美股：实时价 + 10 年财务并行（P1.2 / 2026-05-22 上线）
  if (ticker.market === "US") {
    const secucodeUS = `${ticker.code}.O`; // 默认 NASDAQ；NYSE 的 .N 后缀待 NYSE 标的扩展时支持
    const [q, fin] = await Promise.all([
      fetchQuoteUS(ticker.secid),
      fetchUSFinancials(secucodeUS),
    ]);
    base.price = q.price;
    base.marketCapBillion = q.mktcap;
    base.yearly = fin.yearly;
    base.source = ["push2", "datacenter/usf10-income", "datacenter/usf10-balance"];
    if (q.err) base.errors.push(q.err);
    if (fin.err) base.errors.push(fin.err);

    if (fin.yearly.length >= 2) {
      base.depth = "full";
      const rev = fin.yearly.map((y) => y.revenue);
      const np = fin.yearly.map((y) => y.netProfit);
      base.revenueCAGR3 = cagr(rev.slice(0, 4)) ?? undefined;
      base.revenueCAGR5 = cagr(rev.slice(0, 6)) ?? undefined;
      base.netProfitCAGR5 = cagr(np.slice(0, 6)) ?? undefined;
      base.grossMarginTrend = marginTrend(fin.yearly.map((y) => y.grossMargin));
      const roes = fin.yearly.slice(0, 5).map((y) => y.roe).filter((r): r is number => r != null);
      base.roeAvg5 = roes.length ? roes.reduce((a, b) => a + b, 0) / roes.length : undefined;
    }
    // 美股 PE/PB/PS datacenter 接口未稳定（push2 f114 也返回 0），暂留 undefined；
    // analysis.ts:87 看 d.earningsYield ?? 100/pe，pe 也是 undefined 时 analyzePrice 输出 unknown 而不会崩。
    return base;
  }

  // A 股：三源并行
  const secucode = `${ticker.code}.${ticker.code.startsWith("6") ? "SH" : "SZ"}`;
  const [q, val, fin] = await Promise.all([
    fetchQuote(ticker.secid),
    fetchValuation(ticker.code),
    fetchFinancials(secucode),
  ]);

  base.price = q.price;
  base.marketCapBillion = q.mktcap;
  base.peTTM = val.peTTM;
  base.pbMRQ = val.pbMRQ;
  base.psTTM = val.psTTM;
  base.pcfTTM = val.pcfTTM;
  base.yearly = fin.yearly;
  base.source = ["push2", "datacenter/valuation", "datacenter/f10-finance"];
  for (const e of [q.err, val.err, fin.err]) if (e) base.errors.push(e);

  // 派生事实
  if (fin.yearly.length >= 2) {
    base.depth = "full";
    const rev = fin.yearly.map((y) => y.revenue);
    const np = fin.yearly.map((y) => y.netProfit);
    base.revenueCAGR3 = cagr(rev.slice(0, 4)) ?? undefined;
    base.revenueCAGR5 = cagr(rev.slice(0, 6)) ?? undefined;
    base.netProfitCAGR5 = cagr(np.slice(0, 6)) ?? undefined;
    base.grossMarginTrend = marginTrend(fin.yearly.map((y) => y.grossMargin));
    const roes = fin.yearly.slice(0, 5).map((y) => y.roe).filter((r): r is number => r != null);
    base.roeAvg5 = roes.length ? roes.reduce((a, b) => a + b, 0) / roes.length : undefined;
  }
  if (base.peTTM && base.peTTM > 0) base.earningsYield = 100 / base.peTTM;

  return base;
}
