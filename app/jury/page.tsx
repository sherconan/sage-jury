"use client";

// /jury — 多 sage 陪审团 UI（v60.5.0 endpoint /api/jury/stream 的前端暴露）
// 用户选 2-5 位 sage + 输入问题，多列并行看每位 sage 实时输出。

import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Loader2, ArrowLeft, Sparkles, Wrench, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { SAGES as SAGES_RAW } from "@/data/sages";
import Link from "next/link";

// ===== Types =====
interface SageStream {
  sage_id: string;
  display: string;
  initials: string;
  gradient: string;
  analystThinking: string;
  analystDone: boolean;
  writerStarted: boolean;
  content: string;
  toolCalls: { name: string; args: any; id?: string; result?: string }[];
  followups: string[];
  done: boolean;
  error?: string;
  startedAt?: number;
  doneAt?: number;
}

// ===== sage 选项（与 page.tsx 同 gradient 映射）=====
const CORPUS_SLUGS = new Set(["duan-yongping", "guan-wo-cai"]);

const GRADIENT_MAP: Record<string, string> = {
  "duan-yongping": "from-blue-500 to-indigo-600",
  "guan-wo-cai": "from-emerald-500 to-teal-600",
  "feng-liu": "from-rose-500 to-pink-600",
  "zhang-kun": "from-fuchsia-500 to-purple-600",
  "buffett": "from-yellow-500 to-amber-600",
  "qiu-guolu": "from-cyan-500 to-blue-600",
  "li-lu": "from-red-500 to-rose-600",
  "fenghe-wu": "from-lime-500 to-green-600",
  "deng-xiaofeng": "from-teal-500 to-cyan-600",
  "zhao-jun": "from-indigo-500 to-violet-600",
  "jiang-jinzhi": "from-stone-500 to-zinc-600",
  "chen-guangming": "from-emerald-600 to-green-700",
  "xie-zhiyu": "from-orange-500 to-amber-600",
  "ma-zibing": "from-blue-600 to-cyan-700",
  "yang-dong": "from-purple-500 to-fuchsia-600",
};

interface SageOption {
  id: string;
  name: string;
  initials: string;
  gradient: string;
  hasCorpus: boolean;
  tier: "popular" | "insider";
  philosophy: string;
}

const ALL_SAGES: SageOption[] = SAGES_RAW.map(s => ({
  id: s.id,
  name: s.name,
  initials: s.avatar,
  gradient: GRADIENT_MAP[s.id] || "from-slate-500 to-gray-600",
  hasCorpus: CORPUS_SLUGS.has(s.id),
  tier: (s.tier === "insider" ? "insider" : "popular") as "popular" | "insider",
  philosophy: s.coreLine || s.philosophy.slice(0, 40),
})).sort((a, b) => {
  if (a.tier !== b.tier) return a.tier === "popular" ? -1 : 1;
  if (a.hasCorpus !== b.hasCorpus) return a.hasCorpus ? -1 : 1;
  return 0;
});

const PRESETS = [
  { label: "段+管 双人评判", ids: ["duan-yongping", "guan-wo-cai"] },
  { label: "三大流派对比", ids: ["duan-yongping", "feng-liu", "buffett"] },
  { label: "圈内 vs 大众", ids: ["duan-yongping", "li-lu", "deng-xiaofeng"] },
];

const STARTER_QUERIES = [
  "腾讯能买吗？",
  "苹果还能拿吗？",
  "现在该不该重仓 A 股？",
  "高股息策略未来 3 年怎么看？",
  "招商银行 PE 历史什么分位？",
];

// ===== SSE 解析 =====
async function streamJury(
  sage_ids: string[],
  message: string,
  onEvent: (e: { sage_id: string; type: string; payload: any }) => void,
  onDone: (summary: any) => void,
  onError: (msg: string) => void,
) {
  const res = await fetch("/api/jury/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sage_ids, message, history: [] }),
  });
  if (!res.ok || !res.body) {
    onError(`HTTP ${res.status}`);
    return;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let evt = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        evt = line.slice(7).trim();
        continue;
      }
      if (!line.startsWith("data: ")) continue;
      let p: any;
      try { p = JSON.parse(line.slice(6)); } catch { continue; }
      if (evt === "jury_event") {
        onEvent(p);
      } else if (evt === "jury_done") {
        onDone(p);
      } else if (evt === "jury_start") {
        // 可以在这里显示 jury 启动信号（暂时不用）
      }
    }
  }
}

// ===== 主组件 =====
export default function JuryPage() {
  const [selected, setSelected] = useState<string[]>(["duan-yongping", "guan-wo-cai"]);
  const [message, setMessage] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streams, setStreams] = useState<Record<string, SageStream>>({});
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const canSubmit = selected.length >= 2 && selected.length <= 5 && message.trim().length > 0 && !streaming;

  function toggle(id: string) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) return prev; // cap
      return [...prev, id];
    });
  }

  async function submit(query?: string) {
    const q = (query || message).trim();
    if (!q || selected.length < 2 || streaming) return;
    setMessage("");
    setStreaming(true);
    // init streams 为每个 sage
    const initStreams: Record<string, SageStream> = {};
    for (const id of selected) {
      const sage = ALL_SAGES.find(s => s.id === id)!;
      initStreams[id] = {
        sage_id: id, display: sage.name, initials: sage.initials, gradient: sage.gradient,
        analystThinking: "", analystDone: false, writerStarted: false,
        content: "", toolCalls: [], followups: [],
        done: false, startedAt: Date.now(),
      };
    }
    setStreams(initStreams);
    // batched setState：每 80ms flush 一次，避免 setState 风暴
    const pending: Record<string, Partial<SageStream>> = {};
    let flushTimer: any = null;
    const scheduleFlush = () => {
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const patches = pending;
        // 复制 pending 后清空
        const ids = Object.keys(patches);
        if (!ids.length) return;
        setStreams(prev => {
          const next = { ...prev };
          for (const id of ids) {
            if (!next[id]) continue;
            next[id] = { ...next[id], ...patches[id] };
            delete patches[id];
          }
          return next;
        });
      }, 80);
    };

    try {
      await streamJury(selected, q,
        (e) => {
          const cur = pending[e.sage_id] || {};
          const t = e.type;
          if (t === "analyst_chunk" && e.payload?.delta) {
            cur.analystThinking = (cur.analystThinking ?? streams[e.sage_id]?.analystThinking ?? "") + e.payload.delta;
          } else if (t === "analyst_done") {
            cur.analystDone = true;
          } else if (t === "phase" && e.payload?.name === "writer") {
            cur.writerStarted = true;
          } else if (t === "chunk" && e.payload?.delta) {
            cur.content = (cur.content ?? streams[e.sage_id]?.content ?? "") + e.payload.delta;
            cur.writerStarted = true;
          } else if (t === "tool_call") {
            const exist = (cur.toolCalls ?? streams[e.sage_id]?.toolCalls ?? []).slice();
            exist.push({ name: e.payload.name, args: e.payload.args, id: e.payload.id });
            cur.toolCalls = exist;
          } else if (t === "tool_result") {
            const exist = (cur.toolCalls ?? streams[e.sage_id]?.toolCalls ?? []).slice();
            const tc = exist.find(x => x.id === e.payload.id);
            if (tc) tc.result = String(e.payload.result || "").slice(0, 800);
            cur.toolCalls = exist;
          } else if (t === "done") {
            cur.done = true;
            cur.doneAt = Date.now();
            if (e.payload?.fullReply) cur.content = e.payload.fullReply;
            if (Array.isArray(e.payload?.followups)) cur.followups = e.payload.followups;
          } else if (t === "error") {
            cur.error = e.payload?.message || "unknown";
            cur.done = true;
          }
          pending[e.sage_id] = cur;
          scheduleFlush();
        },
        (summary) => {
          // jury_done — 全部完成
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          setStreams(prev => {
            const next = { ...prev };
            for (const id of Object.keys(next)) {
              if (!next[id].done) {
                next[id] = { ...next[id], done: true, doneAt: Date.now() };
              }
            }
            return next;
          });
          setStreaming(false);
        },
        (err) => {
          if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
          setStreams(prev => {
            const next = { ...prev };
            for (const id of Object.keys(next)) {
              if (!next[id].done) next[id] = { ...next[id], done: true, error: err };
            }
            return next;
          });
          setStreaming(false);
        });
    } catch (e: any) {
      setStreaming(false);
    }
  }

  const selectedSages = selected.map(id => ALL_SAGES.find(s => s.id === id)!).filter(Boolean);
  const popular = ALL_SAGES.filter(s => s.tier === "popular");
  const insider = ALL_SAGES.filter(s => s.tier === "insider");

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-slate-400 hover:text-slate-600">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Users className="h-5 w-5 text-blue-600" />
            <h1 className="text-base font-semibold text-slate-900">Sage Jury · 陪审团</h1>
            <span className="text-[10px] font-mono text-slate-400">v60.5.0</span>
          </div>
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-800">单 sage 模式 →</Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* sage 选择 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">选 2-5 位 sage 同时评判（已选 {selected.length}/5）</h2>
            <div className="flex items-center gap-1.5">
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => setSelected(p.ids)} disabled={streaming}
                  className="text-[11px] text-slate-500 hover:text-blue-600 px-2 py-1 rounded border border-slate-200 hover:border-blue-300 transition disabled:opacity-50">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">大众派</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {popular.map(s => (
              <SageChip key={s.id} s={s} active={selected.includes(s.id)} onToggle={() => toggle(s.id)} disabled={streaming} />
            ))}
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2">圈内派</div>
          <div className="flex flex-wrap gap-2">
            {insider.map(s => (
              <SageChip key={s.id} s={s} active={selected.includes(s.id)} onToggle={() => toggle(s.id)} disabled={streaming} />
            ))}
          </div>
        </section>

        {/* 输入区 */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col md:flex-row gap-3">
            <input
              type="text"
              placeholder="输入要让陪审团评判的问题..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }}
              disabled={streaming}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
            />
            <button
              onClick={() => submit()}
              disabled={!canSubmit}
              className={cn("inline-flex items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-medium text-white transition",
                canSubmit ? "bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700" : "bg-slate-300 cursor-not-allowed")}>
              {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {streaming ? "陪审中…" : "开始陪审"}
            </button>
          </div>
          {!streaming && Object.keys(streams).length === 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTER_QUERIES.map(q => (
                <button key={q} onClick={() => submit(q)} disabled={!selected.length || streaming}
                  className="rounded-full border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 px-3 py-1 text-xs text-slate-600 hover:text-blue-700 transition">
                  ✨ {q}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* 多列陪审输出 */}
        {Object.keys(streams).length > 0 && (
          <section className={cn("grid gap-4",
            selected.length === 2 ? "grid-cols-1 md:grid-cols-2" :
            selected.length === 3 ? "grid-cols-1 md:grid-cols-3" :
            "grid-cols-1 md:grid-cols-2 lg:grid-cols-4")}>
            {selected.map(id => {
              const stream = streams[id];
              if (!stream) return null;
              return <SageColumn key={id} stream={stream} ref={(el) => { scrollRefs.current[id] = el; }} />;
            })}
          </section>
        )}
      </div>
    </main>
  );
}

// ===== sage 选择 chip =====
function SageChip({ s, active, onToggle, disabled }: { s: SageOption; active: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition",
        active
          ? "border-blue-400 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50",
        disabled && "opacity-50 cursor-not-allowed")}>
      <div className={cn("h-4 w-4 rounded bg-gradient-to-br text-white text-[8px] font-mono font-bold flex items-center justify-center", s.gradient)}>{s.initials}</div>
      <span>{s.name}</span>
      {!s.hasCorpus && <span className="text-[9px] text-slate-400">元</span>}
    </button>
  );
}

// ===== 单 sage 输出列 =====
import { forwardRef } from "react";
const SageColumn = forwardRef<HTMLDivElement, { stream: SageStream }>(function SageColumn({ stream }, ref) {
  const elapsed = stream.doneAt && stream.startedAt ? ((stream.doneAt - stream.startedAt) / 1000).toFixed(1) : null;
  return (
    <div ref={ref} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col max-h-[80vh]">
      <div className="border-b border-slate-100 px-4 py-3 flex items-center gap-2.5 bg-gradient-to-r from-slate-50 to-white">
        <div className={cn("h-9 w-9 flex items-center justify-center rounded-lg bg-gradient-to-br text-white font-mono text-[10px] font-bold shadow-sm", stream.gradient)}>{stream.initials}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{stream.display}</p>
          <p className="text-[10px] text-slate-500 truncate font-mono">
            {stream.error ? <span className="text-red-500">err: {stream.error}</span> :
             stream.done ? <>✓ 完成 · {elapsed}s</> :
             stream.writerStarted ? <>✍️ 落笔中</> :
             stream.analystThinking ? <>💭 思考中</> :
             <>启动中…</>}
          </p>
        </div>
        {!stream.done && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
        {stream.done && !stream.error && <span className="text-emerald-500 text-sm">✓</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm leading-relaxed">
        {/* analyst 思考 */}
        {stream.analystThinking && (
          <details open={!stream.writerStarted} className="rounded-lg border border-violet-100 bg-violet-50/40 p-2.5">
            <summary className="cursor-pointer inline-flex items-center gap-1.5 text-[11px] text-violet-600">
              <Sparkles className="h-3 w-3" />
              <span className="font-medium">{stream.analystDone ? "内心分析" : "思考中…"}</span>
              <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
            </summary>
            <div className="mt-2 text-[12px] text-violet-800 whitespace-pre-wrap leading-relaxed">{stream.analystThinking}</div>
          </details>
        )}

        {/* tools */}
        {stream.toolCalls.length > 0 && (
          <details className="rounded-lg border border-amber-100 bg-amber-50/40 p-2.5">
            <summary className="cursor-pointer inline-flex items-center gap-1.5 text-[11px] text-amber-700">
              <Wrench className="h-3 w-3" />
              <span className="font-medium">用了 {stream.toolCalls.length} 个工具</span>
              <ChevronDown className="h-3 w-3" />
            </summary>
            <div className="mt-2 space-y-1.5">
              {stream.toolCalls.map((tc, i) => (
                <div key={tc.id || i} className="text-[11px] text-amber-800">
                  <div className="font-medium">{tc.name}</div>
                  {tc.result && <div className="mt-0.5 text-[10px] text-amber-700/80 line-clamp-3">{tc.result}</div>}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* content */}
        {stream.content && (
          <div className="text-slate-800 whitespace-pre-wrap text-[13.5px] leading-relaxed">{stream.content}</div>
        )}

        {/* followups */}
        {stream.done && stream.followups.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
            {stream.followups.map(f => (
              <span key={f} className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] text-blue-700">✨ {f}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
