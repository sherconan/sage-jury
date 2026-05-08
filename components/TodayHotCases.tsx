"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles, Activity, AlertTriangle, ChevronRight } from "lucide-react";
import { evaluate } from "@/lib/engine";
import { TODAY_HOT_CASES } from "@/data/cases/today";
import type { CaseInput } from "@/types";
import { cn, scoreBarColor, verdictColor } from "@/lib/utils";

const agreementBadge = (a: string) => {
  switch (a) {
    case "UNANIMOUS": return { label: "一致裁决", tone: "bg-gold-100 text-gold-800 border-gold-400" };
    case "MAJORITY": return { label: "多数意见", tone: "bg-emerald-100 text-emerald-800 border-emerald-400" };
    case "SPLIT": return { label: "意见分散", tone: "bg-amber-100 text-amber-800 border-amber-400" };
    case "CONTROVERSIAL": return { label: "严重分歧", tone: "bg-red-100 text-red-800 border-red-400" };
    default: return { label: a, tone: "bg-ink-100 text-ink-700 border-ink-300" };
  }
};

interface Props {
  onLoadCase: (input: CaseInput) => void;
}

export function TodayHotCases({ onLoadCase }: Props) {
  const evaluated = useMemo(
    () => TODAY_HOT_CASES.map((c) => ({ case: c, report: evaluate(c.input) })),
    [],
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {evaluated.map(({ case: c, report }, i) => {
        const ag = agreementBadge(report.agreementLevel);
        const sortedHigh = [...report.verdicts].sort((a, b) => b.finalScore - a.finalScore);
        const sortedLow = [...report.verdicts].sort((a, b) => a.finalScore - b.finalScore);
        return (
          <motion.button
            key={c.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onLoadCase(c.input)}
            className="court-card group cursor-pointer p-5 text-left transition-all hover:shadow-gold"
            style={{ borderTopColor: report.consensusScore >= 60 ? "#10B981" : report.consensusScore < 40 ? "#DC2626" : "#F59E0B", borderTopWidth: 3 }}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="text-3xl">{c.emojiTag}</span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-ink-900">{c.title}</h3>
                  <p className="text-xs text-gold-700">{c.hook}</p>
                </div>
              </div>
              <span className={cn("rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider", ag.tone)}>
                {ag.label}
              </span>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-ink-600 line-clamp-2">{c.context}</p>

            <div className="mt-4 flex items-baseline justify-between border-t border-ink-200/60 pt-3">
              <div>
                <span className="text-xs font-mono uppercase text-ink-500">陪审团综合</span>
                <div className="font-serif text-3xl font-bold tabular-nums text-navy-700">
                  {report.consensusScore}<span className="text-base font-normal text-ink-500">/100</span>
                </div>
              </div>
              <span className={cn("verdict-stamp text-xs", verdictColor(report.consensusVerdict))}>
                {report.consensusLabel.split(" · ")[0]}
              </span>
            </div>

            <div className="mt-3 stat-bar">
              <div className={cn("stat-bar-fill", scoreBarColor(report.consensusScore))} style={{ width: `${report.consensusScore}%` }} />
            </div>

            <div className="mt-4 grid grid-cols-6 gap-1">
              {report.verdicts.map((v) => (
                <div
                  key={v.sageId}
                  className={cn("flex flex-col items-center rounded-md border px-1 py-1", scoreBarColor(v.finalScore).replace("from-", "border-").replace(" to-", " bg-"))}
                  title={`${v.sageName}: ${v.finalScore} ${v.verdictLabel}`}
                >
                  <span className="text-[10px] text-ink-700">{v.sageName.slice(0, 2)}</span>
                  <span className="font-mono text-xs font-bold text-cream-50">{v.letterGrade}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-start gap-1.5 text-xs">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
              <p className="line-clamp-1 text-ink-700">
                <span className="text-emerald-700">最支持：</span>{sortedHigh[0].sageName} {sortedHigh[0].finalScore}
              </p>
            </div>
            <div className="mt-1 flex items-start gap-1.5 text-xs">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-600" />
              <p className="line-clamp-1 text-ink-700">
                <span className="text-red-700">最警惕：</span>{sortedLow[0].sageName} {sortedLow[0].finalScore}
              </p>
            </div>

            <div className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-navy-700 opacity-0 transition-opacity group-hover:opacity-100">
              展开完整判决书 <ChevronRight className="h-3 w-3" />
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
