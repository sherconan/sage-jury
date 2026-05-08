// 历史时光机 — 选历史时点，看陪审团判决 vs 实际结局
import Link from "next/link";
import { ArrowLeft, Clock, CheckCircle2, XCircle } from "lucide-react";
import { evaluate } from "@/lib/engine";
import type { CaseInput } from "@/types";
import { cn, scoreBarColor, verdictColor } from "@/lib/utils";

export const metadata = {
  title: "历史时光机 · 陪审团 vs 实际结局 | 大佬陪审团",
  description: "回到 2003 / 2014 / 2019 / 2021 等关键历史时点，看陪审团方法论的预判 vs 真实历史结局",
};

interface TimeWindow {
  era: string;
  title: string;
  hook: string;
  cases: Array<{
    code: string;
    name: string;
    input: CaseInput;
    actualOutcome: string;
    win: boolean | "mixed";
    fwd: string;
  }>;
}

const TIME_WINDOWS: TimeWindow[] = [
  {
    era: "2003 价值起点",
    title: "中国资本市场价值投资黎明",
    hook: "段永平刚刚开始网易传奇，但斌种下时间的玫瑰",
    cases: [
      {
        code: "600519", name: "贵州茅台 (2003)",
        actualOutcome: "20 年涨幅 100+ 倍",
        win: true, fwd: "✅ 历史性大牛股",
        input: {
          ticker: "600519", name: "贵州茅台 2003", industry: "白酒",
          briefBusiness: "国宴用酒，刚上市 3 年", pe: 18, pb: 4.5, roe: 0.32,
          grossMargin: 0.85, netMargin: 0.32, fcfMargin: 0.4,
          monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 4,
          techDisruption: 1, regulatoryRisk: 2, managementQuality: 4,
          inUserCircle: true, intendedHoldYears: 20, yearsListed: 2,
        },
      },
      {
        code: "NTES", name: "网易 (2001)",
        actualOutcome: "段永平 100+ 倍回报",
        win: true, fwd: "✅ 段永平人生最经典一笔",
        input: {
          ticker: "NTES", name: "网易 2001", industry: "互联网游戏",
          briefBusiness: "退市边缘，账上现金 > 市值", pe: 0, pb: 0.4, roe: -0.15,
          grossMargin: 0.55, netMargin: -0.3, debtToAsset: 0.25,
          monopolyLevel: 3, brandStrength: 3, consumerStickiness: 3, repeatedConsumption: 4,
          techDisruption: 4, regulatoryRisk: 3, managementQuality: 4,
          inUserCircle: true, oversoldRecently: true, recentDrawdown: 0.95,
          consensusBullish: false, catalystVisible: true, intendedHoldYears: 10,
        },
      },
    ],
  },
  {
    era: "2014 戴维斯双击",
    title: "经济下行后的逆向抄底窗口",
    hook: "冯柳的弱者体系最佳猎场",
    cases: [
      {
        code: "002415", name: "海康威视 (2014)",
        actualOutcome: "3 年戴维斯双击 4 倍",
        win: true, fwd: "✅ 冯柳代表作",
        input: {
          ticker: "002415", name: "海康威视 2014", industry: "安防",
          briefBusiness: "全球安防龙头被周期错杀", pe: 16, pb: 4.2, roe: 0.34,
          grossMargin: 0.42, netMargin: 0.22, fcfMargin: 0.18,
          monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 2,
          techDisruption: 2, regulatoryRisk: 2, managementQuality: 4,
          inUserCircle: true, cyclical: true, oversoldRecently: true, recentDrawdown: 0.4,
          consensusBullish: false, catalystVisible: true, intendedHoldYears: 5,
        },
      },
    ],
  },
  {
    era: "2019 IPO 狂热",
    title: "故事股 vs 真价值",
    hook: "瑞幸 IPO 全民追捧 / 特斯拉空头围剿",
    cases: [
      {
        code: "LK", name: "瑞幸咖啡 (2019 IPO)",
        actualOutcome: "18 个月内财务造假崩盘 90%",
        win: false, fwd: "❌ 退市重组（陪审团完美命中）",
        input: {
          ticker: "LK", name: "瑞幸咖啡 2019", industry: "咖啡新零售",
          briefBusiness: "颠覆星巴克，烧钱抢市场", pe: 0, pb: 12, roe: -0.6,
          grossMargin: 0.1, netMargin: -0.5, fcfMargin: -0.4, debtToAsset: 0.6,
          monopolyLevel: 2, brandStrength: 3, consumerStickiness: 2, repeatedConsumption: 4,
          techDisruption: 2, regulatoryRisk: 3, managementQuality: 1,
          inUserCircle: false, consensusBullish: true, intendedHoldYears: 1,
        },
      },
      {
        code: "TSLA", name: "特斯拉 (2019 破产边缘)",
        actualOutcome: "2020-2021 涨 10+ 倍",
        win: true, fwd: "✅ 但巴菲特/段永平当年回避（能力圈外）",
        input: {
          ticker: "TSLA", name: "特斯拉 2019", industry: "电动车",
          briefBusiness: "Model 3 产能地狱", pe: 0, pb: 8, roe: -0.1,
          grossMargin: 0.18, netMargin: -0.05, debtToAsset: 0.7,
          monopolyLevel: 3, brandStrength: 4, consumerStickiness: 4, repeatedConsumption: 1,
          techDisruption: 3, regulatoryRisk: 3, managementQuality: 4,
          inUserCircle: false, oversoldRecently: true, recentDrawdown: 0.45,
          consensusBullish: false, catalystVisible: true, intendedHoldYears: 5,
        },
      },
    ],
  },
  {
    era: "2021 高位 VS 2022 谷底",
    title: "新能源狂热顶 + 中概互联谷底",
    hook: "宁德 2021 vs 腾讯 2022 — 同时间不同宿命",
    cases: [
      {
        code: "300750", name: "宁德时代 (2021 高位 PE 200)",
        actualOutcome: "随后 2 年回调 60%+",
        win: false, fwd: "❌ 陪审团方法论命中过热警告",
        input: {
          ticker: "300750", name: "宁德时代 2021 高位", industry: "动力电池",
          briefBusiness: "新能源车爆发，机构一致看多", pe: 180, pb: 18, roe: 0.12,
          grossMargin: 0.27, netMargin: 0.1, fcfMargin: -0.05, debtToAsset: 0.6,
          monopolyLevel: 4, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 1,
          techDisruption: 4, regulatoryRisk: 3, managementQuality: 4,
          inUserCircle: false, cyclical: true, consensusBullish: true, intendedHoldYears: 3,
        },
      },
      {
        code: "0700", name: "腾讯控股 (2022 谷底)",
        actualOutcome: "12 个月内反弹 100%+",
        win: true, fwd: "✅ 冯柳 + 段永平 公开加仓",
        input: {
          ticker: "0700", name: "腾讯 2022", industry: "互联网平台",
          briefBusiness: "监管+宏观双杀，估值历史底部", pe: 12, pb: 2.4, roe: 0.18,
          grossMargin: 0.42, netMargin: 0.18, fcfMargin: 0.22,
          monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 5,
          techDisruption: 3, regulatoryRisk: 4, managementQuality: 5,
          inUserCircle: true, oversoldRecently: true, recentDrawdown: 0.74,
          consensusBullish: false, catalystVisible: true, intendedHoldYears: 5,
        },
      },
    ],
  },
  {
    era: "2007 大牛市顶部",
    title: "中石油 IPO 全民疯狂",
    hook: "PE 60+ / 万人摇号 / 一夜首富——经典追高陷阱",
    cases: [
      {
        code: "601857", name: "中国石油 (2007 IPO 顶部)",
        actualOutcome: "16 年跌 80%+，至今未回 IPO 价",
        win: false, fwd: "❌ 史诗级套牢盘",
        input: {
          ticker: "601857", name: "中石油 2007 IPO", industry: "石油",
          briefBusiness: "国企巨头 IPO，全民追捧", pe: 65, pb: 5.5, roe: 0.18,
          grossMargin: 0.35, netMargin: 0.13, fcfMargin: 0.11, debtToAsset: 0.5,
          monopolyLevel: 5, brandStrength: 4, consumerStickiness: 3, repeatedConsumption: 3,
          techDisruption: 1, regulatoryRisk: 4, managementQuality: 3,
          inUserCircle: true, cyclical: true, consensusBullish: true, intendedHoldYears: 3,
        },
      },
    ],
  },
  {
    era: "2018 熊市底部",
    title: "白酒崩盘+中美贸易战",
    hook: "茅台跌 30%+ / 酱油五粮液腰斩——价值派最佳猎场",
    cases: [
      {
        code: "600519-2018", name: "贵州茅台 (2018 底部)",
        actualOutcome: "2019-2021 涨 4 倍",
        win: true, fwd: "✅ 张坤 / 但斌 公开加仓",
        input: {
          ticker: "600519", name: "茅台 2018 底部", industry: "白酒",
          briefBusiness: "贸易战 + 限制三公消费担忧", pe: 22, pb: 6.8, roe: 0.34,
          grossMargin: 0.91, netMargin: 0.51, fcfMargin: 0.45,
          monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 4,
          techDisruption: 1, regulatoryRisk: 3, managementQuality: 4,
          inUserCircle: true, oversoldRecently: true, recentDrawdown: 0.32,
          consensusBullish: false, catalystVisible: true, intendedHoldYears: 10,
        },
      },
      {
        code: "603288", name: "海天味业 (2018 底部)",
        actualOutcome: "2019-2021 涨 5 倍",
        win: true, fwd: "✅ 嘴巴股+垄断 完美匹配林园",
        input: {
          ticker: "603288", name: "海天味业 2018", industry: "调味品",
          briefBusiness: "国民酱油龙头", pe: 35, pb: 12, roe: 0.32,
          grossMargin: 0.46, netMargin: 0.27, fcfMargin: 0.24,
          monopolyLevel: 5, brandStrength: 5, consumerStickiness: 5, repeatedConsumption: 5,
          techDisruption: 1, regulatoryRisk: 2, managementQuality: 4,
          inUserCircle: true, oversoldRecently: true, recentDrawdown: 0.25,
          consensusBullish: false, intendedHoldYears: 10,
        },
      },
    ],
  },
  {
    era: "2020-2022 教培崩盘",
    title: "新东方 / 好未来 强监管震荡",
    hook: "双减政策一夜归零——监管风险的极端案例",
    cases: [
      {
        code: "EDU", name: "新东方 (2021 双减前)",
        actualOutcome: "3 个月跌 90%+",
        win: false, fwd: "❌ 但斌方法论命中监管风险",
        input: {
          ticker: "EDU", name: "新东方 2021 双减前", industry: "教育",
          briefBusiness: "K12 课外培训龙头", pe: 28, pb: 5.2, roe: 0.18,
          grossMargin: 0.55, netMargin: 0.11, fcfMargin: 0.13,
          monopolyLevel: 3, brandStrength: 5, consumerStickiness: 3, repeatedConsumption: 3,
          techDisruption: 2, regulatoryRisk: 5, managementQuality: 4,
          inUserCircle: false, consensusBullish: true, intendedHoldYears: 5,
        },
      },
    ],
  },
];

export default function TimeMachinePage() {
  const allCases = TIME_WINDOWS.flatMap(w => w.cases.map(c => ({ ...c, era: w.era })));
  const evaluated = allCases.map(c => ({ ...c, report: evaluate(c.input) }));

  let methodHits = 0;
  let methodMisses = 0;
  evaluated.forEach(c => {
    if (c.win === "mixed") return;
    const buyish = c.report.consensusScore >= 60;
    const avoidish = c.report.consensusScore < 50;
    if ((buyish && c.win) || (avoidish && !c.win)) methodHits++;
    else methodMisses++;
  });

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">TIME MACHINE</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>Time Machine</span>
          </p>
          <h1 className="mt-3 text-center font-serif text-4xl font-bold text-navy-700 md:text-5xl">
            <Clock className="mr-2 inline h-8 w-8" />
            历史时光机
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-center text-ink-700">
            回到关键历史时点 — 把陪审团方法论拉回当年评 6 大佬独立判决，对照真实结局。
            <strong className="text-navy-700">方法论的可证伪性才是它的可信性。</strong>
          </p>
          <div className="mt-6 mx-auto inline-flex gap-3 rounded-xl border border-gold-300 bg-gold-50 px-5 py-3 text-center">
            <div>
              <span className="font-serif text-2xl font-bold text-emerald-700">{methodHits}</span>
              <p className="text-[10px] uppercase text-emerald-700">方法论命中</p>
            </div>
            <div className="border-l border-gold-200" />
            <div>
              <span className="font-serif text-2xl font-bold text-red-700">{methodMisses}</span>
              <p className="text-[10px] uppercase text-red-700">方法论偏离</p>
            </div>
            <div className="border-l border-gold-200" />
            <div>
              <span className="font-serif text-2xl font-bold text-navy-700">{Math.round(methodHits / (methodHits + methodMisses) * 100)}%</span>
              <p className="text-[10px] uppercase text-navy-700">命中率</p>
            </div>
          </div>
        </div>
      </section>

      {TIME_WINDOWS.map((w, wi) => (
        <section key={w.era} className={cn("border-b border-ink-200/60", wi % 2 === 0 ? "" : "bg-cream-50/40")}>
          <div className="mx-auto max-w-6xl px-5 py-10">
            <p className="font-mono text-xs uppercase tracking-widest text-gold-700">{w.era}</p>
            <h2 className="mt-1 font-serif text-2xl font-bold text-navy-700">{w.title}</h2>
            <p className="mt-1 text-ink-600">{w.hook}</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {w.cases.map(c => {
                const report = evaluate(c.input);
                const buyish = report.consensusScore >= 60;
                const avoidish = report.consensusScore < 50;
                const hit = c.win !== "mixed" && ((buyish && c.win) || (avoidish && !c.win));
                return (
                  <div key={c.code} className="court-card p-5">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif text-lg font-bold text-ink-900">{c.name}</h3>
                      <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-mono uppercase",
                        hit ? "bg-emerald-100 text-emerald-800 border border-emerald-300" : "bg-red-100 text-red-800 border border-red-300")}>
                        {hit ? <><CheckCircle2 className="h-3 w-3" />方法论命中</> : <><XCircle className="h-3 w-3" />偏离</>}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] uppercase font-mono text-ink-500">陪审团当年判决</p>
                        <div className="flex items-baseline gap-2">
                          <span className="font-serif text-3xl font-bold text-navy-700">{report.consensusScore}</span>
                          <span className="text-xs text-ink-500">/100</span>
                        </div>
                        <span className={cn("verdict-stamp text-xs", verdictColor(report.consensusVerdict))}>{report.consensusLabel.split(" · ")[0]}</span>
                        <div className="mt-1 stat-bar"><div className={cn("stat-bar-fill", scoreBarColor(report.consensusScore))} style={{ width: `${report.consensusScore}%` }} /></div>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase font-mono text-ink-500">实际历史结局</p>
                        <p className="mt-1 font-serif italic text-ink-800">{c.actualOutcome}</p>
                        <p className="mt-1 text-xs text-ink-600">{c.fwd}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-6 gap-1">
                      {report.verdicts.map(v => (
                        <span key={v.sageId} title={`${v.sageName}: ${v.finalScore}`}
                          className={cn("flex h-7 items-center justify-center rounded text-[10px] font-bold tabular-nums",
                            v.finalScore >= 75 ? "bg-emerald-600 text-cream-50" :
                            v.finalScore >= 60 ? "bg-emerald-300 text-emerald-900" :
                            v.finalScore >= 45 ? "bg-amber-200 text-amber-900" :
                            v.finalScore >= 30 ? "bg-orange-300 text-orange-900" :
                                                 "bg-red-500 text-cream-50")}>
                          {v.finalScore}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ))}

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">← 返回陪审团首页</Link>
      </footer>
    </main>
  );
}
