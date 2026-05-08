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
  id: number; date: string; ts?: number; text: string; likes: number;
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

function findRelevant(sage: SageData, query: string, limit = 8): Quote[] {
  const found: Quote[] = []; const seen = new Set<number>();
  const push = (q: Quote) => { if (!seen.has(q.id)) { found.push(q); seen.add(q.id); } };

  // ⭐ 关键修复 1：双向匹配股票字典 key（中文别名 + 代码都查）
  for (const stockKey of Object.keys(sage.by_stock)) {
    if (query.includes(stockKey) || stockKey.includes(query.trim())) {
      for (const q of sage.by_stock[stockKey].slice(0, 6)) push(q);
    }
  }

  // 概念匹配
  for (const concept of Object.keys(sage.by_concept)) {
    if (query.includes(concept)) {
      for (const q of sage.by_concept[concept].slice(0, 3)) push(q);
    }
  }

  // ⭐ 关键修复 2：直接对最近 90 天发言做全文搜索（最近热点必扫）
  const terms = query.match(/[一-龥]{2,}|[A-Z]{2,}|\$\w+/g) || [];
  if (terms.length > 0 && sage.recent_originals) {
    for (const q of sage.recent_originals) {
      if (found.length >= limit + 4) break;
      if (seen.has(q.id)) continue;
      if (terms.some(t => q.text.includes(t))) push(q);
    }
  }

  // ⭐ 关键修复 3：再扫历史高赞（高质量原创）
  if (found.length < limit) {
    for (const q of sage.high_quality_originals) {
      if (found.length >= limit) break;
      if (seen.has(q.id)) continue;
      if (terms.some(t => q.text.includes(t))) push(q);
    }
  }

  // ⭐ 关键修复 4：扫持仓变化（重要！比如"换成泡泡玛特"必须被找到）
  if (sage.position_changes) {
    for (const q of sage.position_changes) {
      if (found.length >= limit + 2) break;
      if (seen.has(q.id)) continue;
      if (terms.some(t => q.text.includes(t))) push(q);
    }
  }

  // 兜底
  if (found.length < 3) {
    for (const q of sage.high_quality_originals.slice(0, 3 - found.length)) push(q);
  }

  // 按"时间近 + 赞多"排序：先按时间倒序保留最近的
  return found.slice(0, limit).sort((a, b) => {
    // 时间衰减：每 30 天减 0.5 倍权重
    const now = Date.now();
    const aDays = a.ts ? (now - a.ts) / 86400000 : 9999;
    const bDays = b.ts ? (now - b.ts) / 86400000 : 9999;
    const aScore = a.likes * Math.max(0.2, 1 - aDays / 365);
    const bScore = b.likes * Math.max(0.2, 1 - bDays / 365);
    return bScore - aScore;
  });
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

interface ChatMsg { role: "user" | "assistant"; content: string; }

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  history: ChatMsg[] = []
): Promise<string> {
  const url = `${LLM_BASE}/chat/completions`;
  const messages = [
    { role: "system", content: systemPrompt },
    // 携带历史对话（最多保留最近 10 轮）
    ...history.slice(-10),
    { role: "user", content: userPrompt },
  ];
  const res = await fetch(url, {
    method: "POST",
    headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
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

async function chatMode(sage: SageData, message: string, history: ChatMsg[] = []) {
  const quotes = findRelevant(sage, message, 8);
  const ragCtx = buildRagContext(quotes);
  const sys = SAGE_PROMPTS[sage.slug] + `\n\n=== 你过去在雪球上的真实相关发言（请优先引用 / 化用，保持你的口吻和观点一致；如果用户问到的话题在历史发言里有，必须正面回答而不是说"我不关注"）===\n${ragCtx}\n\n回答时尽量引用其中至少 1-2 条作为依据，注明日期。如果用户问到的标的你确实在最近发言里讨论过，要正面引述你的真实观点。`;
  const reply = await callLLM(sys, message, history);
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

  const { sage_id, mode, message, stock_code, reason, history } = body;
  if (!sage_id || !SAGE_FILES[sage_id]) {
    return NextResponse.json({ error: "Unknown sage_id", available: Object.keys(SAGE_FILES) }, { status: 400, headers: cors });
  }
  const sage = await loadSage(sage_id);
  if (!sage) return NextResponse.json({ error: "Failed to load sage data" }, { status: 500, headers: cors });

  // history 来自前端 localStorage（用户在这位 sage 下的历史对话）
  const hist: ChatMsg[] = Array.isArray(history)
    ? history.filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    : [];

  try {
    const result = mode === "battle"
      ? await battleMode(sage, stock_code || message || "", reason || "")
      : await chatMode(sage, message || "", hist);
    return NextResponse.json({
      sage: { id: sage.slug, name: sage.display, philosophy: sage.philosophy, total_posts: sage.total_posts },
      ...result,
    }, { headers: cors });
  } catch (e: any) {
    return NextResponse.json({ error: "LLM call failed", message: e?.message || String(e) }, { status: 500, headers: cors });
  }
}
