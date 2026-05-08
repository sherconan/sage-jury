// 个股深度页 - /stock/600519 → 完整陪审团判决书 + 大佬维度评分
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { evaluate } from "@/lib/engine";
import { SAGE_BY_ID } from "@/data/sages";
import { SageAvatar } from "@/components/SageAvatar";
import type { CaseInput } from "@/types";
import { cn, scoreBarColor, verdictColor, gradeColor } from "@/lib/utils";

export const revalidate = 600;

const INDUSTRY_HINTS: Record<string, Partial<CaseInput>> = {
  白酒: { monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 4, techDisruption: 1, regulatoryRisk: 2, managementQuality: 4 },
  家电: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1, techDisruption: 3, regulatoryRisk: 2, managementQuality: 4 },
  中药: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 4, techDisruption: 1, regulatoryRisk: 3, managementQuality: 3 },
  银行: { monopolyLevel: 4, brandStrength: 3, consumerStickiness: 4, repeatedConsumption: 3, techDisruption: 3, regulatoryRisk: 5, cyclical: true, managementQuality: 3 },
  保险: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 2, techDisruption: 3, regulatoryRisk: 5, managementQuality: 3 },
  新能源: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 4, regulatoryRisk: 3, cyclical: true, managementQuality: 3 },
  汽车: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 1, techDisruption: 4, regulatoryRisk: 3, cyclical: true, managementQuality: 3 },
  互联网: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 5, techDisruption: 4, regulatoryRisk: 4, managementQuality: 4 },
  半导体: { monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 2, techDisruption: 5, regulatoryRisk: 3, managementQuality: 4 },
  医药: { monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 4, techDisruption: 3, regulatoryRisk: 4, managementQuality: 3 },
};

const NAME_INDUSTRY: Record<string, string> = {
  茅台: "白酒", 五粮液: "白酒", 山西汾酒: "白酒", 泸州老窖: "白酒", 洋河: "白酒",
  招商银行: "银行", 工商银行: "银行", 建设银行: "银行", 平安银行: "银行",
  中国平安: "保险", 中国人寿: "保险",
  腾讯: "互联网", 美团: "互联网", 拼多多: "互联网", 阿里: "互联网",
  比亚迪: "汽车", 宁德时代: "新能源", 隆基: "新能源",
  片仔癀: "中药", 云南白药: "中药", 同仁堂: "中药",
  美的: "家电", 格力: "家电", 海尔: "家电",
};

function inferIndustry(name: string): string | undefined {
  const n = name.replace(/\s+/g, "");
  for (const [k, v] of Object.entries(NAME_INDUSTRY)) if (n.includes(k)) return v;
  if (/酒$/.test(n)) return "白酒";
  if (/银行$/.test(n)) return "银行";
  if (/医药|药业|生物$/.test(n)) return "医药";
  if (/汽车|车$/.test(n)) return "汽车";
  return undefined;
}

function pickSecid(t: string): string {
  if (/^[0-9]{6}$/.test(t)) return t.startsWith("6") || t.startsWith("9") ? `1.${t}` : `0.${t}`;
  if (/^[0-9]{5}$/.test(t)) return `116.${t}`;
  return `105.${t.toUpperCase()}`;
}

async function fetchStock(ticker: string) {
  const secid = pickSecid(ticker);
  try {
    const res = await fetch(
      `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f57,f58,f60,f86,f162,f167,f184`,
      { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 600 } },
    );
    if (!res.ok) return null;
    const j: any = await res.json();
    const d = j?.data;
    if (!d || !d.f58) return null;
    const div = (n: any) => (typeof n === "number" && !isNaN(n) ? n / 100 : undefined);
    return {
      name: String(d.f58).replace(/\s+/g, ""),
      lastPrice: div(d.f43),
      pe: div(d.f162),
      pb: div(d.f167),
      ytdChange: div(d.f184),
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: { ticker: string } }) {
  return {
    title: `${params.ticker} · 陪审团深度判决 | 大佬陪审团`,
    description: `输入 ${params.ticker} → 6 位投资大佬独立评分 + 完整维度拆解 + 综合判决书。`,
  };
}

export default async function StockPage({ params }: { params: { ticker: string } }) {
  const data = await fetchStock(params.ticker);
  if (!data) {
    return (
      <main className="min-h-screen flex items-center justify-center px-5">
        <div className="court-card p-8 max-w-md text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-red-600" />
          <h1 className="mt-4 font-serif text-2xl font-bold text-navy-700">无法找到 {params.ticker}</h1>
          <p className="mt-2 text-ink-700">A 股 6 位代码、港股 5 位、美股字母。例如 600519 / 00700 / NVDA</p>
          <Link href="/" className="btn-primary mt-5 inline-flex">返回主页</Link>
        </div>
      </main>
    );
  }

  const industry = inferIndustry(data.name);
  const indHints = industry ? INDUSTRY_HINTS[industry] || {} : {};
  const input: CaseInput = {
    ticker: params.ticker,
    name: data.name,
    industry: industry || "未知",
    briefBusiness: `${data.name} · ${industry || "行业未知"}`,
    pe: data.pe,
    pb: data.pb,
    monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3,
    repeatedConsumption: 3, techDisruption: 3, regulatoryRisk: 3,
    managementQuality: 3, cyclical: false, intendedHoldYears: 5,
    ...indHints,
  };
  const report = evaluate(input);

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">CASE FILE · {params.ticker}</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <p className="font-mono text-xs uppercase tracking-widest text-ink-500">{params.ticker} · {industry || "未推断行业"}</p>
          <h1 className="mt-2 font-serif text-5xl font-bold text-navy-700">{data.name}</h1>
          <div className="mt-3 flex flex-wrap gap-3 text-sm text-ink-600">
            <span>现价 <span className="font-mono font-bold text-ink-900">{data.lastPrice ?? "-"}</span></span>
            <span>PE <span className="font-mono font-bold text-ink-900">{data.pe?.toFixed(1) ?? "-"}</span></span>
            <span>PB <span className="font-mono font-bold text-ink-900">{data.pb?.toFixed(2) ?? "-"}</span></span>
            <span>YTD <span className="font-mono font-bold text-ink-900">{data.ytdChange ? (data.ytdChange * 100).toFixed(1) + "%" : "-"}</span></span>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            <div className="court-card p-5 md:col-span-2">
              <p className="text-xs font-mono uppercase tracking-widest text-ink-500">陪审团综合判决</p>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="font-serif text-6xl font-bold text-navy-700">{report.consensusScore}</span>
                <span className="text-xl text-ink-500">/100</span>
                <span className={cn("verdict-stamp", verdictColor(report.consensusVerdict))}>
                  {report.consensusLabel.split(" · ")[0]}
                </span>
              </div>
              <div className="mt-3 stat-bar h-3">
                <div className={cn("stat-bar-fill", scoreBarColor(report.consensusScore))} style={{ width: `${report.consensusScore}%` }} />
              </div>
              <p className="mt-3 text-sm text-ink-600">共识等级：<span className="font-mono font-bold text-navy-700">{report.agreementLevel}</span></p>
            </div>
            <div className="court-card p-5">
              <p className="text-xs font-mono uppercase tracking-widest text-ink-500">本庭意见</p>
              <p className="mt-2 font-serif italic text-ink-800">{report.finalJudgment}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="mb-6 font-serif text-2xl font-bold text-navy-700">15 位陪审员逐一意见</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {report.verdicts.map((v) => {
              const sage = SAGE_BY_ID[v.sageId];
              return (
                <div key={v.sageId} className="court-card p-5" style={{ borderTopColor: sage?.accentColor, borderTopWidth: 3 }}>
                  <div className="flex items-start gap-3">
                    <SageAvatar initials={sage?.avatar || "?"} bgColor={sage?.color || "#0F2541"} accentColor={sage?.accentColor || "#D4AF37"} size="md" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/sage/${v.sageId}`} className="font-serif text-lg font-bold text-ink-900 hover:text-navy-700">{v.sageName}</Link>
                      <p className="text-xs text-ink-500">{sage?.title}</p>
                    </div>
                    <span className={cn("grade-badge", gradeColor(v.letterGrade))}>{v.letterGrade}</span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-serif text-3xl font-bold text-navy-700">{v.finalScore}</span>
                    <span className="text-sm text-ink-500">/100</span>
                    <span className={cn("verdict-stamp text-xs", verdictColor(v.verdict))}>{v.verdictLabel.split(" · ")[0]}</span>
                  </div>
                  <p className="mt-2 font-serif italic text-ink-700">"{v.oneLine}"</p>
                  <div className="mt-3 space-y-1.5">
                    {v.dimensions.map((d) => (
                      <div key={d.key}>
                        <div className="flex justify-between text-xs">
                          <span className="text-ink-700">{d.label}<span className="ml-1 text-ink-400">{(d.weight * 100).toFixed(0)}%</span></span>
                          <span className="font-mono text-ink-800">{d.rawScore.toFixed(0)}</span>
                        </div>
                        <div className="stat-bar"><div className={cn("stat-bar-fill", scoreBarColor(d.rawScore))} style={{ width: `${d.rawScore}%` }} /></div>
                      </div>
                    ))}
                  </div>
                  {v.redFlags.length > 0 && (
                    <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                      🚨 {v.redFlags.map(f => f.label).join(" · ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-10 text-center">
          <p className="text-sm text-ink-600">数据源：东方财富 push2（10 分钟自动刷新）· 定性指标按行业 <span className="font-mono">{industry || "默认"}</span> 套用</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link href="/market" className="btn-ghost">看市场扫描全景</Link>
            <Link href="/" className="btn-ghost">查另一只股票</Link>
            <Link href={`/api/lookup?ticker=${params.ticker}`} className="btn-ghost" target="_blank">JSON API</Link>
          </div>
        </div>
      </section>

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">← 返回陪审团首页</Link>
      </footer>
    </main>
  );
}
