// 双股对比 — /diff?a=600519&b=000858 → 陪审团并列判决，逐位大佬观点对比
import Link from "next/link";
import { ArrowLeft, GitCompare, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import { evaluate } from "@/lib/engine";
import { SAGE_BY_ID } from "@/data/sages";
import { SageAvatar } from "@/components/SageAvatar";
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
      ticker, name, industry: ind || "未知", briefBusiness: `${name}`,
      pe: div(d.f162), pb: div(d.f167),
      monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 3,
      techDisruption: 3, regulatoryRisk: 3, managementQuality: 3, cyclical: false,
      intendedHoldYears: 5,
      ...(ind ? INDUSTRY_HINTS[ind] || {} : {}),
    };
    return { ticker, name, industry: ind, pe: div(d.f162), pb: div(d.f167), price: div(d.f43), report: evaluate(input) };
  } catch {
    return null;
  }
}

export default async function DiffPage({ searchParams }: { searchParams: { a?: string; b?: string } }) {
  const a = searchParams.a || "600519";
  const b = searchParams.b || "000858";

  const [A, B] = await Promise.all([fetchOne(a), fetchOne(b)]);

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">DIFF</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-10 text-center">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>Side by Side</span>
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-navy-700">
            <GitCompare className="mr-2 inline h-7 w-7" />
            双股对比 · 陪审团并列判决
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-ink-600">
            15 位大佬同时对两只股票投票，看哪只更受陪审团青睐，逐位查看意见差异。
          </p>
          <p className="mt-2 text-xs text-ink-500">URL: <code className="font-mono">?a=600519&b=000858</code></p>
        </div>
      </section>

      {(!A || !B) && (
        <section className="px-5 py-12">
          <div className="court-card mx-auto max-w-md p-6 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-600" />
            <p className="mt-3 text-ink-800">未能获取数据：{!A ? `a=${a}` : ""} {!B ? `b=${b}` : ""}</p>
            <Link href="/diff?a=600519&b=000858" className="btn-primary mt-4 inline-flex">用茅台 vs 五粮液 看示例</Link>
          </div>
        </section>
      )}

      {A && B && (
        <>
          <section className="border-b border-ink-200/60 bg-cream-50/40">
            <div className="mx-auto max-w-5xl px-5 py-10">
              <div className="grid gap-4 md:grid-cols-2">
                {[A, B].map((s, i) => (
                  <div key={s.ticker} className="court-card p-5"
                       style={{ borderTopColor: s.report.consensusScore >= 60 ? "#10B981" : s.report.consensusScore < 40 ? "#DC2626" : "#F59E0B", borderTopWidth: 4 }}>
                    <p className="font-mono text-xs uppercase text-ink-500">{i === 0 ? "A 方" : "B 方"} · {s.ticker}</p>
                    <h2 className="mt-1 font-serif text-2xl font-bold text-navy-700">{s.name}</h2>
                    <p className="text-xs text-ink-600">{s.industry || "?"} · PE {s.pe?.toFixed(1) || "-"} · PB {s.pb?.toFixed(2) || "-"} · ¥{s.price ?? "-"}</p>
                    <div className="mt-4 flex items-baseline gap-2">
                      <span className="font-serif text-5xl font-bold text-navy-700">{s.report.consensusScore}</span>
                      <span className="text-base text-ink-500">/100</span>
                    </div>
                    <span className={cn("verdict-stamp text-sm mt-1 inline-flex", verdictColor(s.report.consensusVerdict))}>
                      {s.report.consensusLabel.split(" · ")[0]}
                    </span>
                    <div className="mt-3 stat-bar h-2.5">
                      <div className={cn("stat-bar-fill", scoreBarColor(s.report.consensusScore))} style={{ width: `${s.report.consensusScore}%` }} />
                    </div>
                    <p className="mt-3 text-xs text-ink-500">共识：<span className="font-mono font-bold text-navy-700">{s.report.agreementLevel}</span></p>
                  </div>
                ))}
              </div>

              {/* Winner banner */}
              <div className="mt-5 court-card p-5 text-center" style={{ borderTopColor: "#D4AF37", borderTopWidth: 3 }}>
                <p className="text-xs font-mono uppercase tracking-widest text-gold-700">陪审团判决</p>
                <p className="mt-2 font-serif text-2xl font-bold text-navy-700">
                  {A.report.consensusScore > B.report.consensusScore && (
                    <><TrendingUp className="mr-2 inline h-6 w-6 text-emerald-600" />{A.name} 更受陪审团青睐 (+{A.report.consensusScore - B.report.consensusScore} 分)</>
                  )}
                  {B.report.consensusScore > A.report.consensusScore && (
                    <><TrendingUp className="mr-2 inline h-6 w-6 text-emerald-600" />{B.name} 更受陪审团青睐 (+{B.report.consensusScore - A.report.consensusScore} 分)</>
                  )}
                  {A.report.consensusScore === B.report.consensusScore && (
                    <>陪审团评分持平 · 看下面逐位大佬意见</>
                  )}
                </p>
              </div>
            </div>
          </section>

          <section className="border-b border-ink-200/60">
            <div className="mx-auto max-w-5xl px-5 py-10">
              <h2 className="mb-6 font-serif text-2xl font-bold text-navy-700">逐位陪审员观点对比</h2>
              <div className="overflow-hidden rounded-2xl border border-ink-200 bg-cream-50 shadow-bench overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 bg-cream-100">
                      <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">陪审员</th>
                      <th className="px-3 py-3 text-center font-mono text-xs uppercase text-ink-500" style={{ minWidth: 200 }}>{A.name}</th>
                      <th className="px-3 py-3 text-center font-mono text-xs uppercase text-ink-500">差距</th>
                      <th className="px-3 py-3 text-center font-mono text-xs uppercase text-ink-500" style={{ minWidth: 200 }}>{B.name}</th>
                      <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">这位大佬怎么说</th>
                    </tr>
                  </thead>
                  <tbody>
                    {A.report.verdicts.map((va) => {
                      const vb = B.report.verdicts.find((x: any) => x.sageId === va.sageId);
                      const sage = SAGE_BY_ID[va.sageId];
                      const diff = vb ? va.finalScore - vb.finalScore : 0;
                      const prefer = diff > 5 ? "A" : diff < -5 ? "B" : "tie";
                      return (
                        <tr key={va.sageId} className="border-b border-ink-100 hover:bg-cream-100/40">
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <SageAvatar initials={sage?.avatar || "?"} bgColor={sage?.color || "#0F2541"} accentColor={sage?.accentColor || "#D4AF37"} size="sm" />
                              <Link href={`/sage/${va.sageId}`} className="font-medium text-ink-800 hover:text-navy-700">{va.sageName}</Link>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={cn("inline-block rounded-md px-2 py-0.5 text-sm font-bold tabular-nums",
                              prefer === "A" ? "bg-emerald-200 text-emerald-900" : "bg-cream-100 text-ink-700")}>
                              {va.finalScore} {va.letterGrade}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            {diff !== 0 && (
                              <span className={cn("inline-flex items-center gap-1 font-mono text-xs",
                                diff > 0 ? "text-emerald-700" : "text-red-700")}>
                                {diff > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {Math.abs(diff)}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={cn("inline-block rounded-md px-2 py-0.5 text-sm font-bold tabular-nums",
                              prefer === "B" ? "bg-emerald-200 text-emerald-900" : "bg-cream-100 text-ink-700")}>
                              {vb?.finalScore || "-"} {vb?.letterGrade || ""}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-ink-700">
                            {prefer === "A" && `偏好 ${A.name}`}
                            {prefer === "B" && `偏好 ${B.name}`}
                            {prefer === "tie" && `两者评分接近`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Link href={`/stock/${A.ticker}`} className="btn-ghost">查看 {A.name} 完整深度页 →</Link>
                <Link href={`/stock/${B.ticker}`} className="btn-ghost">查看 {B.name} 完整深度页 →</Link>
              </div>
            </div>
          </section>

          <section className="border-b border-ink-200/60 bg-cream-50/40">
            <div className="mx-auto max-w-3xl px-5 py-10 text-center">
              <p className="text-sm text-ink-600 mb-3">试试其他对比：</p>
              <div className="flex flex-wrap justify-center gap-2 text-xs">
                {[
                  { a: "600519", b: "000858", label: "茅台 vs 五粮液" },
                  { a: "300750", b: "002594", label: "宁德 vs 比亚迪" },
                  { a: "000333", b: "000651", label: "美的 vs 格力" },
                  { a: "601318", b: "600036", label: "平安 vs 招行" },
                  { a: "600436", b: "000538", label: "片仔癀 vs 云南白药" },
                ].map((p) => (
                  <Link key={`${p.a}-${p.b}`} href={`/diff?a=${p.a}&b=${p.b}`}
                    className="rounded-md border border-ink-300 bg-cream-50 px-3 py-1 font-mono text-ink-700 hover:border-gold-400 hover:bg-gold-50">
                    {p.label}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </>
      )}

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">← 返回陪审团首页</Link>
      </footer>
    </main>
  );
}
