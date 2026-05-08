// 市场扫描页 — 用 /api/lookup 实时调用东方财富 API + 陪审团评估
// 让访问者一进来就看到陪审团对当下市场的真实判断

import Link from "next/link";
import { ArrowLeft, Activity, ShieldAlert } from "lucide-react";
import { MARKET_WATCHLIST } from "@/data/cases/market";
import { evaluate } from "@/lib/engine";
import type { CaseInput } from "@/types";
import { cn, scoreBarColor, verdictColor } from "@/lib/utils";

export const metadata = {
  title: "陪审团市场扫描 · 12 只 A 股实时评估 | 大佬陪审团",
  description: "12 只 A 股龙头股票实时从东方财富抓取数据 → 6 位投资大佬独立评分 → 陪审团综合判决。",
};

export const revalidate = 600; // 10 分钟重新跑一次

const INDUSTRY_HINTS: Record<string, Partial<CaseInput>> = {
  白酒: { monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 4, techDisruption: 1, regulatoryRisk: 2, managementQuality: 4 },
  家电: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 3, regulatoryRisk: 2, managementQuality: 4 },
  中药: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 4, techDisruption: 1, regulatoryRisk: 3, managementQuality: 3 },
  银行: { monopolyLevel: 4, brandStrength: 3, consumerStickiness: 4, repeatedConsumption: 3, techDisruption: 3, regulatoryRisk: 5, cyclical: true, managementQuality: 3 },
  保险: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 2, techDisruption: 3, regulatoryRisk: 5, managementQuality: 3 },
  新能源: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 4, regulatoryRisk: 3, cyclical: true, managementQuality: 3 },
  汽车: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 4, regulatoryRisk: 3, cyclical: true, managementQuality: 3 },
};

interface FetchedRow {
  code: string;
  category: string;
  hint?: string;
  name: string;
  pe?: number;
  pb?: number;
  lastPrice?: number;
  consensusScore?: number;
  consensusLabel?: string;
  agreementLevel?: string;
  topVerdict?: { sageName: string; finalScore: number; oneLine: string };
  worstVerdict?: { sageName: string; finalScore: number; oneLine: string };
  verdicts?: Array<{ sageName: string; finalScore: number; letterGrade: string }>;
  error?: string;
}

async function fetchRow(item: { code: string; category: string; hint?: string }): Promise<FetchedRow> {
  const code = item.code;
  const secid = code.startsWith("6") || code.startsWith("9") ? `1.${code}` : `0.${code}`;
  try {
    const res = await fetch(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f57,f58,f162,f167`,
      {
        headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" },
        next: { revalidate: 600 },
      },
    );
    if (!res.ok) return { code, category: item.category, hint: item.hint, name: code, error: `fetch failed ${res.status}` };
    const json: any = await res.json();
    const d = json?.data;
    if (!d || !d.f58) return { code, category: item.category, hint: item.hint, name: code, error: "no data" };
    const div = (n: any) => (typeof n === "number" && !isNaN(n) ? n / 100 : undefined);
    const name = String(d.f58).replace(/\s+/g, "");
    const pe = div(d.f162);
    const pb = div(d.f167);
    const lastPrice = div(d.f43);

    const indHints = INDUSTRY_HINTS[item.category] || {};
    const input: CaseInput = {
      ticker: code,
      name,
      industry: item.category,
      briefBusiness: item.hint || `${name} · ${item.category}`,
      pe,
      pb,
      monopolyLevel: 3,
      brandStrength: 3,
      consumerStickiness: 3,
      repeatedConsumption: 3,
      techDisruption: 3,
      regulatoryRisk: 3,
      managementQuality: 3,
      cyclical: false,
      intendedHoldYears: 5,
      ...indHints,
    };

    const report = evaluate(input);
    const sortedHigh = [...report.verdicts].sort((a, b) => b.finalScore - a.finalScore);
    const sortedLow = [...report.verdicts].sort((a, b) => a.finalScore - b.finalScore);

    return {
      code,
      category: item.category,
      hint: item.hint,
      name,
      pe,
      pb,
      lastPrice,
      consensusScore: report.consensusScore,
      consensusLabel: report.consensusLabel,
      agreementLevel: report.agreementLevel,
      topVerdict: sortedHigh[0],
      worstVerdict: sortedLow[0],
      verdicts: report.verdicts.map((v) => ({ sageName: v.sageName, finalScore: v.finalScore, letterGrade: v.letterGrade })),
    };
  } catch (e: any) {
    return { code, category: item.category, hint: item.hint, name: code, error: e?.message || "error" };
  }
}

export default async function MarketPage() {
  const rows = await Promise.all(MARKET_WATCHLIST.map(fetchRow));
  const validRows = rows.filter((r) => !r.error);
  const buyCount = validRows.filter((r) => r.consensusScore !== undefined && r.consensusScore >= 60).length;
  const avoidCount = validRows.filter((r) => r.consensusScore !== undefined && r.consensusScore < 40).length;
  const watchCount = validRows.length - buyCount - avoidCount;
  const lastUpdated = new Date().toISOString();

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">MARKET SCAN</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>Live Market Scan</span>
          </p>
          <h1 className="mt-3 text-center font-serif text-4xl font-bold text-navy-700 md:text-5xl">
            陪审团市场扫描
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ink-700">
            {validRows.length} 只 A 股龙头实时从东方财富抓取数据 → 6 位投资大佬独立评分 → 陪审团综合判决。
            数据每 10 分钟自动重新跑一次。
          </p>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-center">
              <p className="text-xs font-mono uppercase tracking-widest text-emerald-700">陪审团看好</p>
              <p className="mt-1 font-serif text-3xl font-bold text-emerald-800">{buyCount}</p>
              <p className="text-xs text-emerald-700">综合 ≥ 60</p>
            </div>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center">
              <p className="text-xs font-mono uppercase tracking-widest text-amber-700">观望</p>
              <p className="mt-1 font-serif text-3xl font-bold text-amber-800">{watchCount}</p>
              <p className="text-xs text-amber-700">综合 40-60</p>
            </div>
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-center">
              <p className="text-xs font-mono uppercase tracking-widest text-red-700">陪审团回避</p>
              <p className="mt-1 font-serif text-3xl font-bold text-red-800">{avoidCount}</p>
              <p className="text-xs text-red-700">综合 &lt; 40</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h2 className="mb-6 font-serif text-2xl font-bold text-navy-700">
            <Activity className="mr-2 inline h-5 w-5" /> 全名单（按综合分排序）
          </h2>
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-cream-50 shadow-bench">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-cream-100">
                    <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">股票</th>
                    <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">代码</th>
                    <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">行业</th>
                    <th className="px-3 py-3 text-right font-mono text-xs uppercase text-ink-500">PE</th>
                    <th className="px-3 py-3 text-right font-mono text-xs uppercase text-ink-500">PB</th>
                    <th className="px-3 py-3 text-right font-mono text-xs uppercase text-ink-500">综合</th>
                    <th className="px-3 py-3 text-center font-mono text-xs uppercase text-ink-500">陪审团 6 票</th>
                    <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">最支持</th>
                  </tr>
                </thead>
                <tbody>
                  {validRows
                    .sort((a, b) => (b.consensusScore || 0) - (a.consensusScore || 0))
                    .map((r) => (
                      <tr key={r.code} className="border-b border-ink-100 last:border-0 hover:bg-cream-100/40">
                        <td className="px-3 py-3 font-medium text-ink-900">{r.name}</td>
                        <td className="px-3 py-3 font-mono text-xs text-ink-500">{r.code}</td>
                        <td className="px-3 py-3 text-ink-600">{r.category}</td>
                        <td className="px-3 py-3 text-right font-mono text-ink-700">{r.pe?.toFixed(1) || "-"}</td>
                        <td className="px-3 py-3 text-right font-mono text-ink-700">{r.pb?.toFixed(2) || "-"}</td>
                        <td className="px-3 py-3 text-right">
                          <span className="font-serif text-xl font-bold text-navy-700">{r.consensusScore}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-center gap-0.5">
                            {r.verdicts?.map((v) => (
                              <span
                                key={v.sageName}
                                className={cn(
                                  "flex h-6 w-7 items-center justify-center rounded text-[10px] font-bold tabular-nums",
                                  v.finalScore >= 75 ? "bg-emerald-600 text-cream-50" :
                                  v.finalScore >= 60 ? "bg-emerald-300 text-emerald-900" :
                                  v.finalScore >= 45 ? "bg-amber-200 text-amber-900" :
                                  v.finalScore >= 30 ? "bg-orange-300 text-orange-900" :
                                                       "bg-red-500 text-cream-50",
                                )}
                                title={`${v.sageName}: ${v.finalScore} (${v.letterGrade})`}
                              >
                                {v.finalScore}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-ink-600">
                          {r.topVerdict ? `${r.topVerdict.sageName} ${r.topVerdict.finalScore}` : "-"}
                        </td>
                      </tr>
                    ))}
                  {rows.filter(r => r.error).map(r => (
                    <tr key={r.code} className="border-b border-ink-100 bg-red-50/40">
                      <td className="px-3 py-3 text-ink-500">{r.name || r.code}</td>
                      <td className="px-3 py-3 font-mono text-xs text-ink-500">{r.code}</td>
                      <td className="px-3 py-3 text-red-600" colSpan={6}>
                        <ShieldAlert className="inline h-3 w-3 mr-1" /> {r.error}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 text-xs text-ink-500">
            数据源：东方财富 push2 · 实时陪审团评估在 Vercel SSR 运行 ·
            最后更新 {new Date(lastUpdated).toLocaleString("zh-CN")} ·
            10 分钟自动刷新
          </p>
        </div>
      </section>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-3xl px-5 py-12 text-center">
          <h2 className="font-serif text-2xl font-bold text-navy-700">想看自定义股票？</h2>
          <p className="mt-2 text-ink-600">回到主页，用「⚡ 一键代码查询」输入任意 6 位代码即可。</p>
          <Link href="/#input" className="btn-primary mt-6 inline-flex">
            去主页查询 →
          </Link>
        </div>
      </section>

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">
          ← 返回陪审团首页
        </Link>
      </footer>
    </main>
  );
}
