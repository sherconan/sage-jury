// GET /api/lookup?ticker=600519
// 输入股票代码 → 自动从东方财富 push2 API 拉取实时数据 → 返回 CaseInput
// 让陪审团从"你输入"升级为"我替你提取"

import { NextRequest, NextResponse } from "next/server";
import type { CaseInput } from "@/types";
import { evaluate } from "@/lib/engine";

export const runtime = "nodejs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function pickSecid(ticker: string): { secid: string; market: string } {
  const t = ticker.trim().toUpperCase();
  if (/^[0-9]{6}$/.test(t)) {
    if (t.startsWith("6") || t.startsWith("9")) return { secid: `1.${t}`, market: "A.SH" };
    if (t.startsWith("0") || t.startsWith("3")) return { secid: `0.${t}`, market: "A.SZ" };
    if (t.startsWith("8") || t.startsWith("4")) return { secid: `0.${t}`, market: "A.BJ" };
  }
  if (/^[0-9]{5}$/.test(t)) return { secid: `116.${t}`, market: "HK" };
  if (/^[A-Z]+$/.test(t)) {
    return { secid: `105.${t}`, market: "US" };
  }
  return { secid: `1.${t}`, market: "A.SH" };
}

const INDUSTRY_HINTS: Record<string, Partial<CaseInput>> = {
  白酒: { monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 4, techDisruption: 1, regulatoryRisk: 2 },
  食品饮料: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 5, techDisruption: 1, regulatoryRisk: 2 },
  医药: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 4, techDisruption: 3, regulatoryRisk: 4 },
  中药: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 4, techDisruption: 1, regulatoryRisk: 3 },
  银行: { monopolyLevel: 4, brandStrength: 3, consumerStickiness: 4, repeatedConsumption: 3, techDisruption: 3, regulatoryRisk: 5, cyclical: true },
  保险: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 2, techDisruption: 3, regulatoryRisk: 5 },
  地产: { monopolyLevel: 2, brandStrength: 2, consumerStickiness: 1, repeatedConsumption: 1, techDisruption: 1, regulatoryRisk: 5, cyclical: true },
  互联网: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 5, techDisruption: 4, regulatoryRisk: 4 },
  半导体: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 2, techDisruption: 5, regulatoryRisk: 3 },
  新能源: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 4, regulatoryRisk: 3, cyclical: true },
  电力设备: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 3, regulatoryRisk: 3, cyclical: true },
  汽车: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 4, regulatoryRisk: 3, cyclical: true },
  钢铁: { monopolyLevel: 2, brandStrength: 2, consumerStickiness: 1, repeatedConsumption: 1, techDisruption: 1, regulatoryRisk: 3, cyclical: true },
  煤炭: { monopolyLevel: 3, brandStrength: 2, consumerStickiness: 2, repeatedConsumption: 2, techDisruption: 1, regulatoryRisk: 4, cyclical: true },
  化工: { monopolyLevel: 2, brandStrength: 2, consumerStickiness: 2, repeatedConsumption: 2, techDisruption: 2, regulatoryRisk: 3, cyclical: true },
  软件: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 4, repeatedConsumption: 3, techDisruption: 4, regulatoryRisk: 3 },
  传媒: { monopolyLevel: 2, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 4, techDisruption: 4, regulatoryRisk: 4 },
  纺织服装: { monopolyLevel: 2, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 2, techDisruption: 2, regulatoryRisk: 2 },
  家电: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 3, regulatoryRisk: 2 },
  消费电子: { monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 2, techDisruption: 4, regulatoryRisk: 3 },
};

const NAME_TO_INDUSTRY: Record<string, string> = {
  茅台: "白酒", 五粮液: "白酒", 山西汾酒: "白酒", 泸州老窖: "白酒", 洋河: "白酒", 古井贡酒: "白酒",
  招商银行: "银行", 工商银行: "银行", 建设银行: "银行", 平安银行: "银行", 兴业银行: "银行",
  中国平安: "保险", 中国人寿: "保险",
  万科: "地产", 保利发展: "地产", 招商蛇口: "地产",
  腾讯: "互联网", 阿里: "互联网", 百度: "互联网", 美团: "互联网", 拼多多: "互联网",
  比亚迪: "汽车", 长城汽车: "汽车", 长安汽车: "汽车",
  宁德时代: "新能源", 隆基绿能: "新能源",
  贵州茅台: "白酒",
  片仔癀: "中药", 云南白药: "中药", 同仁堂: "中药",
  美的集团: "家电", 格力电器: "家电", 海尔智家: "家电",
};

function inferIndustryFromName(name: string): string | undefined {
  const normalized = name.replace(/\s+/g, "");
  for (const [key, ind] of Object.entries(NAME_TO_INDUSTRY)) {
    if (normalized.includes(key)) return ind;
  }
  // suffix-based fallback
  if (/酒$/.test(normalized)) return "白酒";
  if (/银行$/.test(normalized)) return "银行";
  if (/保险$/.test(normalized)) return "保险";
  if (/地产|置业|发展$/.test(normalized)) return "地产";
  if (/药业|医药|生物$/.test(normalized)) return "医药";
  if (/电力|能源$/.test(normalized)) return "新能源";
  if (/钢铁|钢$/.test(normalized)) return "钢铁";
  if (/煤业|煤$/.test(normalized)) return "煤炭";
  if (/化工|化学$/.test(normalized)) return "化工";
  if (/科技|软件|信息$/.test(normalized)) return "软件";
  if (/汽车|车$/.test(normalized)) return "汽车";
  if (/家电|电器$/.test(normalized)) return "家电";
  return undefined;
}

function divIfBig(v: number | undefined, divisor: number): number | undefined {
  if (v === undefined || v === null || isNaN(v)) return undefined;
  return v / divisor;
}

interface LookupResult {
  ticker: string;
  market: string;
  source: string;
  fetched: { name: string; pe?: number; pb?: number; lastPrice?: number; ytdChange?: number };
  caseInput: CaseInput;
  inferredFromIndustry?: string;
  notes: string[];
}

async function fetchEastmoney(secid: string): Promise<{
  name: string; pe?: number; pb?: number; lastPrice?: number; ytdChange?: number;
} | null> {
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f57,f58,f162,f167,f184`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://quote.eastmoney.com/" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const d = json?.data;
    if (!d || !d.f58) return null;
    return {
      name: String(d.f58 || "").replace(/\s+/g, ""),
      lastPrice: divIfBig(Number(d.f43), 100),
      pe: divIfBig(Number(d.f162), 100),
      pb: divIfBig(Number(d.f167), 100),
      ytdChange: divIfBig(Number(d.f184), 100),
    };
  } catch (e) {
    return null;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const includeReport = req.nextUrl.searchParams.get("evaluate") !== "false";

  if (!ticker) {
    return NextResponse.json(
      {
        service: "sage-jury · lookup",
        usage: "GET /api/lookup?ticker=<code>[&evaluate=false]",
        examples: [
          "/api/lookup?ticker=600519",
          "/api/lookup?ticker=000858",
          "/api/lookup?ticker=300750",
          "/api/lookup?ticker=00700",
        ],
        notes: [
          "ticker 支持：A 股 6 位代码 / 港股 5 位 / 美股字母",
          "数据源：东方财富 push2 实时行情",
          "自动从行业 + 名称推断垄断/品牌/复购等定性指标",
          "evaluate=false 只返回 CaseInput，不跑陪审团",
        ],
      },
      { headers: cors },
    );
  }

  const { secid, market } = pickSecid(ticker);
  const data = await fetchEastmoney(secid);
  const notes: string[] = [];

  if (!data) {
    return NextResponse.json(
      {
        ticker,
        market,
        error: "Unable to fetch data from East Money for this ticker",
        suggestion: "Verify ticker format. A-shares: 6 digits, HK: 5 digits, US: letters.",
      },
      { status: 404, headers: cors },
    );
  }

  let inferredIndustry = inferIndustryFromName(data.name);
  if (inferredIndustry) notes.push(`从名称 "${data.name}" 推断行业: ${inferredIndustry}`);

  const indHints = inferredIndustry ? INDUSTRY_HINTS[inferredIndustry] : {};
  if (Object.keys(indHints).length > 0) {
    notes.push(`行业 "${inferredIndustry}" 已套用默认定性指标（垄断/品牌/复购等）`);
  } else {
    notes.push("无行业匹配——定性指标使用中性默认值，请手动调整");
  }

  const caseInput: CaseInput = {
    ticker: data.name && market === "A.SH" ? `${ticker}` : ticker,
    name: data.name,
    industry: inferredIndustry || "未知",
    briefBusiness: `${data.name} · ${inferredIndustry || "行业未知"}`,
    pe: data.pe,
    pb: data.pb,
    monopolyLevel: 3,
    brandStrength: 3,
    consumerStickiness: 3,
    repeatedConsumption: 3,
    techDisruption: 3,
    regulatoryRisk: 3,
    managementQuality: 3,
    inUserCircle: undefined,
    cyclical: false,
    intendedHoldYears: 5,
    ...indHints,
  };

  const result: LookupResult = {
    ticker,
    market,
    source: "eastmoney.push2",
    fetched: data,
    caseInput,
    inferredFromIndustry: inferredIndustry,
    notes,
  };

  if (!includeReport) {
    return NextResponse.json(result, { headers: cors });
  }

  try {
    const report = evaluate(caseInput);
    return NextResponse.json({ ...result, report }, { headers: cors });
  } catch (e: any) {
    return NextResponse.json(
      { ...result, error: "Evaluation failed", message: e?.message || String(e) },
      { status: 500, headers: cors },
    );
  }
}
