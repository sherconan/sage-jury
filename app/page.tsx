"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, Loader2, MessageSquarePlus, Trash2, Download, Sparkles, ExternalLink,
  Hash, Twitter, Menu, X, ChevronDown, Wrench, ChevronRight, Quote,
} from "lucide-react";
import { cn } from "@/lib/utils";

// =================== Types ===================
interface QuoteRef { date: string; text: string; likes: number; url: string; _rel_score?: number; _rec_mul?: number; _final_score?: number; }
interface ToolCall { name: string; args: any; id?: string; result?: string; }
// v63: 后端结构化判决/估值/维度——之前前端丢弃了这些事件，只渲染纯文字墙
interface VerdictData {
  signal?: string;            // buy / watch / pass / too_hard …
  headline?: string;
  keyMetrics?: string[];      // ["PE 20", "营收5年CAGR 11.9%", …]
  dims?: Record<string, { note?: string; pass?: boolean; signal?: string }>;
  sage?: string;
}
interface FactsMeta {
  ticker?: { name?: string; code?: string; market?: string } | null;
  v62?: boolean;
  facts?: any;                // 非 v62 路径的 StockFactsTyped
  note?: string;
}
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
  // v63: 结构化卡片数据
  verdict?: VerdictData;
  factsMeta?: FactsMeta;
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
}

// =================== Static Config ===================
// v63: 上线 roster 扩到 10 位大佬。total_posts > 0 = 有真实雪球语料（带「发言溯源」）；
// = 0 = 靠结构化人设 + 真实财务数据作答（无历史发言库）。
const SAGES: SageOption[] = [
  { slug: "duan-yongping", display: "段永平", alias: "大道无形我有型",
    philosophy: "本分 · 不懂不投 · 看十年后", total_posts: 10630,
    initials: "DYP", gradient: "from-blue-500 to-indigo-600" },
  { slug: "guan-wo-cai", display: "管我财", alias: "管我财",
    philosophy: "低估逆向平均赢 · 排雷胜选股", total_posts: 33853,
    initials: "GWC", gradient: "from-emerald-500 to-teal-600" },
  { slug: "dan-bin", display: "但斌", alias: "时间的玫瑰",
    philosophy: "长持伟大消费品 · 享受复利", total_posts: 597,
    initials: "DB", gradient: "from-rose-500 to-pink-600" },
  { slug: "lao-tang", display: "唐朝（老唐）", alias: "手把手教你读财报",
    philosophy: "三年后估值 · 确定性折现", total_posts: 116,
    initials: "LT", gradient: "from-amber-500 to-orange-600" },
  { slug: "feng-liu", display: "冯柳", alias: "高毅·弱者体系",
    philosophy: "逆向 · 预期差 · 下行保护优先", total_posts: 0,
    initials: "FL", gradient: "from-violet-500 to-purple-600" },
  { slug: "zhang-kun", display: "张坤", alias: "易方达·公募一哥",
    philosophy: "集中持有 · 自由现金流为王", total_posts: 0,
    initials: "ZK", gradient: "from-sky-500 to-blue-600" },
  { slug: "lin-yuan", display: "林园", alias: "嘴巴股专家",
    philosophy: "垄断 · 上瘾 · 重复消费", total_posts: 0,
    initials: "LY", gradient: "from-lime-500 to-green-600" },
  { slug: "qiu-guolu", display: "邱国鹭", alias: "便宜的好公司",
    philosophy: "好行业 · 好公司 · 好价格", total_posts: 0,
    initials: "QGL", gradient: "from-cyan-500 to-teal-600" },
  { slug: "buffett", display: "巴菲特", alias: "Warren Buffett",
    philosophy: "护城河 · 能力圈 · 安全边际", total_posts: 0,
    initials: "WB", gradient: "from-slate-600 to-slate-800" },
  { slug: "li-lu", display: "李录", alias: "喜马拉雅资本",
    philosophy: "商业持久性 · 安全边际 · 复利", total_posts: 0,
    initials: "LL", gradient: "from-fuchsia-500 to-purple-600" },
];

const STARTERS: Record<string, string[]> = {
  "duan-yongping": ["苹果还能拿吗？", "拼多多怎么看？", "茅台现在能买吗？"],
  "guan-wo-cai":   ["腾讯能买吗？", "招行现在贵不贵？", "长江电力适合做底仓吗？"],
  "dan-bin":       ["茅台还能长持吗？", "腾讯算时间的玫瑰吗？", "比亚迪怎么看？"],
  "lao-tang":      ["茅台现在估值贵不贵？", "腾讯三年后值多少？", "洋河还能拿吗？"],
  "feng-liu":      ["海康威视有没有预期差？", "现在的医药板块怎么看？", "腾讯算左侧机会吗？"],
  "zhang-kun":     ["茅台的自由现金流如何？", "腾讯护城河还在吗？", "海天味业怎么看？"],
  "lin-yuan":      ["茅台符合嘴巴股吗？", "片仔癀怎么看？", "爱尔眼科算上瘾消费吗？"],
  "qiu-guolu":     ["招行算便宜的好公司吗？", "格力现在怎么看？", "美的值得买吗？"],
  "buffett":       ["苹果还有护城河吗？", "茅台符合你的标准吗？", "比亚迪怎么看？"],
  "li-lu":         ["茅台的商业持久性如何？", "腾讯在你能力圈内吗？", "宁德时代怎么看？"],
};
const DEFAULT_STARTERS = ["茅台现在能买吗？", "腾讯怎么看？", "苹果还能拿吗？"];

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

// v61: 把分析里的〔小标题〕转成 #### 标题 —— 让 ReactMarkdown 渲染出分层，
// 解决"一坨文字没人看得下去"的排版问题
function formatSageStructure(text: string): string {
  if (!text) return text;
  return text.replace(/〔\s*([^〕\n]{2,24})\s*〕/g, "\n\n#### $1\n\n");
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

// =================== v63 结构化卡片 ===================
// 判决信号 → 中文标签 + 语义色调（克制专业的研报配色，不花哨）
type Tone = "buy" | "watch" | "avoid" | "hard";
const SIGNAL_MAP: Record<string, { label: string; tone: Tone }> = {
  buy: { label: "值得重注", tone: "buy" },
  strong_buy: { label: "强烈看好", tone: "buy" },
  add: { label: "可加仓", tone: "buy" },
  watch: { label: "观望 · 等价", tone: "watch" },
  hold: { label: "持有", tone: "watch" },
  neutral: { label: "中性", tone: "watch" },
  pass: { label: "不碰", tone: "avoid" },
  avoid: { label: "回避", tone: "avoid" },
  sell: { label: "卖出", tone: "avoid" },
  too_hard: { label: "能力圈外", tone: "hard" },
  unknown: { label: "数据不足", tone: "hard" },
};
const TONE_STYLE: Record<Tone, { badge: string; ring: string; soft: string; text: string; bar: string; dot: string }> = {
  buy:   { badge: "bg-emerald-600 text-white", ring: "border-emerald-200", soft: "bg-emerald-50/70", text: "text-emerald-700", bar: "bg-emerald-500", dot: "bg-emerald-500" },
  watch: { badge: "bg-amber-500 text-white",   ring: "border-amber-200",   soft: "bg-amber-50/70",   text: "text-amber-700",   bar: "bg-amber-400",   dot: "bg-amber-400" },
  avoid: { badge: "bg-rose-600 text-white",     ring: "border-rose-200",    soft: "bg-rose-50/70",    text: "text-rose-700",    bar: "bg-rose-500",    dot: "bg-rose-500" },
  hard:  { badge: "bg-slate-600 text-white",    ring: "border-slate-200",   soft: "bg-slate-50",      text: "text-slate-600",   bar: "bg-slate-400",   dot: "bg-slate-400" },
};
function resolveSignal(sig?: string): { label: string; tone: Tone } {
  if (!sig) return { label: "判断中", tone: "watch" };
  return SIGNAL_MAP[sig] || { label: sig, tone: "watch" };
}
// "营收5年CAGR 11.9%" → { label:"营收5年CAGR", value:"11.9%" }；解析不出就整串当 value
function parseMetric(s: string): { label: string; value: string } {
  const m = s.match(/^(.+?)[\s:：]+([+\-]?[\d.,]+\s*[%倍元亿×x]?[A-Za-z]*)$/);
  if (m) return { label: m[1].trim(), value: m[2].replace(/\s+/g, "") };
  return { label: "", value: s };
}
const DIM_DOT: Record<string, Tone> = { strong: "buy", ok: "watch", weak: "avoid", unknown: "hard" };

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
  // v60.9.3: 溯源侧边栏 —— 引用发言不再平铺在对话下方，改为点 chip 抽屉展示
  const [sourcePanel, setSourcePanel] = useState<QuoteRef[] | null>(null);
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

    // v60.6.1: AbortController + 双重 watchdog
    // - 总超时 240s（cover 复杂多 sage 5 步推理 + 多工具）
    // - stall watchdog 90s（如果 90s 没新 SSE 事件 → 流死了，强制 abort）
    const ctrl = new AbortController();
    const totalTimeout = setTimeout(() => ctrl.abort(new Error("total-timeout-240s")), 240_000);
    let lastEventAt = Date.now();
    const stallTimer = setInterval(() => {
      if (Date.now() - lastEventAt > 90_000) {
        clearInterval(stallTimer);
        ctrl.abort(new Error("stall-90s-no-event"));
      }
    }, 5_000);
    const cleanupTimers = () => { clearTimeout(totalTimeout); clearInterval(stallTimer); };
    try {
      // v60.8.4: 切到 /api/chat/v2/stream — 两阶段架构（Python 取数/分析 + LLM 只写 voice）
      // v2 emit 兼容事件（quotes/tool_call/tool_result/phase:writer）让现有 UI 正常显示
      const res = await fetch("/api/chat/v2/stream", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sage_id: activeSage.slug, message: text, history: histPayload }),
        signal: ctrl.signal,
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
          lastEventAt = Date.now(); // v60.6.1 stall watchdog 心跳
          if (evt === "quotes") patchLast({ quotes: data || [], loading: true });
          // v63: 接住后端结构化判决/估值——之前被丢弃，导致只剩纯文字墙
          else if (evt === "verdict") patchLast({ verdict: data || {}, loading: true });
          else if (evt === "facts") patchLast({ factsMeta: data || {}, loading: true });
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
            // v60.6.1: done = 终态。强制清 analyst loading，防 analyst_done/phase 事件丢失导致 UI 永远转
            patchLast({
              content: cleanDSML(finalText),
              followups: data.followups || [],
              loading: false,
              analystDone: true,
              writerStarted: true,
            });
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
      // v60.6.1: 友好错误 + 始终清 analyst 状态防"内心分析中"永远转
      const isAbort = e?.name === "AbortError" || /timeout|stall/.test(String(e?.message));
      const friendlyMsg = isAbort
        ? "（响应超时——服务端可能仍在处理，但流被中断了。试着重发一次或换个简短的问法）"
        : `Error: ${e?.message || e}`;
      setSessions(prev => prev.map(s => {
        if (s.id !== sessId) return s;
        const msgs = [...s.msgs];
        if (msgs.length > 0) {
          const last = msgs[msgs.length - 1];
          msgs[msgs.length - 1] = {
            ...last,
            content: last.content || friendlyMsg,
            loading: false,
            analystDone: true,
            writerStarted: true,
          };
        }
        return { ...s, msgs };
      }));
    } finally {
      cleanupTimers();
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
              <span className="text-base">⚔️</span>
              <span>交易对线</span>
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
              <div className="mt-2 space-y-1">
                {SAGES.map(s => (
                  <button key={s.slug} onClick={() => { newSession(s); setSagePickerOpen(false); }}
                    className={cn("w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                      s.slug === activeSage.slug ? "bg-slate-100" : "hover:bg-slate-50")}>
                    <div className={cn("h-6 w-6 shrink-0 flex items-center justify-center rounded bg-gradient-to-br text-white font-mono text-[9px] font-bold", s.gradient)}>{s.initials}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-900 truncate">{s.display}</p>
                      <p className="text-[10px] text-slate-500 truncate">{s.philosophy.slice(0, 18)}</p>
                    </div>
                  </button>
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
            数据本地存储 · {SAGES.length} 位大佬 · 真实财务数据
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
                <p className="text-[11px] text-slate-500">{activeSage.philosophy}{activeSage.total_posts > 0 ? ` · 基于 ${activeSage.total_posts.toLocaleString()} 条雪球发言` : " · 结构化人设 + 真实财务数据"}</p>
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
                <p className="mt-1 text-xs text-slate-400">4 工具 (历史发言语义搜 · 网搜 · 实时行情 · K 线)</p>
                <div className="mt-7 flex flex-wrap justify-center gap-2 max-w-xl">
                  {(STARTERS[activeSage.slug] || DEFAULT_STARTERS).map(s => (
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
                <div className={cn("rounded-2xl px-5 py-3.5 shadow-sm",
                  m.role === "user" ? "max-w-[78%] bg-slate-900 text-white" : "w-full max-w-2xl md:max-w-3xl bg-white border border-slate-200")}>
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
                  {/* v63: 结构化卡片 —— 判决 / 估值 / 维度（命中"把信息展示卡片做好"） */}
                  {m.role === "sage" && m.verdict && (m.verdict.signal || m.verdict.headline || (m.verdict.keyMetrics?.length ?? 0) > 0) && (() => {
                    const { label, tone } = resolveSignal(m.verdict!.signal);
                    const st = TONE_STYLE[tone];
                    const tk = m.factsMeta?.ticker;
                    const mktLabel = tk?.market === "A" ? "A股" : tk?.market === "US" ? "美股" : tk?.market === "HK" ? "港股" : "";
                    const metrics = (m.verdict!.keyMetrics || []).map(parseMetric).filter(x => x.value);
                    const dims = m.verdict!.dims ? Object.entries(m.verdict!.dims) : [];
                    return (
                      <div className="mb-4 space-y-2.5">
                        {/* 判决卡 */}
                        <div className={cn("relative overflow-hidden rounded-xl border bg-white", st.ring)}>
                          <div className={cn("absolute inset-y-0 left-0 w-1", st.bar)} />
                          <div className="py-3 pl-4 pr-4">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className={cn("inline-flex items-center rounded-md px-2.5 py-1 text-xs font-bold tracking-wide", st.badge)}>{label}</span>
                              {tk?.name && (
                                <span className="text-sm font-semibold text-slate-900">{tk.name}
                                  {tk.code && <span className="ml-1 font-mono text-[11px] font-normal text-slate-400">{tk.code}</span>}
                                </span>
                              )}
                              <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-slate-300">{activeSage.display} · 判断</span>
                            </div>
                            {m.verdict!.headline && <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700">{m.verdict!.headline}</p>}
                          </div>
                        </div>
                        {/* 估值数据卡 */}
                        {metrics.length > 0 && (
                          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                              <span className="text-[11px] font-semibold text-slate-500">关键估值与质地</span>
                              <span className="font-mono text-[9px] uppercase tracking-wider text-slate-300">{mktLabel ? `${mktLabel} · 年报口径` : "年报口径"}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3">
                              {metrics.map((mm, i) => (
                                <div key={i} className="bg-white px-4 py-2.5">
                                  <div className="truncate text-[10.5px] text-slate-400">{mm.label || "指标"}</div>
                                  <div className="mt-0.5 font-mono text-[15px] font-semibold tabular-nums text-slate-800">{mm.value}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {/* 维度发现 */}
                        {dims.length > 0 && (
                          <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <div className="mb-2 text-[11px] font-semibold text-slate-500">{activeSage.display}的框架</div>
                            <ul className="space-y-2">
                              {dims.map(([dim, d], i) => {
                                const key = d?.signal || (d?.pass ? "ok" : "weak");
                                const dt = TONE_STYLE[DIM_DOT[key] || "watch"];
                                return (
                                  <li key={i} className="flex gap-2.5 text-[12.5px]">
                                    <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dt.dot)} />
                                    <div className="min-w-0">
                                      <span className="font-medium text-slate-700">{dim}</span>
                                      {d?.note && <span className="text-slate-500"> — {d.note}</span>}
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {m.loading && !m.content && !m.toolCalls?.length && !m.verdict ? (
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
                            h4: ({ children }: any) => (
                              <h4 className="not-prose mb-2 mt-6 flex items-center gap-2 text-[13.5px] font-bold tracking-wide text-slate-800 first:mt-0">
                                <span className="inline-block h-4 w-[3px] rounded-full bg-blue-500" />
                                {children}
                              </h4>
                            ),
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
                            {injectCitationChips(formatSageStructure(m.content))}
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
                        <button
                          onClick={() => setSourcePanel(m.quotes!)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700">
                          <Hash className="h-3 w-3" />
                          {m.quotes.length} 条历史发言溯源
                          <ChevronRight className="h-3 w-3" />
                        </button>
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

      {/* v60.9.3 溯源侧边栏 — 引用发言默认收起，点 chip 抽屉展示 */}
      {sourcePanel && (
        <>
          <div onClick={() => setSourcePanel(null)} className="fixed inset-0 z-40 bg-slate-900/25" />
          <aside className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100">
                  <Quote className="h-4 w-4 text-sky-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">引用来源</h3>
                  <p className="text-[11px] text-slate-400">{sourcePanel.length} 条雪球历史发言 · 仅供参考语气</p>
                </div>
              </div>
              <button onClick={() => setSourcePanel(null)}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {sourcePanel.map((q, j) => {
                const relScore = q._rel_score;
                const relLabel = relScore == null ? null :
                  relScore >= 10 ? "强相关" : relScore >= 5 ? "相关" : "弱相关";
                return (
                  <div key={j} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-sky-500 px-1 text-[10px] font-mono font-bold text-white">#{j + 1}</span>
                      <Twitter className="h-3 w-3 text-sky-500" />
                      <span className="font-medium text-slate-600">雪球</span>
                      <span className="text-slate-300">·</span>
                      <a href={q.url} target="_blank" rel="noreferrer" className="text-slate-500 transition hover:text-blue-600">{q.date} · 👍{q.likes}</a>
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                      {relLabel && (
                        <span className={cn("ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                          relScore! >= 10 ? "bg-emerald-100 text-emerald-700" :
                          relScore! >= 5 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500")}>
                          {relLabel}
                        </span>
                      )}
                    </div>
                    <p className="leading-relaxed text-slate-700">{q.text}</p>
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}
    </main>
  );
}
