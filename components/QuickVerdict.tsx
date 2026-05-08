"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Search, Gavel, AlertTriangle, Sparkles, ShieldAlert, ArrowRight } from "lucide-react";
import type { CaseInput, JuryReport } from "@/types";
import { SAGE_BY_ID } from "@/data/sages";
import { SageAvatar } from "./SageAvatar";
import { ShareBar } from "./ShareBar";
import { cn, scoreBarColor, verdictColor, gradeColor } from "@/lib/utils";

interface Props {
  onPickCase?: (input: CaseInput) => void;
}

interface LookupResp {
  ticker: string;
  market: string;
  source: string;
  fetched: { name: string; pe?: number; pb?: number; lastPrice?: number };
  caseInput: CaseInput;
  inferredFromIndustry?: string;
  notes: string[];
  report?: JuryReport;
  error?: string;
}

export function QuickVerdict({ onPickCase }: Props) {
  const [ticker, setTicker] = useState("");
  const [data, setData] = useState<LookupResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (t: string) => {
    if (!t.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await fetch(`/api/lookup?ticker=${encodeURIComponent(t.trim())}`);
      const j: LookupResp = await res.json();
      if (!res.ok || j.error) {
        setError(j.error || "未能拉取");
        return;
      }
      setData(j);
    } catch (e: any) {
      setError(e?.message || "网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="border-b border-ink-200/60 bg-cream-50/40">
      <div className="mx-auto max-w-5xl px-5 py-12 md:py-16">
        <div className="mb-8 text-center">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-gold-700">
            <span>3 秒看到陪审团意见</span>
          </p>
          <h2 className="mt-3 font-serif text-3xl font-bold text-navy-700 md:text-4xl">
            ⚡ 输一个股票代码，立刻看到 6 位大佬怎么投票
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-ink-600">
            自动从东方财富抓 PE / PB / 行业，套用陪审团默认评分维度，秒出综合判决。
          </p>
        </div>

        <div className="mx-auto max-w-2xl">
          <div className="court-card p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookup(ticker)}
                placeholder="A 股 6 位（600519）/ 港股 5 位（00700）/ 美股字母（NVDA）"
                className="case-input flex-1 font-mono"
                disabled={loading}
              />
              <button
                onClick={() => lookup(ticker)}
                disabled={loading || !ticker.trim()}
                className="btn-primary text-base"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                {loading ? "审议中…" : "提交审议"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-500">试试：</span>
              {[
                { t: "600519", l: "茅台" },
                { t: "300750", l: "宁德时代" },
                { t: "002594", l: "比亚迪" },
                { t: "601318", l: "中国平安" },
                { t: "600036", l: "招商银行" },
                { t: "00700", l: "腾讯·港" },
              ].map((x) => (
                <button
                  key={x.t}
                  onClick={() => { setTicker(x.t); setTimeout(() => lookup(x.t), 50); }}
                  className="rounded-md border border-ink-300 bg-cream-50 px-2 py-0.5 font-mono text-[10px] text-ink-700 transition-colors hover:border-gold-400 hover:bg-gold-50 hover:text-gold-700"
                >
                  {x.t} {x.l}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div>
                <p className="font-medium text-red-800">{error}</p>
                <p className="mt-0.5 text-xs text-red-700">A 股 6 位、港股 5 位、美股字母。</p>
              </div>
            </div>
          )}

          {data && data.report && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-5 court-card overflow-hidden border-2 border-navy-700/30"
            >
              <div className="bg-gradient-to-b from-cream-50 to-cream-100 px-5 py-4">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-widest text-ink-500">{data.market} · {data.ticker}</p>
                    <h3 className="font-serif text-2xl font-bold text-navy-700">{data.fetched.name}</h3>
                    <p className="text-xs text-ink-600">
                      {data.inferredFromIndustry || "行业未推断"} · PE {data.fetched.pe?.toFixed(1) ?? "-"} · PB {data.fetched.pb?.toFixed(2) ?? "-"} · 现价 {data.fetched.lastPrice ?? "-"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[11px] uppercase tracking-widest text-ink-500">综合</p>
                    <p className="font-serif text-4xl font-bold text-navy-700">
                      {data.report.consensusScore}<span className="text-base text-ink-400">/100</span>
                    </p>
                  </div>
                </div>
                <div className="mt-3 stat-bar h-2.5">
                  <div className={cn("stat-bar-fill", scoreBarColor(data.report.consensusScore))} style={{ width: `${data.report.consensusScore}%` }} />
                </div>
                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className={cn("verdict-stamp text-xs", verdictColor(data.report.consensusVerdict))}>
                    {data.report.consensusLabel.split(" · ")[0]}
                  </span>
                  <span className="font-mono text-ink-500">共识：{data.report.agreementLevel}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-ink-200/60 p-4 md:grid-cols-3">
                {data.report.verdicts.map((v) => {
                  const sage = SAGE_BY_ID[v.sageId];
                  return (
                    <div key={v.sageId} className="flex items-center gap-2 rounded-md border border-ink-200 bg-cream-50 p-2">
                      <SageAvatar
                        initials={sage?.avatar || "??"}
                        bgColor={sage?.color || "#0F2541"}
                        accentColor={sage?.accentColor || "#D4AF37"}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-ink-600">{v.sageName}</p>
                        <p className="font-serif text-base font-bold text-navy-700">
                          {v.finalScore}
                          <span className={cn("ml-1 rounded px-1 text-[10px] border", gradeColor(v.letterGrade))}>{v.letterGrade}</span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-2 border-t border-ink-200/60 p-4 md:grid-cols-2">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-emerald-700">
                    <Sparkles className="h-3 w-3" /> 最支持
                  </div>
                  <p className="text-sm text-emerald-900">{data.report.topPro}</p>
                </div>
                <div className="rounded-md border border-red-200 bg-red-50 p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-red-700">
                    <ShieldAlert className="h-3 w-3" /> 最警惕
                  </div>
                  <p className="text-sm text-red-900">{data.report.topCon}</p>
                </div>
              </div>

              <div className="border-t border-ink-200/60 bg-cream-50 px-5 py-4">
                <p className="text-xs font-mono uppercase tracking-widest text-ink-500">本庭意见</p>
                <p className="mt-1 font-serif italic text-ink-800">{data.report.finalJudgment}</p>
                <div className="mt-3">
                  <ShareBar input={data.caseInput} />
                </div>
              </div>

              {onPickCase && (
                <div className="border-t border-ink-200/60 bg-cream-100 p-3 text-center">
                  <button
                    onClick={() => onPickCase(data.caseInput)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:text-gold-600"
                  >
                    展开完整 30 维度评分（手动调整定性指标） <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}
