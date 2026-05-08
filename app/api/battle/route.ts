// POST /api/battle — 交易对线 API（LLM 真扮演大佬）
// 后端: RAG 检索雪球真实发言 + Claude bridge 让大佬"开口"

import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "***DEEPSEEK_KEY_REMOVED***";
const LLM_MODEL = process.env.SAGE_LLM_MODEL || "deepseek-v4-pro";

interface Quote {
  id: number; date: string; text: string; likes: number;
  rt?: number; url: string;
}
interface SageData {
  slug: string; display: string; alias: string;
  philosophy: string; total_posts: number;
  high_quality_originals: Quote[];
  recent_originals?: Quote[];
  position_changes?: Quote[];
  by_stock: Record<string, Quote[]>;
  by_concept: Record<string, Quote[]>;
}

const SAGE_FILES: Record<string, string> = {
  "duan-yongping": "duan-yongping.json",
  "guan-wo-cai":   "guan-wo-cai.json",
};

async function loadSage(slug: string): Promise<SageData | null> {
  try {
    const file = path.join(process.cwd(), "data", "sages-quotes", SAGE_FILES[slug] || `${slug}.json`);
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch { return null; }
}

function findRelevant(sage: SageData, query: string, limit = 6): Quote[] {
  const found: Quote[] = []; const seen = new Set<number>();
  for (const stock of Object.keys(sage.by_stock)) {
    if (query.includes(stock)) {
      for (const q of sage.by_stock[stock].slice(0, 3)) if (!seen.has(q.id)) { found.push(q); seen.add(q.id); }
    }
  }
  for (const concept of Object.keys(sage.by_concept)) {
    if (query.includes(concept)) {
      for (const q of sage.by_concept[concept].slice(0, 2)) if (!seen.has(q.id)) { found.push(q); seen.add(q.id); }
    }
  }
  if (found.length < limit) {
    const terms = query.match(/[一-龥]{2,}|[A-Z]{2,}|\$\w+/g) || [];
    for (const q of sage.high_quality_originals) {
      if (found.length >= limit) break;
      if (seen.has(q.id)) continue;
      if (terms.some(t => q.text.includes(t))) { found.push(q); seen.add(q.id); }
    }
  }
  if (found.length < 3) {
    for (const q of sage.high_quality_originals.slice(0, 3 - found.length)) if (!seen.has(q.id)) { found.push(q); seen.add(q.id); }
  }
  return found.slice(0, limit).sort((a, b) => b.likes - a.likes);
}

const SAGE_PROMPTS: Record<string, string> = {
  "duan-yongping": `你是段永平（雪球 ID @大道无形我有型，oppo/vivo/步步高创始人，被誉为中国巴菲特）。
方法论：
- 本分。不懂不投。看十年后。
- 商业模式 > 优秀公司 > 合理价格（这个排序很重要，价格永远不是第一位）
- stop doing list 比 to-do list 重要
- 能力圈窄但深，大部分公司你都不了解
- 投的是公司未来现金流的折现
回答风格：朴实、直接、不端架子，常说"我不懂"、"看十年"、"对的事，把事做对"、"我只投我看得懂的"。
拒绝回答与方法论不符的问题（比如短期博弈、技术分析），但拒绝时要给出他的理由。`,
  "guan-wo-cai": `你是管我财（雪球 ID @管我财，价值投资派低估逆向定量代表，香港人，常用繁体粤式中文）。
方法论：
- 低估逆向平均赢，排雷排千平常心
- 定量估值：PE / PB / 历史分位 / 股息率
- 平均分散：AH 各 10 只 5% 仓位（"荒岛"系列年度策略）
- 长期回报 = 股价收益 + 股息收益（5% + 5% = 10% 即可）
- 最容易亏钱的方法是趁回吐买入，比追高危险十倍百倍
- "排雷"重于"选股"——避开烂公司的 ROI 高于精选好公司
回答风格：粤式繁体中文（也可简体），冷静、定量、注重数字。常说"低估逆向平均赢"、"排雷排千平常心"、"放長線釣大魚"、谈具体 PE/PB/股息率分位。
不会被炒作打动，习惯反问"PE在歷史什麼分位？"、"有沒有股息支撐？"、"下行有沒有保護？"`,
};

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  // DeepSeek V4 PRO endpoint
  const url = LLM_BASE.endsWith("/v1")
    ? `${LLM_BASE}/chat/completions`
    : `${LLM_BASE}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 1500,
      temperature: 0.75,
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const d: any = await res.json();
  return d?.choices?.[0]?.message?.content || "(empty)";
}

function buildRagContext(quotes: Quote[]): string {
  if (!quotes.length) return "（暂无相关历史发言）";
  return quotes.map((q, i) =>
    `[原文 ${i+1}] ${q.date} (👍${q.likes}): ${q.text.replace(/\n/g, " ").slice(0, 250)}`
  ).join("\n\n");
}

async function chatMode(sage: SageData, message: string) {
  const quotes = findRelevant(sage, message, 5);
  const ragCtx = buildRagContext(quotes);
  const sys = SAGE_PROMPTS[sage.slug] + `\n\n=== 你过去在雪球上的真实相关发言（请优先引用 / 化用，保持你的口吻和观点一致）===\n${ragCtx}\n\n回答时尽量引用其中至少 1-2 条作为依据，注明日期。`;
  const reply = await callLLM(sys, message);
  return { reply, quotes, mode: "chat" as const };
}

async function battleMode(sage: SageData, stockCode: string, reason: string) {
  // 检索股票相关的发言（优先持仓变化记录）
  const stockQuotes: Quote[] = [];
  // 1. 持仓变化里找该股票
  for (const pc of sage.position_changes || []) {
    if (pc.text && (pc.text.includes(stockCode) || stockCode.split(/[\s/]/).some(s => s && pc.text.includes(s)))) {
      stockQuotes.push(pc);
      if (stockQuotes.length >= 3) break;
    }
  }
  // 2. by_stock 字典
  for (const k of Object.keys(sage.by_stock)) {
    if (stockCode.includes(k) || k.includes(stockCode)) {
      stockQuotes.push(...sage.by_stock[k].slice(0, 4));
    }
  }
  const reasonQuotes = findRelevant(sage, reason, 3);
  const allQuotes = [...stockQuotes.slice(0, 5), ...reasonQuotes].slice(0, 8);
  const ragCtx = buildRagContext(allQuotes);

  const sys = SAGE_PROMPTS[sage.slug] + `\n\n=== 你过去在雪球上的真实相关发言（背景知识）===\n${ragCtx}\n\n现在用户来跟你"对线"——他想买入股票并给了买入理由。你的任务：\n1. 用你的方法论质疑他（至少 3 个尖锐问题）\n2. 引用你过去的真实发言（注明日期）作为论据\n3. 最后给一个明确的判断：买 / 等 / 不买，并说明理由\n4. 保持你的口吻特征（段永平：朴实直接 / 管我财：粤式繁体定量）`;
  const userPrompt = `我想买入：**${stockCode}**\n\n我的买入理由：\n${reason || "(未填写理由)"}\n\n请你按你的方法论审判我这个交易决策，并直接告诉我该买、该等、还是不该买。`;
  const reply = await callLLM(sys, userPrompt);
  return { reply, quotes: allQuotes, mode: "battle" as const };
}

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

export async function GET() {
  return NextResponse.json({
    service: "sage-jury · battle",
    llm: { base: LLM_BASE, model: LLM_MODEL },
    modes: {
      chat: "POST { sage_id, mode: 'chat', message }",
      battle: "POST { sage_id, mode: 'battle', stock_code, reason }",
    },
    available_sages: Object.keys(SAGE_FILES),
  }, { headers: cors });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors }); }

  const { sage_id, mode, message, stock_code, reason } = body;
  if (!sage_id || !SAGE_FILES[sage_id]) {
    return NextResponse.json({ error: "Unknown sage_id", available: Object.keys(SAGE_FILES) }, { status: 400, headers: cors });
  }
  const sage = await loadSage(sage_id);
  if (!sage) return NextResponse.json({ error: "Failed to load sage data" }, { status: 500, headers: cors });

  try {
    const result = mode === "battle"
      ? await battleMode(sage, stock_code || message || "", reason || "")
      : await chatMode(sage, message || "");
    return NextResponse.json({
      sage: { id: sage.slug, name: sage.display, philosophy: sage.philosophy, total_posts: sage.total_posts },
      ...result,
    }, { headers: cors });
  } catch (e: any) {
    return NextResponse.json({ error: "LLM call failed", message: e?.message || String(e) }, { status: 500, headers: cors });
  }
}
