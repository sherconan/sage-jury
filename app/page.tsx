"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, Loader2, MessageSquarePlus, Trash2, Download, Sparkles, ExternalLink,
  Hash, Twitter, Menu, X, ChevronDown, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SAGES as SAGES_RAW } from "@/data/sages";

// =================== Types ===================
interface QuoteRef { date: string; text: string; likes: number; url: string; _rel_score?: number; _rec_mul?: number; _final_score?: number; }
interface ToolCall { name: string; args: any; id?: string; result?: string; }
interface Msg {
  role: "user" | "sage";
  content: string;
  quotes?: QuoteRef[];
  followups?: string[];
  toolCalls?: ToolCall[];
  loading?: boolean;
  ts: number;
  // v60.1: 内心分析 markdown，流式累积
  analystThinking?: string;
  analystDone?: boolean;
  writerStarted?: boolean;
}
interface Session {
  id: string;
  sage_id: string;
  title: string;
  msgs: Msg[];
  ts_created: number;
  ts_updated: number;
}
interface SageOption {
  slug: string; display: string; alias: string;
  philosophy: string; total_posts: number;
  initials: string; gradient: string;
  tier: "popular" | "insider";
  hasCorpus: boolean;
}

// =================== Static Config ===================
// v60.4.9: 从 SAGES_RAW 动态生成 15 sage 列表（v60.4.7 backend 已支持 fallback）
// - 有 corpus 的 2 位（duan/guan）：full v60 quality，能 search_sage_post
// - 13 位 fallback：靠 SAGES_RAW metadata 角色扮演，工具仍可用

// 有 corpus 的 sage 静态额外信息（total_posts + gradient + initials）
const CORPUS_INFO: Record<string, { total_posts: number; gradient: string; initials: string; alias: string }> = {
  "duan-yongping": { total_posts: 10497, gradient: "from-blue-500 to-indigo-600", initials: "DYP", alias: "大道无形我有型" },
  "guan-wo-cai":   { total_posts: 33877, gradient: "from-emerald-500 to-teal-600", initials: "GWC", alias: "管我财" },
};

// 13 个 fallback sage 的 gradient 预设（按 SAGES_RAW.color hex 映射）
function gradientForSage(slug: string, hex: string): string {
  if (CORPUS_INFO[slug]) return CORPUS_INFO[slug].gradient;
  // value/reverse/consumer/growth/moat/concentration 对应不同色系
  const map: Record<string, string> = {
    "feng-liu":         "from-rose-500 to-pink-600",
    "zhang-kun":        "from-fuchsia-500 to-purple-600",
    "buffett":          "from-yellow-500 to-amber-600",
    "qiu-guolu":        "from-cyan-500 to-blue-600",
    "li-lu":            "from-red-500 to-rose-600",
    "fenghe-wu":        "from-lime-500 to-green-600",
    "deng-xiaofeng":    "from-teal-500 to-cyan-600",
    "zhao-jun":         "from-indigo-500 to-violet-600",
    "jiang-jinzhi":     "from-stone-500 to-zinc-600",
    "chen-guangming":   "from-emerald-600 to-green-700",
    "xie-zhiyu":        "from-orange-500 to-amber-600",
    "ma-zibing":        "from-blue-600 to-cyan-700",
    "yang-dong":        "from-purple-500 to-fuchsia-600",
  };
  return map[slug] || "from-slate-500 to-gray-600";
}

// 派生 SAGES：popular 在前，insider 在后，每组内 corpus 优先
const SAGES: SageOption[] = SAGES_RAW
  .map(s => {
    const info = CORPUS_INFO[s.id];
    const hasCorpus = !!info;
    return {
      slug: s.id,
      display: s.name,
      alias: info?.alias || s.title.split(" · ")[0] || s.name,
      philosophy: s.coreLine || s.philosophy.slice(0, 40),
      total_posts: info?.total_posts ?? 0,
      initials: info?.initials || s.avatar,
      gradient: gradientForSage(s.id, s.color),
      tier: (s.tier === "insider" ? "insider" : "popular") as "popular" | "insider",
      hasCorpus,
    };
  })
  .sort((a, b) => {
    // popular 前；同 tier 内 corpus 优先
    if (a.tier !== b.tier) return a.tier === "popular" ? -1 : 1;
    if (a.hasCorpus !== b.hasCorpus) return a.hasCorpus ? -1 : 1;
    return 0;
  });

const STARTERS: Record<string, string[]> = {
  "duan-yongping": ["你为什么换神华去泡泡玛特？", "苹果还能拿吗？", "拼多多怎么看？"],
  "guan-wo-cai":   ["腾讯能买吗？", "招行 PE 历史什么分位？", "26 年荒岛策略选什么？"],
};
// fallback sage 通用 starters（每个 sage 1 个，按风格选）
const STARTERS_FALLBACK: Record<string, string[]> = {
  "feng-liu":       ["医药 CXO 现在是逆向机会吗？", "你看好哪个被市场打到底的板块？"],
  "zhang-kun":      ["茅台还能拿吗？", "高端消费品长期还成立吗？"],
  "buffett":        ["伯克希尔现金仓位你怎么解读？", "美股泡沫到顶了吗？"],
  "qiu-guolu":      ["怎么用'四种思维'看现在 A 股？", "便宜的好公司去哪找？"],
  "li-lu":          ["格雷厄姆框架对中国市场还适用吗？", "怎么找到下一个 BYD？"],
  "fenghe-wu":      ["亚洲市场被低估的好生意？", "怎么看中国房地产周期？"],
  "deng-xiaofeng":  ["现在 A 股最大的预期差在哪？", "周期股何时翻身？"],
  "zhao-jun":       ["专精特新还能不能买？", "高股息策略未来 3 年怎么看？"],
  "jiang-jinzhi":   ["景林投资框架核心是什么？", "你怎么挑选成长股？"],
  "chen-guangming": ["睿远价值理念怎么用在现在 A 股？", "好行业好公司好价格怎么三者兼得？"],
  "xie-zhiyu":      ["TMT 板块现在的机会？", "你怎么平衡价值与成长？"],
  "ma-zibing":      ["雪湖资本怎么投港股？", "新经济股的估值锚怎么定？"],
  "yang-dong":      ["你现在最看好的领域？", "重仓股的退出节奏怎么把握？"],
};

const STOCK_SUGGESTIONS = [
  "茅台", "五粮液", "汾酒", "泸州老窖", "洋河", "海天", "伊利", "片仔癀",
  "招商银行", "中国平安", "工商银行", "宁德时代", "比亚迪", "中国中免",
  "腾讯", "阿里", "美团", "京东", "拼多多", "网易", "小米", "泡泡玛特", "神华",
  "苹果 AAPL", "英伟达 NVDA", "特斯拉 TSLA", "亚马逊 AMZN", "谷歌 GOOGL", "Meta",
];

const SESS_KEY = "sj_chat_sessions_v1";
const ACTIVE_KEY = "sj_chat_active_session_v1";

// =================== Helpers ===================
function loadSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try { const raw = localStorage.getItem(SESS_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
function saveSessions(s: Session[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(SESS_KEY, JSON.stringify(s.slice(0, 100))); } catch {}
}
function genId() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
// 客户端兜底过滤 DSML 内部标签（防 server 漏过滤）
function cleanDSML(s: string): string {
  if (!s) return s;
  return s
    .replace(/<[^<>\n]{0,200}DSML[^<>\n]{0,200}>/g, "")
    .replace(/<\/?\s*(invoke|parameter|tool_calls)[^>]*>/gi, "")
    .replace(/name="[a-z_]+"\s+string="(true|false)"\s*>/g, "")
    .replace(/^\s+|\s+$/g, "");
}

// v58: 工具调用人话化映射 —— 把 "get_realtime_quote" 这种开发者命名翻译成用户能看懂的中文
const TOOL_LABELS: Record<string, string> = {
  get_realtime_quote: "实时行情",
  get_financials: "财务数据",
  get_pe_history_pct: "PE 历史分位",
  get_dividend_history: "股息历史",
  get_kline: "K 线",
  search_sage_post: "查历史发言",
  web_search: "联网搜索",
  compare_stocks: "对比股票",
};
const TOOL_ICONS: Record<string, string> = {
  get_realtime_quote: "📊",
  get_financials: "💰",
  get_pe_history_pct: "📈",
  get_dividend_history: "💵",
  get_kline: "📉",
  search_sage_post: "🔍",
  web_search: "🌐",
  compare_stocks: "⚖️",
};
function formatToolArgs(args: any): string {
  if (!args || typeof args !== "object") return "";
  if (args.stock) return String(args.stock);
  if (args.query) return `"${String(args.query).slice(0, 50)}${String(args.query).length > 50 ? "…" : ""}"`;
  if (args.tickers) return (Array.isArray(args.tickers) ? args.tickers : [args.tickers]).join(" / ");
  if (args.stocks) return (Array.isArray(args.stocks) ? args.stocks : [args.stocks]).join(" / ");
  return Object.values(args).map(v => String(v)).join(" ").slice(0, 50);
}

// 把 sage 输出里的 [原文 N] / [原文N] 替换为可点击的 ⓘ chip（HTML span 包裹）
// 后续由 ReactMarkdown 渲染为 <citation-chip data-n="N"/> → 点击展开对应 quote
function injectCitationChips(text: string): string {
  if (!text) return text;
  // 匹配 [原文 1] 或 [原文1] 或 [原文 12]
  return text.replace(/\[原文\s*(\d+)\]/g, (_, n) => `[\`#${n}\`](#cite-${n})`);
}

function fmtTime(ts: number) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff/60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff/3600_000)} 小时前`;
  return d.toISOString().slice(5, 10).replace("-", "/");
}

// =================== Sub-components ===================
function SagePickerRow({ s, active, onPick }: { s: SageOption; active: boolean; onPick: () => void }) {
  return (
    <button onClick={onPick}
      className={cn("w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
        active ? "bg-slate-100" : "hover:bg-slate-50")}>
      <div className={cn("h-6 w-6 shrink-0 flex items-center justify-center rounded bg-gradient-to-br text-white font-mono text-[9px] font-bold", s.gradient)}>{s.initials}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-900 truncate">{s.display}</p>
        <p className="text-[10px] text-slate-500 truncate">{s.philosophy.slice(0, 22)}</p>
      </div>
      {!s.hasCorpus && (
        <span className="shrink-0 text-[9px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full" title="无雪球 corpus，靠 metadata 角色扮演">
          元
        </span>
      )}
    </button>
  );
}

// =================== Component ===================
export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSage, setActiveSage] = useState<SageOption>(SAGES[0]);
  const [input, setInput] = useState("");
  // v56: 并行 session 支持 —— 用 Set 跟踪每个 session 各自是否在流式中，替代原全局 loading
  const [streamingIds, setStreamingIds] = useState<Set<string>>(new Set());
  const isActiveStreaming = activeId ? streamingIds.has(activeId) : false;
  const addStreaming = (id: string) => setStreamingIds(prev => { const n = new Set(prev); n.add(id); return n; });
  const removeStreaming = (id: string) => setStreamingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sagePickerOpen, setSagePickerOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage + 一次性清洗已存的 DSML 污染
  useEffect(() => {
    let s = loadSessions();
    let needSave = false;
    s = s.map(sess => {
      const cleaned = sess.msgs.map(m => {
        if (m.role === "sage" && m.content && /DSML|name="[a-z_]+" string=/.test(m.content)) {
          needSave = true;
          return { ...m, content: cleanDSML(m.content) };
        }
        return m;
      });
      return cleaned !== sess.msgs ? { ...sess, msgs: cleaned } : sess;
    });
    // v59: 清掉所有空 session（之前每次点"新对话"按钮都会留下空壳，本版本起 lazy 创建不再产生）
    const before = s.length;
    s = s.filter(sess => sess.msgs && sess.msgs.length > 0);
    if (s.length !== before) needSave = true;
    if (needSave) saveSessions(s);
    setSessions(s);
    // v59: 只有当 lastActive 指向真有内容的 session 时才 restore，否则进入空状态引导
    const last = typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
    const lastSess = last ? s.find(x => x.id === last) : null;
    if (lastSess && lastSess.msgs.length > 0) {
      setActiveId(last);
      const sage = SAGES.find(x => x.slug === lastSess.sage_id);
      if (sage) setActiveSage(sage);
    }
  }, []);

  // Persist
  useEffect(() => { if (sessions.length) saveSessions(sessions); }, [sessions]);
  useEffect(() => {
    if (activeId && typeof window !== "undefined") localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  const activeSession = useMemo(() => sessions.find(s => s.id === activeId) || null, [sessions, activeId]);
  const messages = activeSession?.msgs || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // v59: "新对话" 改为 lazy —— 不立即创建 session 实体，只是清空 active + 聚焦 input
  // 真正的 session 会在用户提交第一条消息时由 submit() 创建（已有 inline 逻辑）
  const newSession = useCallback((sage?: SageOption) => {
    const target = sage || activeSage;
    if (target.slug !== activeSage.slug) setActiveSage(target);
    setActiveId(null);   // 主区域进入空状态引导（v59 新增的 EmptyState）
    setInput("");
    setSidebarOpen(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [activeSage]);

  const switchSession = useCallback((id: string) => {
    const sess = sessions.find(s => s.id === id);
    if (!sess) return;
    setActiveId(id);
    const sage = SAGES.find(x => x.slug === sess.sage_id);
    if (sage) setActiveSage(sage);
    setSidebarOpen(false);
  }, [sessions]);

  const deleteSession = useCallback((id: string) => {
    if (!confirm("确认删除这个对话？")) return;
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      saveSessions(filtered);
      return filtered;
    });
    if (activeId === id) setActiveId(null);
  }, [activeId]);

  const updateActiveSession = useCallback((patch: Partial<Session>) => {
    setSessions(prev => prev.map(s => s.id === activeId ? { ...s, ...patch, ts_updated: Date.now() } : s));
  }, [activeId]);

  const updateLastMsg = useCallback((patch: Partial<Msg>) => {
    setSessions(prev => prev.map(s => {
      if (s.id !== activeId) return s;
      const msgs = [...s.msgs];
      if (msgs.length === 0) return s;
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...patch };
      return { ...s, msgs, ts_updated: Date.now() };
    }));
  }, [activeId]);

  // Generate title after first turn complete
  const generateTitle = async (sessId: string, userMsg: string, sageReply: string) => {
    try {
      const r = await fetch("/api/chat/title", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: userMsg, reply: sageReply.slice(0, 400) }),
      });
      if (!r.ok) return;
      const { title } = await r.json();
      if (title) setSessions(prev => prev.map(s => s.id === sessId ? { ...s, title: title.slice(0, 30) } : s));
    } catch {}
  };

  const submit = async (overrideText?: string) => {
    const text = (overrideText !== undefined ? overrideText : input).trim();
    if (!text) return;

    // 确保有 active session
    let sessId = activeId;
    if (!sessId) {
      const ns: Session = { id: genId(), sage_id: activeSage.slug, title: "新对话", msgs: [], ts_created: Date.now(), ts_updated: Date.now() };
      setSessions(prev => [ns, ...prev]);
      setActiveId(ns.id);
      sessId = ns.id;
    }

    // v56: 只阻止"在同一 session 内重复提交"，不阻止"切到别的 session 提问"
    if (streamingIds.has(sessId)) return;

    setInput(""); addStreaming(sessId);

    // 推 user msg + loading sage placeholder（使用最新 history 调用）
    const histPayload = messages.filter(m => !m.loading && m.content).map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
    setSessions(prev => prev.map(s => {
      if (s.id !== sessId) return s;
      return { ...s, msgs: [...s.msgs,
        { role: "user", content: text, ts: Date.now() },
        { role: "sage", content: "", loading: true, ts: Date.now() + 1 },
      ], ts_updated: Date.now() };
    }));

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sage_id: activeSage.slug, message: text, history: histPayload }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", evt = "", accumulated = "";
      // ⭐ 用本地 sessId 直接 patch, 不依赖 activeId 闭包（修race condition）
      const patchLast = (patch: Partial<Msg>) => setSessions(prev => prev.map(s => {
        if (s.id !== sessId) return s;
        const msgs = [...s.msgs];
        if (msgs.length === 0) return s;
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], ...patch };
        return { ...s, msgs, ts_updated: Date.now() };
      }));
      const processLines = (lines: string[]) => {
        for (const line of lines) {
          if (line.startsWith("event: ")) { evt = line.slice(7).trim(); continue; }
          if (!line.startsWith("data: ")) continue;
          let data: any; try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (evt === "quotes") patchLast({ quotes: data || [], loading: true });
          else if (evt === "chunk" && data.delta) {
            const clean = cleanDSML(data.delta);
            if (clean) { accumulated += clean; patchLast({ content: accumulated, loading: false }); }
          }
          else if (evt === "tool_call") setSessions(prev => prev.map(s => {
            if (s.id !== sessId) return s;
            const msgs = [...s.msgs];
            const last = { ...msgs[msgs.length - 1] };
            last.toolCalls = [...(last.toolCalls || []), { name: data.name, args: data.args, id: data.id }];
            msgs[msgs.length - 1] = last;
            return { ...s, msgs };
          }));
          else if (evt === "tool_result") setSessions(prev => prev.map(s => {
            if (s.id !== sessId) return s;
            const msgs = [...s.msgs];
            const last = { ...msgs[msgs.length - 1] };
            last.toolCalls = (last.toolCalls || []).map(tc => tc.id === data.id ? { ...tc, result: data.result } : tc);
            msgs[msgs.length - 1] = last;
            return { ...s, msgs };
          }));
          // v60.1: Analyst 流式思考过程
          else if (evt === "analyst_chunk" && data.delta) setSessions(prev => prev.map(s => {
            if (s.id !== sessId) return s;
            const msgs = [...s.msgs];
            const last = { ...msgs[msgs.length - 1] };
            last.analystThinking = (last.analystThinking || "") + data.delta;
            last.loading = false;
            msgs[msgs.length - 1] = last;
            return { ...s, msgs };
          }));
          else if (evt === "analyst_done") setSessions(prev => prev.map(s => {
            if (s.id !== sessId) return s;
            const msgs = [...s.msgs];
            const last = { ...msgs[msgs.length - 1] };
            last.analystDone = true;
            msgs[msgs.length - 1] = last;
            return { ...s, msgs };
          }));
          else if (evt === "phase" && data?.name === "writer") setSessions(prev => prev.map(s => {
            if (s.id !== sessId) return s;
            const msgs = [...s.msgs];
            const last = { ...msgs[msgs.length - 1] };
            last.writerStarted = true;
            msgs[msgs.length - 1] = last;
            return { ...s, msgs };
          }));
          else if (evt === "done") {
            // v55: 优先使用服务端 citation 校验后的 fullReply（剥除了张冠李戴的 [原文 N]）
            const finalText = data.fullReply || accumulated || "";
            patchLast({ content: cleanDSML(finalText), followups: data.followups || [], loading: false });
            const sess = sessions.find(s => s.id === sessId);
            const turns = sess ? sess.msgs.filter(m => m.role === "user").length + 1 : 1;
            if (turns === 1) setTimeout(() => generateTitle(sessId!, text, finalText), 100);
          }
          else if (evt === "citation_audit") {
            // v55: 调试事件 —— 控制台打印被剥的引用，便于回测
            if (data?.stripped?.length) console.warn("[citation_audit] stripped:", data.stripped, "kept:", data.kept);
          }
          else if (evt === "error") patchLast({ content: `Error: ${data.message}`, loading: false });
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) { if (buf) processLines(buf.split("\n")); break; }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        processLines(lines);
      }
    } catch (e: any) {
      setSessions(prev => prev.map(s => {
        if (s.id !== sessId) return s;
        const msgs = [...s.msgs];
        if (msgs.length > 0) msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: `Error: ${e.message}`, loading: false };
        return { ...s, msgs };
      }));
    } finally {
      removeStreaming(sessId);
    }
  };

  const exportMarkdown = () => {
    if (!activeSession || !messages.length) return;
    const today = new Date().toISOString().slice(0, 19).replace("T", " ");
    const lines: string[] = [
      `# ${activeSage.display} · ${activeSession.title}`, ``,
      `> 导出: ${today}`,
      `> Sage: ${activeSage.display} (${activeSage.alias})`,
      `> 来源: https://sage-jury.vercel.app/`, ``, `---`, ``,
    ];
    for (const m of messages) {
      if (m.role === "user") lines.push(`### 🧑 你`, ``, m.content, ``);
      else {
        lines.push(`### 🎩 ${activeSage.display}`, ``, m.content, ``);
        if (m.quotes?.length) {
          lines.push(`<details><summary>引用 ${m.quotes.length} 条原帖</summary>`, ``);
          m.quotes.forEach((q, i) => lines.push(`${i+1}. [${q.date} 👍${q.likes}](${q.url}) ${q.text.slice(0, 120)}`));
          lines.push(`</details>`, ``);
        }
        if (m.followups?.length) lines.push(`**跟进**: ${m.followups.map(f => `\`${f}\``).join(" · ")}`, ``);
      }
      lines.push(`---`, ``);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${activeSage.slug}-${activeSession.title}-${today.slice(0,10)}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <main className="h-screen overflow-hidden bg-slate-50 text-slate-900"
      style={{ fontFamily: "ui-sans-serif, -apple-system, 'Inter', 'PingFang SC', system-ui, sans-serif" }}>
      <div className="grid h-full grid-cols-1 md:grid-cols-[288px_1fr]">
        {/* === SIDEBAR (sessions) === */}
        <aside className={cn("fixed inset-y-0 left-0 z-30 w-72 border-r border-slate-200 bg-white transition-transform md:static md:translate-x-0 md:w-72 md:grid",
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0")}
          style={{ display: "flex", flexDirection: "column" }}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <span className="font-semibold text-slate-900 flex items-center gap-2">
              <span className="text-base">🎩</span>
              <span>Sage Chat</span>
            </span>
            <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1 hover:bg-slate-100 rounded">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="px-3 py-3 border-b border-slate-100">
            <button onClick={() => newSession()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white px-3 py-2.5 text-sm font-medium hover:shadow-md transition">
              <MessageSquarePlus className="h-4 w-4" /> 新对话
            </button>
          </div>
          {/* sage picker */}
          <div className="px-3 py-2 border-b border-slate-100">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 px-1">当前 Sage</div>
            <button onClick={() => setSagePickerOpen(!sagePickerOpen)}
              className={cn("w-full flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-slate-300 transition",
                "bg-white")}>
              <div className={cn("h-7 w-7 shrink-0 flex items-center justify-center rounded-lg bg-gradient-to-br text-white font-mono text-[10px] font-bold",
                activeSage.gradient)}>{activeSage.initials}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{activeSage.display}</p>
                <p className="text-[10px] text-slate-500 truncate">@{activeSage.alias}</p>
              </div>
              <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition", sagePickerOpen && "rotate-180")} />
            </button>
            {sagePickerOpen && (
              <div className="mt-2 space-y-2 max-h-[420px] overflow-y-auto">
                {/* 大众派 with corpus */}
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 px-3 pt-1">大众派 · 有 corpus</div>
                {SAGES.filter(s => s.tier === "popular" && s.hasCorpus).map(s => (
                  <SagePickerRow key={s.slug} s={s} active={s.slug === activeSage.slug}
                    onPick={() => { newSession(s); setSagePickerOpen(false); }} />
                ))}
                {/* 大众派 无 corpus */}
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 px-3 pt-2">大众派 · 元数据角色</div>
                {SAGES.filter(s => s.tier === "popular" && !s.hasCorpus).map(s => (
                  <SagePickerRow key={s.slug} s={s} active={s.slug === activeSage.slug}
                    onPick={() => { newSession(s); setSagePickerOpen(false); }} />
                ))}
                {/* 圈内派 */}
                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-400 px-3 pt-2">圈内派 · 元数据角色</div>
                {SAGES.filter(s => s.tier === "insider").map(s => (
                  <SagePickerRow key={s.slug} s={s} active={s.slug === activeSage.slug}
                    onPick={() => { newSession(s); setSagePickerOpen(false); }} />
                ))}
              </div>
            )}
          </div>
          {/* sessions list */}
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 px-2">历史对话 ({sessions.length})</div>
            {sessions.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8 px-3">还没有对话<br/>点上面「新对话」开始</p>
            ) : sessions.map(s => {
              const sage = SAGES.find(x => x.slug === s.sage_id);
              const isStreaming = streamingIds.has(s.id);
              return (
                <div key={s.id} className={cn("group rounded-lg px-2 py-2 mb-1 cursor-pointer transition",
                  s.id === activeId ? "bg-slate-100" : "hover:bg-slate-50")}
                  onClick={() => switchSession(s.id)}>
                  <div className="flex items-center gap-2">
                    <span className={cn("h-1.5 w-1.5 rounded-full bg-gradient-to-br shrink-0", sage?.gradient || "bg-slate-300")} />
                    <span className="flex-1 truncate text-sm text-slate-800">{s.title}</span>
                    {isStreaming && (
                      <span title="正在回答中" className="inline-flex items-center gap-1 text-[10px] text-blue-500 font-mono">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                        生成中
                      </span>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-rose-100 hover:text-rose-600 rounded transition">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 ml-3.5 text-[10px] text-slate-400">
                    <span>{sage?.display}</span>
                    <span>·</span>
                    <span>{s.msgs.filter(m => m.role === "user").length} 轮</span>
                    <span>·</span>
                    <span>{fmtTime(s.ts_updated)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400 text-center">
            数据本地存储 · 4 sage · 4 工具
          </div>
        </aside>

        {/* === MAIN (chat) === */}
        <section className="relative flex flex-col h-screen overflow-hidden">
          {/* Top bar */}
          <header className="flex items-center justify-between border-b border-slate-200 bg-white/90 backdrop-blur px-4 md:px-6 py-3">
            <div className="flex items-center gap-2 md:gap-3">
              <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5 hover:bg-slate-100 rounded">
                <Menu className="h-5 w-5 text-slate-600" />
              </button>
              <div className={cn("h-8 w-8 flex items-center justify-center rounded-lg bg-gradient-to-br text-white font-mono text-[11px] font-bold shadow-sm",
                activeSage.gradient)}>{activeSage.initials}</div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{activeSession?.title || "和 " + activeSage.display + " 对话"}</p>
                <p className="text-[11px] text-slate-500">
                  {activeSage.philosophy}
                  {activeSage.hasCorpus
                    ? ` · 基于 ${activeSage.total_posts.toLocaleString()} 条雪球发言`
                    : ` · 元数据角色（无历史发言池）`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button onClick={exportMarkdown} title="导出对话为 Markdown"
                  className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 transition">
                  <Download className="h-3 w-3" /> 导出
                </button>
              )}
              <span className="hidden md:flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] text-emerald-700 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Agent · 4 tools
              </span>
            </div>
          </header>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-5 bg-gradient-to-br from-slate-50 to-blue-50/30">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center max-w-2xl mx-auto">
                <div className={cn("h-16 w-16 flex items-center justify-center rounded-2xl bg-gradient-to-br text-white text-xl font-bold shadow-md",
                  activeSage.gradient)}>{activeSage.initials}</div>
                <h2 className="mt-5 text-2xl font-semibold text-slate-900">和 {activeSage.display} 对话</h2>
                <p className="mt-2 text-sm text-slate-500">{activeSage.philosophy}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {activeSage.hasCorpus
                    ? "4 工具 (历史发言语义搜 · 网搜 · 实时行情 · K 线)"
                    : "3 工具 (网搜 · 实时行情 · 财务) · 元数据角色，无历史发言池"}
                </p>
                <div className="mt-7 flex flex-wrap justify-center gap-2 max-w-xl">
                  {((STARTERS[activeSage.slug] || STARTERS_FALLBACK[activeSage.slug]) || [
                    `${activeSage.display}怎么看现在的市场？`,
                    `给我讲讲你的核心方法论`,
                  ]).map(s => (
                    <button key={s} onClick={() => submit(s)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition shadow-sm">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, mi) => (
              <div key={m.ts} className={cn("flex gap-3", m.role === "user" ? "flex-row-reverse" : "flex-row")}>
                <div className={cn("h-9 w-9 shrink-0 flex items-center justify-center rounded-xl font-mono text-[10px] font-bold shadow-sm",
                  m.role === "user" ? "bg-slate-900 text-white" : `bg-gradient-to-br ${activeSage.gradient} text-white`)}>
                  {m.role === "user" ? "你" : activeSage.initials}
                </div>
                <div className={cn("max-w-[78%] rounded-2xl px-5 py-3.5 shadow-sm",
                  m.role === "user" ? "bg-slate-900 text-white" : "bg-white border border-slate-200")}>
                  {/* v58: tool calls — 折叠 + 人话标签 + 紧凑 */}
                  {m.role === "sage" && m.toolCalls && m.toolCalls.length > 0 && (
                    <details className="mb-3 group">
                      <summary className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1 text-[11px] text-slate-600 transition select-none">
                        <Wrench className="h-3 w-3" />
                        <span>用了 {m.toolCalls.length} 个工具</span>
                        {m.toolCalls.some(tc => !tc.result) ? (
                          <Loader2 className="h-3 w-3 animate-spin text-amber-500" />
                        ) : (
                          <span className="text-emerald-600 text-[10px]">✓</span>
                        )}
                        <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
                      </summary>
                      <ul className="mt-1.5 ml-1 space-y-px">
                        {m.toolCalls.map((tc, ti) => {
                          const label = TOOL_LABELS[tc.name] || tc.name;
                          const icon = TOOL_ICONS[tc.name] || "🔧";
                          const argsStr = formatToolArgs(tc.args);
                          return (
                            <li key={ti}>
                              <details className="text-[11.5px]">
                                <summary className="cursor-pointer flex items-center gap-1.5 py-1 px-2 rounded hover:bg-slate-50 transition select-none">
                                  <span className="text-[12px] leading-none">{icon}</span>
                                  <span className="text-slate-700 font-medium shrink-0">{label}</span>
                                  {argsStr && <span className="text-slate-400">·</span>}
                                  <span className="text-slate-600 truncate flex-1 min-w-0">{argsStr}</span>
                                  {!tc.result && <Loader2 className="h-3 w-3 animate-spin text-amber-500 shrink-0" />}
                                  {tc.result && <span className="text-emerald-500 text-[10px] shrink-0">✓</span>}
                                </summary>
                                {tc.result && (
                                  <pre className="mt-1 mb-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[10.5px] text-slate-600 bg-slate-50 px-2.5 py-2 rounded ml-5">{tc.result.slice(0, 800)}{tc.result.length > 800 ? '…' : ''}</pre>
                                )}
                              </details>
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                  {/* v60.1: Analyst 内心分析（思考卡片，默认展开看到流式思考） */}
                  {m.role === "sage" && m.analystThinking && (
                    <details open={!m.writerStarted} className="mb-3 group">
                      <summary className="cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-violet-50 hover:bg-violet-100 px-3 py-1 text-[11px] text-violet-700 transition select-none">
                        <span>💭</span>
                        <span>{m.analystDone ? "内心分析" : (m.writerStarted ? "已分析完，落笔中" : "内心分析中…")}</span>
                        {!m.analystDone && <Loader2 className="h-3 w-3 animate-spin text-violet-500" />}
                        {m.analystDone && <span className="text-emerald-600 text-[10px]">✓</span>}
                        <ChevronDown className="h-3 w-3 transition group-open:rotate-180" />
                      </summary>
                      <div className="mt-1.5 ml-1 px-3 py-2 bg-violet-50/40 border-l-2 border-violet-200 rounded-r text-[11.5px] text-slate-600 max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                        {m.analystThinking}
                      </div>
                    </details>
                  )}
                  {m.loading && !m.content && !m.toolCalls?.length ? (
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{activeSage.display} 正在思考...</span>
                    </div>
                  ) : (
                    <>
                      <div className={cn("prose prose-sm max-w-none text-[14.5px] leading-[1.7] prose-p:my-2 prose-headings:my-3 prose-table:text-xs prose-th:bg-slate-100 prose-td:py-1 prose-td:px-2 prose-th:py-1.5 prose-th:px-2 prose-blockquote:border-l-2 prose-blockquote:border-slate-300 prose-blockquote:text-slate-600 prose-blockquote:italic",
                        m.role === "user" ? "text-white prose-invert" : "text-slate-800")}>
                        {m.role === "user" ? (
                          <p className="whitespace-pre-wrap m-0">{m.content}</p>
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                            a: ({ href, children }: any) => {
                              const m2 = href?.match(/^#cite-(\d+)/);
                              if (m2) {
                                const n = parseInt(m2[1], 10);
                                return (
                                  <a href={`#cite-${n}`}
                                    className="inline-flex items-center gap-0.5 rounded-md bg-sky-50 border border-sky-200 px-1.5 py-0 text-[11px] text-sky-700 hover:bg-sky-100 hover:border-sky-400 align-baseline no-underline font-mono"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      const el = document.getElementById(`cite-card-${m.ts}-${n}`);
                                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                      el?.classList.add('ring-2', 'ring-sky-400');
                                      setTimeout(() => el?.classList.remove('ring-2', 'ring-sky-400'), 1500);
                                    }}
                                    title="跳到引用原帖"
                                  >#{n}</a>
                                );
                              }
                              return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
                            }
                          }}>
                            {injectCitationChips(m.content)}
                          </ReactMarkdown>
                        )}
                        {m.role === "sage" && isActiveStreaming && messages[messages.length - 1] === m && (
                          <span className="inline-block w-0.5 h-4 ml-0.5 bg-blue-500 align-middle animate-pulse" />
                        )}
                      </div>
                      {m.role === "sage" && m.followups && m.followups.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {m.followups.map((q, k) => (
                            <button key={k} onClick={() => submit(q)}
                              className="group flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1.5 text-xs text-blue-800 hover:bg-blue-100 hover:border-blue-300 transition shadow-sm">
                              <Sparkles className="h-3 w-3 text-blue-500 group-hover:scale-110 transition" />
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                      {m.quotes && m.quotes.length > 0 && (
                        <details open className="mt-4 border-t border-slate-100 pt-3">
                          <summary className="cursor-pointer flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 hover:text-slate-600">
                            <Hash className="h-3 w-3" /> 引用 {m.quotes.length} 条历史原帖（点击文中 #N 跳转）
                          </summary>
                          <ul className="mt-2.5 space-y-2">
                            {m.quotes.map((q, j) => {
                              // v57.2: 暴露"为什么被选"的 score 标签
                              const recMul = q._rec_mul;
                              const relScore = q._rel_score;
                              const recLabel = recMul == null ? null :
                                recMul >= 1.5 ? "近期 🔥" :
                                recMul >= 1.15 ? "近期" :
                                recMul >= 0.9 ? "去年" :
                                recMul >= 0.65 ? "1-2 年前" : "更早";
                              const relLabel = relScore == null ? null :
                                relScore >= 10 ? "强相关" :
                                relScore >= 5 ? "相关" : "弱相关";
                              return (
                                <li key={j} id={`cite-card-${m.ts}-${j + 1}`} className="rounded-xl border border-slate-200 bg-sky-50/60 px-3.5 py-2.5 text-xs transition-all">
                                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-sky-500 px-1 text-[10px] font-mono font-bold text-white">#{j + 1}</span>
                                    <Twitter className="h-3 w-3 text-sky-500" />
                                    <span className="font-medium text-slate-600">雪球</span>
                                    <span className="text-slate-300">·</span>
                                    <a href={q.url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-blue-600 transition">{q.date} · 👍{q.likes}</a>
                                    <ExternalLink className="h-3 w-3 text-slate-400" />
                                    {relLabel && (
                                      <span className={cn("ml-auto inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                                        relScore! >= 10 ? "bg-emerald-100 text-emerald-700" :
                                        relScore! >= 5 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>
                                        {relLabel}
                                      </span>
                                    )}
                                    {recLabel && (
                                      <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                                        recMul! >= 1.5 ? "bg-rose-100 text-rose-700" :
                                        recMul! >= 1.15 ? "bg-amber-100 text-amber-700" :
                                        recMul! >= 0.9 ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-400")}>
                                        {recLabel}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-slate-700 line-clamp-3 leading-relaxed">{q.text}</p>
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
          <div className="border-t border-slate-200 bg-white p-3 md:p-4">
            <div className="flex gap-2 max-w-4xl mx-auto">
              <datalist id="stockSugList">{STOCK_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} list="stockSugList"
                onKeyDown={e => e.key === "Enter" && !isActiveStreaming && submit()}
                placeholder={isActiveStreaming ? `${activeSage.display} 正在回答…可切换到其他对话` : `问 ${activeSage.display}...`}
                className="flex-1 rounded-full border border-slate-200 bg-slate-50/50 px-5 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-50 transition"
                disabled={isActiveStreaming} />
              <button onClick={() => submit()} disabled={isActiveStreaming || !input.trim()}
                className={cn("flex items-center gap-1.5 rounded-full px-5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-30 transition",
                  `bg-gradient-to-br ${activeSage.gradient}`)}>
                {isActiveStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* mobile sidebar overlay */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/30 z-20 md:hidden" />
      )}
    </main>
  );
}
