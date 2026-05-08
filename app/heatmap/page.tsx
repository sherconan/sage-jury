// /heatmap — 15 位陪审员 × 24 只 A 股龙头评分热力图
// 一目了然看共识 vs 分歧，找出最一致看好 / 最严重分歧的标的

import Link from "next/link";
import { ArrowLeft, Flame, GitMerge, Zap } from "lucide-react";
import { SAGES } from "@/data/sages";
import { evaluate } from "@/lib/engine";
import { LEADERBOARD_POOL, SCAN_INDUSTRY_DEFAULTS, type LeaderboardEntry } from "@/data/cases/leaderboard-pool";
import type { CaseInput } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 1800;

export const metadata = {
  title: "陪审团热力图 · 15位 × 24股 | 大佬陪审团",
  description: "15 位投资大佬同时给 24 只 A 股龙头打分，一张表看共识与分歧。",
};

const pickSecid = (t: string) =>
  /^[0-9]{6}$/.test(t) ? (t.startsWith("6") || t.startsWith("9") ? `1.${t}` : `0.${t}`) : `0.${t}`;

interface ScoredRow {
  code: string;
  name: string;
  category: string;
  pe?: number;
  scoreBySage: Record<string, number>;
  avg: number;
  std: number;          // 标准差，越大越分歧
  max: number;
  min: number;
  bullCount: number;    // 给 70+ 分的 sage 数
  bearCount: number;    // 给 35- 分的 sage 数
}

async function buildHeatmap(): Promise<ScoredRow[]> {
  const sageIds = SAGES.map(s => s.id);
  const rows = await Promise.all(LEADERBOARD_POOL.map(async (p: LeaderboardEntry) => {
    const secid = pickSecid(p.code);
    let pe: number | undefined; let pb: number | undefined; let name = p.code;
    try {
      const res = await fetch(
        `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f58,f162,f167`,
        { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 1800 } },
      );
      if (res.ok) {
        const j: any = await res.json();
        const d = j?.data;
        if (d?.f58) {
          name = String(d.f58).replace(/\s+/g, "");
          if (typeof d.f162 === "number") pe = d.f162 / 100;
          if (typeof d.f167 === "number") pb = d.f167 / 100;
        }
      }
    } catch {}

    const indDef = SCAN_INDUSTRY_DEFAULTS[p.category] || {};
    const input: CaseInput = {
      ticker: p.code, name, industry: p.category, briefBusiness: name,
      pe, pb,
      monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 3,
      techDisruption: 3, regulatoryRisk: 3, managementQuality: 3, cyclical: false,
      intendedHoldYears: 5,
      ...indDef,
      ...(p.roe !== undefined ? { roe: p.roe } : {}),
      ...(p.fcfMargin !== undefined ? { fcfMargin: p.fcfMargin } : {}),
      ...(p.netMargin !== undefined ? { netMargin: p.netMargin } : {}),
      ...(p.grossMargin !== undefined ? { grossMargin: p.grossMargin } : {}),
      ...(p.divYield !== undefined ? { dividendYield: p.divYield } : {}),
      ...(p.monopolyLevel !== undefined ? { monopolyLevel: p.monopolyLevel } : {}),
      ...(p.brandStrength !== undefined ? { brandStrength: p.brandStrength } : {}),
      ...(p.consumerStickiness !== undefined ? { consumerStickiness: p.consumerStickiness } : {}),
      ...(p.repeatedConsumption !== undefined ? { repeatedConsumption: p.repeatedConsumption } : {}),
      ...(p.techDisruption !== undefined ? { techDisruption: p.techDisruption } : {}),
      ...(p.regulatoryRisk !== undefined ? { regulatoryRisk: p.regulatoryRisk } : {}),
      ...(p.managementQuality !== undefined ? { managementQuality: p.managementQuality } : {}),
      ...(p.cyclical !== undefined ? { cyclical: p.cyclical } : {}),
      ...(p.yearsListed !== undefined ? { yearsListed: p.yearsListed } : {}),
    } as CaseInput;

    const r = evaluate(input, sageIds);
    const scoreBySage: Record<string, number> = {};
    for (const v of r.verdicts) scoreBySage[v.sageId] = v.finalScore;
    const scores = Object.values(scoreBySage);
    const avg = scores.reduce((s, x) => s + x, 0) / scores.length;
    const std = Math.sqrt(scores.reduce((s, x) => s + (x - avg) ** 2, 0) / scores.length);
    return {
      code: p.code, name, category: p.category, pe,
      scoreBySage, avg, std,
      max: Math.max(...scores),
      min: Math.min(...scores),
      bullCount: scores.filter(s => s >= 70).length,
      bearCount: scores.filter(s => s < 35).length,
    };
  }));
  return rows.sort((a, b) => b.avg - a.avg);
}

function cellColor(score: number): string {
  // 0-100 score → background color
  if (score >= 80) return "bg-emerald-500 text-white";
  if (score >= 70) return "bg-emerald-400 text-white";
  if (score >= 60) return "bg-emerald-200 text-emerald-900";
  if (score >= 50) return "bg-amber-100 text-amber-900";
  if (score >= 40) return "bg-orange-200 text-orange-900";
  if (score >= 30) return "bg-red-300 text-red-900";
  return "bg-red-500 text-white";
}

export default async function HeatmapPage() {
  const rows = await buildHeatmap();
  const sageIds = SAGES.map(s => s.id);

  // 找出最一致看好 / 最严重分歧
  const consensus = [...rows].sort((a, b) => b.bullCount - a.bullCount).slice(0, 3);
  const dissent = [...rows].sort((a, b) => b.std - a.std).slice(0, 3);
  const allBear = [...rows].sort((a, b) => b.bearCount - a.bearCount).slice(0, 3);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      <nav className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition">
            <ArrowLeft className="h-4 w-4" />
            <span className="font-mono text-xs tracking-tight">SAGE-JURY</span>
          </Link>
          <h1 className="font-semibold text-slate-900">陪审团热力图</h1>
          <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-medium text-emerald-700">
            {SAGES.length} × {LEADERBOARD_POOL.length}
          </span>
        </div>
      </nav>

      <section className="mx-auto max-w-[1600px] px-6 py-8">
        <div className="mb-6">
          <p className="text-xs font-mono uppercase tracking-widest text-slate-500">JURY HEATMAP</p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-slate-900">15 位陪审员 × 24 只 A 股龙头</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 leading-relaxed">
            用每位大佬的方法论同时评分 24 只龙头。绿色=看好（70+）、橙色=观望、红色=回避（&lt;35）。<br />
            找出 <span className="font-medium text-emerald-700">「全场一致看好」</span>的标的（多数 sage 给 70+），
            和 <span className="font-medium text-rose-600">「严重分歧」</span>的标的（评分标准差最大）——这两类才是值得深究的。
          </p>
        </div>

        {/* 顶部洞察卡片 */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-emerald-700">
              <Flame className="h-3.5 w-3.5" /> 全场一致看好 TOP 3
            </div>
            <div className="mt-3 space-y-2">
              {consensus.map(r => (
                <Link href={`/stock/${r.code}`} key={r.code}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 hover:shadow-sm transition">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                    <p className="text-[10px] text-slate-500">{r.category} · {r.code}</p>
                  </div>
                  <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-mono text-emerald-700">
                    {r.bullCount}/15 看好
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-rose-700">
              <GitMerge className="h-3.5 w-3.5" /> 严重分歧 TOP 3
            </div>
            <div className="mt-3 space-y-2">
              {dissent.map(r => (
                <Link href={`/stock/${r.code}`} key={r.code}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 hover:shadow-sm transition">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                    <p className="text-[10px] text-slate-500">{r.category} · σ={r.std.toFixed(1)}</p>
                  </div>
                  <span className="rounded-md bg-rose-100 px-2 py-1 text-xs font-mono text-rose-700">
                    {r.min.toFixed(0)}–{r.max.toFixed(0)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-700">
              <Zap className="h-3.5 w-3.5" /> 全场最回避 TOP 3
            </div>
            <div className="mt-3 space-y-2">
              {allBear.map(r => (
                <Link href={`/stock/${r.code}`} key={r.code}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 hover:shadow-sm transition">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{r.name}</p>
                    <p className="text-[10px] text-slate-500">{r.category}</p>
                  </div>
                  <span className="rounded-md bg-orange-100 px-2 py-1 text-xs font-mono text-orange-700">
                    {r.bearCount}/15 回避
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* 主热力图 */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 sticky top-0">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50/95 px-4 py-3 text-left font-medium text-slate-600 border-r border-slate-200" style={{ minWidth: 180 }}>
                    股票
                  </th>
                  <th className="px-2 py-3 text-center font-medium text-slate-500" style={{ minWidth: 60 }}>均分</th>
                  {SAGES.map(s => (
                    <th key={s.id} className="px-1.5 py-3 text-center font-medium text-slate-600" style={{ minWidth: 56 }}>
                      <Link href={`/sage/${s.id}`} className="hover:text-blue-600 transition">
                        <div className="font-semibold text-[11px]">{s.name.replace(/（.*?）/g, '').slice(0, 4)}</div>
                        <div className="text-[9px] text-slate-400 font-normal mt-0.5">
                          {s.tier === "insider" ? "圈内" : "大众"}
                        </div>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.code} className={i % 2 ? "bg-slate-50/30" : ""}>
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 border-r border-slate-200">
                      <Link href={`/stock/${r.code}`} className="block hover:text-blue-600 transition">
                        <p className="font-semibold text-slate-900">{r.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {r.category} · {r.code}
                          {r.pe ? ` · PE ${r.pe.toFixed(1)}` : ""}
                        </p>
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className="inline-flex items-center justify-center rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700" style={{ minWidth: 36 }}>
                        {r.avg.toFixed(0)}
                      </span>
                    </td>
                    {sageIds.map(sid => {
                      const s = r.scoreBySage[sid];
                      return (
                        <td key={sid} className="px-1 py-1.5 text-center">
                          <span className={`inline-flex items-center justify-center rounded font-mono text-[11px] font-semibold ${cellColor(s)}`}
                            style={{ minWidth: 38, height: 28 }}
                            title={`${SAGES.find(x => x.id === sid)?.name}: ${s} 分`}>
                            {s.toFixed(0)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 图例 */}
        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="font-medium">评分图例:</span>
          {[
            { range: "80+", color: "bg-emerald-500 text-white", label: "强烈推荐" },
            { range: "70-79", color: "bg-emerald-400 text-white", label: "可买" },
            { range: "60-69", color: "bg-emerald-200 text-emerald-900", label: "看好" },
            { range: "50-59", color: "bg-amber-100 text-amber-900", label: "观望" },
            { range: "40-49", color: "bg-orange-200 text-orange-900", label: "倾向不买" },
            { range: "30-39", color: "bg-red-300 text-red-900", label: "回避" },
            { range: "<30", color: "bg-red-500 text-white", label: "强烈回避" },
          ].map(x => (
            <span key={x.range} className="flex items-center gap-1.5">
              <span className={`inline-block rounded px-2 py-0.5 font-mono ${x.color}`}>{x.range}</span>
              <span>{x.label}</span>
            </span>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          数据每 30 分钟刷新 · 实时 PE/PB 来自东方财富 · 评分={SAGES.length} 位陪审员的方法论引擎结果
        </p>
      </section>
    </main>
  );
}
