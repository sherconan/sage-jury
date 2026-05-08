"use client";

import { useState } from "react";
import { Loader2, Search, AlertTriangle } from "lucide-react";
import type { CaseInput } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  onResult: (input: CaseInput) => void;
}

export function TickerLookup({ onResult }: Props) {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch(`/api/lookup?ticker=${encodeURIComponent(ticker.trim())}&evaluate=false`);
      const data = await res.json();
      if (!res.ok || !data.caseInput) {
        setError(data.error || "未能拉取数据");
        return;
      }
      setHint(`已自动填入：${data.fetched?.name} | PE ${data.fetched?.pe?.toFixed(1) ?? "-"} | PB ${data.fetched?.pb?.toFixed(1) ?? "-"}` +
              (data.inferredFromIndustry ? ` | 行业「${data.inferredFromIndustry}」自动套用定性指标` : ""));
      onResult(data.caseInput);
    } catch (e: any) {
      setError(e?.message || "网络错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gold-300 bg-cream-50/80 p-4 shadow-bench">
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="font-serif text-base font-bold text-navy-700">⚡ 一键代码查询（A 股 / 港股 / 美股）</h4>
        <span className="font-mono text-[10px] uppercase tracking-widest text-gold-700">EAST MONEY API</span>
      </div>
      <p className="mb-3 text-xs text-ink-600">
        输入股票代码自动从东方财富抓取最新 PE / PB / 名称，并按行业套用合理的定性指标默认值。
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          placeholder="600519 / 00700 / NVDA"
          className="case-input flex-1 font-mono"
          disabled={loading}
        />
        <button
          onClick={handleLookup}
          disabled={loading || !ticker.trim()}
          className="btn-primary text-sm"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          {loading ? "拉取中…" : "拉取并填表"}
        </button>
      </div>
      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div>
            <p className="font-medium text-red-800">{error}</p>
            <p className="mt-0.5 text-xs text-red-700">A 股请输 6 位代码，港股 5 位（如 00700），美股字母（如 NVDA）。</p>
          </div>
        </div>
      )}
      {hint && (
        <p className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">✓ {hint}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
        <span className="text-ink-500">试试：</span>
        {[
          { t: "600519", l: "茅台" },
          { t: "000858", l: "五粮液" },
          { t: "300750", l: "宁德时代" },
          { t: "002594", l: "比亚迪" },
        ].map((x) => (
          <button
            key={x.t}
            onClick={() => { setTicker(x.t); setTimeout(handleLookup, 50); }}
            className="rounded-md border border-ink-300 bg-cream-50 px-2 py-0.5 font-mono text-[10px] text-ink-600 hover:border-gold-400 hover:bg-gold-50 hover:text-gold-700"
          >
            {x.t} {x.l}
          </button>
        ))}
      </div>
    </div>
  );
}
