"use client";

import { useMemo } from "react";
import { evaluate } from "@/lib/engine";
import { PRESET_CASES } from "@/data/cases";
import { cn, scoreBarColor, verdictColor } from "@/lib/utils";

export function RetrospectiveTable() {
  const rows = useMemo(() => {
    return PRESET_CASES.map((c) => {
      const r = evaluate(c.input);
      return {
        ...c,
        consensus: r.consensusScore,
        verdict: r.consensusVerdict,
        verdictLabel: r.consensusLabel,
        agreement: r.agreementLevel,
      };
    });
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-cream-50 shadow-bench">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-200 bg-cream-100">
              <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-ink-500">案例</th>
              <th className="px-4 py-3 text-center font-mono text-xs uppercase tracking-widest text-ink-500">陪审团评分</th>
              <th className="px-4 py-3 text-center font-mono text-xs uppercase tracking-widest text-ink-500">陪审团判决</th>
              <th className="px-4 py-3 text-left font-mono text-xs uppercase tracking-widest text-ink-500">历史实际结局</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const matched = (r.consensus >= 60 && r.outcome.startsWith("✅")) ||
                              (r.consensus < 50 && r.outcome.startsWith("❌"));
              return (
                <tr key={r.id} className="border-b border-ink-100 last:border-0 hover:bg-cream-100/40">
                  <td className="px-4 py-3">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl">{r.emojiTag}</span>
                      <div>
                        <div className="font-serif font-bold text-ink-900">{r.title}</div>
                        <div className="text-xs text-ink-500">{r.subtitle}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="font-serif text-2xl font-bold tabular-nums text-navy-700">{r.consensus}</div>
                    <div className="mt-1 mx-auto h-1.5 w-16 overflow-hidden rounded-full bg-ink-100">
                      <div className={cn("h-full", scoreBarColor(r.consensus))} style={{ width: `${r.consensus}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={cn("verdict-stamp text-xs", verdictColor(r.verdict))}>
                      {r.verdictLabel.split(" · ")[0]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-ink-700">{r.outcome}</p>
                    {matched && (
                      <span className="mt-1 inline-block rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider text-emerald-700">
                        ✓ 方法论命中
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
