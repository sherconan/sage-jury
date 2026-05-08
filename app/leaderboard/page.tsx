// 陪审团排行榜 — 24 只 A 股龙头按综合分排序，看陪审团心目中的"市场之王"
import Link from "next/link";
import { ArrowLeft, Trophy, Medal, Award } from "lucide-react";
import { LEADERBOARD_POOL } from "@/data/cases/leaderboard-pool";
import { evaluate } from "@/lib/engine";
import type { CaseInput } from "@/types";
import { cn, scoreBarColor, verdictColor } from "@/lib/utils";

export const revalidate = 1800; // 30 分钟刷新

const INDUSTRY_HINTS: Record<string, Partial<CaseInput>> = {
  白酒: { monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 4, techDisruption: 1 },
  食品: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 5, techDisruption: 1 },
  家电: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 3 },
  中药: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 4, techDisruption: 1 },
  医药: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 4, techDisruption: 3, regulatoryRisk: 4 },
  银行: { monopolyLevel: 4, brandStrength: 3, consumerStickiness: 4, regulatoryRisk: 5, cyclical: true },
  保险: { monopolyLevel: 3, brandStrength: 3, regulatoryRisk: 5 },
  新能源: { monopolyLevel: 3, brandStrength: 3, techDisruption: 4, cyclical: true },
  汽车: { monopolyLevel: 3, brandStrength: 3, techDisruption: 4, cyclical: true },
  软件: { monopolyLevel: 3, brandStrength: 3, techDisruption: 4, regulatoryRisk: 3 },
  消费: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 3 },
  半导体: { monopolyLevel: 4, brandStrength: 4, techDisruption: 5 },
  文教: { monopolyLevel: 3, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 4, techDisruption: 2 },
};

const pickSecid = (t: string) =>
  /^[0-9]{6}$/.test(t) ? (t.startsWith("6") || t.startsWith("9") ? `1.${t}` : `0.${t}`) : `0.${t}`;

async function fetchOne(code: string, category: string) {
  const secid = pickSecid(code);
  try {
    const res = await fetch(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f58,f162,f167`,
      { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 1800 } },
    );
    if (!res.ok) return null;
    const j: any = await res.json();
    const d = j?.data;
    if (!d || !d.f58) return null;
    const div = (n: any) => (typeof n === "number" && !isNaN(n) ? n / 100 : undefined);
    const name = String(d.f58).replace(/\s+/g, "");
    const indHints = INDUSTRY_HINTS[category] || {};
    const input: CaseInput = {
      ticker: code, name, industry: category, briefBusiness: name,
      pe: div(d.f162), pb: div(d.f167),
      monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 3,
      techDisruption: 3, regulatoryRisk: 3, managementQuality: 3, cyclical: false,
      intendedHoldYears: 5,
      ...indHints,
    };
    const r = evaluate(input);
    return {
      code, name, category,
      pe: div(d.f162), pb: div(d.f167),
      score: r.consensusScore, label: r.consensusLabel.split(" · ")[0],
      verdict: r.consensusVerdict, agree: r.agreementLevel,
      verdicts: r.verdicts.map((v: any) => ({ name: v.sageName, score: v.finalScore, grade: v.letterGrade })),
    };
  } catch { return null; }
}

export default async function LeaderboardPage() {
  const rows = (await Promise.all(LEADERBOARD_POOL.map((p) => fetchOne(p.code, p.category)))).filter(Boolean) as any[];
  rows.sort((a, b) => b.score - a.score);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);
  const byCategory: Record<string, any[]> = {};
  rows.forEach((r) => { byCategory[r.category] = byCategory[r.category] || []; byCategory[r.category].push(r); });
  const categories = Object.entries(byCategory).map(([cat, list]) => ({
    cat, avg: Math.round(list.reduce((s, r) => s + r.score, 0) / list.length),
    count: list.length,
  })).sort((a, b) => b.avg - a.avg);

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">LEADERBOARD</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-12 text-center">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>Jury Leaderboard</span>
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-navy-700 md:text-5xl">
            <Trophy className="mr-2 inline h-7 w-7 text-gold-600" />
            陪审团排行榜
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-ink-600">
            {rows.length} 只 A 股龙头实时陪审团评估排序——8 位投资大佬眼中的"市场之王"。
            数据每 30 分钟自动刷新。
          </p>
        </div>
      </section>

      {top3.length === 3 && (
        <section className="border-b border-ink-200/60 bg-cream-50/40">
          <div className="mx-auto max-w-5xl px-5 py-12">
            <div className="grid items-end gap-4 md:grid-cols-3">
              {/* 第二名 */}
              <div className="court-card md:order-1 p-5 text-center" style={{ borderTopColor: "#94A3B8", borderTopWidth: 4 }}>
                <Medal className="mx-auto h-10 w-10 text-slate-500" />
                <p className="mt-1 font-mono text-xs uppercase text-ink-500">2nd Place</p>
                <Link href={`/stock/${top3[1].code}`} className="block font-serif text-2xl font-bold text-navy-700 hover:text-gold-600">{top3[1].name}</Link>
                <p className="text-xs text-ink-500">{top3[1].code} · {top3[1].category}</p>
                <p className="mt-3 font-serif text-4xl font-bold text-navy-700">{top3[1].score}</p>
                <span className={cn("verdict-stamp text-xs mt-1 inline-flex", verdictColor(top3[1].verdict))}>{top3[1].label}</span>
              </div>
              {/* 第一名 */}
              <div className="court-card md:order-2 p-6 text-center md:scale-110" style={{ borderTopColor: "#D4AF37", borderTopWidth: 5 }}>
                <Trophy className="mx-auto h-14 w-14 text-gold-500" />
                <p className="mt-1 font-mono text-xs uppercase text-gold-700">🥇 Champion</p>
                <Link href={`/stock/${top3[0].code}`} className="block font-serif text-3xl font-bold text-navy-700 hover:text-gold-600">{top3[0].name}</Link>
                <p className="text-xs text-ink-500">{top3[0].code} · {top3[0].category}</p>
                <p className="mt-3 font-serif text-5xl font-bold text-gold-600">{top3[0].score}</p>
                <span className={cn("verdict-stamp text-sm mt-1 inline-flex", verdictColor(top3[0].verdict))}>{top3[0].label}</span>
              </div>
              {/* 第三名 */}
              <div className="court-card md:order-3 p-5 text-center" style={{ borderTopColor: "#A16207", borderTopWidth: 4 }}>
                <Award className="mx-auto h-10 w-10 text-amber-700" />
                <p className="mt-1 font-mono text-xs uppercase text-ink-500">3rd Place</p>
                <Link href={`/stock/${top3[2].code}`} className="block font-serif text-2xl font-bold text-navy-700 hover:text-gold-600">{top3[2].name}</Link>
                <p className="text-xs text-ink-500">{top3[2].code} · {top3[2].category}</p>
                <p className="mt-3 font-serif text-4xl font-bold text-navy-700">{top3[2].score}</p>
                <span className={cn("verdict-stamp text-xs mt-1 inline-flex", verdictColor(top3[2].verdict))}>{top3[2].label}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <h2 className="mb-4 font-serif text-2xl font-bold text-navy-700">完整榜单</h2>
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-cream-50 shadow-bench overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-cream-100">
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">名次</th>
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">股票</th>
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">代码</th>
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">行业</th>
                  <th className="px-3 py-3 text-right font-mono text-xs uppercase text-ink-500">PE</th>
                  <th className="px-3 py-3 text-right font-mono text-xs uppercase text-ink-500">综合</th>
                  <th className="px-3 py-3 text-center font-mono text-xs uppercase text-ink-500">8 票</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.code} className={cn("border-b border-ink-100 hover:bg-cream-100/40",
                    i === 0 && "bg-gold-50", i === 1 && "bg-slate-50", i === 2 && "bg-amber-50")}>
                    <td className="px-3 py-2 font-mono text-sm font-bold text-ink-600">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/stock/${r.code}`} className="font-medium text-navy-700 hover:text-gold-600">{r.name}</Link>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-ink-500">{r.code}</td>
                    <td className="px-3 py-2 text-xs text-ink-600">{r.category}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-700">{r.pe?.toFixed(1) || "-"}</td>
                    <td className="px-3 py-2 text-right">
                      <span className="font-serif text-lg font-bold text-navy-700">{r.score}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-center gap-0.5">
                        {r.verdicts.map((v: any) => (
                          <span key={v.name} title={`${v.name}: ${v.score}`}
                            className={cn("flex h-5 w-6 items-center justify-center rounded text-[9px] font-bold",
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-5xl px-5 py-10">
          <h2 className="mb-4 font-serif text-2xl font-bold text-navy-700">行业平均分</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {categories.map((c) => (
              <div key={c.cat} className="court-card p-4">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-ink-800">{c.cat}</span>
                  <span className="text-xs text-ink-500">{c.count} 只</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-serif text-3xl font-bold text-navy-700">{c.avg}</span>
                  <span className="text-xs text-ink-500">/100</span>
                </div>
                <div className="mt-1 stat-bar"><div className={cn("stat-bar-fill", scoreBarColor(c.avg))} style={{ width: `${c.avg}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">← 返回陪审团首页</Link>
      </footer>
    </main>
  );
}
