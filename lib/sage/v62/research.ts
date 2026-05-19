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

  // v62 第一版只做 A 股深度档案
  if (ticker.market !== "A") {
    const q = await fetchQuote(ticker.secid);
    base.price = q.price;
    base.marketCapBillion = q.mktcap;
    if (q.err) base.errors.push(q.err);
    base.errors.push("v62 暂仅 A 股深度档案，港股/美股待后续接入");
    base.source.push("push2");
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
