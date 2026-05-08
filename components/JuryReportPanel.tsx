"use client";

import { motion } from "framer-motion";
import { Gavel, Award, ShieldAlert, Users, Sparkles } from "lucide-react";
import type { JuryReport } from "@/types";
import { cn, scoreBarColor, verdictColor } from "@/lib/utils";

const agreementMeta = {
  UNANIMOUS: { label: "一致裁决", icon: Award, tone: "border-gold-400 bg-gold-50 text-gold-700" },
  MAJORITY: { label: "多数意见", icon: Users, tone: "border-emerald-400 bg-emerald-50 text-emerald-700" },
  SPLIT: { label: "意见分散", icon: Users, tone: "border-amber-400 bg-amber-50 text-amber-700" },
  CONTROVERSIAL: { label: "严重分歧", icon: ShieldAlert, tone: "border-red-400 bg-red-50 text-red-700" },
};

interface Props {
  report: JuryReport;
}

export function JuryReportPanel({ report }: Props) {
  const meta = agreementMeta[report.agreementLevel];
  const Icon = meta.icon;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="court-card relative overflow-hidden border-2 border-navy-700/40"
      style={{
        background: "linear-gradient(180deg, #FBF8F2 0%, #F5F0E8 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gavel-rays" />
      <div className="absolute right-6 top-6 opacity-20">
        <motion.div initial={{ rotate: -30, opacity: 0 }} animate={{ rotate: 0, opacity: 0.2 }} transition={{ delay: 0.4, duration: 0.6 }}>
          <Gavel className="h-32 w-32 text-navy-700" strokeWidth={1.4} />
        </motion.div>
      </div>

      <div className="relative space-y-5 p-6 md:p-8">
        <div className="ornament-line text-xs font-mono uppercase tracking-[0.3em]">
          <span>陪审团判决书 · Jury Verdict</span>
        </div>

        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-ink-500">本庭裁定 · {report.caseInput.name}</p>
          <h2 className="mt-2 font-serif text-4xl font-bold text-navy-700 md:text-5xl">
            {report.consensusLabel.split(" · ")[0]}
          </h2>
          <p className="mt-1 font-serif italic text-ink-600">
            {report.consensusLabel.split(" · ")[1] || ""}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <div className={cn("inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-xs font-medium", meta.tone)}>
            <Icon className="h-3.5 w-3.5" />
            {meta.label}
          </div>
          <div className={cn("verdict-stamp", verdictColor(report.consensusVerdict))}>
            {report.consensusVerdict.replace("_", " ")}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-mono uppercase tracking-wider text-ink-500">
            <span>陪审团综合评分</span>
            <span className="font-serif text-3xl font-bold text-navy-700">
              {report.consensusScore}<span className="text-base text-ink-400">/100</span>
            </span>
          </div>
          <div className="stat-bar h-3">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${report.consensusScore}%` }}
              transition={{ delay: 0.3, duration: 1, ease: "easeOut" }}
              className={cn("stat-bar-fill", scoreBarColor(report.consensusScore))}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-6">
          {report.verdicts.map(v => (
            <div key={v.sageId} className="rounded-lg border border-ink-200 bg-cream-50 px-2 py-2 text-center">
              <p className="font-serif text-xs font-medium text-ink-700">{v.sageName}</p>
              <p className="font-serif text-2xl font-bold text-navy-700">{v.finalScore}</p>
              <p className={cn("inline-block rounded px-1.5 py-0 text-[10px] font-mono", verdictColor(v.verdict))}>
                {v.letterGrade}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-emerald-700">
              <Sparkles className="h-3 w-3" /> 最支持的陪审员
            </div>
            <p className="font-serif italic text-emerald-900">{report.topPro}</p>
          </div>
          <div className="rounded-lg border border-red-300 bg-red-50/60 p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-red-700">
              <ShieldAlert className="h-3 w-3" /> 最警惕的陪审员
            </div>
            <p className="font-serif italic text-red-900">{report.topCon}</p>
          </div>
        </div>

        <div className="rounded-xl border-2 border-navy-700/30 bg-cream-50/80 p-5">
          <div className="ornament-line mb-3 text-xs font-mono uppercase tracking-[0.3em]">
            <span>本庭意见 · Final Judgment</span>
          </div>
          <p className="font-serif text-base leading-relaxed text-ink-800 md:text-lg">
            {report.finalJudgment}
          </p>
          <p className="mt-3 text-right font-serif text-xs italic text-ink-500">
            评定时间 · {new Date(report.generatedAt).toLocaleString("zh-CN")}
          </p>
        </div>
      </div>
    </motion.section>
  );
}
