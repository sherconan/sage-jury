// POST /api/chat/v2/stream — v60.9 三阶段架构 + SKILL.md 注入
//
// 调研标杆: virattt/ai-hedge-fund · GuruAgents (arxiv 2510.01664) · will2025btc/buffett-perspective
// v60.9 关键改动：
//   1. Phase 3 system prompt 主体改为 sage SKILL.md（保留身份卡 / 5问框架 / 12 voice sample / 收尾铁律 / self-check）
//   2. inline 只保留运行时强化（数据纪律 + 输出硬约束 + cross-sage 禁用）
//   3. Phase 2 scoring 改 sage-specific 加权（段永平重 stop_doing+circle，管哥重 landmine+dividend）
//   4. 输出 verdict 包含 top_concerns（用于 Phase 3 LLM 重点强调）
//
// Phase 1 (Python orchestrator):
//   - extract ticker (A/HK/US) from user msg
//   - 并行 fetch: 行情 + PE 分位 + 财务 + 派息 → typed StockFactsTyped
//   - 检索 sage 雪球 corpus top 3-5 条相关历史发言
//
// Phase 2 (Sage-specific weighted scoring):
//   - 段永平: circle 25% + business 20% + team 15% + price 25% + stop_doing 15%
//   - 管哥: position 25% + landmine 30% + dividend 20% + stability 15% + island 10%
//   - 输出: signal / confidence / top_concerns[]
//
// Phase 3 (LLM voice generation):
//   - system = SKILL.md + 数据纪律 + 输出硬约束
//   - user = facts JSON + verdict + history block + 用户问
//   - 不调任何工具

import { NextRequest } from "next/server";
import { resolveTicker, gatherFacts, type StockFactsTyped, type Ticker } from "@/lib/sage/stock_tools";
import { searchSagePosts, formatHistoricalPosts, type RelevantQuote } from "@/lib/sage/corpus_search";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ============ SKILL.md loader (edge fetch + 内存 cache) ============
const skillCache = new Map<string, string>();
async function loadSageSkill(slug: string, req: { url: string }): Promise<string> {
  if (skillCache.has(slug)) return skillCache.get(slug)!;
  try {
    const u = new URL(`/sages/${slug}/SKILL.md`, req.url);
    const r = await fetch(u.toString(), { cache: "force-cache" });
    if (!r.ok) return "";
    const md = await r.text();
    skillCache.set(slug, md);
    return md;
  } catch { return ""; }
}

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "";
const LLM_FAST_MODEL = process.env.SAGE_LLM_FAST_MODEL || "deepseek-chat";

function sse(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ============ 股票识别 (整句 + 子串降级) ============
function extractStock(userMsg: string): Ticker | null {
  // 直接 resolveTicker 试一遍（含中文 / 美股代码 / 数字代码）
  const direct = resolveTicker(userMsg);
  if (direct) return direct;
  // 句子拆 token 再试
  const segs = userMsg.split(/[\s,，。！？!?、:：；;\(\)（）"'""'']+/).filter(Boolean);
  for (const s of segs) {
    const t = resolveTicker(s);
    if (t) return t;
  }
  // 句子前缀子串（"苹果还能拿吗" → "苹果"）
  for (const s of segs) {
    for (const sub of [s.slice(0, 4), s.slice(0, 3), s.slice(0, 2)]) {
      if (sub.length >= 2) {
        const t = resolveTicker(sub);
        if (t) return t;
      }
    }
  }
  return null;
}

// ============ Phase 2: Sage-specific Weighted Scoring (v60.9) ============
// 灵感: GuruAgents 论文 §2.1.3 Deterministic Reasoning Pipeline + investor-specific weighting schemes
interface DimScore { score: number; weight: number; pass: boolean; note: string; }
interface SageVerdict {
  sage: 'duan-yongping' | 'guan-wo-cai';
  dims: Record<string, DimScore>;
  signal: 'bullish' | 'bearish' | 'neutral' | 'out_of_circle' | 'too_hard';
  confidence: number;          // 0-100, sage-weighted
  top_concerns: string[];      // Phase 3 LLM 必须重点提及的 1-3 条
}

const DUAN_CIRCLE = ["茅台","五粮液","苹果","AAPL","网易","NTES","腾讯","00700","拼多多","PDD","泡泡玛特","09992","Costco","可口可乐","美的","格力","海天","伯克希尔","BRK"];
const DUAN_OUT = ["生物医药","光伏","新能源车","搜索","百度","BIDU","煤炭","钢铁","周期","隆基","创新药","生物科技","半导体","锂电"];
const GUAN_PORTFOLIO = ["招行","招商银行","工行","工商银行","建行","中行","腾讯","00700","江南布衣","03306","物管","首都机场","00694","北京控股"];

// 段永平加权：能力圈 + stop doing 是 mantra，权重最高
const DUAN_WEIGHTS = { circle: 0.25, business: 0.20, team: 0.15, price: 0.25, stop_doing: 0.15 };
// 管哥加权：排雷是 mantra（"一颗雷炸 5 只好股"），股息打底是底线
const GUAN_WEIGHTS = { position: 0.25, landmine: 0.30, dividend: 0.20, stability: 0.15, island: 0.10 };

function scoreDuan(facts: StockFactsTyped | null, userMsg: string): SageVerdict {
  const dims: Record<string, DimScore> = {};
  const concerns: string[] = [];
  const fullText = userMsg + " " + (facts?.ticker.name || "") + " " + (facts?.ticker.code || "");
  const inCircle = DUAN_CIRCLE.some(k => fullText.includes(k));
  const outCircle = DUAN_OUT.some(k => fullText.includes(k));

  // 1. 能力圈（25%）
  dims.circle = { score: outCircle?0:inCircle?5:3, weight: DUAN_WEIGHTS.circle, pass: !outCircle,
    note: outCircle?"明显能力圈外（周期/医药/光伏）→ 太难篮子": inCircle?"在已表态过的能力圈": "未明确表态，需谨慎" };
  if (outCircle) concerns.push("能力圈外（看不懂就别买）");

  // 2. 商业模式 right business（20%）
  if (facts?.pe_ttm && facts.pe_ttm > 0) {
    const pe = facts.pe_ttm;
    dims.business = { score: pe<8||pe>80?2:pe<15||pe>50?3:4, weight: DUAN_WEIGHTS.business, pass: pe<80,
      note: `PE-TTM ${pe.toFixed(1)} ${pe<15?"(便宜但生意可能一般)":pe>50?"(贵但反映成长)":"(中性)"}` };
  } else { dims.business = { score: 0, weight: DUAN_WEIGHTS.business, pass: false, note: "无 PE 数据" }; }

  // 3. 团队 right people（15%）
  if (facts?.roe_pct !== undefined) {
    const roe = facts.roe_pct;
    dims.team = { score: roe>15?5:roe>10?3:1, weight: DUAN_WEIGHTS.team, pass: roe>5,
      note: `ROE ${roe.toFixed(1)}% ${roe>15?"(段永平喜欢长期 ROE>15%)":roe<5?"(差，效率低)":"(中性)"}` };
  } else { dims.team = { score: 3, weight: DUAN_WEIGHTS.team, pass: true, note: "无 ROE 数据" }; }

  // 4. 价格 right price（25%）— EY vs 国债 4%
  if (facts?.pe_ttm && facts.pe_ttm > 0) {
    const ey = 100/facts.pe_ttm;
    dims.price = { score: ey>8?5:ey>5?4:ey>3?2:1, weight: DUAN_WEIGHTS.price, pass: ey>3,
      note: `Earnings Yield ${ey.toFixed(1)}% vs 国债 ~4%` };
    if (ey < 3) concerns.push(`EY ${ey.toFixed(1)}% < 国债，价格不吸引`);
  } else { dims.price = { score: 0, weight: DUAN_WEIGHTS.price, pass: false, note: "无 PE" }; }

  // 5. stop doing list（15%）
  const red: string[] = [];
  if (outCircle) red.push("能力圈外");
  if (facts?.pe_ttm && facts.pe_ttm > 80) red.push("PE > 80 讲故事嫌疑");
  if (facts?.net_income_billion !== undefined && facts.net_income_billion < 0) red.push("净利亏损");
  dims.stop_doing = { score: red.length===0?5:red.length===1?2:0, weight: DUAN_WEIGHTS.stop_doing, pass: red.length===0,
    note: red.length?"触发: "+red.join(", "):"无明显 stop doing" };
  red.forEach(r => concerns.push(`stop_doing: ${r}`));

  // 加权汇总
  const weighted = Object.values(dims).reduce((s, d) => s + d.score * d.weight, 0);
  const conf = Math.round(weighted * 20);  // 0-5 → 0-100
  let signal: SageVerdict['signal'];
  if (outCircle) signal = "too_hard";
  else if (weighted >= 3.8) signal = "bullish";
  else if (weighted >= 2.8) signal = "neutral";
  else signal = "bearish";

  return { sage: "duan-yongping", dims, signal, confidence: conf, top_concerns: concerns.slice(0, 3) };
}

function scoreGuan(facts: StockFactsTyped | null, userMsg: string): SageVerdict {
  const dims: Record<string, DimScore> = {};
  const concerns: string[] = [];
  const fullText = userMsg + " " + (facts?.ticker.name || "") + " " + (facts?.ticker.code || "");

  // 1. 价位（25%）
  if (facts?.pe_pct_5y !== undefined) {
    const p = facts.pe_pct_5y;
    dims.position = { score: p>80?0:p>60?2:p>30?4:5, weight: GUAN_WEIGHTS.position, pass: p<80,
      note: `PE 5 年分位 ${p.toFixed(0)}% ${p<30?"(低估区)":p>80?"(高估，立刻没兴趣)":"(中性)"}` };
    if (p > 80) concerns.push(`PE 分位 ${p.toFixed(0)}% > 80%（贵就是贵，再好都不动）`);
  } else if (facts?.pe_ttm) {
    dims.position = { score: 3, weight: GUAN_WEIGHTS.position, pass: true, note: `PE ${facts.pe_ttm.toFixed(1)} (无分位)` };
  } else { dims.position = { score: 0, weight: GUAN_WEIGHTS.position, pass: false, note: "无 PE" }; }

  // 2. 排雷（30%，权重最高 — 排雷胜选股）
  const red: string[] = [];
  if (facts?.pe_ttm && facts.pe_ttm > 100) red.push("PE > 100 极端");
  if (facts?.ticker.market === 'HK' && (facts?.dividend_yield_pct ?? 0) < 0.5 && (facts?.pe_ttm ?? 0) > 25)
    red.push("港股低股息高 PE");
  if (facts?.net_income_billion !== undefined && facts.net_income_billion < 0) red.push("净利亏损");
  if (facts?.roe_pct !== undefined && facts.roe_pct < 0) red.push("ROE 负值");
  dims.landmine = { score: red.length===0?5:red.length===1?2:0, weight: GUAN_WEIGHTS.landmine, pass: red.length===0,
    note: red.length?"触发: "+red.join(", "):"无明显排雷" };
  red.forEach(r => concerns.push(`排雷: ${r}`));

  // 3. 股息打底（20%）
  if (facts?.dividend_yield_pct !== undefined) {
    const dy = facts.dividend_yield_pct;
    dims.dividend = { score: dy>=5?5:dy>=3?3:dy>=1?2:0, weight: GUAN_WEIGHTS.dividend, pass: dy>=1,
      note: `股息率 ${dy.toFixed(2)}% ${dy>=5?"(5% 打底过关)":dy<1?"(几乎无股息→下行没保护)":"(中等)"}` };
    if (dy < 1) concerns.push(`股息 ${dy.toFixed(2)}% < 1%（下行没保护）`);
  } else { dims.dividend = { score: 0, weight: GUAN_WEIGHTS.dividend, pass: false, note: "无股息数据" }; }

  // 4. 商业稳态（15%）
  if (facts?.roe_pct !== undefined) {
    const roe = facts.roe_pct;
    dims.stability = { score: roe>15?5:roe>10?4:roe>5?3:1, weight: GUAN_WEIGHTS.stability, pass: roe>5,
      note: `ROE ${roe.toFixed(1)}% ${roe>10?"(稳态可)":roe<5?"(差)":"(中等)"}` };
  } else if (facts?.pb_mrq) {
    const pb = facts.pb_mrq;
    dims.stability = { score: pb<1?5:pb<2?4:pb<5?3:1, weight: GUAN_WEIGHTS.stability, pass: pb<10,
      note: `PB ${pb.toFixed(2)} ${pb<1?"(破净低估)":pb<2?"(便宜稳健)":"(中等以上)"}` };
  } else { dims.stability = { score: 3, weight: GUAN_WEIGHTS.stability, pass: true, note: "无 PB/ROE" }; }

  // 5. 荒岛（10%）
  const inPort = GUAN_PORTFOLIO.some(k => fullText.includes(k));
  dims.island = { score: inPort?5:3, weight: GUAN_WEIGHTS.island, pass: true,
    note: inPort?"在管哥过去重点关注/持仓池":"未明确表态" };

  // 加权汇总
  const weighted = Object.values(dims).reduce((s, d) => s + d.score * d.weight, 0);
  const conf = Math.round(weighted * 20);
  let signal: SageVerdict['signal'];
  if (dims.landmine.score === 0) signal = "bearish";  // 排雷一票否决
  else if (dims.position.score === 0 && facts?.pe_pct_5y && facts.pe_pct_5y > 80) signal = "bearish";
  else if (weighted >= 3.8) signal = "bullish";
  else if (weighted >= 2.8) signal = "neutral";
  else signal = "bearish";

  return { sage: "guan-wo-cai", dims, signal, confidence: conf, top_concerns: concerns.slice(0, 3) };
}

// ============ Phase 3: LLM Voice Prompt — v60.9 SKILL.md 注入 ============
// v60.9 关键变更:
//   - system 主体 = SKILL.md（含身份卡 / 5问框架 / 12 voice sample / 收尾铁律 / self-check）
//   - inline 只保留运行时强化（数据纪律 + 输出硬约束 + verdict top_concerns）
//   - SKILL.md 加载失败时 fallback 到极简骨架（不让服务挂）
function buildVoicePrompt(
  sage_id: 'duan-yongping' | 'guan-wo-cai',
  userMsg: string,
  facts: StockFactsTyped | null,
  verdict: SageVerdict | null,
  historicalPosts: RelevantQuote[],
  skillMd: string
): { system: string; user: string } {
  const isDuan = sage_id === "duan-yongping";
  const sageName = isDuan ? "段永平" : "管我财";

  // SKILL.md 加载失败时的极简 fallback
  const fallbackPersona = isDuan
    ? `你是段永平。1961 年江西生，2002 年起重仓苹果，雪球 ID @大道无形我有型。\n核心：right business / right people / right price，stop doing list。`
    : `你是管我财。香港价值投资者。雪球 ID @管我财。\n核心：低估逆向平均赢，排雷胜选股，5% 股息打底 + 5% 增长。`;
  const personaBody = (skillMd && skillMd.length > 100) ? skillMd : fallbackPersona;

  const verdictBlock = verdict ? `

# 🎯 Phase 2 已算好的 verdict（你必须围绕这个写，不要自己重新判断）
- signal: **${verdict.signal}**（confidence ${verdict.confidence}/100）
- 各维度（已加权）:
${Object.entries(verdict.dims).map(([k, v]) =>
  `  - ${k} (权重 ${(v.weight*100).toFixed(0)}%, 得分 ${v.score}/5): ${v.note}`).join('\n')}
${verdict.top_concerns.length ? `- 🚨 top_concerns（必须在回答里点出来）:\n${verdict.top_concerns.map(c => '  - '+c).join('\n')}` : ''}
` : '';

  const system = `${personaBody}

═══════════════════════════════════════════════════
# 🔧 运行时强化（覆盖 SKILL.md 内任何冲突项）
═══════════════════════════════════════════════════

## 数据纪律
- **Analysis JSON** 是 Python 端今天刚拿到的真数字 — PE / PB / 股息 / 营收 / ROE
  必须把这些数字**算进答案里**做对比推理（EY vs 国债、股息够不够 5%、PE 分位高低）
- 数据为 null/undefined：明说"今天 X 没拿到"，**严禁瞎编**（曾经编过"40 倍 PB"——绝不再犯）
- **历史发言**仅供学语气（短/反问/"哈"/"！"/口头禅），**不要照抄具体观点和股价**

## 输出硬约束
- **80-300 字**，超 350 字算失败
- 不分段或最多 2 段，禁 "第一/第二/Step/##/表格/emoji 列表"
- **首句优先反问或场景**（不要"X 公司怎么样..."研报开头）
- **必须算账**：拿到 PE → 算 EY vs 国债；拿到股息 → 比 5%；拿到 PB → 看破净
- **判定一句话给完**${isDuan ? "（right business / right people / right price 三个并列说完）" : "（PE 分位 + 股息率 → 进/不进 一句完）"}

## 能力圈 / 太难篮子（重要！）
- 用户问的是${isDuan ? "周期/医药/光伏/银行/小盘" : "成长股/无股息高 PE/讲故事的"}
  → 直接承认 "${isDuan ? '我看不懂，放进太难篮子' : '不是我的角度，问段永平更对路'}"，**不要硬答**
- verdict.signal=${isDuan ? '"too_hard"' : '"bearish"'} 时，主答必须是承认 + 简短解释为什么不碰

## 跨角色禁用（写出立刻失败）
${isDuan ? `- 禁说: 茶餐厅 / 在香港 / 放长线钓大鱼 / 5% 股息打底 / 看分位不看 K 线 / 排雷胜选股 / 招行长持 / 江南布衣 / 首都机场 / 物管` : `- 禁说: 圆石滩 / 加州后院 / 打高尔夫 / I'll be back / 本分 / stop doing list / 看十年 / 千万别用 Margin / 苹果拿了 20 年 / 网易 100 倍 / 拒绝百度 / 神华换泡泡玛特`}
${isDuan ? '' : '- 必须简体普通话：粤字 / 繁体字一个不要（嘅咗喺啲冇咁唔睇識靚呢佢 → 全部改为简体普通话）'}
${verdictBlock}`;

  const factsBlock = facts ? `
# Analysis JSON (真实数据，禁瞎编)
\`\`\`json
${JSON.stringify({
    ticker: facts.ticker,
    price: facts.price,
    pe_ttm: facts.pe_ttm,
    pb_mrq: facts.pb_mrq,
    dividend_yield_pct: facts.dividend_yield_pct,
    pe_pct_5y: facts.pe_pct_5y,
    revenue_billion: facts.revenue_billion,
    net_income_billion: facts.net_income_billion,
    roe_pct: facts.roe_pct,
    gross_margin_pct: facts.gross_margin_pct,
    market_cap_billion: facts.market_cap_billion,
    data_source: facts.source,
    data_errors: facts.errors,
  }, null, 2)}
\`\`\`

# 5 维 verdict (Python 粗判)
- signal: ${verdict?.signal} (confidence ${verdict?.confidence})
${Object.entries(verdict?.dims || {}).map(([k, v]) => `- ${k}: ${v.note}`).join('\n')}
` : `\n# 无识别到具体股票，凭你的角色知识 + 历史发言回答`;

  const historyBlock = historicalPosts.length > 0 ? `
# 你过去在雪球的发言（⚠️ 仅供学习你的语气和用词习惯，**禁止照抄具体观点 / 股价 / 时间点**）
${formatHistoricalPosts(historicalPosts, 200)}

记住：上面是历史切片，**用户问的是今天**。学他们的语气写法（短/反问/"哈"/"！"/I'll be back），但具体判断必须用上面 Analysis JSON 的今天数据现场推理。
` : `\n# 无相关历史发言（用今天数据 + 分析框架推理即可）`;

  const user = `用户问：${userMsg}
${factsBlock}
${historyBlock}

用${isDuan ? "段永平" : "管哥"}口吻写 80-200 字回答。`;

  return { system, user };
}

// ============ POST handler ============
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { sage_id, message } = body;

  if (sage_id !== 'duan-yongping' && sage_id !== 'guan-wo-cai') {
    return new Response("v60.8 当前仅支持 duan-yongping / guan-wo-cai", { status: 400 });
  }
  const userMsg = String(message || "").trim();
  if (!userMsg) return new Response("Empty message", { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: any) => controller.enqueue(enc.encode(sse(event, data)));

      try {
        send("phase", { name: "analyzing", message: "Python 端分析中..." });

        const stock = extractStock(userMsg);

        // 并行：取数 + 检索历史
        const [factsResult, historyResult] = await Promise.all([
          stock ? gatherFacts(stock).catch(() => null) : Promise.resolve(null),
          searchSagePosts(sage_id, userMsg, stock?.name || null, req, 4).catch(() => [] as RelevantQuote[]),
        ]);

        const facts: StockFactsTyped | null = factsResult;
        const history: RelevantQuote[] = historyResult || [];

        if (facts) send("facts", { ticker: stock, facts });
        else send("facts", { ticker: null, note: "无识别股票" });
        if (history.length) {
          send("history", { count: history.length, posts: history });
          // v60.8.4: 兼容 v1 frontend — 把 history 也作为 quotes 事件 emit，让 quote 卡能显示
          send("quotes", history.map((p, i) => ({
            date: p.date, text: p.text, likes: p.likes, url: p.url,
            _rel_score: Math.round(p.score), _rec_mul: 1, _final_score: Math.round(p.score),
          })));
        }

        const verdict: SageVerdict = sage_id === 'duan-yongping' ? scoreDuan(facts, userMsg) : scoreGuan(facts, userMsg);
        send("verdict", verdict);

        // v60.8.4: 兼容 v1 frontend — emit synthetic tool_call/result 让"用了 X 工具"显示
        if (facts) {
          const toolId = `v608-fetch-${Date.now()}`;
          send("tool_call", { name: "get_realtime_quote", args: { stock: stock?.name }, id: toolId });
          send("tool_result", {
            name: "get_realtime_quote", id: toolId,
            result: `${stock?.name}(${stock?.code}) 现价 ${facts.price?.toFixed?.(2) || '?'} | PE ${facts.pe_ttm || '?'} | PB ${facts.pb_mrq?.toFixed?.(2) || '?'} | 股息率 ${facts.dividend_yield_pct?.toFixed?.(2) || '?'}% | ROE ${facts.roe_pct?.toFixed?.(1) || '?'}% | 营收 ${facts.revenue_billion?.toFixed?.(0) || '?'}亿 | 数据源 ${facts.source.join(',')}`,
          });
        }
        // v60.8.4: 兼容 — emit phase writer 让 UI 关闭"内心分析中"loader
        send("phase", { name: "writer", message: `${sage_id === 'duan-yongping' ? '段永平' : '管哥'}写答案...` });
        // v60.9: 加载 SKILL.md 作为 system prompt 主体
        const skillMd = await loadSageSkill(sage_id, req);
        const { system, user } = buildVoicePrompt(sage_id, userMsg, facts, verdict, history, skillMd);

        const llmRes = await fetch(`${LLM_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: LLM_FAST_MODEL,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: 600,
            temperature: 0.85,
            stream: true,
          }),
        });

        if (!llmRes.ok || !llmRes.body) {
          send("error", { message: `LLM ${llmRes.status}` });
          controller.close();
          return;
        }

        // v60.8.6: 角色违禁词（写完后 post-process strip 句子）
        const FORBIDDEN_FOR_GUAN = [
          /[^。！？\n]*(圆石滩|打高尔夫|加州后院|Westfield)[^。！？]*[。！？\n]?/g,
          /[^。！？\n]*(I'll be back|I'll pass|本分。|看十年)[^。！？]*[。！？\n]?/g,
          /[^。！？\n]*(苹果拿了20年|网易100倍|拒绝百度|神华换泡泡玛特|stop doing list)[^。！？]*[。！？\n]?/g,
          /[^。！？\n]*(千万别用Margin|千万别用 Margin)[^。！？]*[。！？\n]?/g,
        ];
        const FORBIDDEN_FOR_DUAN = [
          /[^。！？\n]*(茶餐厅|放长线钓大鱼|看分位不看K线|排雷胜选股)[^。！？]*[。！？\n]?/g,
          /[^。！？\n]*(招行长持|江南布衣|首都机场清仓|物管行业)[^。！？]*[。！？\n]?/g,
          /[^。！？\n]*(5%股息打底|5% 股息打底|荒岛.{0,2}组合)[^。！？]*[。！？\n]?/g,
        ];
        // v60.8.7: 管哥粤字归一（简体普通话）
        const HK_TO_M: Array<[string, string]> = [
          ["點解", "为什么"], ["嘅", "的"], ["咗", "了"], ["喺", "在"], ["啲", "些"],
          ["冇", "没"], ["畀", "给"], ["俾", "给"], ["咁", "这么"], ["咩", "什么"],
          ["邊", "哪"], ["唔", "不"], ["睇", "看"], ["識", "会"], ["靚", "好"],
          ["呢條", "这条"], ["呢個", "这个"], ["呢", "这"], ["啖", "口"], ["佢", "他"],
          ["收竿唔玩", "收竿不玩"], ["唔玩", "不玩"], ["過", "过"], ["據", "据"],
        ];
        const normalizeHK = (text: string): string => {
          let r = text;
          for (const [h, m] of HK_TO_M) r = r.split(h).join(m);
          return r;
        };

        const stripCrossSage = (text: string): string => {
          const patterns = sage_id === 'guan-wo-cai' ? FORBIDDEN_FOR_GUAN : FORBIDDEN_FOR_DUAN;
          let cleaned = text;
          for (const p of patterns) cleaned = cleaned.replace(p, '');
          // 管哥额外做粤字归一
          if (sage_id === 'guan-wo-cai') cleaned = normalizeHK(cleaned);
          return cleaned;
        };

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
                if (delta.length > 80) {
                  for (let i = 0; i < delta.length; i += 80) send("chunk", { delta: delta.slice(i, i + 80) });
                } else send("chunk", { delta });
              }
            } catch {}
          }
        }

        // v60.8.6: post-process strip 角色违禁词；如有删改，重 emit fullReply 替代流式输出
        const cleaned = stripCrossSage(fullReply);
        const stripped_chars = fullReply.length - cleaned.length;
        if (stripped_chars > 0) {
          send("strip_warning", { stripped_chars, original_length: fullReply.length });
        }
        send("done", {
          fullReply: cleaned,
          chars: cleaned.length,
          history_used: history.length,
          data_errors: facts?.errors || [],
          stripped_chars,
        });
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
    service: "sage-chat v60.9 · 三阶段架构 + SKILL.md 注入 + sage-specific 加权",
    inspiration: [
      "https://github.com/virattt/ai-hedge-fund (warren_buffett.py 极简 prompt)",
      "https://arxiv.org/abs/2510.01664 (GuruAgents deterministic pipeline)",
      "https://github.com/will2025btc/buffett-perspective (SKILL.md 蒸馏标杆)",
    ],
    architecture: {
      phase1_orchestrator: "extract ticker (A/HK/US) → 并行 fetch facts (eastmoney/sina/stooq/bocha) → BM25 search sage corpus",
      phase2_scoring: "sage-specific weighted scoring (Duan: circle/business/team/price/stop_doing; Guan: position/landmine/dividend/stability/island)",
      phase3_narrator: "system = SKILL.md + runtime guards; user = facts JSON + verdict + history → 80-300 字 voice",
    },
    supported_sages: ["duan-yongping", "guan-wo-cai"],
    v609_changes: [
      "Layer 1: v2 endpoint 加载 SKILL.md 作为 system 主体（之前 inline 重写质量更差）",
      "Layer 3: scoring 改 sage-specific 加权（段永平 stop_doing+circle，管哥 landmine+dividend）",
      "新增 verdict.top_concerns[] 让 LLM 有重点强调对象",
      "signal 新增 too_hard 类（段永平能力圈外明确出口）",
    ],
  });
}
