"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Send, Loader2, ExternalLink,
  MessageSquare, Swords, Sparkles,
  Twitter, BookOpen, Mic, FileText, Globe, Hash,
  TrendingUp, Activity, Database, Trash2, Clock, Download,
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

// 每位 sage 的高价值起手问题（基于他们最近最热门的真实持仓 / 经典话题）
const STARTERS: Record<string, string[]> = {
  "duan-yongping": ["段大你换神华去泡泡玛特怎么想的？", "苹果还能拿吗？", "拼多多看长期怎么样？", "什么是 stop doing list？", "你怎么看小米？"],
  "guan-wo-cai":   ["腾讯现在能买吗？", "招行 PE 历史什么分位？", "工行股息现在多少？", "26 年荒岛策略怎么选？", "排雷比选股重要在哪？"],
  "lao-tang":      ["老唐茅台现在能买吗？", "腾讯三年合理估值是多少？", "洋河怎么看？", "守正出奇你怎么解释？", "分众分红的事老唐怎么看？"],
  "dan-bin":       ["但总英伟达还能拿吗？", "茅台拿 20 年这事现在还成立吗？", "特斯拉怎么看？", "时间的玫瑰最重要的是什么？", "苹果护城河在哪？"],
};

// 股票自动补全候选（datalist 用）
const STOCK_SUGGESTIONS = [
  "茅台", "贵州茅台", "五粮液", "汾酒", "泸州老窖", "洋河", "海天", "伊利",
  "片仔癀", "云南白药", "恒瑞医药", "美的", "格力", "海尔", "招商银行", "招行",
  "中国平安", "工商银行", "工行", "宁德时代", "比亚迪", "隆基", "中国中免",
  "腾讯", "阿里", "美团", "京东", "拼多多", "网易", "小米",
  "苹果 AAPL", "英伟达 NVDA", "特斯拉 TSLA", "亚马逊 AMZN", "谷歌 GOOGL",
  "微软 MSFT", "Meta", "可口可乐 KO", "Costco", "泡泡玛特", "神华",
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
interface MultiReply {
  sage_id: string;
  sage_name: string;
  sage_initials: string;
  sage_gradient: string;
  content: string;
  quotes?: QuoteRef[];
  followups?: string[];
  loading?: boolean;
}
interface Msg {
  role: "user" | "sage" | "multi";
  content: string;
  sage_id?: string;          // 单 sage 模式记录是哪位 sage 答的
  quotes?: QuoteRef[];
  followups?: string[];
  loading?: boolean;
  multiReplies?: MultiReply[];
  verdict?: string;          // 陪审团判决书
  verdictLoading?: boolean;
  // cross-sage debate: sage A 答完后让 B 反驳
  debates?: Array<{ sage_id: string; sage_name: string; sage_initials: string; sage_gradient: string; content: string; loading?: boolean; quotes?: QuoteRef[] }>;
  ts: number;
}

export default function BattlePage() {
  const [activeSage, setActiveSage] = useState<SageOption>(SAGES[0]);
  const [mode, setMode] = useState<"chat" | "battle" | "jury">("chat");
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

  const exportMarkdown = useCallback(() => {
    if (!messages.length) return;
    const today = new Date().toISOString().slice(0, 19).replace("T", " ");
    const sageName = mode === "jury" ? `陪审团 (${SAGES.length} 位)` : activeSage.display;
    const lines: string[] = [
      `# ${sageName} · 交易对线对话存档`,
      ``,
      `> 导出时间: ${today}`,
      `> 模式: ${mode === "chat" ? "1v1 对话" : mode === "jury" ? "多人陪审" : "对线判决"}`,
      `> 来源: https://sage-jury.vercel.app/battle`,
      ``,
      `---`,
      ``,
    ];
    for (const m of messages) {
      if (m.role === "user") {
        lines.push(`### 🧑 你`, ``, m.content || "", ``);
      } else if (m.role === "multi" && m.multiReplies) {
        lines.push(`### 🏛️ 陪审团 · ${m.multiReplies.length} 位回答`, ``);
        for (const r of m.multiReplies) {
          lines.push(`#### ${r.sage_name}`, ``, r.content || "(无回应)", ``);
          if (r.quotes && r.quotes.length) {
            lines.push(`<details><summary>引用 ${r.quotes.length} 条原帖</summary>`, ``);
            r.quotes.slice(0, 3).forEach(q => lines.push(`- [${q.date} 👍${q.likes}](${q.url}) ${q.text.slice(0, 100)}`));
            lines.push(`</details>`, ``);
          }
        }
      } else {
        lines.push(`### 🎩 ${activeSage.display}`, ``, m.content || "", ``);
        if (m.quotes && m.quotes.length) {
          lines.push(`<details><summary>引用 ${m.quotes.length} 条历史原帖</summary>`, ``);
          m.quotes.forEach((q, i) => lines.push(`${i+1}. [${q.date} 👍${q.likes}](${q.url}) ${q.text.slice(0, 120)}`));
          lines.push(`</details>`, ``);
        }
        if (m.followups && m.followups.length) {
          lines.push(`**跟进建议**: ${m.followups.map(f => `\`${f}\``).join(" · ")}`, ``);
        }
      }
      lines.push(`---`, ``);
    }
    const md = lines.join("\n");
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sage-jury-${activeSage.slug}-${mode}-${today.slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages, activeSage, mode]);

  // 共用：单 sage SSE 流处理（用于 chat 模式 + jury 模式各 sage）
  const streamOneSage = async (
    sageSlug: string,
    text: string,
    history: any[],
    onUpdate: (patch: { content?: string; quotes?: QuoteRef[]; followups?: string[]; loading?: boolean }) => void,
  ) => {
    const res = await fetch("/api/battle/stream", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sage_id: sageSlug, message: text, history }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", evt = "", accumulated = "";
    const processLines = (lines: string[]) => {
      for (const line of lines) {
        if (line.startsWith("event: ")) { evt = line.slice(7).trim(); continue; }
        if (!line.startsWith("data: ")) continue;
        let data: any; try { data = JSON.parse(line.slice(6)); } catch { continue; }
        if (evt === "quotes") onUpdate({ quotes: (data || []).map((q: any) => ({ ...q, source: q.source || "xueqiu" })), loading: true });
        else if (evt === "chunk" && data.delta) { accumulated += data.delta; onUpdate({ content: accumulated, loading: false }); }
        else if (evt === "done") onUpdate({ content: accumulated || data.fullReply || "", followups: data.followups || [], loading: false });
        else if (evt === "error") onUpdate({ content: `Error: ${data.message}`, loading: false });
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
  };

  // 陪审团模式：4 个 sage 并行流式
  const submitJury = async (text: string) => {
    setInput(""); setLoading(true);
    const tsBase = Date.now();
    const initialReplies: MultiReply[] = SAGES.map(s => ({
      sage_id: s.slug, sage_name: s.display, sage_initials: s.initials, sage_gradient: s.gradient,
      content: "", loading: true,
    }));
    setMessages(prev => [...prev,
      { role: "user", content: text, ts: tsBase },
      { role: "multi", content: text, multiReplies: initialReplies, ts: tsBase + 1 }]);

    const updateMulti = (sageSlug: string, patch: Partial<MultiReply>) => setMessages(prev => {
      const arr = [...prev];
      const last = arr[arr.length - 1];
      if (last.role === "multi" && last.multiReplies) {
        last.multiReplies = last.multiReplies.map(r => r.sage_id === sageSlug ? { ...r, ...patch } : r);
        arr[arr.length - 1] = { ...last };
      }
      return arr;
    });

    // 4 个并行（不传历史 — jury 模式独立每问）
    await Promise.all(SAGES.map(s =>
      streamOneSage(s.slug, text, [], patch => updateMulti(s.slug, patch))
        .catch(e => updateMulti(s.slug, { content: `Error: ${e.message}`, loading: false }))
    ));

    // ⭐ 4 个 sage 答完后请求陪审团判决书
    const updateVerdict = (patch: Partial<Msg>) => setMessages(prev => {
      const arr = [...prev]; arr[arr.length - 1] = { ...arr[arr.length - 1], ...patch }; return arr;
    });
    updateVerdict({ verdictLoading: true });
    try {
      // 拿到当前 multiReplies 内容
      const finalReplies = await new Promise<MultiReply[]>(resolve => {
        setMessages(prev => { resolve((prev[prev.length - 1].multiReplies || [])); return prev; });
      });
      const vRes = await fetch("/api/battle/verdict", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          replies: finalReplies.map(r => ({ sage_name: r.sage_name, content: r.content })),
        }),
      });
      const vJson = await vRes.json();
      updateVerdict({ verdict: vJson.verdict || `生成失败: ${vJson.error}`, verdictLoading: false });
    } catch (e: any) {
      updateVerdict({ verdict: `生成判决失败: ${e.message}`, verdictLoading: false });
    }

    setLoading(false);
  };

  // Chat 模式走 SSE 流式 (/api/battle/stream)；Battle 模式走传统 POST
  const submitChatStream = async (text: string) => {
    const body: any = {
      sage_id: activeSage.slug,
      message: text,
      history: messages
        .filter(m => !m.loading && m.content)
        .map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })),
    };
    setMessages(prev => [...prev,
      { role: "user", content: text, ts: Date.now() },
      { role: "sage", content: "", sage_id: activeSage.slug, loading: true, ts: Date.now() + 1 }]);
    setInput(""); setLoading(true);
    try {
      const res = await fetch("/api/battle/stream", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", evt = "", accumulated = "";
      const updateLast = (patch: Partial<Msg>) => setMessages(prev => {
        const arr = [...prev]; arr[arr.length - 1] = { ...arr[arr.length - 1], ...patch }; return arr;
      });
      const processLines = (lines: string[]) => {
        for (const line of lines) {
          if (line.startsWith("event: ")) { evt = line.slice(7).trim(); continue; }
          if (!line.startsWith("data: ")) continue;
          let data: any; try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (evt === "quotes") {
            updateLast({ quotes: (data || []).map((q: any) => ({ ...q, source: q.source || "xueqiu" })), loading: true });
          } else if (evt === "chunk" && data.delta) {
            accumulated += data.delta;
            updateLast({ content: accumulated, loading: false });
          } else if (evt === "done") {
            updateLast({ content: accumulated || data.fullReply || "", followups: data.followups || [], loading: false });
          } else if (evt === "error") {
            updateLast({ content: `Error: ${data.message}`, loading: false });
          }
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          // ⭐ flush 残留 buf —— done event 经常残留在最后一段
          if (buf) processLines(buf.split("\n"));
          break;
        }
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        processLines(lines);
      }
    } catch (e: any) {
      setMessages(prev => {
        const arr = [...prev];
        arr[arr.length - 1] = { role: "sage", content: `Error: ${e.message}`, ts: Date.now() };
        return arr;
      });
    } finally { setLoading(false); }
  };

  const submitWith = async (overrideText?: string) => {
    if (loading) return;
    const text = overrideText !== undefined ? overrideText : input;
    if (mode === "jury") {
      if (!text.trim()) return;
      return submitJury(text);
    }
    if (mode === "chat") {
      if (!text.trim()) return;
      return submitChatStream(text);
    }
    // battle 模式（传统）
    if (!stockCode.trim()) return;
    const userContent = `${stockCode}${reason ? ` — ${reason}` : ""}`;
    const body: any = { sage_id: activeSage.slug, mode: "battle", stock_code: stockCode, reason };
    setMessages(prev => [...prev,
      { role: "user", content: userContent, ts: Date.now() },
      { role: "sage", content: "", loading: true, ts: Date.now() + 1 }]);
    setLoading(true);
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

  // ⭐ Cross-sage debate: 当前 sage 答完后，找另一位 sage 反驳
  const triggerDebate = async (msgIdx: number, oppId: string) => {
    const msg = messages[msgIdx];
    if (!msg || msg.role !== "sage" || !msg.sage_id || !msg.content) return;
    const userMsg = messages[msgIdx - 1];
    if (!userMsg || userMsg.role !== "user") return;
    const opp = SAGES.find(s => s.slug === oppId);
    if (!opp) return;

    setMessages(prev => prev.map((m, i) => i === msgIdx ? {
      ...m,
      debates: [...(m.debates || []), { sage_id: oppId, sage_name: opp.display, sage_initials: opp.initials, sage_gradient: opp.gradient, content: "", loading: true }],
    } : m));

    const updateDeb = (patch: Partial<NonNullable<Msg["debates"]>[0]>) => setMessages(prev => prev.map((m, i) => {
      if (i !== msgIdx || !m.debates) return m;
      const debs = [...m.debates]; const last = debs[debs.length - 1]; debs[debs.length - 1] = { ...last, ...patch };
      return { ...m, debates: debs };
    }));

    try {
      const res = await fetch("/api/battle/debate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMsg.content, sage_a_id: msg.sage_id, sage_a_reply: msg.content, sage_b_id: oppId }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", evt = "", acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("event: ")) { evt = line.slice(7).trim(); continue; }
          if (!line.startsWith("data: ")) continue;
          let d: any; try { d = JSON.parse(line.slice(6)); } catch { continue; }
          if (evt === "quotes") updateDeb({ quotes: d, loading: true });
          else if (evt === "chunk" && d.delta) { acc += d.delta; updateDeb({ content: acc, loading: false }); }
          else if (evt === "done") updateDeb({ content: acc || d.fullReply || "", loading: false });
          else if (evt === "error") updateDeb({ content: `Error: ${d.message}`, loading: false });
        }
      }
    } catch (e: any) {
      updateDeb({ content: `Error: ${e.message}`, loading: false });
    }
  };

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

      {/* BODY — mobile: 单列堆叠; tablet: chat + sources; desktop: 三栏 */}
      <div className="mx-auto grid max-w-[1600px] gap-0 grid-cols-1 md:grid-cols-[260px_1fr] xl:grid-cols-[280px_1fr_320px]">

        {/* LEFT — sage list (mobile: 横向滚动 chip 行) */}
        <aside className="border-b md:border-b-0 md:border-r border-slate-200/80 md:min-h-[calc(100vh-57px)]">
          <div className="md:px-4 md:py-5 md:space-y-3">
            {/* Mobile: 横向滚动条 */}
            <div className="md:hidden flex items-center gap-2 overflow-x-auto px-4 py-3 bg-white">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 shrink-0">陪审 {SAGES.length}</span>
              {SAGES.map(s => (
                <button key={s.slug} onClick={() => setActiveSage(s)}
                  className={cn("shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition",
                    activeSage.slug === s.slug
                      ? `bg-gradient-to-br ${s.gradient} text-white shadow-sm`
                      : "border border-slate-200 bg-white text-slate-600")}>
                  <span className="font-mono text-[9px] opacity-80">{s.initials}</span>
                  {s.display}
                </button>
              ))}
            </div>
            {/* Desktop: 完整卡片 */}
            <div className="hidden md:block md:px-4 md:py-5 md:space-y-3">
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
            </div>{/* close hidden md:block */}
          </div>{/* close aside inner */}
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
              <button onClick={() => setMode("jury")}
                className={cn("flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all",
                  mode === "jury" ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                <Sparkles className="h-3.5 w-3.5" /> 陪审团
                <span className="rounded-full bg-blue-500/20 px-1.5 text-[9px] font-mono text-blue-700">x{SAGES.length}</span>
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {messages.length > 0 && (
                <>
                  <span className="flex items-center gap-1.5 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-slate-600">
                    <Clock className="h-3 w-3" />
                    {messages.filter(m => m.role === "user").length} 轮历史 · 已保存
                  </span>
                  <button onClick={exportMarkdown} title="导出为 Markdown"
                    className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 transition">
                    <Download className="h-3 w-3" /> 导出
                  </button>
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
                  {mode === "jury" ? `${SAGES.length} 位大佬陪审团 · 同问一题`
                    : mode === "chat" ? `和 ${activeSage.display} 对话`
                    : `让 ${activeSage.display} 审判你的交易`}
                </h3>
                {mode === "jury" ? (
                  <>
                    <p className="mt-2 text-sm text-slate-500 max-w-md">同一个问题，4 位大佬同时回答 · 看共识 vs 分歧</p>
                    <p className="mt-1.5 text-xs text-slate-400">{SAGES.map(s => `${s.display}（${s.total_posts.toLocaleString()}）`).join(" · ")}</p>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-slate-500 max-w-md">{activeSage.philosophy}</p>
                    <p className="mt-1.5 text-xs text-slate-400">基于 {activeSage.total_posts.toLocaleString()} 条真实雪球发言 · {activeSage.position_changes} 条持仓变化</p>
                  </>
                )}
                <div className="mt-7 flex flex-wrap justify-center gap-2 max-w-2xl">
                  {(mode === "jury"
                    ? ["茅台现在能买吗？", "腾讯能买吗？", "英伟达还能拿吗？", "招商银行还有上涨空间吗？", "AI 这波该跟吗？"]
                    : mode === "chat"
                    ? (STARTERS[activeSage.slug] || ["你怎么看 NVDA？","什么是护城河？","PE 多少算贵？"])
                    : ["茅台 / PE 20 长期持有","宁德时代 / 新能源龙头","腾讯 / 历史低估反弹","英伟达 / AI 必涨"]
                  ).map(s => (
                    <button key={s} onClick={() => mode === "battle"
                      ? (() => { const [c, r] = s.split(" / "); setStockCode(c); setReason(r || ""); })()
                      : submitWith(s)}
                      className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition shadow-sm">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => m.role === "multi" && m.multiReplies ? (
              // ⭐ 陪审团模式：N 个 sage 并排 grid 卡片
              <div key={m.ts} className="space-y-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  <span className="font-medium">{m.multiReplies.length} 位大佬同时回答 · 看共识与分歧</span>
                </div>
                <div className={cn("grid gap-3", m.multiReplies.length <= 2 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2")}>
                  {m.multiReplies.map(rep => (
                    <div key={rep.sage_id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
                      <div className={cn("flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 bg-gradient-to-br", rep.sage_gradient, "text-white")}>
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20 font-mono text-[10px] font-bold">
                          {rep.sage_initials}
                        </div>
                        <span className="text-sm font-semibold">{rep.sage_name}</span>
                        {rep.loading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin opacity-80" />}
                      </div>
                      <div className="flex-1 px-4 py-3 text-[13.5px] leading-[1.65] text-slate-800 whitespace-pre-wrap">
                        {rep.loading && !rep.content ? (
                          <span className="text-slate-400">正在翻历史发言…</span>
                        ) : (
                          rep.content || <span className="text-slate-400 italic">无回应</span>
                        )}
                      </div>
                      {rep.quotes && rep.quotes.length > 0 && (
                        <details className="border-t border-slate-100 px-4 py-2 bg-slate-50/50">
                          <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-wider text-slate-400 hover:text-slate-600">
                            引用 {rep.quotes.length} 条原帖
                          </summary>
                          <ul className="mt-2 space-y-1.5">
                            {rep.quotes.slice(0, 3).map((q, j) => (
                              <li key={j} className="text-[11px] text-slate-600">
                                <a href={q.url} target="_blank" rel="noreferrer" className="font-mono text-slate-400 hover:text-blue-600">{q.date} 👍{q.likes}</a>
                                <span className="ml-2 line-clamp-2">{q.text.slice(0, 80)}</span>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                  ))}
                </div>

                {/* ⭐ 陪审团判决书 — 4 个 sage 答完后的总结（在卡片下方更直观） */}
                {(m.verdict || m.verdictLoading) && (
                  <div className="rounded-2xl border-2 border-blue-300 bg-gradient-to-br from-blue-50 via-indigo-50/60 to-purple-50/60 p-5 shadow-md">
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-2xl">⚖️</span>
                      <span className="font-mono uppercase tracking-wider text-indigo-700 font-bold text-sm">陪审团判决书</span>
                      {m.verdictLoading && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
                    </div>
                    {m.verdict ? (
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap text-[14.5px] leading-[1.8] text-slate-800">
                        {m.verdict}
                      </div>
                    ) : (
                      <p className="text-xs text-indigo-600 italic">正在综合 {m.multiReplies.length} 位大佬的观点 · 提炼共识与分歧...</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
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
                        {m.role === "sage" && loading && messages[messages.length - 1] === m && (
                          <span className="inline-block w-0.5 h-4 ml-0.5 bg-blue-500 align-middle animate-pulse" />
                        )}
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
                      {/* ⭐ Cross-sage debate triggers */}
                      {m.role === "sage" && !m.loading && m.sage_id && m.content && (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <Swords className="h-3 w-3 text-rose-400" />
                          <span>让其他大佬反驳：</span>
                          {SAGES.filter(s => s.slug !== m.sage_id && !(m.debates || []).find(d => d.sage_id === s.slug)).map(s => (
                            <button key={s.slug} onClick={() => triggerDebate(messages.indexOf(m), s.slug)}
                              className={cn("flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
                                "border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-400 hover:bg-rose-100")}>
                              {s.display}
                            </button>
                          ))}
                        </div>
                      )}
                      {/* ⭐ Cross-sage debate replies */}
                      {m.debates && m.debates.length > 0 && m.debates.map((deb, di) => (
                        <div key={di} className="mt-3 rounded-xl border-l-4 border-rose-300 bg-rose-50/40 p-3.5">
                          <div className="flex items-center gap-2 text-xs mb-1.5">
                            <Swords className="h-3 w-3 text-rose-500" />
                            <span className="font-semibold text-rose-700">{deb.sage_name} 反驳</span>
                            {deb.loading && <Loader2 className="h-3 w-3 animate-spin text-rose-400" />}
                          </div>
                          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-[13.5px] leading-[1.65] text-slate-800">
                            {deb.content || (deb.loading ? <span className="italic text-slate-400">{deb.sage_name} 正在组织反驳...</span> : null)}
                          </div>
                        </div>
                      ))}
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
            {mode === "chat" || mode === "jury" ? (
              <div className="flex gap-2">
                <datalist id="stockSugList">
                  {STOCK_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                </datalist>
                <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  list="stockSugList"
                  onKeyDown={e => e.key === "Enter" && !loading && submit()}
                  placeholder={mode === "jury"
                    ? `同问 ${SAGES.length} 位大佬...（输入"茅台"等股票名有提示）`
                    : `问 ${activeSage.display}...（输入"茅台"等股票名有提示）`}
                  className={cn("flex-1 rounded-full border bg-slate-50/50 px-5 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 transition",
                    mode === "jury"
                      ? "border-blue-200 focus:border-blue-500 focus:ring-blue-100"
                      : "border-slate-200 focus:border-blue-400 focus:ring-blue-50")}
                  disabled={loading} />
                <button onClick={submit} disabled={loading || !input.trim()}
                  className={cn("flex items-center gap-1.5 rounded-full px-5 text-sm font-medium text-white shadow-md hover:shadow-lg disabled:opacity-30 transition",
                    mode === "jury"
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                      : `bg-gradient-to-br ${activeSage.gradient}`)}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "jury" ? <Sparkles className="h-4 w-4" /> : <Send className="h-4 w-4" />)}
                  {mode === "jury" ? "陪审" : "发送"}
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

        {/* RIGHT — sources & data (hidden on tablet/mobile) */}
        <aside className="hidden xl:block border-l border-slate-200/80 px-4 py-5 space-y-5 min-h-[calc(100vh-57px)] bg-slate-50/40">
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
