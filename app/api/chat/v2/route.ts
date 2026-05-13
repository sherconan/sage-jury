// POST /api/chat/v2/stream — v60.8 两阶段架构（仿 AI Hedge Fund）
//
// 核心 insight（从 virattt/ai-hedge-fund Buffett agent 抄到）：
//   v60.7 错：LLM 同时干 3 件事（思考 + 调 7 工具 + 写 voice）→ 必然 fuck up
//   v60.8 对：Python-端跑量化分析 → 输出 JSON facts → LLM 只做 1 件事（写 sage voice）
//
// 流程：
//   1. extract_stock(userMsg)  - 简单 regex 识别股票
//   2. fetch_facts(ticker)      - 并行拉 实时行情/PE 分位/股息历史/搜历史发言
//   3. score_dimensions(facts)  - 按 sage 5 维 deterministic 打分
//   4. LLM call (极短 prompt + voice few-shot + facts JSON) - 流式输出 80-200 字 voice

import { NextRequest } from "next/server";
import { SAGE_BY_ID } from "@/data/sages";
import { DUAN_YONGPING_SAMPLES, GUAN_WO_CAI_SAMPLES, formatVoiceSamples } from "@/lib/sage/voice_samples";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "***DEEPSEEK_KEY_REMOVED***";
const LLM_FAST_MODEL = process.env.SAGE_LLM_FAST_MODEL || "deepseek-chat";

function sse(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ============ 1. 股票识别（简单 regex + 中文公司名映射）============

const STOCK_ALIASES: Record<string, { code: string; secid: string; name: string; market: 'A' | 'HK' | 'US' }> = {
  // A 股常用
  "茅台": { code: "600519", secid: "1.600519", name: "贵州茅台", market: 'A' },
  "五粮液": { code: "000858", secid: "0.000858", name: "五粮液", market: 'A' },
  "招商银行": { code: "600036", secid: "1.600036", name: "招商银行", market: 'A' },
  "招行": { code: "600036", secid: "1.600036", name: "招商银行", market: 'A' },
  "工商银行": { code: "601398", secid: "1.601398", name: "工商银行", market: 'A' },
  "工行": { code: "601398", secid: "1.601398", name: "工商银行", market: 'A' },
  "宁德时代": { code: "300750", secid: "0.300750", name: "宁德时代", market: 'A' },
  "比亚迪": { code: "002594", secid: "0.002594", name: "比亚迪", market: 'A' },
  "中国神华": { code: "601088", secid: "1.601088", name: "中国神华", market: 'A' },
  "神华": { code: "601088", secid: "1.601088", name: "中国神华", market: 'A' },
  // 港股
  "腾讯": { code: "00700", secid: "116.00700", name: "腾讯控股", market: 'HK' },
  "腾讯控股": { code: "00700", secid: "116.00700", name: "腾讯控股", market: 'HK' },
  "泡泡玛特": { code: "09992", secid: "116.09992", name: "泡泡玛特", market: 'HK' },
  "美团": { code: "03690", secid: "116.03690", name: "美团-W", market: 'HK' },
  "小米": { code: "01810", secid: "116.01810", name: "小米集团-W", market: 'HK' },
  "江南布衣": { code: "03306", secid: "116.03306", name: "江南布衣", market: 'HK' },
  // 美股
  "苹果": { code: "AAPL", secid: "105.AAPL", name: "苹果", market: 'US' },
  "特斯拉": { code: "TSLA", secid: "105.TSLA", name: "特斯拉", market: 'US' },
  "英伟达": { code: "NVDA", secid: "105.NVDA", name: "英伟达", market: 'US' },
  "网易": { code: "NTES", secid: "105.NTES", name: "网易", market: 'US' },
  "拼多多": { code: "PDD", secid: "105.PDD", name: "拼多多", market: 'US' },
  "亚马逊": { code: "AMZN", secid: "105.AMZN", name: "亚马逊", market: 'US' },
  "Meta": { code: "META", secid: "105.META", name: "Meta", market: 'US' },
};

function extractStock(text: string): typeof STOCK_ALIASES[string] | null {
  // 优先匹配最长的别名
  const keys = Object.keys(STOCK_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) if (text.includes(k)) return STOCK_ALIASES[k];
  // 直接 6 位代码
  const m6 = text.match(/\b(\d{6})\b/);
  if (m6) {
    const code = m6[1];
    const secid = code.startsWith("6") ? `1.${code}` : `0.${code}`;
    return { code, secid, name: code, market: 'A' };
  }
  return null;
}

// ============ 2. 数据获取 (typed, 并行) ============

interface StockFacts {
  ticker: { code: string; name: string; market: 'A' | 'HK' | 'US' };
  price?: number;
  pe_ttm?: number;
  pb_mrq?: number;
  dividend_yield_pct?: number;
  pe_pct_5y?: number;
  pe_pct_10y?: number;
  change_today_pct?: number;
  errors: string[];
}

async function fetchQuote(stock: typeof STOCK_ALIASES[string]): Promise<Partial<StockFacts>> {
  try {
    const u = `https://push2.eastmoney.com/api/qt/stock/get?secid=${stock.secid}&fields=f43,f57,f58,f162,f167,f168,f170`;
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { errors: [`quote http ${r.status}`] };
    const d: any = (await r.json()).data;
    if (!d?.f43) return { errors: ["no data"] };
    const safe = (n: any) => typeof n === "number" && !isNaN(n) ? n / 100 : undefined;
    return {
      price: safe(d.f43),
      pe_ttm: safe(d.f162),
      pb_mrq: safe(d.f167),
      dividend_yield_pct: safe(d.f168),
      change_today_pct: safe(d.f170),
      errors: [],
    };
  } catch (e: any) { return { errors: [`quote ${e.message}`] }; }
}

async function fetchPePct(stock: typeof STOCK_ALIASES[string]): Promise<Partial<StockFacts>> {
  if (stock.market !== 'A') return {}; // HK/US 没有这个接口
  try {
    const u = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=PE_TTM_5YEARS_PCT,PE_TTM_10YEARS_PCT&filter=(SECURITY_CODE%3D%22${stock.code}%22)&pageSize=1`;
    const r = await fetch(u, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return {};
    const j: any = await r.json();
    const row = j?.result?.data?.[0];
    if (!row) return {};
    return {
      pe_pct_5y: row.PE_TTM_5YEARS_PCT,
      pe_pct_10y: row.PE_TTM_10YEARS_PCT,
    };
  } catch { return {}; }
}

async function gatherFacts(stock: typeof STOCK_ALIASES[string]): Promise<StockFacts> {
  const [quote, pe] = await Promise.all([fetchQuote(stock), fetchPePct(stock)]);
  return {
    ticker: stock,
    ...quote,
    ...pe,
    errors: [...(quote.errors || []), ...(pe.errors || [])],
  };
}

// ============ 3. Sage 5 维 deterministic 评分 ============

interface DimScore {
  score: number;       // 0-5
  pass: boolean;
  note: string;
}

interface SageVerdict {
  sage: 'duan-yongping' | 'guan-wo-cai';
  dims: Record<string, DimScore>;
  signal: 'bullish' | 'bearish' | 'neutral' | 'out_of_circle';
  confidence: number;  // 0-100
}

// 段永平能力圈关键词
const DUAN_CIRCLE_KEYWORDS = ["茅台", "五粮液", "苹果", "AAPL", "网易", "NTES", "腾讯", "00700", "拼多多", "PDD", "泡泡玛特", "09992", "Costco", "可口可乐", "美的", "格力", "海天"];
const DUAN_OUT_OF_CIRCLE = ["生物医药", "光伏", "新能源车", "搜索", "百度", "BIDU", "煤炭", "钢铁", "周期", "中报反转"];

// 管我财能力圈：港股 + 高股息 + 低估
const GUAN_PORTFOLIO = ["招行", "招商银行", "工行", "工商银行", "建行", "中行", "腾讯", "00700", "江南布衣", "03306", "物管", "首都机场", "00694"];

function scoreDuan(facts: StockFacts, userMsg: string): SageVerdict {
  const dims: Record<string, DimScore> = {};
  const tickerStr = facts.ticker.name + " " + facts.ticker.code;
  const fullText = userMsg + " " + tickerStr;

  // 维度 1: 能力圈
  const inCircle = DUAN_CIRCLE_KEYWORDS.some(k => fullText.includes(k));
  const outOfCircle = DUAN_OUT_OF_CIRCLE.some(k => fullText.includes(k));
  dims.circle = {
    score: outOfCircle ? 0 : inCircle ? 5 : 3,
    pass: !outOfCircle,
    note: outOfCircle ? "明显能力圈外（光伏/医药/周期类）" : inCircle ? "在已表态过的能力圈内" : "未明确表态，需谨慎",
  };

  // 维度 2: 商业模式（用 PE/PB 粗判 - 优质消费品通常 PE 20-40 ROE 高）
  if (facts.pe_ttm && facts.pe_ttm > 0) {
    const pe = facts.pe_ttm;
    dims.business = {
      score: pe < 8 || pe > 80 ? 2 : pe < 15 || pe > 50 ? 3 : 4,
      pass: pe < 80,
      note: `PE-TTM ${pe.toFixed(1)} ${pe < 15 ? "(便宜但可能反映生意一般)" : pe > 50 ? "(贵但可能反映成长强)" : "(中性区间)"}`,
    };
  } else {
    dims.business = { score: 0, pass: false, note: "无 PE 数据，未表态" };
  }

  // 维度 3: 团队（无可靠 deterministic 信号，依赖 search_sage_post，这里给中性）
  dims.team = { score: 3, pass: true, note: "无 deterministic 信号，看用户问的公司段永平是否赞过其管理层" };

  // 维度 4: 价格 vs 国债（10 年期国债 ~3.5%, 段永平要求年化 8% 以上预期）
  if (facts.pe_ttm && facts.pe_ttm > 0) {
    const pe = facts.pe_ttm;
    const earnings_yield = 100 / pe;
    dims.price = {
      score: earnings_yield > 8 ? 4 : earnings_yield > 5 ? 3 : earnings_yield > 3 ? 2 : 1,
      pass: earnings_yield > 3,
      note: `Earnings Yield ${earnings_yield.toFixed(1)}% vs 国债 ~3.5% (段永平不算精确 DCF，看 vs 国债的相对吸引力)`,
    };
  } else {
    dims.price = { score: 0, pass: false, note: "无 PE 数据" };
  }

  // 维度 5: Stop Doing 红旗
  const redFlags: string[] = [];
  if (outOfCircle) redFlags.push("能力圈外");
  if (facts.pe_ttm && facts.pe_ttm > 80) redFlags.push("PE > 80（讲故事股嫌疑）");
  dims.stop_doing = {
    score: redFlags.length === 0 ? 5 : redFlags.length === 1 ? 2 : 0,
    pass: redFlags.length === 0,
    note: redFlags.length ? "触发: " + redFlags.join(", ") : "无明显 stop doing 触发",
  };

  // 综合信号
  const avg = (dims.circle.score + dims.business.score + dims.team.score + dims.price.score + dims.stop_doing.score) / 5;
  const signal = outOfCircle ? "out_of_circle" : avg >= 3.5 ? "bullish" : avg >= 2.5 ? "neutral" : "bearish";
  return { sage: "duan-yongping", dims, signal, confidence: Math.round(avg * 20) };
}

function scoreGuan(facts: StockFacts, userMsg: string): SageVerdict {
  const dims: Record<string, DimScore> = {};
  const tickerStr = facts.ticker.name + " " + facts.ticker.code;
  const fullText = userMsg + " " + tickerStr;

  // 维度 1: 价位（PE 5 年分位）
  if (facts.pe_pct_5y !== undefined) {
    const pct = facts.pe_pct_5y;
    dims.position = {
      score: pct > 80 ? 0 : pct > 60 ? 2 : pct > 30 ? 4 : 5,
      pass: pct < 80,
      note: `PE 5 年分位 ${pct.toFixed(0)}% ${pct < 30 ? "(低估)" : pct > 80 ? "(高估，立刻没兴趣)" : "(中性)"}`,
    };
  } else if (facts.pe_ttm) {
    dims.position = { score: 3, pass: true, note: `PE ${facts.pe_ttm.toFixed(1)} (无 5 年分位数据，仅看绝对值)` };
  } else {
    dims.position = { score: 0, pass: false, note: "无 PE 数据" };
  }

  // 维度 2: 排雷（粗略：极端高 PE / 港股科技偶发雷）
  const redFlags: string[] = [];
  if (facts.pe_ttm && facts.pe_ttm > 100) redFlags.push("PE > 100（极端高）");
  if (facts.ticker.market === 'HK' && facts.dividend_yield_pct !== undefined && facts.dividend_yield_pct < 0.5) {
    // 港股低股息且 PE 不低，潜在风险
    if (facts.pe_ttm && facts.pe_ttm > 30) redFlags.push("港股低股息高 PE 类（管哥不放心）");
  }
  dims.landmine = {
    score: redFlags.length === 0 ? 4 : 1,
    pass: redFlags.length === 0,
    note: redFlags.length ? "触发: " + redFlags.join(", ") : "无明显排雷触发（需要 financials 深查）",
  };

  // 维度 3: 股息（管哥要求 5%+）
  if (facts.dividend_yield_pct !== undefined) {
    const dy = facts.dividend_yield_pct;
    dims.dividend = {
      score: dy >= 5 ? 5 : dy >= 3 ? 3 : dy >= 1 ? 2 : 0,
      pass: dy >= 1,
      note: `股息率 ${dy.toFixed(2)}% ${dy >= 5 ? "(打底过关)" : dy < 1 ? "(几乎无股息，下行没保护)" : "(中等)"}`,
    };
  } else {
    dims.dividend = { score: 0, pass: false, note: "无股息数据" };
  }

  // 维度 4: 商业稳态（用 PB 粗判 - 低 PB 通常意味着重资产/银行，管哥喜欢）
  if (facts.pb_mrq) {
    const pb = facts.pb_mrq;
    dims.stability = {
      score: pb < 1 ? 5 : pb < 2 ? 4 : pb < 5 ? 3 : 1,
      pass: pb < 10,
      note: `PB ${pb.toFixed(2)} ${pb < 1 ? "(深度低估，破净)" : pb < 2 ? "(便宜稳健)" : "(中等以上)"}`,
    };
  } else {
    dims.stability = { score: 3, pass: true, note: "无 PB 数据" };
  }

  // 维度 5: 荒岛测试（在管哥已持仓池里 → 高分；否则中性）
  const inPortfolio = GUAN_PORTFOLIO.some(k => fullText.includes(k));
  dims.island = {
    score: inPortfolio ? 5 : 3,
    pass: true,
    note: inPortfolio ? "在管哥过去重点关注/持仓池" : "未明确表态，看下行能否睡得着",
  };

  const avg = (dims.position.score + dims.landmine.score + dims.dividend.score + dims.stability.score + dims.island.score) / 5;
  const signal = dims.position.score === 0 && facts.pe_pct_5y && facts.pe_pct_5y > 80
    ? "bearish"
    : avg >= 3.5 ? "bullish" : avg >= 2.5 ? "neutral" : "bearish";
  return { sage: "guan-wo-cai", dims, signal, confidence: Math.round(avg * 20) };
}

// ============ 4. LLM Voice Narrator (极短 prompt + few-shot) ============

function buildVoicePrompt(sage_id: 'duan-yongping' | 'guan-wo-cai', userMsg: string, facts: StockFacts | null, verdict: SageVerdict | null): { system: string; user: string } {
  const isDuan = sage_id === "duan-yongping";
  const samples = isDuan ? DUAN_YONGPING_SAMPLES : GUAN_WO_CAI_SAMPLES;
  const voice = formatVoiceSamples(samples, 8);
  const meta = SAGE_BY_ID[sage_id];

  const system = `你是${isDuan ? "段永平" : "管我财"}。${meta?.title || ""}

# 你的真实雪球短回复（必须模仿这种长度、密度、口吻）

${voice}

# 输出硬约束

1. **80-200 字**。超过 250 字算失败。
2. **不分段或最多 2 段**。禁用 "第一/第二/Step/##/表格/emoji 列表"
3. **首句优先反问或场景**（看上面 12 个样本，60% 是反问/场景开头）
4. **判定一句话给完**。${isDuan ? "段永平：'right business, right people, right price' 三个并列说完就完" : "管哥：'5% 股息打底 + 5% 增长' 或 'PE X 分位 → 进/不进' 一句完"}
5. **情绪化标点**："！"、"哈"、"！？" — 别像研报
6. **如果用户问的是能力圈外**（${isDuan ? "周期/医药/光伏" : "成长股/无股息高 PE"}）→ 一句话承认不懂或不是自己角度，把球踢回

# 如何使用下面的 analysis JSON

那是 Python 已经算好的事实和粗判，**你只参考事实，不照抄分数和理由**。用 sage 口吻把这些事实说人话即可。**绝对不要写"维度1能力圈：5 分"这种**。`;

  const user = facts && verdict ? `用户问：${userMsg}

# Analysis JSON（事实参考，不要照搬措辞）

\`\`\`json
${JSON.stringify({
    ticker: facts.ticker,
    facts: {
      price: facts.price,
      pe_ttm: facts.pe_ttm,
      pb_mrq: facts.pb_mrq,
      dividend_yield_pct: facts.dividend_yield_pct,
      pe_pct_5y: facts.pe_pct_5y,
      change_today_pct: facts.change_today_pct,
    },
    verdict: verdict.signal,
    confidence: verdict.confidence,
    dim_notes: Object.fromEntries(Object.entries(verdict.dims).map(([k, v]) => [k, v.note])),
  }, null, 2)}
\`\`\`

用${isDuan ? "段永平" : "管哥"}的口吻写 80-200 字回答。` : `用户问：${userMsg}

（用户问的不是单只股票，或股票无法识别，凭你的角色知识自由回答 80-200 字。）`;

  return { system, user };
}

// ============ 5. POST handler ============

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { sage_id, message } = body;

  if (sage_id !== 'duan-yongping' && sage_id !== 'guan-wo-cai') {
    return new Response("v60.8 POC 当前仅支持 duan-yongping / guan-wo-cai", { status: 400 });
  }
  const userMsg = String(message || "").trim();
  if (!userMsg) return new Response("Empty message", { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: any) => controller.enqueue(enc.encode(sse(event, data)));

      try {
        // Phase 1: 提取 + 取数 + 评分
        send("phase", { name: "analyzing", message: "Python-端量化分析中..." });
        const stock = extractStock(userMsg);
        let facts: StockFacts | null = null;
        let verdict: SageVerdict | null = null;

        if (stock) {
          facts = await gatherFacts(stock);
          send("facts", { ticker: stock, facts });
          verdict = sage_id === 'duan-yongping' ? scoreDuan(facts, userMsg) : scoreGuan(facts, userMsg);
          send("verdict", verdict);
        } else {
          send("facts", { ticker: null, note: "无识别股票，进入概念问答" });
        }

        // Phase 2: LLM voice narrator
        send("phase", { name: "writing", message: `${sage_id === 'duan-yongping' ? '段永平' : '管哥'}写答案中...` });
        const { system, user } = buildVoicePrompt(sage_id, userMsg, facts, verdict);

        const llmRes = await fetch(`${LLM_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: LLM_FAST_MODEL,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: 600,  // ~200 字最多，留 buffer
            temperature: 0.85,
            stream: true,
          }),
        });

        if (!llmRes.ok || !llmRes.body) {
          send("error", { message: `LLM ${llmRes.status}` });
          controller.close();
          return;
        }

        let fullReply = "";
        const reader = llmRes.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
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
              if (delta) {
                fullReply += delta;
                // 80 字符切段，避免 DeepSeek 大块返回
                if (delta.length > 80) {
                  for (let i = 0; i < delta.length; i += 80) {
                    send("chunk", { delta: delta.slice(i, i + 80) });
                  }
                } else {
                  send("chunk", { delta });
                }
              }
            } catch {}
          }
        }

        send("done", { fullReply, chars: fullReply.length });
        controller.close();
      } catch (e: any) {
        send("error", { message: e?.message || String(e) });
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

export async function GET() {
  return Response.json({
    service: "sage-chat v60.8 · two-phase agent (Python analyzer + LLM narrator)",
    inspiration: "https://github.com/virattt/ai-hedge-fund",
    architecture: {
      phase1: "extract stock → fetch facts (quote/PE/PB/股息/分位) → 5-dim deterministic score",
      phase2: "LLM call with SHORT prompt + 12 voice few-shots + facts JSON → 80-200 字 voice",
    },
    supported_sages: ["duan-yongping", "guan-wo-cai"],
    endpoint: "POST /api/chat/v2/stream",
    payload: { sage_id: "string", message: "string" },
  });
}
