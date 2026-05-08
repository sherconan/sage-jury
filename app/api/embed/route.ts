// GET /api/embed?ticker=600519
// 返回 SVG 实时判决卡 — 可在 Notion/博客/GitHub README 嵌入
// <img src="https://sage-jury.vercel.app/api/embed?ticker=600519" />

import { NextRequest, NextResponse } from "next/server";
import { evaluate } from "@/lib/engine";
import type { CaseInput } from "@/types";

export const runtime = "nodejs";

const INDUSTRY_HINTS: Record<string, Partial<CaseInput>> = {
  白酒: { monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 4, techDisruption: 1 },
  家电: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 3 },
  中药: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 4, techDisruption: 1 },
  银行: { monopolyLevel: 4, brandStrength: 3, consumerStickiness: 4, regulatoryRisk: 5, cyclical: true },
  保险: { monopolyLevel: 3, brandStrength: 3, regulatoryRisk: 5 },
  新能源: { monopolyLevel: 3, brandStrength: 3, techDisruption: 4, cyclical: true },
  汽车: { monopolyLevel: 3, brandStrength: 3, techDisruption: 4, cyclical: true },
  互联网: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 5, regulatoryRisk: 4 },
};
const NAME_IND: Record<string, string> = {
  茅台: "白酒", 五粮液: "白酒", 汾酒: "白酒",
  招商银行: "银行", 工商银行: "银行",
  中国平安: "保险",
  腾讯: "互联网", 拼多多: "互联网",
  比亚迪: "汽车", 宁德: "新能源",
  片仔癀: "中药", 云南白药: "中药",
  美的: "家电", 格力: "家电",
};
const inferInd = (name: string) => {
  const n = name.replace(/\s+/g, "");
  for (const [k, v] of Object.entries(NAME_IND)) if (n.includes(k)) return v;
  if (/酒$/.test(n)) return "白酒";
  if (/银行$/.test(n)) return "银行";
  return undefined;
};
const pickSecid = (t: string) =>
  /^[0-9]{6}$/.test(t) ? (t.startsWith("6") || t.startsWith("9") ? `1.${t}` : `0.${t}`) :
  /^[0-9]{5}$/.test(t) ? `116.${t}` : `105.${t.toUpperCase()}`;

async function fetchOne(ticker: string) {
  const secid = pickSecid(ticker);
  try {
    const res = await fetch(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f58,f162,f167`,
      { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const j: any = await res.json();
    const d = j?.data;
    if (!d || !d.f58) return null;
    const div = (n: any) => (typeof n === "number" && !isNaN(n) ? n / 100 : undefined);
    const name = String(d.f58).replace(/\s+/g, "");
    const ind = inferInd(name);
    const input: CaseInput = {
      ticker, name, industry: ind || "未知", briefBusiness: name,
      pe: div(d.f162), pb: div(d.f167),
      monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 3,
      techDisruption: 3, regulatoryRisk: 3, managementQuality: 3, cyclical: false,
      intendedHoldYears: 5,
      ...(ind ? INDUSTRY_HINTS[ind] || {} : {}),
    };
    return { name, pe: div(d.f162), pb: div(d.f167), price: div(d.f43), industry: ind, report: evaluate(input) };
  } catch { return null; }
}

const xmlEsc = (s: string) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));

function scoreColor(s: number) {
  if (s >= 75) return "#10B981";
  if (s >= 60) return "#34D399";
  if (s >= 45) return "#F59E0B";
  if (s >= 30) return "#FB923C";
  return "#EF4444";
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker") || "600519";
  const data = await fetchOne(ticker);

  if (!data || !data.report) {
    const errSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" viewBox="0 0 320 120">
<rect width="320" height="120" fill="#FBF8F2" stroke="#DC2626" stroke-width="2" rx="8"/>
<text x="160" y="60" font-family="serif" font-size="14" fill="#DC2626" text-anchor="middle">⚠️ 未找到 ${xmlEsc(ticker)}</text>
<text x="160" y="85" font-family="monospace" font-size="11" fill="#7A6A4A" text-anchor="middle">A 股 6 位 / 港股 5 位 / 美股字母</text>
</svg>`;
    return new NextResponse(errSvg, {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "no-store, max-age=60" },
    });
  }

  const r = data.report;
  const verdicts = r.verdicts;
  const score = r.consensusScore;
  const sc = scoreColor(score);

  // SVG card 360x520
  const W = 360, H = 540;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#FBF8F2"/>
    <stop offset="100%" stop-color="#F5F0E8"/>
  </linearGradient>
  <linearGradient id="navy" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#1A3553"/>
    <stop offset="100%" stop-color="#0A1A30"/>
  </linearGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)" stroke="#0A1A30" stroke-width="2" rx="14"/>
<rect x="0" y="0" width="${W}" height="56" fill="url(#navy)" rx="14"/>
<rect x="0" y="42" width="${W}" height="14" fill="url(#navy)"/>
<text x="20" y="26" font-size="11" fill="#D4AF37" letter-spacing="3">SAGE JURY ⚖️</text>
<text x="20" y="46" font-size="18" font-weight="700" fill="#FBF8F2">${xmlEsc(data.name)} · ${xmlEsc(ticker)}</text>
<text x="${W - 20}" y="46" font-size="11" fill="#C2CCD8" text-anchor="end">${xmlEsc(data.industry || "?")} · PE ${data.pe?.toFixed(1) ?? "-"} · PB ${data.pb?.toFixed(2) ?? "-"}</text>

<text x="20" y="86" font-size="10" fill="#7A6A4A" letter-spacing="2">JURY CONSENSUS</text>
<text x="20" y="124" font-size="40" font-weight="900" fill="${sc}">${score}</text>
<text x="${20 + 76}" y="124" font-size="14" fill="#7A6A4A">/100</text>
<text x="${W - 20}" y="124" font-size="14" font-weight="700" fill="${sc}" text-anchor="end">${xmlEsc(r.consensusLabel.split(" · ")[0])}</text>
<rect x="20" y="138" width="${W - 40}" height="6" fill="#E5DCC4" rx="3"/>
<rect x="20" y="138" width="${(W - 40) * score / 100}" height="6" fill="${sc}" rx="3"/>
<text x="20" y="160" font-size="10" fill="#7A6A4A">共识等级: ${xmlEsc(r.agreementLevel)} · ${verdicts.length} 位陪审员</text>

<line x1="20" y1="174" x2="${W - 20}" y2="174" stroke="#D4AF37" stroke-opacity="0.4"/>
<text x="20" y="194" font-size="10" fill="#7A6A4A" letter-spacing="2">PER-SAGE VOTES</text>`;

  let y = 210;
  for (const v of verdicts) {
    const vc = scoreColor(v.finalScore);
    svg += `<rect x="20" y="${y - 12}" width="320" height="22" fill="#FBF8F2" stroke="#E5DCC4"/>
<text x="28" y="${y + 2}" font-size="12" font-weight="600" fill="#0A1A30">${xmlEsc(v.sageName)}</text>
<text x="148" y="${y + 2}" font-size="11" font-weight="700" fill="${vc}">${v.letterGrade}</text>
<text x="170" y="${y + 2}" font-size="11" fill="${vc}" font-weight="700">${v.finalScore}</text>
<rect x="200" y="${y - 4}" width="100" height="6" fill="#E5DCC4" rx="3"/>
<rect x="200" y="${y - 4}" width="${v.finalScore}" height="6" fill="${vc}" rx="3"/>
<text x="${W - 20}" y="${y + 2}" font-size="9" fill="#7A6A4A" text-anchor="end">${xmlEsc(v.verdictLabel.split(" · ")[0])}</text>`;
    y += 26;
  }

  svg += `<line x1="20" y1="${y + 8}" x2="${W - 20}" y2="${y + 8}" stroke="#D4AF37" stroke-opacity="0.4"/>
<text x="${W / 2}" y="${y + 26}" font-size="10" fill="#7A6A4A" text-anchor="middle">sage-jury.vercel.app/stock/${xmlEsc(ticker)}</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=1800",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
