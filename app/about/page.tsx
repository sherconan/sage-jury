// /about — 为什么是这 14 位（大众 8 + 圈内 6）
import Link from "next/link";
import { ArrowLeft, BookOpen, Compass, ShieldCheck, Users2, Sparkles } from "lucide-react";
import { SAGES } from "@/data/sages";
import { SageAvatar } from "@/components/SageAvatar";

export const metadata = {
  title: "为什么是这 14 位？| 大佬陪审团",
  description: "陪审团成员选择标准——8 位大众派（高曝光度 + 公开方法论）+ 6 位圈内派（资管巨头但极少露面）。",
};

const POPULAR = SAGES.filter(s => s.tier === "popular");
const INSIDERS = SAGES.filter(s => s.tier === "insider");

const INSIDER_PROOF: Record<string, { proof: string; aum: string; rare: string }> = {
  "li-lu": {
    proof: "查理·芒格 2017 年公开称：'李录是我能想到的唯一一个我会把家族财富托付给他管理的中国人'。巴菲特 2008 年通过李录推荐买入比亚迪。",
    aum: "喜马拉雅资本 30 年复合年化 16% (Columbia 大学背书)",
    rare: "几乎从不接受媒体采访，30 年只出过 1 本书《文明、现代化、价值投资与中国》"
  },
  "fenghe-wu": {
    proof: "前金石资本 / Maverick Capital 系。亚洲对冲基金圈年度致投资人信被持续传阅。",
    aum: "风和资本 FengHe Asia AUM > 50 亿美元（圈内估算）",
    rare: "公开演讲极少，主要在 GMIC 等闭门会议 + 年度致投资人信"
  },
  "deng-xiaofeng": {
    proof: "前博时基金明星基金经理（2002-2014），2014 加入高毅与冯柳同事但风格相反。圈内被称'A 股最深的研究'。",
    aum: "高毅资产 AUM > 1500 亿元（中国最大主观多头之一）",
    rare: "极少接受公开访谈，主要通过高毅季报对外发声"
  },
  "zhao-jun": {
    proof: "前嘉实基金 / 卖方研究员，2007 年创立淡水泉。跟冯柳的弱者体系区分：赵军更纪律化，要业绩拐点 + 管理层变革双重信号。",
    aum: "淡水泉 AUM > 600 亿元",
    rare: "每年只通过年度致投资人信对外发声"
  },
  "jiang-jinzhi": {
    proof: "中国版 PIMCO。2010s 早期重仓拼多多 Pre-IPO + 全球 LVMH/Hermès 类消费股 + 中概互联深度配置。",
    aum: "景林资产 AUM > 800 亿美元（亚洲最大对冲基金之一）",
    rare: "几乎从不公开露面，每年只通过年度致投资人信对外发声"
  },
  "wang-yawei": {
    proof: "前华夏大盘精选基金经理（2005-2012），公募时代连续 7 年战胜大盘，年化 49%。2012 年创立千合资本后完全淡出公众视野。",
    aum: "千合资本 AUM 估算 > 200 亿元",
    rare: "2012 年创立千合后基本不再公开露面，圈内每次操作被传为传奇"
  },
};

export default function AboutPage() {
  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">SELECTION RATIONALE</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-3xl px-5 py-16">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>Why These 14</span>
          </p>
          <h1 className="mt-4 text-center font-serif text-4xl font-bold text-navy-700 md:text-5xl">为什么是这 14 位？</h1>
          <p className="mx-auto mt-5 max-w-2xl text-center font-serif text-lg italic text-ink-700">
            "陪审团不是越多越好，是<span className="not-italic font-bold text-navy-700">大众权威 + 圈内深度</span>的互补。"
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-amber-700">大众派 (8)</p>
              <p className="mt-1 font-serif text-3xl font-bold text-amber-800">高曝光 · 高可查证</p>
              <p className="mt-1 text-xs text-amber-700">公开方法论书 / 季报 / 访谈丰富</p>
            </div>
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center">
              <p className="font-mono text-xs uppercase tracking-widest text-emerald-700">圈内派 (6)</p>
              <p className="mt-1 font-serif text-3xl font-bold text-emerald-800">圈内权威 · 极少露面</p>
              <p className="mt-1 text-xs text-emerald-700">大众不熟 / AUM 巨大 / 圈内传阅</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="mb-2 font-serif text-2xl font-bold text-navy-700">
            <Sparkles className="mr-2 inline h-5 w-5 text-emerald-600" /> 圈内派 6 位 · 圈内地位佐证
          </h2>
          <p className="mb-6 text-sm text-ink-600">这 6 位的方法论都有公开可查的来源——不是我们编的。每位列出"圈内地位 + AUM + 为什么大众不熟"。</p>
          <div className="space-y-5">
            {INSIDERS.map((s) => {
              const proof = INSIDER_PROOF[s.id];
              return (
                <div key={s.id} className="court-card p-5" style={{ borderLeftColor: s.accentColor, borderLeftWidth: 4 }}>
                  <div className="flex items-start gap-4">
                    <SageAvatar initials={s.avatar} bgColor={s.color} accentColor={s.accentColor} size="lg" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link href={`/sage/${s.id}`} className="font-serif text-2xl font-bold text-ink-900 hover:text-navy-700">{s.name}</Link>
                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-emerald-700 border border-emerald-300">圈内</span>
                      </div>
                      <p className="text-sm text-ink-600">{s.title}</p>
                      <p className="mt-2 font-serif italic text-ink-700">"{s.coreLine}"</p>
                      {proof && (
                        <div className="mt-4 grid gap-2 text-sm">
                          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                            <p className="text-[10px] uppercase font-mono text-emerald-700">圈内地位</p>
                            <p className="text-emerald-900">{proof.proof}</p>
                          </div>
                          <div className="grid gap-2 md:grid-cols-2">
                            <div className="rounded-md border border-ink-200 bg-cream-50 px-3 py-2">
                              <p className="text-[10px] uppercase font-mono text-ink-500">AUM 规模</p>
                              <p className="text-ink-800">{proof.aum}</p>
                            </div>
                            <div className="rounded-md border border-ink-200 bg-cream-50 px-3 py-2">
                              <p className="text-[10px] uppercase font-mono text-ink-500">为什么大众不熟</p>
                              <p className="text-ink-800">{proof.rare}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h2 className="mb-6 font-serif text-2xl font-bold text-navy-700">大众派 8 位 · 高曝光高可查证</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {POPULAR.map((s) => (
              <Link key={s.id} href={`/sage/${s.id}`}
                className="court-card group flex items-start gap-3 p-4 transition-all hover:shadow-gold"
                style={{ borderLeftColor: s.accentColor, borderLeftWidth: 4 }}>
                <SageAvatar initials={s.avatar} bgColor={s.color} accentColor={s.accentColor} size="sm" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-base font-bold text-ink-900 group-hover:text-navy-700">{s.name}</h3>
                  <p className="text-xs text-ink-500">{s.title.split(" · ")[0]}</p>
                  <p className="mt-1 font-serif text-sm italic text-ink-700">"{s.coreLine}"</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <h2 className="mb-4 font-serif text-2xl font-bold text-navy-700"><Compass className="mr-2 inline h-5 w-5" />三条选人标准</h2>
          <div className="space-y-4 text-ink-700">
            <p><strong>1. 风格必须互补</strong>——价值派 / 逆向派 / 消费派 / 嘴巴股 / 集中派 / 护城河派 / 全球派 / 黑马派——同一笔交易在不同视角下的得分差异本身就是最有价值的信息。</p>
            <p><strong>2. 必须有公开可查方法论</strong>——大佬必须有书、季报、访谈或长期公开发言可追溯。每位陪审员的评分维度都来自其公开方法论文本，不是脑补。</p>
            <p><strong>3. 大众权威 + 圈内深度结合</strong>——单纯大众派容易抱团（认知重叠），单纯圈内派验证难度大。8+6 配比让陪审团既有可信度又有差异化。</p>
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-3xl px-5 py-12 text-center">
          <h2 className="font-serif text-2xl font-bold text-navy-700">现在试一试</h2>
          <p className="mt-2 text-ink-600">提交一笔交易决策，看 14 位陪审员怎么投票——尤其留意圈内 6 位是否跟大众派的判断有差异。</p>
          <Link href="/" className="btn-primary mt-6 inline-flex">⚡ 输代码 3 秒看 14 大佬投票 →</Link>
        </div>
      </section>

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">← 返回陪审团首页</Link>
      </footer>
    </main>
  );
}
