"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Gavel, Scale, Users, BookOpen, Sparkles, ChevronRight, ArrowDown, ExternalLink, Menu, X } from "lucide-react";
import { evaluate } from "@/lib/engine";
import { SAGES } from "@/data/sages";
import { PRESET_CASES } from "@/data/cases";
import type { CaseInput, JuryReport } from "@/types";
import { CaseInputForm } from "@/components/CaseInputForm";
import { SageVerdictCard } from "@/components/SageVerdictCard";
import { JuryReportPanel } from "@/components/JuryReportPanel";
import { SageAvatar } from "@/components/SageAvatar";
import { ShareBar } from "@/components/ShareBar";
import { RetrospectiveTable } from "@/components/RetrospectiveTable";
import { TodayHotCases } from "@/components/TodayHotCases";
import { QuickVerdict } from "@/components/QuickVerdict";
import { decodeCase } from "@/lib/share";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const [report, setReport] = useState<JuryReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSages, setExpandedSages] = useState<Set<string>>(new Set());
  const [presetInput, setPresetInput] = useState<Partial<CaseInput> | undefined>(undefined);
  const reportRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Load shared case from URL (?case=hash)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const hash = params.get("case");
    if (!hash) return;
    const decoded = decodeCase(hash);
    if (decoded && decoded.name) {
      setPresetInput(decoded);
      setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    }
  }, []);

  const handleSubmit = (input: CaseInput) => {
    setLoading(true);
    setExpandedSages(new Set());
    setTimeout(() => {
      const r = evaluate(input);
      setReport(r);
      setLoading(false);
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }, 600);
  };

  const loadPreset = (presetId: string) => {
    const p = PRESET_CASES.find(p => p.id === presetId);
    if (!p) return;
    setPresetInput({ ...p.input });
    setReport(null);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const toggleSage = (id: string) => {
    setExpandedSages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <main className="min-h-screen">
      {/* Top Bar */}
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="relative">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gold-400 bg-navy-700">
              <Gavel className="h-5 w-5 text-gold-300" />
            </div>
            <div>
              <h1 className="font-serif text-lg font-bold leading-none text-navy-700">大佬陪审团</h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-500">Sage Jury · v1</p>
            </div>
          </div>
          <div className="hidden items-center gap-5 text-sm md:flex">
            <a href="#jury" className="text-ink-700 hover:text-navy-700">陪审员</a>
            <a href="#cases" className="text-ink-700 hover:text-navy-700">历史案卷</a>
            <a href="/quotes" className="text-ink-700 hover:text-navy-700">金句墙</a>
            <a href="/about" className="text-ink-700 hover:text-navy-700">为什么是这 15 位</a>
            <a href="/dynamics" className="text-ink-700 hover:text-navy-700">相关性</a>
            <a href="/market" className="text-ink-700 hover:text-navy-700">市场扫描</a>
            <a href="/timemachine" className="text-ink-700 hover:text-navy-700">时光机</a>
            <a href="/watchlist" className="text-ink-700 hover:text-navy-700">自选股</a>
            <a href="/diff" className="text-ink-700 hover:text-navy-700">对比</a>
            <a href="/faq" className="text-ink-700 hover:text-navy-700">FAQ</a>
            <a href="/battle" className="text-ink-700 hover:text-navy-700">⚔️ 交易对线</a>
            <a href="/cli" className="text-ink-700 hover:text-navy-700">CLI</a>
            <a href="/embed" className="text-ink-700 hover:text-navy-700">Embed</a>
            <a href="/leaderboard" className="text-ink-700 hover:text-navy-700">榜单</a>
            <a href="#methodology" className="text-ink-700 hover:text-navy-700">方法论</a>
            <a href="#input" className="rounded-md bg-navy-700 px-3 py-1.5 text-cream-50 hover:bg-navy-800">提交案卷</a>
          </div>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="rounded-md p-2 text-ink-700 hover:bg-cream-100 md:hidden"
            aria-label="切换菜单"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-ink-200/60 bg-cream-50 md:hidden">
            <div className="flex flex-col gap-2 px-5 py-3 text-sm">
              {[
                { href: "#jury", label: "陪审员" },
                { href: "#cases", label: "历史案卷" },
                { href: "/quotes", label: "金句墙" },
                { href: "/about", label: "为什么是这 15 位" },
                { href: "/dynamics", label: "陪审员相关性" },
                { href: "#methodology", label: "方法论" },
              ].map((l) => (
                <a key={l.href} href={l.href} onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-2 text-ink-700 hover:bg-cream-100">
                  {l.label}
                </a>
              ))}
              <a href="#input" onClick={() => setMenuOpen(false)} className="rounded-md bg-navy-700 px-3 py-2 text-center font-medium text-cream-50">
                提交案卷
              </a>
            </div>
          </div>
        )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-ink-200/60">
        <div className="absolute inset-0 bg-gavel-rays opacity-70" />
        <div className="relative mx-auto max-w-7xl px-5 py-12 md:py-20">
          <div className="mx-auto max-w-4xl text-center">
            <div className="ornament-line mx-auto mb-5 max-w-xs text-[11px] font-mono uppercase tracking-[0.4em] text-gold-600 animate-fadeUp" style={{ animationDelay: '0.05s' }}>
              <span>The Court of Investment</span>
            </div>
            <h1 className="font-serif text-4xl font-bold leading-tight text-navy-700 sm:text-5xl md:text-7xl animate-fadeUp" style={{ animationDelay: '0.1s' }}>
              让 15 位投资大佬<br />
              <span className="text-navy-700">替你审判</span>
              <span className="relative inline-block">
                <span className="relative z-10">每一笔交易</span>
                <span className="absolute -bottom-1 left-0 right-0 h-3 bg-gold-300/55" />
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl font-serif text-base text-ink-700 sm:text-lg md:text-xl animate-fadeUp" style={{ animationDelay: '0.2s' }}>
              段永平、冯柳、但斌、林园、张坤、巴菲特——把你的交易决策提交给陪审团。
              他们用各自的方法论独立评分，给出一份结构化的判决书。
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-3 animate-fadeUp" style={{ animationDelay: '0.3s' }}>
              {SAGES.map((s, i) => (
                <div key={s.id} className="group relative">
                  <SageAvatar initials={s.avatar} bgColor={s.color} accentColor={s.accentColor} size="lg" />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-ink-200 bg-cream-50 px-2 py-0.5 text-xs font-medium text-ink-700 shadow-sm">
                    {s.name}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-14 flex flex-col items-center gap-3 animate-fadeUp" style={{ animationDelay: '0.5s' }}>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <a href="#input" className="btn-primary">
                  <Gavel className="h-5 w-5" />
                  提交我的交易决策
                </a>
                <button
                  onClick={() => loadPreset("moutai-2003")}
                  className="rounded-lg border border-ink-300 bg-cream-50 px-5 py-3 font-serif text-base font-medium text-ink-800 transition-all hover:border-gold-500 hover:bg-cream-100 hover:shadow-bench"
                >
                  🍶 试一下"茅台 2003"
                </button>
              </div>
              <a href="#cases" className="text-sm text-ink-600 hover:text-navy-700">
                或浏览 11 个历史案例 ↓
              </a>
            </div>

            <div className="mt-12 flex flex-wrap items-center justify-center gap-6 text-center animate-fadeUp" style={{ animationDelay: '0.7s' }}>
              {[
                { num: 6, label: "位陪审员" },
                { num: 11, label: "历史案卷" },
                { num: 48, label: "句金句箴言" },
                { num: "71%", label: "时光机命中率" },
              ].map((s) => (
                <div key={s.label} className="min-w-[80px]">
                  <p className="font-serif text-3xl font-bold text-navy-700 md:text-4xl">{s.num}</p>
                  <p className="text-xs text-ink-500">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-2 animate-fadeUp" style={{ animationDelay: '0.85s' }}>
              {[
                { href: "/market", label: "📊 市场扫描", desc: "12 只 A 股实时" },
                { href: "/timemachine", label: "⏱️ 时光机", desc: "命中率 71%" },
                { href: "/watchlist", label: "📋 自选股", desc: "批量审议" },
                { href: "/diff?a=600519&b=000858", label: "⚖️ 对比", desc: "茅台 vs 五粮液" },
                { href: "/stock/600519", label: "📑 个股深度", desc: "茅台示例" },
              ].map((l) => (
                <Link key={l.href} href={l.href}
                  className="rounded-lg border border-ink-300 bg-cream-50 px-3 py-1.5 text-xs text-ink-700 transition-all hover:border-gold-400 hover:bg-gold-50 hover:text-gold-700"
                  title={l.desc}>
                  {l.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Verdict — 3 秒看陪审团 (Hero 紧下方，第一交互入口) */}
      <QuickVerdict
        onPickCase={(input) => {
          setPresetInput(input);
          setReport(null);
          setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
        }}
      />

      {/* Jury intro - 12 sages 分两组：大众派 + 圈内派 */}
      <section id="jury" className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="mb-10 text-center">
            <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
              <span>Meet the Jury · 12 Justices</span>
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-navy-700 md:text-4xl">十五位陪审员 · 大众 6 + 圈内 9</h2>
            <p className="mx-auto mt-2 max-w-2xl text-ink-600">
              <span className="font-mono text-xs uppercase tracking-widest text-amber-700">大众派 (6)</span> 段永平 / 冯柳 / 张坤 / 巴菲特 / 邱国鹭 / 唐朝
              <br />
              <span className="font-mono text-xs uppercase tracking-widest text-emerald-700">圈内派 (9)</span> <span className="font-bold">李录</span>（喜马拉雅）/ <span className="font-bold">胡猛</span>（风和亚洲）/ <span className="font-bold">马自铭</span>（雪湖资本）/ <span className="font-bold">邓晓峰</span>（高毅 CIO）/ <span className="font-bold">赵军</span>（淡水泉）/ <span className="font-bold">蒋锦志</span>（景林）/ <span className="font-bold">陈光明</span>（睿远）/ <span className="font-bold">谢治宇</span>（兴证全球）/ <span className="font-bold">杨东</span>（宁泉）
              <br />
              <span className="text-xs text-ink-500 italic">已移除：但斌、林园、王亚伟（翻车 / 大众化）</span>
            </p>
            <Link href="/about" className="mt-3 inline-block text-sm text-gold-700 underline hover:text-navy-700">
              为什么换人 / 为什么是这 14 位？→
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {SAGES.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Link
                  href={`/sage/${s.id}`}
                  className="court-card group block p-5 transition-all hover:shadow-gold"
                  style={{ borderTopColor: s.accentColor, borderTopWidth: 3 }}
                >
                  <div className="flex items-start gap-3">
                    <SageAvatar initials={s.avatar} bgColor={s.color} accentColor={s.accentColor} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-serif text-lg font-bold text-ink-900 group-hover:text-navy-700">{s.name}</h3>
                        {s.tier === "insider" && (
                          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-700 border border-emerald-300">圈内</span>
                        )}
                      </div>
                      <p className="text-xs text-ink-500">{s.title}</p>
                    </div>
                    <span className="nameplate text-[10px]">{s.school}</span>
                  </div>
                  <p className="mt-3 font-serif italic text-ink-700">"{s.coreLine}"</p>
                  <div className="mt-3 space-y-1 text-xs text-ink-500">
                    {s.dimensions.slice(0, 3).map(d => (
                      <div key={d.key} className="flex justify-between">
                        <span>{d.label}</span>
                        <span className="font-mono">{(d.weight * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-navy-700 opacity-0 transition-opacity group-hover:opacity-100">
                    查看完整方法论 <ChevronRight className="h-3 w-3" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Today Hot Cases — 实战 demo */}
      <section id="today" className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="mb-10 text-center">
            <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
              <span>Today on the Docket</span>
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-navy-700 md:text-4xl">今日热点案件 · 陪审团已审议</h2>
            <p className="mx-auto mt-2 max-w-2xl text-ink-600">
              4 个当下市场最受关注的标的——英伟达、比亚迪、拼多多、中科曙光。
              这是陪审团**实时跑分**的真实输出，不是预设。点击任一卡片展开完整判决书。
            </p>
          </div>
          <TodayHotCases onLoadCase={(input) => {
            setPresetInput(input);
            setReport(null);
            setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
          }} />
        </div>
      </section>

      {/* Preset cases */}
      <section id="cases" className="border-b border-ink-200/60">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="mb-10 text-center">
            <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
              <span>Historical Case Files</span>
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-navy-700 md:text-4xl">历史案卷 · 一键审议</h2>
            <p className="mx-auto mt-2 max-w-2xl text-ink-600">
              选一个真实案例，看 15 位陪审员的判断 vs 历史结果。最好的检验是回到当年。
            </p>
            <Link href="/dynamics" className="mt-3 inline-block text-sm text-gold-700 underline hover:text-navy-700">
              查看陪审员相关性热点 →
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {PRESET_CASES.map((c, i) => (
              <motion.button
                key={c.id}
                onClick={() => loadPreset(c.id)}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                whileHover={{ y: -3 }}
                className="court-card group cursor-pointer overflow-hidden p-5 text-left transition-all hover:shadow-gold"
              >
                <div className="mb-2 flex items-start justify-between">
                  <span className="text-3xl">{c.emojiTag}</span>
                  <span className="nameplate">{c.era}</span>
                </div>
                <h3 className="font-serif text-xl font-bold text-ink-900">{c.title}</h3>
                <p className="text-sm font-medium text-gold-600">{c.subtitle}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-600">{c.summary}</p>
                <div className="gold-rule my-3" />
                <p className="text-xs text-ink-500">
                  <span className="font-mono uppercase">结果：</span>{c.outcome}
                </p>
                <p className="text-xs text-ink-500">
                  <span className="font-mono uppercase">下注者：</span>{c.whoBet}
                </p>
                <div className="mt-3 flex items-center justify-end gap-1 text-sm font-medium text-navy-700 opacity-0 transition-opacity group-hover:opacity-100">
                  立即审议 <ChevronRight className="h-4 w-4" />
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* Retrospective Table */}
      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="mb-6 text-center">
            <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
              <span>Verdict vs History</span>
            </p>
            <h2 className="mt-3 font-serif text-2xl font-bold text-navy-700 md:text-3xl">陪审团判决 vs 历史结局</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-ink-600">
              如果你不相信方法论拟合的合理性——看这张表。陪审团对 11 个真实案例的预判，对照实际结局。
            </p>
          </div>
          <RetrospectiveTable />
          <p className="mt-3 text-center text-xs text-ink-500">
            注：&ldquo;方法论命中&rdquo;徽章基于陪审团多数意见与历史结局的方向是否一致。
          </p>
        </div>
      </section>

      {/* Input form */}
      <section id="input" className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-4xl px-5 py-16">
          <div className="mb-10 text-center">
            <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
              <span>Submit Your Case</span>
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-navy-700 md:text-4xl">把你的交易决策交给陪审团</h2>
          </div>
          <div ref={formRef}>
            <CaseInputForm key={presetInput ? JSON.stringify(presetInput).slice(0, 50) : "blank"} onSubmit={handleSubmit} loading={loading} initial={presetInput} />
          </div>
        </div>
      </section>

      {/* Report */}
      <AnimatePresence>
        {report && (
          <motion.section
            ref={reportRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="border-b border-ink-200/60 bg-cream-100/40"
          >
            <div className="mx-auto max-w-7xl space-y-6 px-5 py-16">
              <JuryReportPanel report={report} />

              <div className="flex justify-center">
                <ShareBar input={report.caseInput} />
              </div>

              <div className="ornament-line text-xs font-mono uppercase tracking-[0.3em] text-ink-500">
                <span>陪审员逐一意见 · {report.verdicts.length} Justices</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {report.verdicts.map((v, i) => (
                  <SageVerdictCard
                    key={v.sageId}
                    verdict={v}
                    index={i}
                    expanded={expandedSages.has(v.sageId)}
                    onToggle={() => toggleSage(v.sageId)}
                  />
                ))}
              </div>

              <div className="text-center">
                <button
                  onClick={() => setExpandedSages(prev => prev.size === report.verdicts.length ? new Set() : new Set(report.verdicts.map(v => v.sageId)))}
                  className="btn-ghost"
                >
                  {expandedSages.size === report.verdicts.length ? "全部收起" : "展开全部陪审员详情"}
                </button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Use cases */}
      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <div className="mb-10 text-center">
            <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
              <span>When to Convene</span>
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-navy-700 md:text-4xl">什么时候召开陪审团？</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: "🤔", t: "犹豫不决时", d: "重仓买入前，让 6 套方法论替你做最后一次结构化检查——避免因信念偏差错过红旗。" },
              { icon: "🔥", t: "市场狂热时", d: "热门赛道 + 共识看好时，用冯柳的弱者体系给自己一盆冷水——共识本身就是风险。" },
              { icon: "💔", t: "深度回撤时", d: "持仓被腰斩时，用陪审团重新审视投资逻辑——是基本面坏了还是情绪过头？" },
              { icon: "🎯", t: "测试一个想法", d: "把朋友推荐 / 大 V 喊单 / 自己研究的标的丢进来，6 张评分卡一目了然。" },
              { icon: "📚", t: "学习方法论时", d: "对比同一笔交易在不同方法论下的评分差异，比读书更直观地理解每位大佬的世界观。" },
              { icon: "🪞", t: "复盘交易时", d: "回到当年的茅台 / 海康 / 网易，看陪审团的方法论拟合是否站得住——你的判断在哪一派？" },
            ].map((u, i) => (
              <div key={u.t} className="court-card p-5">
                <div className="text-3xl">{u.icon}</div>
                <h3 className="mt-2 font-serif text-lg font-bold text-ink-900">{u.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-700">{u.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Methodology */}
      <section id="methodology" className="border-b border-ink-200/60">
        <div className="mx-auto max-w-4xl px-5 py-16">
          <div className="mb-10 text-center">
            <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
              <span>How the Jury Works</span>
            </p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-navy-700 md:text-4xl">陪审团是怎么打分的？</h2>
          </div>
          <div className="space-y-6">
            {[
              {
                t: "结构化方法论",
                d: "每位大佬基于其公开著作 / 访谈 / 季报 / 投资案例提炼出 5 个评分维度 + 加权权重。比如段永平的 35% 权重在'商业模式'，冯柳的 30% 权重在'预期差'。",
              },
              {
                t: "红旗一票否决",
                d: "每位大佬有自己的 deal-breaker。段永平的'超出能力圈'、张坤的'自由现金流为负'，触发即直接顶格扣分——这模拟了真实的投资纪律。",
              },
              {
                t: "加分项",
                d: "符合大佬偏好的特征（如毛利 > 60%、上市 20 年仍增长、高分红）会带来额外加分，让评分更接近大佬的真实判断。",
              },
              {
                t: "综合判决与共识等级",
                d: "15 位评分加权平均生成综合分，并标注'一致裁决 / 多数意见 / 严重分歧'。注意：完全的一致是危险信号——冯柳就是教你警惕共识的那个。",
              },
              {
                t: "本地运行 · 不上传数据",
                d: "整套引擎用 TypeScript 写在客户端，输入数据完全在你的浏览器内计算，不发送到任何服务器。",
              },
            ].map((item, i) => (
              <motion.div
                key={item.t}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="flex gap-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-gold-400 bg-cream-50 font-serif text-base font-bold text-gold-600">
                  {i + 1}
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-ink-900">{item.t}</h3>
                  <p className="mt-1 text-ink-700">{item.d}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-ink-200/60 bg-navy-700 text-cream-100">
        <div className="mx-auto max-w-7xl px-5 py-10">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2">
                <Gavel className="h-5 w-5 text-gold-300" />
                <span className="font-serif text-lg font-bold">大佬陪审团</span>
              </div>
              <p className="mt-2 text-sm text-cream-200">
                这是一个把投资大佬方法论结构化的工具——不是投资建议，更不是预测。
                所有评分基于公开方法论的拟合，最终决策权在你手上。
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-gold-300">免责声明</p>
              <p className="text-sm text-cream-200">
                本工具不构成投资建议。所有投资有风险，请独立判断。大佬观点为基于公开资料的方法论拟合，不代表其本人的真实判断。
              </p>
            </div>
            <div>
              <p className="mb-2 font-mono text-xs uppercase tracking-widest text-gold-300">页面索引</p>
              <ul className="space-y-1 text-sm text-cream-200">
                <li><Link href="/about" className="hover:text-gold-300">为什么是这 15 位 →</Link></li>
                <li><Link href="/dynamics" className="hover:text-gold-300">陪审员相关性 →</Link></li>
                <li><Link href="/quotes" className="hover:text-gold-300">48 句金句墙 →</Link></li>
                <li><a href="/api/evaluate" target="_blank" rel="noreferrer" className="hover:text-gold-300">⚡ 评估 API（POST JSON）→</a></li>
              </ul>
              <p className="mt-3 text-xs text-cream-300/60">
                Next.js 14 · TypeScript · Tailwind · 部署于 Vercel · © 2026 Sage Jury
              </p>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
