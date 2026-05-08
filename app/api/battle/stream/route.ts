// POST /api/battle/stream — SSE 流式响应
// 用 Server-Sent Events 实时推送：
//   event: quotes  → 立即返回 RAG 召回的 8 条原文（200ms 内）
//   event: live    → 实时行情数据（500ms 内）
//   event: chunk   → LLM token 增量（边生成边推送）
//   event: done    → 结束 + followups 跟进建议

import { NextRequest } from "next/server";

export const runtime = "edge";  // ⭐ Edge runtime — Vercel Node lambda buffers SSE，edge 不会
export const dynamic = "force-dynamic";

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "***DEEPSEEK_KEY_REMOVED***";
const LLM_MODEL = process.env.SAGE_LLM_MODEL || "deepseek-v4-pro";

// 复用主 route.ts 中的导出 — 这里直接 inline 关键函数（保持单文件可读性）
// （生产中可重构成 lib/，先用最简方案）

interface Quote { id: number; date: string; ts?: number; text: string; text_n?: string; kw?: string[]; likes: number; rt?: number; url: string; }
interface SageData { slug: string; display: string; alias: string; philosophy: string; total_posts: number;
  high_quality_originals: Quote[]; recent_originals?: Quote[]; position_changes?: Quote[];
  by_stock: Record<string, Quote[]>; by_concept: Record<string, Quote[]>; }

const SAGE_FILES: Record<string, string> = {
  "duan-yongping": "duan-yongping.json", "guan-wo-cai": "guan-wo-cai.json",
  "lao-tang": "lao-tang.json", "dan-bin": "dan-bin.json",
};

async function loadSage(slug: string, req: NextRequest): Promise<SageData | null> {
  try {
    const fname = SAGE_FILES[slug] || `${slug}.json`;
    // Edge runtime: 从 same-origin /public 拿 JSON
    const url = new URL(`/sages-quotes/${fname}`, req.url);
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const HK_TO_M: Array<[string,string]> = [["點解","为什么"],["嘅","的"],["咗","了"],["喺","在"],["啲","些"],["冇","没"],["畀","给"],["俾","给"],["咁","这么"],["咩","什么"],["邊","哪"],["唔","不"],["睇","看"],["識","会"]];
function normalize(s: string): string { if (!s) return ""; for (const [h,m] of HK_TO_M) s = s.split(h).join(m); return s; }
const STOPWORDS = new Set("的了是在我你他她它们也都这那".split(""));
function tokenize(q: string): string[] {
  const n = normalize(q); const segs = n.split(/[\s,，。！？!?、:：；;\(\)（）"'""''「」『』]+/).filter(Boolean);
  const t = new Set<string>();
  for (const s of segs) {
    if (s.length >= 2 && !STOPWORDS.has(s)) t.add(s);
    if (/^[一-龥]+$/.test(s)) {
      for (let i = 0; i < s.length - 1; i++) { const bi = s.slice(i,i+2); if (!STOPWORDS.has(bi)) t.add(bi); }
      for (let i = 0; i < s.length - 2; i++) t.add(s.slice(i,i+3));
    } else t.add(s);
  }
  return [...t];
}
function findRelevant(sage: SageData, query: string, limit = 8): Quote[] {
  const found = new Map<number, { q: Quote; score: number }>();
  const tokens = tokenize(query);
  const qLow = normalize(query).toLowerCase();
  const score = (q: Quote, base: number) => {
    const txt = (q.text_n || q.text).toLowerCase();
    const kwSet = new Set(q.kw || []);
    let s = base;
    for (const t of tokens) { if (kwSet.has(t)) s += 3; if (txt.includes(t.toLowerCase())) s += 1; }
    if (s > 0) {
      const prev = found.get(q.id);
      if (!prev || prev.score < s) found.set(q.id, { q, score: s });
    }
  };
  for (const k of Object.keys(sage.by_stock)) {
    if (qLow.includes(k.toLowerCase()) || (k.length >= 2 && tokens.some(t => k.includes(t) || t.includes(k))))
      for (const q of sage.by_stock[k]) score(q, 8);
  }
  for (const c of Object.keys(sage.by_concept)) if (qLow.includes(c) || tokens.includes(c)) for (const q of sage.by_concept[c]) score(q, 5);
  if (sage.recent_originals) for (const q of sage.recent_originals) score(q, 0);
  for (const q of sage.high_quality_originals) score(q, 0);
  if (sage.position_changes) for (const q of sage.position_changes) score(q, 1);
  if (found.size < 3) for (const q of sage.high_quality_originals.slice(0, 3 - found.size)) if (!found.has(q.id)) found.set(q.id, { q, score: 0.1 });
  const now = Date.now();
  return [...found.values()].map(({ q, score }) => {
    const days = q.ts ? (now - q.ts) / 86400000 : 9999;
    const r = Math.max(0.3, 1 - days / 365);
    return { q, fs: score * 10 + q.likes * 0.05 * r };
  }).sort((a, b) => b.fs - a.fs).slice(0, limit).map(({ q }) => q);
}

// 实时行情
const NAME_TO_TICKER: Record<string,string> = {
  "茅台":"600519","贵州茅台":"600519","五粮液":"000858","汾酒":"600809","泸州老窖":"000568","洋河":"002304",
  "海天":"603288","海天味业":"603288","伊利":"600887","片仔癀":"600436","云南白药":"000538","恒瑞":"600276",
  "美的":"000333","格力":"000651","海尔":"600690","招行":"600036","招商银行":"600036","平安":"601318",
  "工行":"601398","宁德时代":"300750","比亚迪":"002594","隆基":"601012","中免":"601888","神华":"601088",
  "海康":"002415","中石油":"601857","万华":"600309","泡泡玛特":"09992","腾讯":"00700",
};
function detectTickers(q: string) {
  const m = new Map<string,string>();
  const codes = q.match(/(?<!\d)[036][05]\d{4}(?!\d)|0?9992|00700/g) || [];
  for (const c of codes) m.set(c.padStart(c.length === 4 ? 5 : c.length, "0"), c);
  for (const [n, c] of Object.entries(NAME_TO_TICKER)) if (q.includes(n)) m.set(c, n);
  return [...m.entries()].slice(0, 3).map(([code, name]) => ({ code, name }));
}
async function fetchLive(code: string, name: string) {
  const secid = /^0?9992$|^00700$/.test(code) ? `116.${code.padStart(5,"0")}` : (code.startsWith("6") ? `1.${code}` : `0.${code}`);
  try {
    const r = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f58,f162,f167,f170,f168`,
      { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 600 } as any });
    if (!r.ok) return null;
    const d: any = (await r.json()).data;
    if (!d?.f58) return null;
    const div = (n: any) => typeof n === "number" && !isNaN(n) ? n / 100 : undefined;
    return { code, name, price: div(d.f43), pe: div(d.f162), pb: div(d.f167), chg: div(d.f170), divYield: div(d.f168) };
  } catch { return null; }
}
async function liveCtx(query: string): Promise<{ text: string; data: any[] }> {
  const t = detectTickers(query); if (!t.length) return { text: "", data: [] };
  const live = (await Promise.all(t.map(x => fetchLive(x.code, x.name)))).filter(Boolean) as any[];
  if (!live.length) return { text: "", data: [] };
  const today = new Date().toISOString().slice(0,10);
  const lines = live.map(q => {
    const p: string[] = [`${q.name}(${q.code})`];
    if (q.price !== undefined) p.push(`价格 ${q.price.toFixed(2)}`);
    if (q.chg !== undefined) p.push(`今日 ${q.chg > 0 ? '+' : ''}${q.chg.toFixed(2)}%`);
    if (q.pe !== undefined) p.push(`PE ${q.pe.toFixed(1)}`);
    if (q.pb !== undefined) p.push(`PB ${q.pb.toFixed(2)}`);
    if (q.divYield && q.divYield > 0) p.push(`股息 ${q.divYield.toFixed(2)}%`);
    return `- ${p.join(' · ')}`;
  }).join("\n");
  return { text: `\n\n=== 📊 ${today} 实时行情（请优先用这些当前数据回答估值类问题）===\n${lines}\n`, data: live };
}

// === 陪审团判决书：4 个 sage 答完后生成 1 段共识/分歧总结 ===
// GET /api/battle/stream/verdict?question=...&replies=base64-json
// 用一个独立 endpoint 处理（前端 4 个 sage 答完后调用）

// SAGE_PROMPTS 简化（仅含 4 位）
const SAGE_PROMPTS: Record<string, string> = {
  "duan-yongping": `你是段永平（雪球 ID @大道无形我有型）。方法论：本分、不懂不投、看十年后、商业模式 > 优秀公司 > 合理价格、stop doing list。回答风格：朴实直接，常说"我不懂"、"看十年"。引用历史发言注明日期。最终输出简体中文。`,
  "guan-wo-cai": `你是管我财（雪球 ID @管我财，香港）。方法论：低估逆向平均赢、排雷重于选股、定量估值（PE/PB/股息率历史分位）、AH 平均分散。习惯反问 PE 在历史什么分位、有没有股息支撑、下行有没有保护。**最终输出必须简体中文普通话**，引用繁体粤语原文同步翻译。`,
  "lao-tang": `你是唐朝（雪球 ID @唐朝，老唐）。方法论：老唐估值法（买点=三年后合理估值×50%，卖点=合理估值×150%）、三年一倍、守正用奇。回答风格：朴实说理，先算账后定性，常说"老唐估值法走起"、"算个账"。`,
  "dan-bin": `你是但斌（雪球 ID @但斌，东方港湾）。方法论：时间的玫瑰、长期持有伟大公司、全球资产配置、集中持股。回答风格：诗意宏大叙事，常引费雪/巴菲特，常说"做时间的朋友"、"伟大企业"。`,
};

function buildRagContext(quotes: Quote[]): string {
  if (!quotes.length) return "（暂无相关历史发言）";
  // 截短到 180 字符 + 限制最多 5 条 → 系统 prompt 缩 ~50%，TTFC 减 ~500ms
  return quotes.slice(0, 5).map((q, i) =>
    `[原文 ${i+1}] ${q.date}(👍${q.likes}): ${(q.text_n || q.text).replace(/\n/g, " ").slice(0, 180)}`
  ).join("\n");
}

const enc = new TextEncoder();
function sse(event: string, data: any): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { sage_id, message, history } = body;
  if (!sage_id || !SAGE_FILES[sage_id]) {
    return new Response("Unknown sage", { status: 400 });
  }
  const sage = await loadSage(sage_id, req);
  if (!sage) return new Response("Failed to load sage data", { status: 500 });
  const userMsg = String(message || "").trim();
  if (!userMsg) return new Response("Empty message", { status: 400 });
  const hist: any[] = Array.isArray(history) ? history.filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-10) : [];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 第 1 步: 立即推送 RAG 召回结果
        const quotes = findRelevant(sage, userMsg, 5);
        controller.enqueue(sse("quotes", quotes));

        // 第 2 步: 推送实时行情
        const live = await liveCtx(userMsg);
        if (live.data.length) controller.enqueue(sse("live", live.data));

        // 第 3 步: 流式调 LLM
        const ragCtx = buildRagContext(quotes);
        const sys = (SAGE_PROMPTS[sage.slug] || `你是${sage.display}。`) +
          `\n\n=== 你过去在雪球上的真实相关发言（请优先引用）===\n${ragCtx}${live.text}\n\n回答时引用至少 1-2 条历史发言并注明日期。`;

        const llmRes = await fetch(`${LLM_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: LLM_MODEL,
            messages: [{ role: "system", content: sys }, ...hist, { role: "user", content: userMsg }],
            max_tokens: 1500, temperature: 0.75, stream: true,
          }),
        });
        if (!llmRes.ok || !llmRes.body) {
          controller.enqueue(sse("error", { message: `LLM ${llmRes.status}` }));
          controller.close();
          return;
        }
        const reader = llmRes.body.getReader();
        const dec = new TextDecoder();
        let buf = "", fullReply = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              const delta = j?.choices?.[0]?.delta?.content;
              if (delta) {
                fullReply += delta;
                controller.enqueue(sse("chunk", { delta }));
              }
            } catch {}
          }
        }

        // 第 4 步: 异步生成 followups（不阻塞，可慢）
        let followups: string[] = [];
        try {
          const fSys = `生成 3 个用户接着想问 ${sage.display} 的问题。每行 1 个，不超过 18 字。无编号无引号。`;
          const fUser = `用户问：${userMsg.slice(0,200)}\n${sage.display}回答：${fullReply.slice(0,600)}\n\n3个跟进：`;
          const fr = await fetch(`${LLM_BASE}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: "system", content: fSys }, { role: "user", content: fUser }], max_tokens: 200, temperature: 0.6, stream: false }),
          });
          if (fr.ok) {
            const d: any = await fr.json();
            const txt: string = d?.choices?.[0]?.message?.content || "";
            followups = txt.split(/\n+/)
              .map(s => s.trim()
                .replace(/^[•·\-\d\.\)、]+\s*/, "")    // 去开头编号
                .replace(/[「『""]/g, "")              // 去括号
                .replace(/^[问题Q：:\s]+/, "")         // 去"问题1:"
                .trim())
              .filter(s => s.length >= 4 && s.length <= 40)  // 放宽到 40
              .slice(0, 3);
          }
        } catch {}

        controller.enqueue(sse("done", { followups, fullReply }));
        controller.close();
      } catch (e: any) {
        controller.enqueue(sse("error", { message: e?.message || String(e) }));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
