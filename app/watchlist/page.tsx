// 自选股批量评估 - /watchlist?codes=600519,000858,300750
import Link from "next/link";
import { ArrowLeft, ShieldAlert, ListChecks } from "lucide-react";
import { evaluate } from "@/lib/engine";
import { SAGE_BY_ID } from "@/data/sages";
import type { CaseInput } from "@/types";
import { cn, scoreBarColor, verdictColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
  茅台: "白酒", 五粮液: "白酒", 汾酒: "白酒", 老窖: "白酒",
  招商银行: "银行", 工商银行: "银行", 平安银行: "银行",
  中国平安: "保险", 人寿: "保险",
  腾讯: "互联网", 拼多多: "互联网",
  比亚迪: "汽车", 宁德: "新能源", 隆基: "新能源",
  片仔癀: "中药", 云南白药: "中药",
  美的: "家电", 格力: "家电",
};

function inferInd(name: string): string | undefined {
  const n = name.replace(/\s+/g, "");
  for (const [k, v] of Object.entries(NAME_IND)) if (n.includes(k)) return v;
  if (/酒$/.test(n)) return "白酒";
  if (/银行$/.test(n)) return "银行";
  return undefined;
}

function pickSecid(t: string): string {
  if (/^[0-9]{6}$/.test(t)) return t.startsWith("6") || t.startsWith("9") ? `1.${t}` : `0.${t}`;
  if (/^[0-9]{5}$/.test(t)) return `116.${t}`;
  return `105.${t.toUpperCase()}`;
}

async function fetchOne(ticker: string) {
  const secid = pickSecid(ticker);
  try {
    const res = await fetch(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f58,f162,f167`,
      { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" }, cache: "no-store" },
    );
    if (!res.ok) return { ticker, error: "fetch failed" };
    const j: any = await res.json();
    const d = j?.data;
    if (!d || !d.f58) return { ticker, error: "no data" };
    const div = (n: any) => (typeof n === "number" && !isNaN(n) ? n / 100 : undefined);
    const name = String(d.f58).replace(/\s+/g, "");
    const ind = inferInd(name);
    const input: CaseInput = {
      ticker, name, industry: ind || "未知", briefBusiness: `${name} · ${ind || "?"}`,
      pe: div(d.f162), pb: div(d.f167),
      monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 3,
      techDisruption: 3, regulatoryRisk: 3, managementQuality: 3, cyclical: false,
      intendedHoldYears: 5,
      ...(ind ? INDUSTRY_HINTS[ind] || {} : {}),
    };
    const r = evaluate(input);
    return {
      ticker, name, industry: ind || "?", pe: div(d.f162), pb: div(d.f167), price: div(d.f43),
      consensus: r.consensusScore, label: r.consensusLabel, agree: r.agreementLevel,
      verdicts: r.verdicts.map(v => ({ name: v.sageName, score: v.finalScore, grade: v.letterGrade })),
    };
  } catch (e: any) {
    return { ticker, error: e?.message || "err" };
  }
}

export default async function WatchlistPage({ searchParams }: { searchParams: { codes?: string } }) {
  const codes = (searchParams.codes || "600519,000858,000333,000651,300750,002594,601318,600036")
    .split(/[,，\s]+/).map(s => s.trim()).filter(Boolean).slice(0, 20);
  const rows = await Promise.all(codes.map(fetchOne));
  const valid = rows.filter((r: any) => !r.error).sort((a: any, b: any) => b.consensus - a.consensus);
  const errors = rows.filter((r: any) => r.error);

  const buy = valid.filter((r: any) => r.consensus >= 60).length;
  const watch = valid.filter((r: any) => r.consensus >= 40 && r.consensus < 60).length;
  const avoid = valid.filter((r: any) => r.consensus < 40).length;

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">WATCHLIST</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>Batch Verdict</span>
          </p>
          <h1 className="mt-3 text-center font-serif text-4xl font-bold text-navy-700">
            <ListChecks className="mr-2 inline h-7 w-7" />
            自选股批量审议
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-center text-ink-600">
            一次评估 {valid.length} 只股票，按陪审团综合分排序。url 参数 <code className="font-mono">?codes=600519,000858,...</code>
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-center">
              <p className="font-serif text-3xl font-bold text-emerald-800">{buy}</p>
              <p className="text-xs text-emerald-700">看好（≥60）</p>
            </div>
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-center">
              <p className="font-serif text-3xl font-bold text-amber-800">{watch}</p>
              <p className="text-xs text-amber-700">观望（40-60）</p>
            </div>
            <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-center">
              <p className="font-serif text-3xl font-bold text-red-800">{avoid}</p>
              <p className="text-xs text-red-700">回避（&lt;40）</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-cream-50 shadow-bench overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-cream-100">
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">#</th>
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">股票</th>
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">代码</th>
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">行业</th>
                  <th className="px-3 py-3 text-right font-mono text-xs uppercase text-ink-500">PE</th>
                  <th className="px-3 py-3 text-right font-mono text-xs uppercase text-ink-500">PB</th>
                  <th className="px-3 py-3 text-right font-mono text-xs uppercase text-ink-500">综合</th>
                  <th className="px-3 py-3 text-center font-mono text-xs uppercase text-ink-500">6 位陪审员</th>
                  <th className="px-3 py-3 text-center font-mono text-xs uppercase text-ink-500">详情</th>
                </tr>
              </thead>
              <tbody>
                {valid.map((r: any, i: number) => (
                  <tr key={r.ticker} className="border-b border-ink-100 hover:bg-cream-100/40">
                    <td className="px-3 py-3 font-mono text-xs text-ink-400">{i + 1}</td>
                    <td className="px-3 py-3 font-medium text-ink-900">{r.name}</td>
                    <td className="px-3 py-3 font-mono text-xs text-ink-500">{r.ticker}</td>
                    <td className="px-3 py-3 text-ink-600">{r.industry}</td>
                    <td className="px-3 py-3 text-right font-mono text-ink-700">{r.pe?.toFixed(1) || "-"}</td>
                    <td className="px-3 py-3 text-right font-mono text-ink-700">{r.pb?.toFixed(2) || "-"}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="font-serif text-xl font-bold text-navy-700">{r.consensus}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center gap-0.5">
                        {r.verdicts.map((v: any) => (
                          <span key={v.name} title={`${v.name}: ${v.score}`}
                            className={cn("flex h-6 w-7 items-center justify-center rounded text-[10px] font-bold",
                              v.score >= 75 ? "bg-emerald-600 text-cream-50" :
                              v.score >= 60 ? "bg-emerald-300 text-emerald-900" :
                              v.score >= 45 ? "bg-amber-200 text-amber-900" :
                              v.score >= 30 ? "bg-orange-300 text-orange-900" :
                                              "bg-red-500 text-cream-50")}>
                            {v.score}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Link href={`/stock/${r.ticker}`} className="text-xs text-navy-700 hover:text-gold-600 underline">详情 →</Link>
                    </td>
                  </tr>
                ))}
                {errors.map((r: any) => (
                  <tr key={r.ticker} className="border-b border-ink-100 bg-red-50/30">
                    <td colSpan={9} className="px-3 py-2 text-xs text-red-600">
                      <ShieldAlert className="inline h-3 w-3 mr-1" /> {r.ticker}: {r.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-500">分享自选股：在 url 加 <code className="font-mono">?codes=600519,000858,300750</code></p>
        </div>
      </section>

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">← 返回陪审团首页</Link>
      </footer>
    </main>
  );
}
