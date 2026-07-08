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
// v62: A股+段永平 走「研究层+分析层」新 pipeline（10 年真实财务数据）
import { buildDossier, type ResearchDossier } from "@/lib/sage/v62/research";
import { analyzeDuan, formatAnalysis } from "@/lib/sage/v62/analysis";
import { analyzeGuan, formatAnalysisGuan } from "@/lib/sage/v62/analysis-guan";
// v63: 通用分析 + registry persona —— 让 10 位大佬都能产出同规格判决，不必每人手写模块
import { analyzeGeneric, buildSagePersona } from "@/lib/sage/v62/analysis-generic";
import { SAGE_BY_ID_ALL, type Sage } from "@/data/sages";

// v63 上线 roster：10 位大佬。段永平/管哥走各自手写 pipeline，其余 8 位走 generic。
const LIVE_SAGES = [
  "duan-yongping", "guan-wo-cai", "feng-liu", "dan-bin", "lao-tang",
  "lin-yuan", "zhang-kun", "qiu-guolu", "buffett", "li-lu",
] as const;
const BESPOKE = new Set(["duan-yongping", "guan-wo-cai"]);

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

// 2026-05-25: Bocha LLM 端点修正 — api.bochaai.com 是搜索域，api.bocha.cn 才是模型域。
// 如果 SAGE_LLM_KEY 未设但 BOCHA_API_KEY 已设，自动 fallback 用 BOCHA key（生产 env 旧 deepseek key 已过期）。
const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.bocha.cn/v1";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || process.env.BOCHA_API_KEY || "";
const LLM_FAST_MODEL = process.env.SAGE_LLM_FAST_MODEL || "deepseek-v4-pro";

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
  sage_id: string,
  sageName: string,
  userMsg: string,
  facts: StockFactsTyped | null,
  verdict: SageVerdict | null,
  historicalPosts: RelevantQuote[],
  personaBody: string,
  v62AnalysisText?: string | null
): { system: string; user: string } {
  const isDuan = sage_id === "duan-yongping";
  const isBespoke = BESPOKE.has(sage_id);
  const voiceName = isDuan ? "段永平" : sage_id === "guan-wo-cai" ? "管哥" : sageName;

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

## 输出形态 —— 这是一次「投资分析」，不是一句点评（v61 核心）

用${voiceName}的投资逻辑，对用户问的事做一次**完整分析**。形态固定：

【输出结构】整篇用「〔小标题〕」分层（〔〕全角方括号；**禁止** # 标题、禁止"第一/第二/Step"、禁止表格、禁止 emoji 列表）。**第一层必须是〔结论〕，整篇第一个字就是〔**。每层 2-4 句话，是${voiceName}本人在讲，自然过渡：
- 〔结论〕**开门见山**——买 / 不碰 / 观望 / 看不懂，一句话说死，再补一句话核心理由。让用户第一眼就看到判断，**绝不许把结论藏到最后**
- 〔先看这是什么〕这门生意怎么赚钱？用户为什么觉得它"猛"/值得问？点破表象
- 〔生意本质〕${isDuan ? '商业模式简单吗？有没有定价权？赚的钱要不要不停投回去买设备？护城河靠什么撑？10 年后还在吗？' : '行业地位、护城河、定价权、现金流稳不稳、有没有"鬼故事"/雷点、10 年后格局清不清楚'}
- 〔现在的价〕用今天的真实数据算账：PE→EY 多少 vs 国债 ~4%、股息率够不够、PB 破净没 —— **必须有数字**
- 〔能力圈与周期〕这在${voiceName}能力圈内吗？周期处在什么位置？最大的坑/最该担心的是什么
- 〔仓位与边界〕给仓位建议 + 一句"什么情况下我会改变看法" —— 不要重复〔结论〕里已说过的话

【长度】600-1000 字。是分析就要展开，不要怕长 —— 但每句都要有信息量，**禁注水、禁把一个意思翻来覆去说**。

【语气】${voiceName}本人在写：夹叙夹议、有类比、有算账、有"我自己当年…"的历史决策对照，符合你 SKILL/人设里的语气样本。不是研报腔，不是 AI 腔。

## 能力圈外怎么答（核心 —— 给你框架，不给台词，自己组织语言）
- 🚫 大忌：把${voiceName}写成"什么都不懂"的人。${isDuan ? '段永平做电子产品出身（步步高/OPPO/vivo），对芯片、供应链、消费、互联网都不陌生' : isBespoke ? '管哥看遍港股 A 股各行业财报，生意模式他都懂' : `${sageName}深耕投资多年，主流行业的生意模式都不陌生`}
- 分清两种"不碰"：
  · 真陌生（创新药的具体药理、加密货币）→ 老实说"这个我真看不懂，不下注"
  · **看得懂、但生意不行**（周期股/重资产/无定价权/讲故事股）→ 这是多数情况。${voiceName}是"看懂了才不碰"——绝不能写成"没研究清楚"
- 对【看得懂但不碰】的，用评判好生意的框架**具体否决**：有没有定价权（价格自己说了算还是供需说了算）？赚的钱要不要不断投回去买设备扩产能？商业模式简单吗、十年后格局清楚吗？
- 针对用户问的【这家具体公司】说**具体的**：它做什么、最近为什么被追捧（用你自己的知识），再用框架判断
- 用户带情绪（"这么猛""回调了能抄底"）→ 正面接住：点破"猛"的真实原因 +「周期股最猛的时候往往就是顶」
- 🚫 死规矩：① 不准抄本 prompt 里任何示范句 ② 不准把看得懂的生意说成"没研究清楚" ③ 不准用"涨看不到顶跌看不到底"这种谁都会说的废话——要说**具体商业结构**
${isBespoke ? `
## 跨角色禁用（写出立刻失败）
${isDuan ? `- 禁说: 茶餐厅 / 在香港 / 放长线钓大鱼 / 5% 股息打底 / 看分位不看 K 线 / 排雷胜选股 / 招行长持 / 江南布衣 / 首都机场 / 物管` : `- 禁说: 圆石滩 / 加州后院 / 打高尔夫 / I'll be back / 本分 / stop doing list / 看十年 / 千万别用 Margin / 苹果拿了 20 年 / 网易 100 倍 / 拒绝百度 / 神华换泡泡玛特`}
${isDuan ? '' : '- 必须简体普通话：粤字 / 繁体字一个不要（嘅咗喺啲冇咁唔睇識靚呢佢 → 全部改为简体普通话）'}` : `
## 角色一致性
- 始终用${sageName}的哲学和语气，不要混入其他大佬的标志性术语或口头禅`}
${verdictBlock}`;

  const factsBlock = v62AnalysisText ? `
# 📊 投资分析底稿（v62 — 基于 10 年真实财务数据，研究层 + 分析层已算好）
${v62AnalysisText}

⚠️ 上面是真实数据算出来的分析底稿。你的工作是在此之上用${voiceName}的视角做**最终判断和表达**——
消化它、用${voiceName}的话讲出来，不是逐条复述。底稿里的数字必须用进去算账，绝不准编新数字。
底稿说"数据缺口"的，如实告诉用户，不要编。
` : facts ? `
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

用${voiceName}的投资逻辑做一次完整分析：先一句结论，再用〔〕分层论证，600-1000 字。`;

  return { system, user };
}

// ============ POST handler ============
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { sage_id, message } = body;

  if (!(LIVE_SAGES as readonly string[]).includes(sage_id)) {
    return new Response(`不支持的大佬: ${sage_id}`, { status: 400 });
  }
  const sage = SAGE_BY_ID_ALL[sage_id] as Sage | undefined;
  const sageName = sage?.name || sage_id;
  const userMsg = String(message || "").trim();
  if (!userMsg) return new Response("Empty message", { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: any) => controller.enqueue(enc.encode(sse(event, data)));

      try {
        send("phase", { name: "analyzing", message: "Python 端分析中..." });

        const stock = extractStock(userMsg);
        // v62: A股/美股/港股 + 段永平 → 走「研究层 + 分析层」新 pipeline
        // P1.2 (2026-05-22)：US 接入 datacenter RPT_USF10_FN_*。
        // P2   (2026-05-22)：HK 接入 datacenter RPT_HKF10_FN_*（schema 同 US，字典不同）。
        // P3-B (2026-05-25)：管哥 v62 化 5 维度（分位/排雷/股息/稳态/荒岛），useV62 扩 guan-wo-cai。
        // v63: 全部 10 位大佬都走 v62（有 stock 时）——段/管用各自手写分析，其余用 generic
        const useV62 = !!stock && ['A', 'US', 'HK'].includes(stock.market);
        if (useV62) {
          const msgMap: Record<string, string> = {
            US: '研究美股 10 年财务...',
            HK: '研究港股 10 年财务...',
            A:  '研究公司 10 年财务...',
          };
          send("phase", { name: "analyzing", message: msgMap[stock!.market] });
        }

        // 并行：取数（v62=研究档案 / 旧=gatherFacts）+ 检索历史
        const [dataResult, historyResult] = await Promise.all([
          useV62
            ? buildDossier(stock!).catch(() => null)
            : (stock ? gatherFacts(stock).catch(() => null) : Promise.resolve(null)),
          // v60.9.4: 识别不出股票（海力士韩股/泛问）→ 不检索 corpus。
          stock
            ? searchSagePosts(sage_id, userMsg, stock.name, req, 4).catch(() => [] as RelevantQuote[])
            : Promise.resolve([] as RelevantQuote[]),
        ]);
        const history: RelevantQuote[] = historyResult || [];

        let facts: StockFactsTyped | null = null;
        let verdict: SageVerdict | null = null;
        let v62Text: string | null = null;

        if (useV62 && dataResult) {
          const dossier = dataResult as ResearchDossier;
          send("facts", { ticker: stock, v62: true, depth: dossier.depth, years: dossier.yearly.length });
          // v63: 段/管走手写分析，其余 8 位走 generic（registry dimensions 驱动）
          const analysis = sage_id === 'duan-yongping' ? analyzeDuan(dossier)
            : sage_id === 'guan-wo-cai' ? analyzeGuan(dossier)
            : analyzeGeneric(dossier, sage!);
          v62Text = sage_id === 'guan-wo-cai' ? formatAnalysisGuan(analysis as any) : formatAnalysis(analysis as any);
          send("verdict", {
            sage: sage_id, v62: true,
            signal: analysis.preliminarySignal, confidence: 0,
            headline: analysis.headline, keyMetrics: analysis.keyMetrics,
            dims: Object.fromEntries(analysis.findings.map(f =>
              [f.dimension, { note: f.points.join('；'), pass: f.signal !== 'weak', signal: f.signal, score: 0, weight: 0 }])),
          });
        } else {
          facts = (dataResult as StockFactsTyped | null) || null;
          if (facts) send("facts", { ticker: stock, facts });
          else send("facts", { ticker: null, note: "无识别股票" });
          // 非 v62（无 stock）：段/管有粗判打分，其余大佬靠人设+历史发言作答，不强行打分
          verdict = sage_id === 'duan-yongping' ? scoreDuan(facts, userMsg)
            : sage_id === 'guan-wo-cai' ? scoreGuan(facts, userMsg)
            : null;
          if (verdict) send("verdict", verdict);
        }

        if (history.length) {
          send("history", { count: history.length, posts: history });
          // v60.8.4: 兼容 v1 frontend — 把 history 也作为 quotes 事件 emit
          send("quotes", history.map((p) => ({
            date: p.date, text: p.text, likes: p.likes, url: p.url,
            _rel_score: Math.round(p.score), _rec_mul: 1, _final_score: Math.round(p.score),
          })));
        }

        // 兼容 v1 frontend — synthetic tool_call/result 让"用了 X 工具"显示
        // P2 (2026-05-22)：v62 路径多发 4 个工具 event，UI 工具调用证据补强（之前只 1 个 get_realtime_quote）。
        if (useV62 && v62Text) {
          const dossier = dataResult as ResearchDossier;
          const ts = Date.now();
          // 工具 1: 实时行情
          const t1 = `v62-quote-${ts}`;
          send("tool_call", { name: "get_realtime_quote", args: { stock: stock?.name, market: stock?.market }, id: t1 });
          send("tool_result", { name: "get_realtime_quote", id: t1,
            result: `${stock?.name}(${stock?.code}) 现价 ${dossier.price?.toFixed?.(2) || '?'} | 市值 ${dossier.marketCapBillion?.toFixed?.(0) || '?'}亿 | 数据源 push2/eastmoney` });
          // 工具 2: 10 年财务
          const t2 = `v62-fin-${ts}`;
          send("tool_call", { name: "get_10y_financials", args: { stock: stock?.name, years: dossier.yearly.length }, id: t2 });
          const km = dossier.yearly[0];
          send("tool_result", { name: "get_10y_financials", id: t2,
            result: `${stock?.name} · ${dossier.yearly.length}年年报 · 最新年 营收 ${km?.revenue?.toFixed?.(1) || '?'}亿 | ROE ${km?.roe?.toFixed?.(1) || '?'}% | 毛利率 ${km?.grossMargin?.toFixed?.(1) || '?'}% | 净利率 ${km?.netMargin?.toFixed?.(1) || '?'}% · 数据源 ${dossier.source.join(',')}` });
          // 工具 3: 估值派生
          const t3 = `v62-val-${ts}`;
          send("tool_call", { name: "get_valuation_metrics", args: { stock: stock?.name }, id: t3 });
          send("tool_result", { name: "get_valuation_metrics", id: t3,
            result: `${stock?.name} · PE ${dossier.peTTM?.toFixed?.(1) || '?'} | PB ${dossier.pbMRQ?.toFixed?.(2) || '?'} | EY ${dossier.earningsYield?.toFixed?.(1) || '?'}% | 营收5年CAGR ${dossier.revenueCAGR5?.toFixed?.(1) || '?'}% | 净利5年CAGR ${dossier.netProfitCAGR5?.toFixed?.(1) || '?'}% | ROE5年均 ${dossier.roeAvg5?.toFixed?.(1) || '?'}%` });
          // 工具 4: 大佬框架分析
          const t4 = `v62-analyze-${ts}`;
          const dimNames = (sage?.dimensions || []).map(d => d.label).join('/') || '多维框架';
          send("tool_call", { name: "analyze_with_sage_framework", args: { sage: sageName, stock: stock?.name }, id: t4 });
          send("tool_result", { name: "analyze_with_sage_framework", id: t4,
            result: `${stock?.name} · ${sageName}框架（${dimNames}）已分析 · 历史发言 ${history.length} 条已检索` });
        } else if (facts) {
          const toolId = `v608-fetch-${Date.now()}`;
          send("tool_call", { name: "get_realtime_quote", args: { stock: stock?.name }, id: toolId });
          send("tool_result", {
            name: "get_realtime_quote", id: toolId,
            result: `${stock?.name}(${stock?.code}) 现价 ${facts.price?.toFixed?.(2) || '?'} | PE ${facts.pe_ttm || '?'} | PB ${facts.pb_mrq?.toFixed?.(2) || '?'} | 股息率 ${facts.dividend_yield_pct?.toFixed?.(2) || '?'}% | ROE ${facts.roe_pct?.toFixed?.(1) || '?'}% | 营收 ${facts.revenue_billion?.toFixed?.(0) || '?'}亿 | 数据源 ${facts.source.join(',')}`,
          });
        }
        // v60.8.4: emit phase writer 让 UI 关闭"内心分析中"loader
        send("phase", { name: "writer", message: `${sageName}写答案...` });
        // v60.9/v63: SKILL.md 优先（段/管有手写），没有就用 registry 生成的 persona
        const skillMd = await loadSageSkill(sage_id, req);
        const personaBody = (skillMd && skillMd.length > 100)
          ? skillMd
          : (sage ? buildSagePersona(sage) : `你是${sageName}，一位价值投资者。`);
        const { system, user } = buildVoicePrompt(sage_id, sageName, userMsg, facts, verdict, history, personaBody, v62Text);

        const llmRes = await fetch(`${LLM_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: LLM_FAST_MODEL,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            max_tokens: 2400,  // v61: 分析长文 600-1000 字 ≈ 1800-2400 token
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
          // v63: 跨角色违禁词只对段/管 bespoke 生效；generic 大佬不套段永平的禁词
          if (!BESPOKE.has(sage_id)) return text;
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
