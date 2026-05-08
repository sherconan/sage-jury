"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Send, Loader2, ExternalLink,
  MessageSquare, Swords, Sparkles,
  Twitter, BookOpen, Mic, FileText, Globe, Hash,
  TrendingUp, Activity, Database, Trash2, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const HISTORY_KEY = (slug: string, mode: string) => `sj_battle_history_v1_${slug}_${mode}`;
const MAX_HISTORY_TURNS = 30;
function loadHistory(slug: string, mode: string): Msg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY(slug, mode));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((m: any) => m && m.role && m.content !== undefined) : [];
  } catch { return []; }
}
function saveHistory(slug: string, mode: string, msgs: Msg[]) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = msgs.slice(-MAX_HISTORY_TURNS * 2);
    localStorage.setItem(HISTORY_KEY(slug, mode), JSON.stringify(trimmed));
  } catch {}
}

interface SageOption {
  slug: string; display: string; alias: string;
  philosophy: string; total_posts: number; position_changes: number;
  accent: string; gradient: string; initials: string; tagline: string;
}

const SAGES: SageOption[] = [
  {
    slug: "duan-yongping", display: "段永平", alias: "大道无形我有型",
    philosophy: "本分 · 不懂不投 · 看十年后 · 商业模式优先",
    total_posts: 10497, position_changes: 470,
    accent: "#3B82F6", gradient: "from-blue-500 to-indigo-600",
    initials: "DYP", tagline: "中国巴菲特 · 步步高/OPPO/vivo 创始人",
  },
  {
    slug: "guan-wo-cai", display: "管我财", alias: "管我财",
    philosophy: "低估逆向平均赢 · 排雷重于选股 · 定量估值",
    total_posts: 33853, position_changes: 906,
    accent: "#10B981", gradient: "from-emerald-500 to-teal-600",
    initials: "GWC", tagline: "粤式定量派 · 荒岛系列年度策略",
  },
  {
    slug: "dan-bin", display: "但斌", alias: "但斌",
    philosophy: "时间的玫瑰 · 长期持有伟大公司 · 全球资产配置",
    total_posts: 597, position_changes: 23,
    accent: "#F59E0B", gradient: "from-amber-500 to-orange-600",
    initials: "DB", tagline: "东方港湾董事长 · 茅台持仓 20 年",
  },
  {
    slug: "lao-tang", display: "唐朝", alias: "老唐",
    philosophy: "老唐估值法 · 三年一倍 · 守正用奇",
    total_posts: 116, position_changes: 1,
    accent: "#8B5CF6", gradient: "from-violet-500 to-purple-600",
    initials: "LT", tagline: "《价值投资实战手册》作者 · 老唐估值法创立者",
  },
];

const SOURCES: Record<string, { name: string; icon: any; color: string; bgColor: string; status: "live" | "soon" }> = {
  xueqiu:    { name: "雪球",     icon: Twitter,       color: "#0EA5E9", bgColor: "bg-sky-50",     status: "live" },
  weibo:     { name: "微博",     icon: MessageSquare, color: "#DB2777", bgColor: "bg-pink-50",    status: "soon" },
  interview: { name: "公开访谈", icon: Mic,           color: "#A855F7", bgColor: "bg-purple-50",  status: "soon" },
  report:    { name: "研报/季报", icon: FileText,     color: "#10B981", bgColor: "bg-emerald-50", status: "soon" },
  book:      { name: "书摘",     icon: BookOpen,      color: "#F97316", bgColor: "bg-orange-50",  status: "soon" },
  wechat:    { name: "公众号",   icon: Globe,         color: "#22C55E", bgColor: "bg-green-50",   status: "soon" },
};

interface QuoteRef {
  date: string; text: string; likes: number;
  url: string; concepts?: string; type?: string; source?: string;
}
interface Msg {
  role: "user" | "sage";
  content: string;
  quotes?: QuoteRef[];
  followups?: string[];
  loading?: boolean;
  ts: number;
}

export default function BattlePage() {
  const [activeSage, setActiveSage] = useState<SageOption>(SAGES[0]);
  const [mode, setMode] = useState<"chat" | "battle">("chat");
  const [input, setInput] = useState("");
  const [stockCode, setStockCode] = useState("");
  const [reason, setReason] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);
  // 切换 sage 或 mode 时，从 localStorage 恢复历史对话（不再清空！）
  useEffect(() => {
    setMessages(loadHistory(activeSage.slug, mode));
  }, [activeSage, mode]);
  useEffect(() => { inputRef.current?.focus(); }, [mode]);
  // 持久化
  useEffect(() => {
    if (messages.length > 0) saveHistory(activeSage.slug, mode, messages);
  }, [messages, activeSage, mode]);

  const clearHistory = useCallback(() => {
    if (typeof window !== "undefined" && window.confirm(`确认清空与 ${activeSage.display} 的「${mode === "chat" ? "对话" : "对线"}」历史？`)) {
      localStorage.removeItem(HISTORY_KEY(activeSage.slug, mode));
      setMessages([]);
    }
  }, [activeSage, mode]);

  const submitWith = async (overrideText?: string) => {
    if (loading) return;
    const text = overrideText !== undefined ? overrideText : input;
    let userContent = "", body: any = { sage_id: activeSage.slug, mode };
    if (mode === "chat") {
      if (!text.trim()) return;
      userContent = text; body.message = text;
      // ⭐ 把历史 messages 转成 LLM 多轮对话格式
      body.history = messages
        .filter(m => !m.loading && m.content)
        .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
    } else {
      if (!stockCode.trim()) return;
      userContent = `${stockCode}${reason ? ` — ${reason}` : ""}`;
      body.stock_code = stockCode; body.reason = reason;
    }
    setMessages(prev => [...prev,
      { role: "user", content: userContent, ts: Date.now() },
      { role: "sage", content: "", loading: true, ts: Date.now() + 1 }]);
    setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/battle", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json();
      setMessages(prev => {
        const arr = [...prev];
        arr[arr.length - 1] = {
          role: "sage",
          content: d.error ? `Error: ${d.error}` : (d.reply || ""),
          quotes: (d.quotes || []).map((q: any) => ({ ...q, source: q.source || "xueqiu" })),
          followups: Array.isArray(d.followups) ? d.followups : [],
          ts: Date.now(),
        };
        return arr;
      });
    } catch (e: any) {
      setMessages(prev => {
        const arr = [...prev];
        arr[arr.length - 1] = { role: "sage", content: `Error: ${e.message}`, ts: Date.now() };
        return arr;
      });
    } finally { setLoading(false); }
  };
  const submit = () => submitWith();

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900"
      style={{ fontFamily: "ui-sans-serif, -apple-system, 'Inter', 'PingFang SC', system-ui, sans-serif" }}>
      {/* TOP NAV */}
      <nav className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-5">
            <Link href="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition">
              <ArrowLeft className="h-4 w-4" />
              <span className="font-mono text-xs tracking-tight">SAGE-JURY</span>
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="font-semibold text-slate-900">交易对线</h1>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-100">BETA</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-medium">DeepSeek V4 PRO</span>
            </span>
          </div>
        </div>
      </nav>

      {/* BODY */}
      <div className="mx-auto grid max-w-[1600px] gap-0" style={{ gridTemplateColumns: "300px 1fr 320px" }}>

        {/* LEFT — sage list */}
        <aside className="border-r border-slate-200/80 px-4 py-5 space-y-3 min-h-[calc(100vh-57px)]">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">陪审席</h2>
            <span className="text-xs text-slate-400">{SAGES.length} 位</span>
          </div>
          {SAGES.map(s => (
            <button key={s.slug} onClick={() => setActiveSage(s)}
              className={cn("group w-full rounded-xl border p-3.5 text-left transition-all duration-200",
                activeSage.slug === s.slug
                  ? "border-blue-200 bg-white shadow-sm shadow-blue-100/60 ring-1 ring-blue-100"
                  : "border-slate-200 bg-white/60 hover:border-slate-300 hover:bg-white hover:shadow-sm")}>
              <div className="flex items-start gap-3">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-mono text-[11px] font-bold text-white shadow-sm",
                  s.gradient)}>
                  {s.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 truncate">{s.display}</p>
                  <p className="text-[11px] text-slate-500 truncate">@{s.alias}</p>
                </div>
                {activeSage.slug === s.slug && (
                  <div className="flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  </div>
                )}
              </div>
              <p className="mt-2.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">{s.philosophy}</p>
              <div className="mt-2.5 flex items-center gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{s.total_posts.toLocaleString()}</span>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />{s.position_changes} 持仓</span>
              </div>
            </button>
          ))}
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/40 p-3 text-center">
            <p className="text-xs text-slate-500">+ 冯柳 / 林园 / 张坤</p>
            <p className="mt-1 text-[10px] text-slate-400">陆续接入</p>
          </div>
        </aside>

        {/* CENTER — chat */}
        <section className="flex flex-col min-h-[calc(100vh-57px)] bg-white">
          {/* Mode header */}
          <header className="flex items-center justify-between border-b border-slate-200/80 px-6 py-3 bg-white/80">
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              <button onClick={() => setMode("chat")}
                className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                  mode === "chat" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                <MessageSquare className="h-3.5 w-3.5" /> 对话
              </button>
              <button onClick={() => setMode("battle")}
                className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                  mode === "battle" ? "bg-rose-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                <Swords className="h-3.5 w-3.5" /> 对线
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {messages.length > 0 && (
                <>
                  <span className="flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-slate-600">
                    <Clock className="h-3 w-3" />
                    {messages.filter(m => m.role === "user").length} 轮历史 · 已保存
                  </span>
                  <button onClick={clearHistory}
                    className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition">
                    <Trash2 className="h-3 w-3" /> 清空
                  </button>
                </>
              )}
              <span>对话:</span>
              <div className={cn("flex items-center gap-1.5 rounded-full bg-gradient-to-br px-2.5 py-1 font-medium text-white",
                activeSage.gradient)}>
                <span className="font-mono text-[10px]">{activeSage.initials}</span>
                <span>{activeSage.display}</span>
              </div>
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
            style={{ maxHeight: "calc(100vh - 245px)" }}>
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className={cn("h-16 w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg shadow-blue-100",
                  activeSage.gradient)}>
                  <Sparkles className="h-8 w-8" />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-slate-900">
                  {mode === "chat" ? `和 ${activeSage.display} 对话` : `让 ${activeSage.display} 审判你的交易`}
                </h3>
                <p className="mt-2 text-sm text-slate-500 max-w-md">{activeSage.philosophy}</p>
                <p className="mt-1.5 text-xs text-slate-400">基于 {activeSage.total_posts.toLocaleString()} 条真实雪球发言 · {activeSage.position_changes} 条持仓变化</p>
                <div className="mt-7 flex flex-wrap justify-center gap-2 max-w-2xl">
                  {(mode === "chat" ? [
                    "你怎么看 NVDA？",
                    "白酒未来 5 年怎样？",
                    "什么是真正的护城河？",
                    "现在该买茅台吗？",
                    "PE 多少算贵？",
                  ] : [
                    "茅台 / PE 20 长期持有",
                    "宁德时代 / 新能源龙头",
                    "腾讯 / 历史低估反弹",
                    "英伟达 / AI 必涨",
                  ]).map(s => (
                    <button key={s} onClick={() => mode === "chat" ? setInput(s) : (() => {
                      const [c, r] = s.split(" / "); setStockCode(c); setReason(r || "");
                    })()}
                      className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition shadow-sm">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.ts} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-[10px] font-bold shadow-sm",
                  m.role === "user"
                    ? "bg-slate-900 text-white"
                    : `bg-gradient-to-br ${activeSage.gradient} text-white`)}>
                  {m.role === "user" ? "你" : activeSage.initials}
                </div>

                <div className={cn("max-w-[78%] rounded-2xl px-5 py-3.5 shadow-sm",
                  m.role === "user"
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200")}>
                  {m.loading ? (
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{activeSage.display} 正在翻 {activeSage.total_posts.toLocaleString()} 条历史发言...</span>
                    </div>
                  ) : (
                    <>
                      <div className={cn("prose prose-sm max-w-none whitespace-pre-wrap text-[14.5px] leading-[1.7]",
                        m.role === "user" ? "text-white prose-invert" : "text-slate-800")}>
                        {m.content}
                      </div>
                      {m.role === "sage" && m.followups && m.followups.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {m.followups.map((q, k) => (
                            <button key={k} onClick={() => submitWith(q)}
                              className="group flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-xs text-blue-800 hover:bg-blue-100 hover:border-blue-300 transition shadow-sm">
                              <Sparkles className="h-3 w-3 text-blue-500 group-hover:scale-110 transition" />
                              <span>{q}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {m.quotes && m.quotes.length > 0 && (
                        <details className="mt-4 border-t border-slate-100 pt-3">
                          <summary className="cursor-pointer flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 hover:text-slate-600">
                            <Hash className="h-3 w-3" /> 引用 {m.quotes.length} 条历史原帖
                          </summary>
                          <ul className="mt-2.5 space-y-2">
                            {m.quotes.map((q, j) => {
                              const src = SOURCES[q.source || "xueqiu"];
                              const Icon = src?.icon || Twitter;
                              return (
                                <li key={j} className={cn("rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs", src?.bgColor || "bg-slate-50")}>
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <Icon className="h-3 w-3" style={{ color: src?.color }} />
                                    <span className="font-medium text-slate-600">{src?.name}</span>
                                    <span className="text-slate-300">·</span>
                                    <a href={q.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-blue-600 transition">
                                      {q.date} · 👍{q.likes}
                                    </a>
                                    <ExternalLink className="h-3 w-3 text-slate-400" />
                                  </div>
                                  <p className="text-slate-700 line-clamp-2 leading-relaxed">{q.text}</p>
                                  {q.concepts && (
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                      {q.concepts.split(",").slice(0, 4).map(c => (
                                        <span key={c} className="rounded-md bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{c}</span>
                                      ))}
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-slate-200/80 bg-white p-4">
            {mode === "chat" ? (
              <div className="flex gap-2">
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !loading && submit()}
                  placeholder={`问 ${activeSage.display}...`}
                  className="flex-1 rounded-full border border-slate-200 bg-slate-50/50 px-5 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-50 transition"
                  disabled={loading} />
                <button onClick={submit} disabled={loading || !input.trim()}
                  className={cn("flex items-center gap-1.5 rounded-full bg-gradient-to-br px-5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-30 transition",
                    activeSage.gradient)}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  发送
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={stockCode} onChange={e => setStockCode(e.target.value)}
                  placeholder="代码 / 名称"
                  className="w-44 rounded-full border border-rose-200 bg-rose-50/30 px-4 py-3 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-50 transition"
                  disabled={loading} />
                <input value={reason} onChange={e => setReason(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !loading && submit()}
                  placeholder="买入理由（让大佬质疑）"
                  className="flex-1 rounded-full border border-rose-200 bg-rose-50/30 px-5 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-rose-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-rose-50 transition"
                  disabled={loading} />
                <button onClick={submit} disabled={loading || !stockCode.trim()}
                  className="flex items-center gap-1.5 rounded-full bg-rose-500 px-5 text-sm font-medium text-white shadow-md hover:bg-rose-600 hover:shadow-lg disabled:opacity-30 transition">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
                  对线
                </button>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT — sources & data */}
        <aside className="border-l border-slate-200/80 px-4 py-5 space-y-5 min-h-[calc(100vh-57px)] bg-slate-50/40">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">数据源</h2>
              <Database className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="space-y-1.5">
              {Object.entries(SOURCES).map(([key, src]) => {
                const Icon = src.icon;
                const isLive = src.status === "live";
                return (
                  <div key={key} className={cn("flex items-center justify-between rounded-lg border px-3 py-2 transition",
                    isLive ? "border-slate-200 bg-white" : "border-slate-200/60 bg-white/40 opacity-60")}>
                    <div className="flex items-center gap-2">
                      <div className={cn("flex h-7 w-7 items-center justify-center rounded-md", src.bgColor)}>
                        <Icon className="h-3.5 w-3.5" style={{ color: src.color }} />
                      </div>
                      <span className="text-sm font-medium text-slate-700">{src.name}</span>
                    </div>
                    <span className={cn("text-[10px] font-mono px-1.5 py-0.5 rounded-md",
                      isLive ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-500")}>
                      {isLive ? "● LIVE" : "SOON"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">当前 Sage 数据</h2>
              <Activity className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
              {[
                ["总条数", activeSage.total_posts.toLocaleString()],
                ["持仓变化", activeSage.position_changes.toString()],
                ["数据源", "雪球"],
                ["更新", "9:00 / 21:00"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-mono font-medium text-slate-800">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">接入路线</h2>
            <div className="space-y-1.5 text-xs">
              {[
                ["雪球", "段永平 ✓ · 管我财 ✓", "live"],
                ["微博", "微博长文", "soon"],
                ["公众号", "公众号长文", "soon"],
                ["公开访谈", "演讲 / 媒体访谈", "soon"],
                ["持仓报告", "季度披露", "soon"],
                ["书摘", "投资问答录", "soon"],
              ].map(([label, desc, status]: any) => (
                <div key={label} className="flex items-center gap-2 px-1">
                  <span className={cn("h-1.5 w-1.5 rounded-full",
                    status === "live" ? "bg-emerald-500" : "bg-slate-300")} />
                  <span className={cn("text-[11px] font-medium",
                    status === "live" ? "text-slate-800" : "text-slate-500")}>{label}</span>
                  <span className="text-[10px] text-slate-400">— {desc}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
