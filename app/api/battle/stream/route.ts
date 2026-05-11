// POST /api/battle/stream — Sage Agent SSE 流式响应
// 每位 sage 是一个 agent，配 4 个工具：
//   - web_search (博查 Bocha): 联网搜最新消息/事件/争议
//   - get_realtime_quote: 实时股价/PE/PB/股息/涨跌
//   - get_kline: 历史 K 线（用于估算波动/趋势）
//   - get_company_news: 个股公司层面新闻（博查站内 site: 限定）

import { NextRequest } from "next/server";
import { SAGE_BY_ID } from "@/data/sages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "***DEEPSEEK_KEY_REMOVED***";
const LLM_MODEL = process.env.SAGE_LLM_MODEL || "deepseek-v4-pro";
const BOCHA_KEY = process.env.BOCHA_API_KEY || "***BOCHA_KEY_REMOVED***";

interface Quote { id: number; date: string; ts?: number; text: string; text_n?: string; kw?: string[]; likes: number; rt?: number; url: string; }
interface SageData { slug: string; display: string; alias: string; philosophy: string; total_posts: number;
  high_quality_originals: Quote[]; recent_originals?: Quote[]; position_changes?: Quote[];
  by_stock: Record<string, Quote[]>; by_concept: Record<string, Quote[]>; }

const SAGE_FILES: Record<string, string> = {
  "duan-yongping": "duan-yongping.json", "guan-wo-cai": "guan-wo-cai.json",
  "lao-tang": "lao-tang.json", "dan-bin": "dan-bin.json",
};

async function loadSage(slug: string, req: NextRequest): Promise<SageData | null> {
  // 1) corpus sage（duan/guan）走 json
  if (SAGE_FILES[slug]) {
    try {
      const url = new URL(`/sages-quotes/${SAGE_FILES[slug]}`, req.url);
      const r = await fetch(url.toString(), { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch {}
  }
  // 2) v60.4.10 fallback：用 SAGES_RAW metadata 拼合成 SageData（与 chat/stream 同步）
  const meta = SAGE_BY_ID[slug];
  if (!meta) return null;
  return {
    slug,
    display: meta.name,
    alias: '',
    philosophy: meta.philosophy,
    total_posts: 0,
    high_quality_originals: [],
    recent_originals: [],
    position_changes: [],
    by_stock: {},
    by_concept: {},
  } as SageData;
}

// v60.4.10: 给 fallback sage 拼系统 prompt（与 chat/stream 同步）
function buildFallbackSkillBlock(meta: any): string {
  const dimensions = (meta.dimensions || []).map((d: any) =>
    `  - ${d.label} (${Math.round((d.weight || 0) * 100)}%): ${d.description}`).join('\n');
  const redFlags = (meta.redFlags || []).map((r: any) =>
    `  - ${r.label}（${r.severity}）: ${r.trigger}`).join('\n');
  const quotes = (meta.quotes || []).slice(0, 5).map((q: string) => `  • ${q}`).join('\n');
  return `你是【${meta.name}】（${meta.title}）。流派：${meta.school}。

## 你的投资哲学
${meta.philosophy}

## 你的招牌核心句
"${meta.coreLine || ''}"

## 你的评分维度
${dimensions || '  （无）'}

## 你绝不碰的红旗
${redFlags || '  （无）'}

## 你常说的话
${quotes || '  （无）'}

⚠️ 你没有公开雪球 corpus 可查。不要假装"我说过 X"，承认"按方法论应该是 ..."。可调 web_search / get_realtime_quote。最终输出简体中文散文 5-7 段。`;
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
function findRelevant(sage: SageData, query: string, limit = 5): Quote[] {
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

const NAME_TO_TICKER: Record<string,string> = {
  "茅台":"600519","贵州茅台":"600519","五粮液":"000858","汾酒":"600809","泸州老窖":"000568","洋河":"002304",
  "海天":"603288","海天味业":"603288","伊利":"600887","片仔癀":"600436","云南白药":"000538","恒瑞":"600276",
  "美的":"000333","格力":"000651","海尔":"600690","招行":"600036","招商银行":"600036","平安":"601318",
  "工行":"601398","宁德时代":"300750","比亚迪":"002594","隆基":"601012","中免":"601888","神华":"601088",
  "海康":"002415","中石油":"601857","万华":"600309","泡泡玛特":"09992","腾讯":"00700",
};
function resolveTicker(input: string): { code: string; secid: string; name: string } | null {
  const v = input.trim();
  // 直接代码
  if (/^[036][05]\d{4}$/.test(v) || /^9?9992$/.test(v) || /^00700$/.test(v)) {
    const code = v.padStart(v.length === 4 ? 5 : v.length, "0");
    const secid = /^9?9992$|^00700$/.test(v) ? `116.${code.padStart(5,"0")}` : (code.startsWith("6") ? `1.${code}` : `0.${code}`);
    return { code, secid, name: code };
  }
  // 中文/英文名
  for (const [n, c] of Object.entries(NAME_TO_TICKER)) {
    if (v.includes(n) || n === v) {
      const secid = /^0?9992$|^00700$/.test(c) ? `116.${c.padStart(5,"0")}` : (c.startsWith("6") ? `1.${c}` : `0.${c}`);
      return { code: c, secid, name: n };
    }
  }
  return null;
}

// === TOOLS 实现 ===
async function tool_web_search(query: string, count = 5): Promise<string> {
  try {
    const r = await fetch("https://api.bochaai.com/v1/web-search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${BOCHA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, summary: true, count: Math.min(count, 8), freshness: "noLimit" }),
    });
    if (!r.ok) return `搜索失败: HTTP ${r.status}`;
    const j: any = await r.json();
    const webs = j?.data?.webPages?.value || [];
    if (!webs.length) return "无搜索结果";
    return webs.slice(0, count).map((w: any, i: number) =>
      `[${i+1}] ${w.name} (${w.dateLastCrawled?.slice(0,10) || ""})\n${w.snippet || w.summary || ""}\n来源: ${w.url}`
    ).join("\n\n");
  } catch (e: any) { return `搜索异常: ${e.message}`; }
}

async function tool_realtime_quote(stock: string): Promise<string> {
  const r = resolveTicker(stock);
  if (!r) return `未识别股票: ${stock}（请用中文名或 6 位代码）`;
  try {
    const u = `https://push2.eastmoney.com/api/qt/stock/get?secid=${r.secid}&fields=f43,f44,f45,f46,f57,f58,f60,f162,f167,f168,f170,f171,f57`;
    const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" } });
    if (!res.ok) return `行情接口失败: ${res.status}`;
    const d: any = (await res.json()).data;
    if (!d?.f58) return "找不到该股票";
    const div = (n: any) => typeof n === "number" && !isNaN(n) ? n / 100 : null;
    const today = new Date().toISOString().slice(0,10);
    return `${d.f58}(${r.code}) ${today} 实时:
价格: ${div(d.f43)?.toFixed(2)} (今日 ${div(d.f170)! > 0 ? '+' : ''}${div(d.f170)?.toFixed(2)}%, 振幅 ${div(d.f171)?.toFixed(2)}%)
今日 高/低/开/昨收: ${div(d.f44)?.toFixed(2)} / ${div(d.f45)?.toFixed(2)} / ${div(d.f46)?.toFixed(2)} / ${div(d.f60)?.toFixed(2)}
PE(TTM): ${div(d.f162)?.toFixed(1)} | PB: ${div(d.f167)?.toFixed(2)} | 股息率: ${div(d.f168)?.toFixed(2)}%`;
  } catch (e: any) { return `实时接口异常: ${e.message}`; }
}

async function tool_kline(stock: string, days = 30): Promise<string> {
  const r = resolveTicker(stock);
  if (!r) return `未识别股票: ${stock}`;
  try {
    const n = Math.min(Math.max(days, 7), 250);
    const u = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${r.secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&end=20500101&lmt=${n}`;
    const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" } });
    if (!res.ok) return `K线接口失败`;
    const d: any = (await res.json()).data;
    if (!d?.klines) return "无 K 线数据";
    const lines: string[] = d.klines.slice(-n);
    if (!lines.length) return "无有效行情";
    const first = lines[0].split(",");
    const last = lines[lines.length-1].split(",");
    const closes = lines.map((l: string) => parseFloat(l.split(",")[2]));
    const max = Math.max(...closes), min = Math.min(...closes);
    const chgPct = ((parseFloat(last[2]) - parseFloat(first[2])) / parseFloat(first[2]) * 100).toFixed(2);
    return `${d.name}(${r.code}) 最近 ${lines.length} 个交易日:
区间: ${first[0]} → ${last[0]}
涨跌幅: ${chgPct}% (${first[2]} → ${last[2]})
区间高/低: ${max.toFixed(2)} / ${min.toFixed(2)}
当前距区间高: ${((parseFloat(last[2])-max)/max*100).toFixed(1)}%, 距区间低: ${((parseFloat(last[2])-min)/min*100).toFixed(1)}%`;
  } catch (e: any) { return `K线异常: ${e.message}`; }
}

async function tool_company_news(stock: string, count = 5): Promise<string> {
  // 用 Bocha 站内搜：股票名 + 最近新闻
  const r = resolveTicker(stock);
  const name = r?.name || stock;
  const q = `${name} ${stock !== name ? '' : ''}最新公告 业绩 利润 营收 政策`;
  return await tool_web_search(q, count);
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "联网搜索最新新闻、政策、争议、行业动态。当用户问题涉及『最近』『最新』『政策』『新闻』『争议』时必用。",
      parameters: { type: "object", properties: { query: { type: "string", description: "搜索关键词" }, count: { type: "number", description: "返回条数 1-8", default: 5 } }, required: ["query"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_realtime_quote",
      description: "查询某只股票当前实时价格、PE、PB、股息率、今日涨跌。当用户问『现在多少钱』『PE 多少』『股息率』时必用。",
      parameters: { type: "object", properties: { stock: { type: "string", description: "股票名（如 茅台）或 6 位代码（如 600519）" } }, required: ["stock"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_kline",
      description: "查询某只股票历史 K 线（默认最近 30 个交易日），输出区间涨跌、距高/低位距离。用于判断趋势/位置。",
      parameters: { type: "object", properties: { stock: { type: "string" }, days: { type: "number", description: "天数 7-250", default: 30 } }, required: ["stock"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_company_news",
      description: "搜索某公司最新公告/业绩/重大事件新闻。比纯 web_search 更聚焦公司层面。",
      parameters: { type: "object", properties: { stock: { type: "string" }, count: { type: "number", default: 5 } }, required: ["stock"] },
    },
  },
];

const SAGE_PROMPTS: Record<string, string> = {
  "duan-yongping": `你是段永平（雪球 ID @大道无形我有型）。本分、不懂不投、看十年后、商业模式 > 优秀公司 > 合理价格、stop doing list。朴实直接。引用历史发言注明日期。最终输出简体中文。`,
  "guan-wo-cai": `你是管我财（雪球 ID @管我财，香港）。低估逆向平均赢、排雷重于选股、定量估值（PE/PB/股息率历史分位）、AH 平均分散。习惯反问 PE 在历史什么分位、有没有股息支撑、下行有没有保护。**最终输出必须简体中文普通话**，引用繁体粤语原文同步翻译。`,
  "lao-tang": `你是唐朝（雪球 ID @唐朝，老唐）。老唐估值法（买点=三年后合理估值×50%，卖点=合理估值×150%）、三年一倍、守正用奇。朴实说理，先算账后定性，常说"老唐估值法走起"、"算个账"。`,
  "dan-bin": `你是但斌（雪球 ID @但斌，东方港湾）。时间的玫瑰、长期持有伟大公司、全球资产配置、集中持股。诗意宏大叙事，常引费雪/巴菲特，常说"做时间的朋友"、"伟大企业"。`,
};

const NAME_TO_TICKER_REVERSE: Record<string, string> = NAME_TO_TICKER;

const enc = new TextEncoder();
function sse(event: string, data: any): Uint8Array {
  return enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function buildRagContext(quotes: Quote[]): string {
  if (!quotes.length) return "（暂无相关历史发言）";
  return quotes.slice(0, 5).map((q, i) =>
    `[原文 ${i+1}] ${q.date}(👍${q.likes}): ${(q.text_n || q.text).replace(/\n/g, " ").slice(0, 180)}`
  ).join("\n");
}

async function executeTool(name: string, args: any): Promise<string> {
  try {
    if (name === "web_search") return await tool_web_search(args.query, args.count);
    if (name === "get_realtime_quote") return await tool_realtime_quote(args.stock);
    if (name === "get_kline") return await tool_kline(args.stock, args.days);
    if (name === "get_company_news") return await tool_company_news(args.stock, args.count);
    return `未知工具: ${name}`;
  } catch (e: any) { return `工具异常: ${e.message}`; }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { sage_id, message, history } = body;
  if (!sage_id || (!SAGE_FILES[sage_id] && !SAGE_BY_ID[sage_id])) {
    return new Response("Unknown sage", { status: 400 });
  }
  const sage = await loadSage(sage_id, req);
  if (!sage) return new Response("Failed to load sage data", { status: 500 });
  const userMsg = String(message || "").trim();
  if (!userMsg) return new Response("Empty message", { status: 400 });
  const hist: any[] = Array.isArray(history) ? history.filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-8) : [];

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const quotes = findRelevant(sage, userMsg, 5);
        controller.enqueue(sse("quotes", quotes));

        const ragCtx = buildRagContext(quotes);
        // v60.4.10: prompt fallback 链 SAGE_PROMPTS → SAGES_RAW metadata 拼合 → 兜底
        const sageSkillBlock = SAGE_PROMPTS[sage.slug]
          || (SAGE_BY_ID[sage.slug] ? buildFallbackSkillBlock(SAGE_BY_ID[sage.slug]) : `你是${sage.display}。`);
        const sys = sageSkillBlock +
          `\n\n=== 你过去在雪球上的真实相关发言（请优先引用）===\n${ragCtx}\n\n你有 4 个外部工具可调用：web_search（联网最新消息）、get_realtime_quote（实时股价 PE）、get_kline（历史 K 线）、get_company_news（公司新闻）。**估值/股价/最新事件类问题必须先调用工具拿真数据再回答**，不要瞎猜。`;

        // Tool-calling loop (最多 3 轮 tool call)
        const messages: any[] = [{ role: "system", content: sys }, ...hist, { role: "user", content: userMsg }];
        let fullReply = "";
        let toolRounds = 0;
        const MAX_ROUNDS = 3;

        while (toolRounds < MAX_ROUNDS) {
          const isLastRound = toolRounds === MAX_ROUNDS - 1;
          const llmRes = await fetch(`${LLM_BASE}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: LLM_MODEL,
              messages,
              tools: isLastRound ? undefined : TOOLS,
              tool_choice: isLastRound ? undefined : "auto",
              max_tokens: 1500,
              temperature: 0.7,
              stream: true,
            }),
          });
          if (!llmRes.ok || !llmRes.body) {
            const errBody = llmRes.body ? await llmRes.text().catch(() => "") : "";
            controller.enqueue(sse("error", { message: `LLM ${llmRes.status}: ${errBody.slice(0,200)}` }));
            controller.close(); return;
          }
          const reader = llmRes.body.getReader();
          const dec = new TextDecoder();
          let buf = "", roundContent = "", roundReasoning = "";
          // tool_calls 累积器（按 index）
          const toolAcc: Record<number, { id?: string; name?: string; args: string }> = {};
          let finishReason = "";

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() || "";
            for (const line of lines) {
              const t = line.trim();
              if (!t.startsWith("data:")) continue;
              const p = t.slice(5).trim();
              if (p === "[DONE]") continue;
              try {
                const j = JSON.parse(p);
                const choice = j?.choices?.[0];
                const delta = choice?.delta;
                if (delta?.content) {
                  roundContent += delta.content;
                  fullReply += delta.content;
                  controller.enqueue(sse("chunk", { delta: delta.content }));
                }
                if (delta?.reasoning_content) {
                  roundReasoning += delta.reasoning_content;
                }
                if (delta?.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const idx = tc.index ?? 0;
                    if (!toolAcc[idx]) toolAcc[idx] = { args: "" };
                    if (tc.id) toolAcc[idx].id = tc.id;
                    if (tc.function?.name) toolAcc[idx].name = tc.function.name;
                    if (tc.function?.arguments) toolAcc[idx].args += tc.function.arguments;
                  }
                }
                if (choice?.finish_reason) finishReason = choice.finish_reason;
              } catch {}
            }
          }

          const toolCalls = Object.entries(toolAcc).map(([idx, v]) => ({ index: parseInt(idx), ...v }));
          if (toolCalls.length === 0 || finishReason !== "tool_calls") break;  // no tool calls → done

          // 通知前端 tool calls 开始
          for (const tc of toolCalls) {
            let parsedArgs: any = {};
            try { parsedArgs = JSON.parse(tc.args || "{}"); } catch {}
            controller.enqueue(sse("tool_call", { name: tc.name, args: parsedArgs, id: tc.id }));
          }

          // append assistant message + tool results to messages
          // ⭐ DeepSeek 思考模式要求把 reasoning_content 回传
          const assistantMsg: any = {
            role: "assistant",
            content: roundContent || "",
            tool_calls: toolCalls.map(tc => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.args || "{}" } })),
          };
          if (roundReasoning) assistantMsg.reasoning_content = roundReasoning;
          messages.push(assistantMsg);

          // 并行执行所有 tool
          await Promise.all(toolCalls.map(async tc => {
            let parsedArgs: any = {};
            try { parsedArgs = JSON.parse(tc.args || "{}"); } catch {}
            const result = await executeTool(tc.name || "", parsedArgs);
            controller.enqueue(sse("tool_result", { name: tc.name, id: tc.id, result: result.slice(0, 1500) }));
            messages.push({ role: "tool", tool_call_id: tc.id, content: result });
          }));

          toolRounds++;
        }

        // followups
        let followups: string[] = [];
        try {
          const fr = await fetch(`${LLM_BASE}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: LLM_MODEL,
              messages: [
                { role: "system", content: `生成 3 个用户接着想问 ${sage.display} 的问题。每行 1 个，不超过 18 字。无编号无引号。` },
                { role: "user", content: `用户问：${userMsg.slice(0,200)}\n${sage.display}回答：${fullReply.slice(0,600)}\n\n3个跟进：` },
              ],
              max_tokens: 200, temperature: 0.6, stream: false,
            }),
          });
          if (fr.ok) {
            const d: any = await fr.json();
            const txt: string = d?.choices?.[0]?.message?.content || "";
            followups = txt.split(/\n+/).map(s => s.trim().replace(/^[•·\-\d\.\)、]+\s*/, "").replace(/[「『""]/g, "").replace(/^[问题Q：:\s]+/, "").trim()).filter(s => s.length >= 4 && s.length <= 40).slice(0, 3);
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
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" },
  });
}
