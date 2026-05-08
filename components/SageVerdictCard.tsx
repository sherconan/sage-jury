"use client";

import { motion } from "framer-motion";
import { AlertTriangle, ChevronRight, Quote, Star } from "lucide-react";
import type { SageVerdict } from "@/types";
import { SAGE_BY_ID } from "@/data/sages";
import { SageAvatar } from "./SageAvatar";
import { cn, gradeColor, scoreBarColor, verdictColor } from "@/lib/utils";

interface Props {
  verdict: SageVerdict;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}

export function SageVerdictCard({ verdict, index, expanded, onToggle }: Props) {
  const sage = SAGE_BY_ID[verdict.sageId];
  if (!sage) return null;

  const dominantFlag = verdict.redFlags.find(f => f.severity === "veto") || verdict.redFlags.find(f => f.severity === "major");

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.45 }}
      className="court-card"
      style={{ borderTopColor: sage.accentColor, borderTopWidth: 3 }}
    >
      <header className="court-card-header">
        <SageAvatar
          initials={sage.avatar}
          bgColor={sage.color}
          accentColor={sage.accentColor}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h3 className="font-serif text-xl font-bold text-ink-900">{sage.name}</h3>
            <span className="nameplate">{sage.school.toUpperCase()}</span>
          </div>
          <p className="truncate text-xs text-ink-600">{sage.title}</p>
        </div>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.06 + 0.2, type: "spring", stiffness: 240 }}
          className={cn("grade-badge", gradeColor(verdict.letterGrade))}
        >
          {verdict.letterGrade}
        </motion.div>
      </header>

      <div className="space-y-4 px-5 py-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs font-mono uppercase tracking-wider text-ink-500">
            <span>裁定评分</span>
            <span className="font-serif text-2xl font-bold text-ink-900">
              {verdict.finalScore}
              <span className="text-sm font-normal text-ink-500">/100</span>
            </span>
          </div>
          <div className="stat-bar">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${verdict.finalScore}%` }}
              transition={{ delay: index * 0.06 + 0.3, duration: 0.7, ease: "easeOut" }}
              className={cn("stat-bar-fill", scoreBarColor(verdict.finalScore))}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("verdict-stamp", verdictColor(verdict.verdict))}>
            {verdict.verdictLabel.split(" · ")[0]}
          </span>
          {verdict.redFlags.length > 0 && (
            <span className="pill border-red-300 bg-red-50 text-red-700">
              <AlertTriangle className="h-3 w-3" /> {verdict.redFlags.length} 个红旗
            </span>
          )}
          {verdict.bonusHits.length > 0 && (
            <span className="pill border-emerald-300 bg-emerald-50 text-emerald-700">
              <Star className="h-3 w-3" /> +{verdict.bonusHits.length} 加分
            </span>
          )}
        </div>

        <blockquote className="border-l-2 pl-3" style={{ borderColor: sage.accentColor }}>
          <p className="font-serif text-[15px] italic leading-relaxed text-ink-800">
            "{verdict.oneLine}"
          </p>
        </blockquote>

        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.3 }}
            className="space-y-4 overflow-hidden border-t border-ink-200/60 pt-4"
          >
            <div>
              <h4 className="mb-2 text-xs font-mono uppercase tracking-wider text-ink-500">维度评分</h4>
              <div className="space-y-2">
                {verdict.dimensions.map((d) => (
                  <div key={d.key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-ink-700">
                        {d.label}
                        <span className="ml-2 text-xs text-ink-400">权重 {(d.weight * 100).toFixed(0)}%</span>
                      </span>
                      <span className="font-mono text-sm font-medium text-ink-800">
                        {d.rawScore.toFixed(0)}
                      </span>
                    </div>
                    <div className="stat-bar">
                      <div
                        className={cn("stat-bar-fill", scoreBarColor(d.rawScore))}
                        style={{ width: `${d.rawScore}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-ink-500">{d.reason}</p>
                  </div>
                ))}
              </div>
            </div>

            {verdict.redFlags.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-mono uppercase tracking-wider text-ink-500">红旗警示</h4>
                <ul className="space-y-1.5">
                  {verdict.redFlags.map(f => (
                    <li key={f.key} className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                        <div>
                          <span className="font-medium text-red-800">{f.label}</span>
                          <span className={cn("ml-2 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase",
                            f.severity === "veto" ? "bg-red-700 text-white" :
                            f.severity === "major" ? "bg-red-200 text-red-800" :
                            "bg-amber-200 text-amber-800"
                          )}>
                            {f.severity}
                          </span>
                          <p className="mt-1 text-xs leading-snug text-red-700">{f.reason}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {verdict.bonusHits.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-mono uppercase tracking-wider text-ink-500">加分项</h4>
                <ul className="flex flex-wrap gap-1.5">
                  {verdict.bonusHits.map((b, i) => (
                    <li key={i} className="pill border-emerald-300 bg-emerald-50 text-emerald-700">
                      <Star className="h-3 w-3" /> {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-lg bg-cream-100 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-ink-500">
                <Quote className="h-3 w-3" /> 大佬箴言
              </div>
              <p className="font-serif italic text-ink-800">"{verdict.signatureQuote}"</p>
              <p className="mt-1 text-right text-xs text-ink-500">—— {sage.name}</p>
            </div>
          </motion.div>
        )}

        <button
          onClick={onToggle}
          className="flex w-full items-center justify-center gap-1 rounded-lg border border-ink-200 bg-cream-50 py-2 text-xs font-medium text-ink-600 transition-colors hover:bg-cream-100"
        >
          {expanded ? "收起详情" : "展开维度评分 / 红旗 / 名言"}
          <ChevronRight className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")} />
        </button>
      </div>
    </motion.article>
  );
}
