// POST /api/battle/debate — 双 sage 对辩模式
// 给定一个问题 + sage A 的回答，让 sage B 用自己的方法论反驳/补充
// 输出：sage B 的反驳 + 双方 quotes

import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "***DEEPSEEK_KEY_REMOVED***";
const LLM_MODEL = process.env.SAGE_LLM_MODEL || "deepseek-v4-pro";

interface Quote { id: number; date: string; ts?: number; text: string; text_n?: string; kw?: string[]; likes: number; rt?: number; url: string; }
interface SageData { slug: string; display: string; alias: string; philosophy: string;
  high_quality_originals: Quote[]; recent_originals?: Quote[]; position_changes?: Quote[];
  by_stock: Record<string, Quote[]>; by_concept: Record<string, Quote[]>; }

const SAGE_FILES: Record<string, string> = {
  "duan-yongping": "duan-yongping.json", "guan-wo-cai": "guan-wo-cai.json",
  "lao-tang": "lao-tang.json", "dan-bin": "dan-bin.json",
};
const SAGE_PROMPTS: Record<string, string> = {
  "duan-yongping": `你是段永平。本分、不懂不投、看十年。商业模式 > 优秀公司 > 合理价格。`,
  "guan-wo-cai": `你是管我财（香港）。低估逆向、排雷胜选股、定量估值。**输出必须简体普通话**。`,
  "lao-tang": `你是唐朝（老唐）。老唐估值法（买点=三年合理估值×50%，卖点×150%）。`,
  "dan-bin": `你是但斌。时间的玫瑰、长期持有伟大公司、全球配置。`,
};

async function loadSage(slug: string, req: NextRequest): Promise<SageData | null> {
  try {
    const url = new URL(`/sages-quotes/${SAGE_FILES[slug]}`, req.url);
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

const enc = new TextEncoder();
const sse = (event: string, data: any) => enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { question, sage_a_id, sage_a_reply, sage_b_id } = body;
  if (!question || !sage_a_id || !sage_a_reply || !sage_b_id || !SAGE_FILES[sage_b_id]) {
    return new Response("Missing params", { status: 400 });
  }
  const sageB = await loadSage(sage_b_id, req);
  if (!sageB) return new Response("Failed loading sage B", { status: 500 });

  // 取 sage B 关于该问题的 5 条 RAG (简化版 — 用整个 question 字符串穷搜 by_stock keys)
  const quotes: Quote[] = [];
  const seen = new Set<number>();
  for (const k of Object.keys(sageB.by_stock)) {
    if (question.includes(k) || k.includes(question.trim())) {
      for (const q of sageB.by_stock[k]) {
        if (!seen.has(q.id)) { quotes.push(q); seen.add(q.id); if (quotes.length >= 5) break; }
      }
    }
    if (quotes.length >= 5) break;
  }
  if (quotes.length < 3) {
    for (const q of sageB.high_quality_originals.slice(0, 5 - quotes.length)) if (!seen.has(q.id)) quotes.push(q);
  }
  const ragCtx = quotes.slice(0, 5).map((q, i) => `[原文 ${i+1}] ${q.date}(👍${q.likes}): ${(q.text_n || q.text).slice(0, 180)}`).join("\n");

  const sys = (SAGE_PROMPTS[sage_b_id] || `你是 ${sageB.display}。`) +
    `\n\n=== 你过去的相关发言 ===\n${ragCtx}\n\n现在你要 **反驳/补充** 另一位投资大佬的回答。要求：\n1. 先一句话点出对方观点的关键点（用「他说...」开头）\n2. 然后用你的方法论给出**不同视角**：可以是反驳、补充、或修正\n3. 引用至少 1 条你自己的历史发言（注明日期）\n4. 输出简体中文，500 字内\n5. 不站队和稀泥，要有自己的判断`;

  const user = `用户问：${question}\n\n另一位大佬（${sage_a_id}）的回答：\n${sage_a_reply.slice(0, 1500)}\n\n请你用自己的方法论反驳/补充：`;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(sse("quotes", quotes));
        const llmRes = await fetch(`${LLM_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: "system", content: sys }, { role: "user", content: user }], max_tokens: 1000, temperature: 0.75, stream: true }),
        });
        if (!llmRes.ok || !llmRes.body) {
          controller.enqueue(sse("error", { message: `LLM ${llmRes.status}` }));
          controller.close(); return;
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
            const t = line.trim();
            if (!t.startsWith("data:")) continue;
            const p = t.slice(5).trim();
            if (p === "[DONE]") continue;
            try {
              const j = JSON.parse(p);
              const delta = j?.choices?.[0]?.delta?.content;
              if (delta) { fullReply += delta; controller.enqueue(sse("chunk", { delta })); }
            } catch {}
          }
        }
        controller.enqueue(sse("done", { fullReply }));
        controller.close();
      } catch (e: any) {
        controller.enqueue(sse("error", { message: e?.message || String(e) }));
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
