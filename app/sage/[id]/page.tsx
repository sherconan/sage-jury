import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Quote, ShieldAlert, Sparkles, TrendingUp, AlertCircle, Users, Target } from "lucide-react";
import { SAGES, SAGE_BY_ID } from "@/data/sages";
import { SageAvatar } from "@/components/SageAvatar";
import { evaluate } from "@/lib/engine";
import { LEADERBOARD_POOL, SCAN_INDUSTRY_DEFAULTS, type LeaderboardEntry } from "@/data/cases/leaderboard-pool";
import type { CaseInput } from "@/types";
import { cn, scoreBarColor, verdictColor } from "@/lib/utils";

const pickSecid = (t: string) =>
  /^[0-9]{6}$/.test(t) ? (t.startsWith("6") || t.startsWith("9") ? `1.${t}` : `0.${t}`) : `0.${t}`;

// 按 sage 偏好的 archetype（黑马/稳健/逆向）给一点点风格倾向
// 不破坏 evaluate() 的核心评分，只是同分时选谁的 tie-breaker
const SAGE_ARCHETYPE_PREF: Record<string, Record<string, number>> = {
  // 段永平 / 李录：稳健长期持久性
  "duan-yongping": { stable: 4, growth: 1, turnaround: 0, blackHorse: -3, cyclical: -3 },
  "li-lu":         { stable: 5, growth: 1, turnaround: 0, blackHorse: -3, cyclical: -3 },
  // 张坤：消费稳健
  "zhang-kun":     { stable: 4, growth: 2, turnaround: 0, blackHorse: -2, cyclical: -3 },
  // 老唐：长期复利
  "lao-tang":      { stable: 4, growth: 1, turnaround: 0, blackHorse: -2, cyclical: -2 },
  // 但斌：时间的玫瑰
  "dan-bin":       { stable: 4, growth: 2, turnaround: 0, blackHorse: -1, cyclical: -2 },
  // 林园：医药消费
  "lin-yuan":      { stable: 4, growth: 1, turnaround: 0, blackHorse: -1, cyclical: -2 },
  // 巴菲特：经典价值
  "buffett":       { stable: 5, growth: 1, turnaround: 1, blackHorse: -2, cyclical: -2 },
  // 邱国鹭：经典价值
  "qiu-guolu":     { stable: 4, growth: 1, turnaround: 2, blackHorse: -1, cyclical: 0 },
  // 马自冰：雪湖
  "ma-zibing":     { stable: 0, growth: 2, turnaround: 1, blackHorse: 3, cyclical: 0 },
  // 冯柳：弱者体系（逆向）
  "feng-liu":      { stable: 0, growth: 1, turnaround: 5, blackHorse: 2, cyclical: 1 },
  // 管我财：低估逆向
  "guan-wo-cai":   { stable: 1, growth: 0, turnaround: 5, blackHorse: -1, cyclical: 2 },
  // 杨东：宏观周期 / 逆向
  "yang-dong":     { stable: 1, growth: 0, turnaround: 4, blackHorse: 1, cyclical: 3 },
  // 风和资本（吴任昊 / Matt Hu）：成长 + 集中
  "fenghe-wu":     { stable: 2, growth: 5, turnaround: 1, blackHorse: 2, cyclical: -1 },
  // 邓晓峰：深度价值
  "deng-xiaofeng": { stable: 4, growth: 1, turnaround: 3, blackHorse: -1, cyclical: 1 },
  // 赵军（淡水泉）：逆向 + 拐点
  "zhao-jun":      { stable: 0, growth: 2, turnaround: 5, blackHorse: 2, cyclical: 1 },
  // 蒋锦志（景林）：全球品牌
  "jiang-jinzhi":  { stable: 4, growth: 3, turnaround: 0, blackHorse: -1, cyclical: -2 },
  // 王亚伟：黑马 / 拐点
  "wang-yawei":    { stable: 0, growth: 2, turnaround: 3, blackHorse: 6, cyclical: 1 },
  // 陈光明（睿远）：均衡价值
  "chen-guangming":{ stable: 3, growth: 2, turnaround: 1, blackHorse: 0, cyclical: 0 },
  // 谢治宇（兴全）：长期价值
  "xie-zhiyu":     { stable: 4, growth: 2, turnaround: 0, blackHorse: 0, cyclical: -1 },
};

// 「为什么这只股票」一句话点题——根据 sage 方法论 + 股票指纹生成
function whyPickRationale(sageId: string, p: LeaderboardEntry, name: string): string {
  const sigs: string[] = [];
  if (p.roe !== undefined && p.roe >= 0.20) sigs.push(`ROE ${(p.roe*100).toFixed(0)}%`);
  if (p.fcfMargin !== undefined && p.fcfMargin >= 0.25) sigs.push(`FCF ${(p.fcfMargin*100).toFixed(0)}%`);
  if (p.divYield !== undefined && p.divYield >= 0.04) sigs.push(`股息 ${(p.divYield*100).toFixed(1)}%`);
  if (p.brandStrength !== undefined && p.brandStrength >= 5) sigs.push(`品牌 5/5`);
  if (p.monopolyLevel !== undefined && p.monopolyLevel >= 5) sigs.push(`垄断 5/5`);
  const sig = sigs.slice(0, 3).join(" · ");

  // 各 sage 方法论 + archetype 对话
  switch (sageId) {
    case "li-lu":
      return p.growthArchetype === "stable"
        ? `10 年后还在的生意 ${sig ? `· ${sig}` : ""}——李录看护城河持久性`
        : `具备复利时间窗口 ${sig ? `· ${sig}` : ""}`;
    case "duan-yongping":
      return p.brandStrength && p.brandStrength >= 4
        ? `商业模式优秀 + 品牌护城河 ${sig ? `· ${sig}` : ""}——本分型生意`
        : `生意结构清晰 ${sig ? `· ${sig}` : ""}`;
    case "buffett":
      return `消费品牌持久 + 现金流稳定 ${sig ? `· ${sig}` : ""}——经典价值标的`;
    case "feng-liu":
    case "zhao-jun":
      return p.growthArchetype === "turnaround"
        ? `已被市场低估 + 拐点信号 ${sig ? `· ${sig}` : ""}——弱者体系/逆向窗口`
        : `估值合理 + 待催化 ${sig ? `· ${sig}` : ""}`;
    case "guan-wo-cai":
      return p.divYield && p.divYield >= 0.04
        ? `${sig}——股息支撑 + 下行有保护，符合"低估逆向平均赢"`
        : `定量过线 ${sig ? `· ${sig}` : ""}——排雷过关`;
    case "yang-dong":
      return `${sig}——周期低位 + 现金保护，宁泉风格`;
    case "jiang-jinzhi":
      return p.brandStrength && p.brandStrength >= 4
        ? `全球品牌格局 ${sig ? `· ${sig}` : ""}——景林全球价值`
        : `跨周期消费品 ${sig ? `· ${sig}` : ""}`;
    case "fenghe-wu":
      return `集中长持 + 增长复利 ${sig ? `· ${sig}` : ""}——风和 5M 框架`;
    case "deng-xiaofeng":
      return p.growthArchetype === "stable"
        ? `深度价值 + ROE 持久 ${sig ? `· ${sig}` : ""}——高毅纪律派`
        : `估值合理 ${sig ? `· ${sig}` : ""}`;
    case "wang-yawei":
      return `黑马拐点 + 市场未充分认知 ${sig ? `· ${sig}` : ""}`;
    case "lao-tang":
      return `老唐估值法过关 ${sig ? `· ${sig}` : ""}——长期复利`;
    case "chen-guangming":
      return `均衡价值 + 竞争优势 ${sig ? `· ${sig}` : ""}——睿远风格`;
    case "xie-zhiyu":
      return `长期价值 + 复利窗口 ${sig ? `· ${sig}` : ""}——兴证全球`;
    case "ma-zibing":
      return `没有欺诈风险 + 业务可验证 ${sig ? `· ${sig}` : ""}——雪湖排雷过关`;
    case "qiu-guolu":
      return `好生意 + 好价格 ${sig ? `· ${sig}` : ""}——经典价值`;
    case "zhang-kun":
      return `消费稳健 + 长期持有 ${sig ? `· ${sig}` : ""}`;
    default:
      return sig || "方法论评分过线";
  }
}

async function scanForSage(sageId: string) {
  const archPref = SAGE_ARCHETYPE_PREF[sageId] || {};
  const results = await Promise.all(LEADERBOARD_POOL.map(async (p: LeaderboardEntry) => {
    const secid = pickSecid(p.code);
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
      const indDef = SCAN_INDUSTRY_DEFAULTS[p.category] || {};
      // 优先使用每只股票自带的指纹，行业默认值兜底
      const input: CaseInput = {
        ticker: p.code, name, industry: p.category, briefBusiness: name,
        pe: div(d.f162), pb: div(d.f167),
        monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 3,
        techDisruption: 3, regulatoryRisk: 3, managementQuality: 3, cyclical: false,
        intendedHoldYears: 5,
        ...indDef,
        // 每股指纹（最高优先级）
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
      const r = evaluate(input, [sageId]);
      const v = r.verdicts[0];
      // 风格加权：每位大佬对 archetype 的偏好作为 tie-breaker（最多±6 分）
      const archBonus = (p.growthArchetype && archPref[p.growthArchetype]) || 0;
      return { code: p.code, name, category: p.category, pe: div(d.f162),
        score: v.finalScore + archBonus,
        rawScore: v.finalScore,
        label: v.verdictLabel.split(" · ")[0], grade: v.letterGrade, oneLine: v.oneLine,
        archetype: p.growthArchetype,
        why: whyPickRationale(sageId, p, name) };
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean).sort((a: any, b: any) => b.score - a.score).slice(0, 5);
}

export function generateStaticParams() {
  return SAGES.map((s) => ({ id: s.id }));
}

export function generateMetadata({ params }: { params: { id: string } }) {
  const sage = SAGE_BY_ID[params.id];
  if (!sage) return { title: "未找到" };
  return {
    title: `${sage.name} · 投资方法论 | 大佬陪审团`,
    description: `${sage.title} — ${sage.coreLine}`,
  };
}

export default async function SageDetailPage({ params }: { params: { id: string } }) {
  const sage = SAGE_BY_ID[params.id];
  if (!sage) notFound();
  const topPicks = await scanForSage(params.id);

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">JUSTICE PROFILE</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-12 md:py-16">
          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            <SageAvatar
              initials={sage.avatar}
              bgColor={sage.color}
              accentColor={sage.accentColor}
              size="xl"
            />
            <div className="flex-1">
              <div className="ornament-line max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
                <span>The Justice</span>
              </div>
              <h1 className="mt-3 font-serif text-4xl font-bold text-navy-700 md:text-5xl">{sage.name}</h1>
              <p className="mt-1 text-ink-600">{sage.title}</p>
              <p className="mt-1 text-xs font-mono uppercase tracking-widest text-ink-500">
                {sage.era} · {sage.school.toUpperCase()}
              </p>
              <p className="mt-5 font-serif text-xl italic leading-relaxed text-ink-800">
                "{sage.coreLine}"
              </p>
              <p className="mt-4 text-ink-700">{sage.philosophy}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="font-serif text-2xl font-bold text-navy-700">
            <BookOpen className="mr-2 inline h-5 w-5" />
            五个评分维度
          </h2>
          <p className="mt-1 text-sm text-ink-600">这是 {sage.name} 评估一笔交易决策时的核心结构。</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {sage.dimensions.map((d, i) => (
              <div key={d.key} className="court-card p-5">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-serif text-lg font-bold text-ink-900">
                    {String(i + 1).padStart(2, "0")} {d.label}
                  </h3>
                  <span className="font-mono text-sm font-medium text-gold-600">{(d.weight * 100).toFixed(0)}%</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">{d.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="font-serif text-2xl font-bold text-red-700">
            <ShieldAlert className="mr-2 inline h-5 w-5" />
            红旗与一票否决
          </h2>
          <p className="mt-1 text-sm text-ink-600">触发任何一项即直接下调评分等级，部分 veto 项一票否决。</p>
          <div className="mt-6 space-y-3">
            {sage.redFlags.map((f) => (
              <div key={f.key} className="rounded-xl border border-red-200 bg-red-50/60 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-serif text-lg font-bold text-red-900">{f.label}</h3>
                    <p className="mt-1 text-sm text-red-800">{f.trigger}</p>
                  </div>
                  <span
                    className={
                      "rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-wider " +
                      (f.severity === "veto"
                        ? "bg-red-700 text-white"
                        : f.severity === "major"
                        ? "bg-red-200 text-red-900"
                        : "bg-amber-200 text-amber-900")
                    }
                  >
                    {f.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="font-serif text-2xl font-bold text-emerald-700">
            <Sparkles className="mr-2 inline h-5 w-5" />
            加分项
          </h2>
          <ul className="mt-6 grid gap-2 md:grid-cols-2">
            {sage.bonus.map((b, i) => (
              <li key={i} className="rounded-lg border border-emerald-300 bg-emerald-50/60 px-4 py-3 text-emerald-900">
                ✦ {b}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {topPicks.length > 0 && (
        <section className="border-b border-ink-200/60 bg-gradient-to-b from-emerald-50/40 to-cream-50/40">
          <div className="mx-auto max-w-5xl px-5 py-12">
            <h2 className="font-serif text-2xl font-bold text-navy-700">
              <Target className="mr-2 inline h-5 w-5 text-emerald-600" />
              {sage.name} 今天会买的 Top 5
            </h2>
            <p className="mt-1 text-sm text-ink-600">
              用 {sage.name} 自己的方法论，扫描 24 只 A 股龙头池，给出该方法论下评分最高的 5 只。
              <span className="font-mono text-xs text-emerald-700">数据每 30 分钟刷新</span>
            </p>
            <div className="mt-6 space-y-3">
              {topPicks.map((p: any, i: number) => (
                <Link key={p.code} href={`/stock/${p.code}`}
                  className="court-card group flex items-center gap-4 p-4 transition-all hover:shadow-gold">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-gold-400 bg-cream-50 font-serif text-base font-bold text-gold-700">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-serif text-lg font-bold text-ink-900 group-hover:text-navy-700">{p.name}</h3>
                    <p className="text-xs text-ink-500">{p.code} · {p.category} · PE {p.pe?.toFixed(1) || "-"}</p>
                    {p.why && (
                      <p className="mt-1.5 inline-block rounded-md bg-emerald-50 border border-emerald-200/70 px-2 py-1 text-[11px] text-emerald-800">
                        <span className="font-medium text-emerald-700">为什么这只 · </span>{p.why}
                      </p>
                    )}
                    <p className="mt-1.5 font-serif text-sm italic text-ink-700">"{p.oneLine}"</p>
                  </div>
                  <div className="text-right">
                    <div className="font-serif text-3xl font-bold text-navy-700">{p.score}</div>
                    <span className={cn("verdict-stamp text-[10px] mt-1 inline-block", verdictColor(
                      p.score >= 85 ? "STRONG_BUY" : p.score >= 70 ? "BUY" : p.score >= 50 ? "HOLD" : p.score >= 30 ? "AVOID" : "STRONG_AVOID"
                    ))}>
                      {p.label}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="font-serif text-2xl font-bold text-navy-700">
            <TrendingUp className="mr-2 inline h-5 w-5" />
            历史代表性投资
          </h2>
          <ul className="mt-6 space-y-3">
            {sage.representativeTrades.map((t, i) => (
              <li key={i} className="rounded-lg border border-ink-200 bg-cream-50 px-5 py-3 text-ink-800">
                <span className="mr-3 font-mono text-xs font-bold text-gold-600">CASE {String(i + 1).padStart(2, "0")}</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {sage.misuseWarnings && sage.misuseWarnings.length > 0 && (
        <section className="border-b border-ink-200/60 bg-amber-50/30">
          <div className="mx-auto max-w-5xl px-5 py-12">
            <h2 className="font-serif text-2xl font-bold text-amber-900">
              <AlertCircle className="mr-2 inline h-5 w-5" />
              误用警告 — 什么时候不该用 {sage.name} 的方法论
            </h2>
            <p className="mt-1 text-sm text-amber-800">
              没有一种方法论适用于所有场景。{sage.name} 的强项之外，是他主动选择不进的领域——硬套等于自取其辱。
            </p>
            <div className="mt-6 space-y-3">
              {sage.misuseWarnings.map((w, i) => (
                <div key={i} className="rounded-xl border border-amber-300 bg-cream-50 p-4">
                  <p className="text-amber-900">⚠️ {w}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {sage.complementarySages && sage.complementarySages.length > 0 && (
        <section className="border-b border-ink-200/60">
          <div className="mx-auto max-w-5xl px-5 py-12">
            <h2 className="mb-2 font-serif text-2xl font-bold text-navy-700">
              <Users className="mr-2 inline h-5 w-5" />
              互补陪审员 — 谁能校验 {sage.name} 的盲区
            </h2>
            <p className="mb-6 text-sm text-ink-600">
              当 {sage.name} 给出强烈意见时，这两位的反对声音最值得留意——他们从不同视角看到 {sage.name} 看不到的东西。
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {sage.complementarySages.map((id) => {
                const c = SAGE_BY_ID[id];
                if (!c) return null;
                return (
                  <Link
                    key={id}
                    href={`/sage/${c.id}`}
                    className="court-card group flex items-start gap-4 p-5 transition-all hover:shadow-gold"
                    style={{ borderLeftColor: c.accentColor, borderLeftWidth: 4 }}
                  >
                    <SageAvatar initials={c.avatar} bgColor={c.color} accentColor={c.accentColor} size="md" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-serif text-lg font-bold text-ink-900 group-hover:text-navy-700">{c.name}</h3>
                      <p className="text-xs text-ink-500">{c.school.toUpperCase()}</p>
                      <p className="mt-2 font-serif italic text-ink-700">"{c.coreLine}"</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="font-serif text-2xl font-bold text-navy-700">
            <Quote className="mr-2 inline h-5 w-5" />
            金句箴言
          </h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {sage.quotes.map((q, i) => (
              <blockquote
                key={i}
                className="rounded-xl border-l-4 bg-cream-50 p-5 shadow-bench"
                style={{ borderLeftColor: sage.accentColor }}
              >
                <p className="font-serif text-lg italic leading-relaxed text-ink-800">"{q}"</p>
                <p className="mt-2 text-right text-xs text-ink-500">—— {sage.name}</p>
              </blockquote>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-ink-500">资料来源：{sage.bookOrSource}</p>
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
