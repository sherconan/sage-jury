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
// v60.6.1: 明确给 5 分钟 — v60.6 5 步推理 + 8 工具会让 analyst 阶段更长，
// 默认 Vercel edge 25-60s 会切断流，导致前端"内心分析中"永远转
export const maxDuration = 300;

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "***DEEPSEEK_KEY_REMOVED***";
const LLM_MODEL = process.env.SAGE_LLM_MODEL || "deepseek-v4-pro";
// v60.3: 最后一轮（合成答案）用 fast non-thinking 模型，TTFT 从 25s+ 降到 3-5s
// 深度已经在 reasoning_content 里累积，最后只需要按 sage 口吻写出来，不需要 thinking
const LLM_FAST_MODEL = process.env.SAGE_LLM_FAST_MODEL || "deepseek-chat";
const BOCHA_KEY = process.env.BOCHA_API_KEY || "***BOCHA_KEY_REMOVED***";

interface Quote { id: number; date: string; ts?: number; text: string; text_n?: string; kw?: string[]; likes: number; rt?: number; url: string;
  // v57.2: 召回 score 元数据（仅运行时附加，便于前端展示"为什么排第一"）
  _rel_score?: number;   // 0-N 相关性原始分（by_stock 8/by_concept 5/token 命中 +1/+3）
  _rec_mul?: number;     // 时效性 multiplier（0.5-2.0）
  _final_score?: number; // 综合分（用于排序）
}
interface SageData { slug: string; display: string; alias: string; philosophy: string; total_posts: number;
  high_quality_originals: Quote[]; recent_originals?: Quote[]; position_changes?: Quote[];
  // v60: 真实深度推理帖池 (>300字, 含类比/算账/竞品/历史决策), 来自 corpus mining
  deep_analysis_originals?: Quote[];
  by_stock: Record<string, Quote[]>; by_concept: Record<string, Quote[]>; }

const SAGE_FILES: Record<string, string> = {
  "duan-yongping": "duan-yongping.json", "guan-wo-cai": "guan-wo-cai.json",
  "lao-tang": "lao-tang.json", "dan-bin": "dan-bin.json",
};

async function loadSage(slug: string, req: NextRequest): Promise<SageData | null> {
  // 1) 有 corpus 的 sage（duan/guan）走 json 数据文件
  if (SAGE_FILES[slug]) {
    try {
      const url = new URL(`/sages-quotes/${SAGE_FILES[slug]}`, req.url);
      const r = await fetch(url.toString(), { cache: "no-store" });
      if (r.ok) return await r.json();
    } catch {}
  }
  // 2) v60.4.7 fallback：从 SAGES_RAW metadata 拼合成 SageData
  //    用途：feng-liu / zhang-kun / buffett / 等没 xueqiu corpus 的 13 个 popular/insider sage
  //    high_quality_originals 等数组为空 → RAG 召回返回 0 条 → LLM 不能引用历史发言
  //    但仍可以靠 dimensions/quotes/coreLine 做角色扮演
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
    deep_analysis_originals: [],
    by_stock: {},
    by_concept: {},
  } as SageData;
}

// v60.4.7: 给没 SKILL.md 文件的 sage 用 SAGES_RAW metadata 兜底
function buildFallbackSkillBlock(meta: any): string {
  const dimensions = (meta.dimensions || []).map((d: any) =>
    `  - ${d.label} (${Math.round((d.weight || 0) * 100)}%): ${d.description}`).join('\n');
  const redFlags = (meta.redFlags || []).map((r: any) =>
    `  - ${r.label}（${r.severity}）: ${r.trigger}`).join('\n');
  const quotes = (meta.quotes || []).slice(0, 5).map((q: string) => `  • ${q}`).join('\n');
  const trades = (meta.representativeTrades || []).slice(0, 4).map((t: string) => `  • ${t}`).join('\n');
  const misuse = (meta.misuseWarnings || []).slice(0, 3).map((m: string) => `  • ${m}`).join('\n');
  return `你是【${meta.name}】（${meta.title}）。流派：${meta.school}，活跃期 ${meta.era || ''}。

## 你的投资哲学
${meta.philosophy}

## 你的招牌核心句
"${meta.coreLine || ''}"

## 你的评分维度（按权重）
${dimensions || '  （无）'}

## 你绝不碰的红旗
${redFlags || '  （无）'}

## 你的代表性交易
${trades || '  （无）'}

## 你常说的话（口头禅）
${quotes || '  （无）'}

## 你的能力圈/误用提醒
${misuse || '  （无）'}

## 资料来源
${meta.bookOrSource || '公开资料'}

⚠️ **重要约束（与有 corpus 的 sage 不同）**：
- 你**没有**雪球公开发言 corpus，所以**不要**假装"我 2023 年说过 XX"
- 用户问"你过去具体对 X 怎么看"时，承认"我没有公开发言记录可查，但按我的方法论应该是 ..."
- 工具可调用：web_search（查公开新闻）、get_realtime_quote（拿当前数据）、get_financials
- **不要**调 search_sage_post（你的数据池是空的，会返回 0 条）
- 仍保持口吻和方法论一致

最终输出简体中文散文体，5-7 段，每段 2-4 句，段间空行。`;
}

// ⭐ 加载 sage skill 文件（持久化的 persona）
// /public/sages/<slug>/SKILL.md + methodology + decision_framework + voice_samples + classic_holdings + triggers
// v3: 9 文件 sage skill 包（新增 3 个反射式文件 mental_models / anti_patterns / default_position_logic）
const SAGE_SKILL_FILES = [
  "SKILL.md",
  "mental_models.md",          // ⭐ v3 新增: 反射式心理模型
  "anti_patterns.md",          // ⭐ v3 新增: 反例集合（永不碰）
  "default_position_logic.md", // ⭐ v3 新增: 仓位决策默认逻辑
  "methodology.md",
  "decision_framework.md",
  "voice_samples.md",
  "classic_holdings.md",
  "triggers.md",
];
async function loadSageSkill(slug: string, req: NextRequest): Promise<string> {
  const parts: string[] = [];
  // 串行 fetch（保证文件顺序在 prompt 里稳定）
  for (const fn of SAGE_SKILL_FILES) {
    try {
      const url = new URL(`/sages/${slug}/${fn}`, req.url);
      const r = await fetch(url.toString(), { cache: "force-cache" });
      if (r.ok) {
        const text = await r.text();
        if (text && text.length > 100) parts.push(`\n\n========= [${fn}] =========\n${text}`);
      }
    } catch {}
  }
  return parts.join("");
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
// v57.1: 动态召回 —— 不写死条数，按"时效性 × 相关性"自适应
// 上界 maxCap=15 防 context 爆炸；下界靠动态阈值，能力圈外可能返回 0 条
function findRelevant(sage: SageData, query: string, maxCap = 12): Quote[] {
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
  // v60: 深度推理帖 base 7 — 比 high_quality 高很多，让 Sage 优先看到完整推理样本而不是金句
  if (sage.deep_analysis_originals) for (const q of sage.deep_analysis_originals) score(q, 7);
  if (sage.recent_originals) for (const q of sage.recent_originals) score(q, 0);
  for (const q of sage.high_quality_originals) score(q, 0);
  if (sage.position_changes) for (const q of sage.position_changes) score(q, 0);

  const MIN_RELEVANCE_SCORE = 2;
  const now = Date.now();

  // v57.1: 时效性分桶 —— 越新越重，让最近 1 个月的帖子比 3 年前帖子优先级高 2 倍
  const recencyMul = (q: Quote): number => {
    if (!q.ts) return 0.5;
    const days = (now - q.ts) / 86400000;
    if (days < 7)   return 2.0;  // 1 周内（热点）
    if (days < 30)  return 1.5;  // 1 月内
    if (days < 180) return 1.2;  // 半年内
    if (days < 365) return 1.0;  // 1 年内
    if (days < 730) return 0.7;  // 2 年内
    return 0.5;                  // 更老
  };

  // 综合评分 = (相关性 × 10 + 赞数 × 0.005) × 时效性
  const scored = [...found.values()]
    .filter(({ score }) => score >= MIN_RELEVANCE_SCORE)
    .map(({ q, score }) => {
      const recMul = recencyMul(q);
      return { q, relScore: score, recMul, fs: (score * 10 + q.likes * 0.005) * recMul };
    })
    .sort((a, b) => b.fs - a.fs);

  if (!scored.length) return [];

  // v57.2: 动态阈值收紧 —— 必须 ≥ top × 0.5 且 ≥ 绝对底 18
  // 让强相关话题真正"挑出最相关"，而不是凑齐 maxCap
  const topScore = scored[0].fs;
  const dynThresh = Math.max(topScore * 0.5, 18);

  return scored
    .filter(s => s.fs >= dynThresh)
    .slice(0, maxCap)
    // 附加 score 元数据到 Quote，便于前端展示
    .map(({ q, relScore, recMul, fs }) => ({ ...q, _rel_score: relScore, _rec_mul: recMul, _final_score: Math.round(fs) }));
}

const NAME_TO_TICKER: Record<string,string> = {
  // A 股
  "茅台":"600519","贵州茅台":"600519","五粮液":"000858","汾酒":"600809","泸州老窖":"000568","洋河":"002304",
  "海天":"603288","海天味业":"603288","伊利":"600887","片仔癀":"600436","云南白药":"000538","恒瑞":"600276",
  "美的":"000333","格力":"000651","海尔":"600690","招行":"600036","招商银行":"600036","平安":"601318",
  "工行":"601398","宁德时代":"300750","比亚迪":"002594","隆基":"601012","中免":"601888","神华":"601088",
  "海康":"002415","中石油":"601857","万华":"600309",
  // 港股 (5 位代码, market 116)
  "腾讯":"00700","腾讯控股":"00700",
  "泡泡玛特":"09992",
  "美团":"03690","美团-W":"03690",
  "京东":"09618","京东集团":"09618",
  "阿里":"09988","阿里巴巴":"09988",
  "小米":"01810","小米集团":"01810",
  "中国移动":"00941","中移动":"00941",
  "中国海洋石油":"00883","中海油":"00883",
  "建设银行":"00939","建行 H":"00939","建设银行 H":"00939",
  "工商银行 H":"01398","工行 H":"01398",
  "中国平安 H":"02318",
  "招商银行 H":"03968","招行 H":"03968",
  "中国神华 H":"01088",
  "中国燃气":"00384",
  "北京控股":"00392",
  "联邦制药":"03933",
  "江南布衣":"03306",
  "首都机场":"00694","北京首都机场":"00694",
  "惠理集团":"00806",
  "中国石化 H":"00386","中石化 H":"00386",
};

// 港股代码集合 (5 位 0 开头) — 用于判断 market
function isHKCode(code: string): boolean {
  // 标准港股: 5 位数字, 第一位 0
  return /^0\d{4}$/.test(code) || code === "9992" || code === "00700" || code === "03306";
}
function calcSecid(code: string): string {
  if (isHKCode(code) || code.length === 5) {
    return `116.${code.padStart(5, "0")}`;
  }
  // A 股
  if (code.startsWith("6") || code.startsWith("9")) return `1.${code}`;
  return `0.${code}`;
}

function resolveTicker(input: string): { code: string; secid: string; name: string; market: 'A' | 'HK' } | null {
  const v = input.trim();
  // 直接代码 — A 股 6 位 / 港股 4-5 位
  if (/^\d{4,6}$/.test(v)) {
    let code: string, market: 'A' | 'HK';
    if (v.length === 6) { code = v; market = 'A'; }
    else { code = v.padStart(5, "0"); market = 'HK'; }
    return { code, secid: calcSecid(code), name: code, market };
  }
  // 中文/英文名
  for (const [n, c] of Object.entries(NAME_TO_TICKER)) {
    if (v.includes(n) || n === v) {
      const market: 'A' | 'HK' = isHKCode(c) || c.length === 5 ? 'HK' : 'A';
      return { code: c, secid: calcSecid(c), name: n, market };
    }
  }
  return null;
}

// === BM25 实现（用于 search_sage_post 的本地召回层）===
function bm25Rank(queryTokens: string[], docs: { id: string; tokens: string[] }[], k1 = 1.5, b = 0.75): Array<{ id: string; score: number }> {
  if (!docs.length) return [];
  const N = docs.length;
  const avgDocLen = docs.reduce((s, d) => s + d.tokens.length, 0) / N;
  // 文档频率
  const df: Record<string, number> = {};
  for (const d of docs) {
    const seen = new Set<string>();
    for (const t of d.tokens) if (!seen.has(t)) { seen.add(t); df[t] = (df[t] || 0) + 1; }
  }
  // 每个文档评分
  const scored = docs.map(d => {
    const docTf: Record<string, number> = {};
    for (const t of d.tokens) docTf[t] = (docTf[t] || 0) + 1;
    let score = 0;
    for (const qt of queryTokens) {
      const tf = docTf[qt] || 0;
      if (tf === 0) continue;
      const idf = Math.log((N - (df[qt] || 0) + 0.5) / ((df[qt] || 0) + 0.5) + 1);
      const numerator = tf * (k1 + 1);
      const denominator = tf + k1 * (1 - b + b * d.tokens.length / avgDocLen);
      score += idf * (numerator / denominator);
    }
    return { id: d.id, score };
  });
  return scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score);
}

// 调用 Bocha rerank API 对候选做精排
async function bochaRerank(query: string, candidates: { id: string; text: string }[], topN: number): Promise<Array<{ id: string; score: number }>> {
  if (!candidates.length) return [];
  try {
    const r = await fetch("https://api.bochaai.com/v1/rerank", {
      method: "POST",
      headers: { "Authorization": `Bearer ${BOCHA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gte-rerank", query, documents: candidates.map(c => c.text), top_n: Math.min(topN, candidates.length), return_documents: false }),
    });
    if (!r.ok) return candidates.slice(0, topN).map(c => ({ id: c.id, score: 0 }));
    const j: any = await r.json();
    const results = j?.data?.results || [];
    return results.map((res: any) => ({ id: candidates[res.index].id, score: res.relevance_score }));
  } catch {
    return candidates.slice(0, topN).map(c => ({ id: c.id, score: 0 }));
  }
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

// === Tool v3 新增 4 个工具 ===

// 1. PE 历史分位 (管哥强需)
//   策略: 拉 10 年（~2500 个交易日）日 K + EPS-TTM 计算 PE 时间序列 → 分位
//   简化版: 拉 1000 天日 K, 用当前 PE 反推过去 PE 趋势, 给"当前 vs 历史最高/最低/中位"对照
async function tool_pe_history_pct(stock: string, years = 5): Promise<string> {
  const r = resolveTicker(stock);
  if (!r) return `未识别股票: ${stock}`;
  if (r.market === 'HK') {
    // 港股用 quote 端口拿当前 PE/PB, 历史分位暂用 kline 估算
    const q = await tool_realtime_quote(stock);
    return `${r.name}(${r.code}) [港股]\n${q}\n注: 港股暂无历史分位数据, 上面为当前快照。建议看 PE/PB 跟同行/历史区间相比。`;
  }
  try {
    // A 股: 用 eastmoney push2 ValueAnalysis 接口
    const u = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_VALUEANALYSIS_DET&columns=TRADE_DATE,PE_TTM,PB_MRQ,PE_TTM_3YEARS_PCT,PB_MRQ_3YEARS_PCT,PE_TTM_5YEARS_PCT,PB_MRQ_5YEARS_PCT,PE_TTM_10YEARS_PCT&filter=(SECURITY_CODE%3D%22${r.code}%22)&pageNumber=1&pageSize=1&sortColumns=TRADE_DATE&sortTypes=-1`;
    const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://emweb.securities.eastmoney.com/" } });
    if (!res.ok) return `PE 历史接口失败 ${res.status}`;
    const j: any = await res.json();
    const row = j?.result?.data?.[0];
    if (!row) return `${r.name}(${r.code}) 暂无 PE 历史分位数据`;
    const lines = [
      `${r.name}(${r.code}) PE/PB 历史分位 (${row.TRADE_DATE}):`,
      `当前 PE-TTM: ${row.PE_TTM?.toFixed(2) || '?'}`,
      `当前 PB-MRQ: ${row.PB_MRQ?.toFixed(2) || '?'}`,
      ``,
      `PE 历史分位:`,
      `  3年: ${row.PE_TTM_3YEARS_PCT?.toFixed(1) || '?'}%`,
      `  5年: ${row.PE_TTM_5YEARS_PCT?.toFixed(1) || '?'}% ${row.PE_TTM_5YEARS_PCT < 20 ? '🟢 低估区' : row.PE_TTM_5YEARS_PCT > 70 ? '🔴 高估区' : '🟡 合理区'}`,
      `  10年: ${row.PE_TTM_10YEARS_PCT?.toFixed(1) || '?'}%`,
      ``,
      `PB 历史分位:`,
      `  3年: ${row.PB_MRQ_3YEARS_PCT?.toFixed(1) || '?'}%`,
      `  5年: ${row.PB_MRQ_5YEARS_PCT?.toFixed(1) || '?'}%`,
    ];
    return lines.join("\n");
  } catch (e: any) { return `PE 历史分位异常: ${e.message}`; }
}

// 2. 财务指标 (ROE/毛利/3 年增长)
async function tool_financials(stock: string): Promise<string> {
  const r = resolveTicker(stock);
  if (!r) return `未识别股票: ${stock}`;
  if (r.market === 'HK') {
    // 港股用专用 endpoint (容错: 失败时 fallback 到 web_search 提示)
    try {
      const u = `https://emweb.securities.eastmoney.com/PC_HKF10/FinancialAnalysis/PageAjax?code=${r.code}`;
      const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://emweb.securities.eastmoney.com/" } });
      if (res.ok) {
        const j: any = await res.json();
        const yo: any = j?.zyzbAccountingPeriodList?.[0];
        if (yo) {
          const rev = typeof yo.OPERATING_REVENUE === 'number' ? (yo.OPERATING_REVENUE / 1e8).toFixed(0) + "亿" : "?";
          const np = typeof yo.HOLDER_PROFIT === 'number' ? (yo.HOLDER_PROFIT / 1e8).toFixed(1) + "亿" : "?";
          const roe = typeof yo.ROE_AVG === 'number' ? yo.ROE_AVG.toFixed(1) + "%" : "?";
          return `${r.name}(${r.code}) [港股最新年报] 营收 ${rev} / 净利 ${np} / ROE ${roe}`;
        }
      }
    } catch {}
    return `${r.name}(${r.code}) [港股] 财务数据需联网查 — 建议 LLM 接着调 web_search('${r.name} 年报 营收 净利 ROE 毛利率')`;
  }
  try {
    // A 股: eastmoney F10 MainTarget endpoint
    const market = r.code.startsWith("6") ? "SH" : "SZ";
    const u = `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/PCWebMainTargetCNew?code=${market}${r.code}&type=0`;
    const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://emweb.securities.eastmoney.com/" } });
    if (!res.ok) return `财务接口失败 ${res.status}`;
    const j: any = await res.json();
    const rows: any[] = j?.data || [];
    if (!rows.length) return `${r.name}(${r.code}) 暂无年报数据`;
    // 取最近 4 年（年报）
    const yearly = rows.filter(x => x.REPORT_DATE_NAME?.includes("年报") || x.REPORT_DATE?.endsWith("12-31")).slice(0, 4);
    if (!yearly.length) return "无年报数据";
    const lines = [`${r.name}(${r.code}) 最近 ${yearly.length} 年年报关键指标:`];
    for (const y of yearly) {
      const date = y.REPORT_DATE?.slice(0, 4) || y.REPORT_DATE_NAME || "?";
      const rev = y.TOTAL_OPERATE_INCOME ? (y.TOTAL_OPERATE_INCOME / 1e8).toFixed(0) + "亿" : "?";
      const np = y.PARENT_NETPROFIT ? (y.PARENT_NETPROFIT / 1e8).toFixed(1) + "亿" : "?";
      const roe = y.WEIGHTAVG_ROE?.toFixed(1) + "%" || "?";
      const gross = y.GROSS_PROFIT_RATIO?.toFixed(1) + "%" || "?";
      const opChg = y.OPERATE_INCOME_YOY?.toFixed(1) + "%" || "?";
      const npChg = y.PARENT_NETPROFIT_YOY?.toFixed(1) + "%" || "?";
      lines.push(`  ${date}: 营收 ${rev} (同比 ${opChg}), 净利 ${np} (同比 ${npChg}), ROE ${roe}, 毛利率 ${gross}`);
    }
    return lines.join("\n");
  } catch (e: any) { return `财务异常: ${e.message}`; }
}

// 3. 派息历史 (管哥强需)
async function tool_dividend_history(stock: string, years = 5): Promise<string> {
  const r = resolveTicker(stock);
  if (!r) return `未识别股票: ${stock}`;
  if (r.market === 'HK') {
    // 港股派息数据: 现在 quote 已经能拿股息率, 历史派息建议 web_search
    const q = await tool_realtime_quote(stock);
    return `${r.name}(${r.code}) [港股] 当前股息率请看下面快照, 详细历史派息建议 web_search:\n${q}`;
  }
  try {
    // A 股: eastmoney 派息数据
    const u = `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_SHAREBONUS_DET&columns=PUBLISH_DATE,REPORT_DATE,PRETAX_BONUS_RATIO,DIVIDENT_RATIO,EX_DIVIDENT_DATE&filter=(SECURITY_CODE%3D%22${r.code}%22)&pageNumber=1&pageSize=${years * 2}&sortColumns=REPORT_DATE&sortTypes=-1`;
    const res = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://emweb.securities.eastmoney.com/" } });
    if (!res.ok) return `派息接口失败 ${res.status}`;
    const j: any = await res.json();
    const rows: any[] = j?.result?.data || [];
    if (!rows.length) return `${r.name}(${r.code}) 近 ${years} 年无派息记录或数据未公开`;
    const lines = [`${r.name}(${r.code}) 派息历史 (近 ${rows.length} 次):`];
    for (const x of rows.slice(0, 10)) {
      const period = x.REPORT_DATE?.slice(0, 10) || "?";
      const ratio = x.DIVIDENT_RATIO?.toFixed(2) || "?";  // 每股派息
      const exDate = x.EX_DIVIDENT_DATE?.slice(0, 10) || "?";
      lines.push(`  ${period}: 每股派 ${ratio} 元 (除权 ${exDate})`);
    }
    return lines.join("\n");
  } catch (e: any) { return `派息异常: ${e.message}`; }
}

// 4. 多股对比 (并行调用 realtime + financials + pe_history 给 N 只股票)
async function tool_compare_stocks(stocks: string[]): Promise<string> {
  if (!stocks || stocks.length < 2) return "请至少提供 2 只股票";
  if (stocks.length > 5) stocks = stocks.slice(0, 5);
  const results = await Promise.all(stocks.map(async s => {
    const r = resolveTicker(s);
    if (!r) return `❌ ${s}: 未识别`;
    try {
      const qUrl = `https://push2.eastmoney.com/api/qt/stock/get?secid=${r.secid}&fields=f43,f58,f162,f167,f168,f170`;
      const qRes = await fetch(qUrl, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" } });
      const qd: any = (await qRes.json()).data;
      if (!qd?.f58) return `❌ ${s}: 数据失败`;
      const div = (n: any) => typeof n === "number" && !isNaN(n) ? n / 100 : null;
      return `${qd.f58}(${r.code}): 价 ${div(qd.f43)?.toFixed(2)}, PE ${div(qd.f162)?.toFixed(1)}, PB ${div(qd.f167)?.toFixed(2)}, 股息率 ${div(qd.f168)?.toFixed(2)}%, 今日 ${div(qd.f170)?.toFixed(2)}%`;
    } catch { return `❌ ${s}: 异常`; }
  }));
  return `多股对比 (${stocks.length} 只):\n` + results.join("\n");
}

// ⭐ 当前 sage 的语义搜（Hybrid: BM25 召回 + Bocha rerank 精排）
// 注意: 这个工具需要 sage 数据。我们用闭包封装 sage 给它访问。
function makeTool_searchSagePost(sage: SageData) {
  return async function (query: string, top = 5): Promise<string> {
    if (!query) return "请提供搜索关键词";
    // 1. 全部候选: high_quality + recent + position_changes (去重)
    const seen = new Set<number>();
    const allCands: Quote[] = [];
    const push = (q: Quote) => { if (!seen.has(q.id)) { allCands.push(q); seen.add(q.id); } };
    // v60: deep_analysis_originals 优先 push (rerank 看到的候选里它们排在前)
    (sage.deep_analysis_originals || []).forEach(push);
    sage.high_quality_originals.forEach(push);
    (sage.recent_originals || []).forEach(push);
    (sage.position_changes || []).forEach(push);
    if (allCands.length === 0) return "该 sage 暂无可搜索语料";

    // 2. BM25 召回 (基于 query tokens 在每条 quote 的命中)
    const queryTokens = tokenize(query);
    const docs = allCands.map(q => ({ id: String(q.id), tokens: tokenize(q.text_n || q.text) }));
    let candidates = bm25Rank(queryTokens, docs).slice(0, 30);  // 召回 top 30
    if (candidates.length === 0) candidates = docs.slice(0, 30).map(d => ({ id: d.id, score: 0 }));

    // 3. Bocha rerank 多请求一些候选（top 15），后面做动态过滤
    const candTexts = candidates.map(c => {
      const q = allCands.find(x => String(x.id) === c.id)!;
      return { id: c.id, text: (q.text_n || q.text).slice(0, 350) };
    });
    const reranked = await bochaRerank(query, candTexts, 15);
    if (reranked.length === 0) return "无相关发言";

    // v57.1: 动态过滤 —— 按 rerank 分数 × 时效性，不写死条数
    const now = Date.now();
    const recencyMul = (q: Quote): number => {
      if (!q.ts) return 0.5;
      const days = (now - q.ts) / 86400000;
      if (days < 7)   return 1.5;
      if (days < 30)  return 1.3;
      if (days < 180) return 1.15;
      if (days < 365) return 1.0;
      if (days < 730) return 0.85;
      return 0.7;
    };
    const enriched = reranked.map(r => {
      const q = allCands.find(x => String(x.id) === r.id);
      if (!q) return null;
      return { r, q, finalScore: r.score * recencyMul(q) };
    }).filter(Boolean) as Array<{ r: { id: string; score: number }; q: Quote; finalScore: number }>;
    if (!enriched.length) return "无相关发言";

    // v57.2: 动态阈值收紧 —— rerank × recency 必须 ≥ top × 0.6 OR ≥ 绝对底 0.30
    const userTop = Math.min(top || 12, 15);
    const topScore = enriched[0].finalScore;
    const dynThresh = Math.max(topScore * 0.6, 0.30);
    const passed = enriched.filter(e => e.finalScore >= dynThresh).slice(0, userTop);
    if (!passed.length) return "无相关发言（话题可能在能力圈外）";

    return passed.map((e, i) =>
      `[${i+1}] ${e.q.date} 👍${e.q.likes} (rerank ${e.r.score.toFixed(3)}, recency×${recencyMul(e.q).toFixed(2)})\n${(e.q.text_n || e.q.text).slice(0, 280)}\n${e.q.url}`
    ).join("\n\n");
  };
}

const TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "search_sage_post",
      description: "⭐ 在你（sage）自己的雪球历史发言里做语义搜索（BM25 + reranker + 时效性加权）。当用户问到你过去的具体观点、某只股票你怎么看、某概念你怎么解释时**优先用此工具**。返回**按相关性 × 时效性动态筛选**的若干条原文（0-12 条，话题热可能多，能力圈外可能 0 条）。",
      parameters: { type: "object", properties: { query: { type: "string", description: "语义搜索 query，如『腾讯估值』『泡泡玛特换仓理由』『为什么看好招行』" }, top: { type: "number", description: "上限条数（不强制，实际按相关性 × 时效性动态裁剪）1-15", default: 12 } }, required: ["query"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "web_search",
      description: "Bocha 联网搜索最新新闻、政策、争议、行业动态。当用户问题涉及『最近』『最新』『政策』『新闻』『争议』『今年/去年』时必用。",
      parameters: { type: "object", properties: { query: { type: "string", description: "搜索关键词" }, count: { type: "number", description: "返回条数 1-8", default: 5 } }, required: ["query"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_realtime_quote",
      description: "查询某只股票当前实时价格、PE-TTM、PB、股息率、今日涨跌。当用户问『现在多少钱』『PE 多少』『股息率』时必用。",
      parameters: { type: "object", properties: { stock: { type: "string", description: "股票名（如 茅台）或 6 位代码（如 600519）" } }, required: ["stock"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_kline",
      description: "查询某只股票历史 K 线（默认最近 30 个交易日），输出区间涨跌、距高/低位距离。用于判断趋势/位置/技术面。",
      parameters: { type: "object", properties: { stock: { type: "string" }, days: { type: "number", description: "天数 7-250", default: 30 } }, required: ["stock"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_pe_history_pct",
      description: "⭐ 查询某只股票当前 PE/PB 在 3/5/10 年历史中的分位（百分位）。**管我财类定量价值投资者必用**：他们的核心信条是 PE 在历史什么分位。当用户问'X 贵不贵''X 历史什么位置''X 合理估值'时必用。",
      parameters: { type: "object", properties: { stock: { type: "string", description: "股票名或代码" }, years: { type: "number", description: "年数 3/5/10", default: 5 } }, required: ["stock"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_financials",
      description: "查询某只股票近 4 年年报关键财务指标：营收/净利/ROE/毛利率/同比增长。**所有价值投资者都用**：判断生意质量、增长可持续性、护城河变化。当用户问'X 财务怎么样''X 增长''X 盈利能力'时必用。",
      parameters: { type: "object", properties: { stock: { type: "string", description: "股票名或代码" } }, required: ["stock"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_dividend_history",
      description: "查询某只股票近 5 年派息历史（每股派息金额 + 除权日）。**管我财类高股息派必用**：他们的安全边际靠 5% 股息打底。当用户问'X 派息''X 股息怎么样''X 分红'时必用。",
      parameters: { type: "object", properties: { stock: { type: "string", description: "股票名或代码" }, years: { type: "number", default: 5 } }, required: ["stock"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "compare_stocks",
      description: "**多股对比**：并排展示 2-5 只股票的当前价、PE、PB、股息率。当用户问'X vs Y'、'A 和 B 哪个好'、'同行业横向对比'时必用。",
      parameters: { type: "object", properties: { tickers: { type: "array", items: { type: "string" }, description: "2-5 只股票名或代码" } }, required: ["tickers"] },
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
  if (!quotes.length) {
    return `（本次未召回到 sage 关于此话题的相关历史发言）
🚨 强制约束：
- 你的回答里**禁止出现任何 [原文 N] 引用标号**（没有可引用的内容）
- 如果用户问的是某只股票/行业/概念，**坦白说"这个我没专门讨论过"或"不是我能力圈"**
- 禁止从无关旧帖里强行类比，禁止编造历史观点`;
  }
  // v57.1: 动态条数，不截断 —— findRelevant 已按时效×相关性筛过，全部展示
  return quotes.map((q, i) =>
    `[原文 ${i+1}] ${q.date}(👍${q.likes}): ${(q.text_n || q.text).replace(/\n/g, " ").slice(0, 180)}`
  ).join("\n");
}

// === v55: 服务端 citation 校验 ===
// 对每个 [原文 N]，算上文句子与 quote N 的 unigram 重合度，低于阈值就剥掉标号（保留原句）
function auditCitations(reply: string, quotes: Quote[]): { corrected: string; stripped: Array<{ n: number; reason: string; snippet: string }> } {
  if (!reply) return { corrected: reply, stripped: [] };
  const stripped: Array<{ n: number; reason: string; snippet: string }> = [];
  // 召回为空时：任何 [原文 N] 都是伪造
  if (!quotes.length) {
    const corrected = reply.replace(/\s*\[原文\s*(\d+)\]/g, (_m, nStr) => {
      stripped.push({ n: parseInt(nStr) || 0, reason: "no-quotes", snippet: "" });
      return "";
    });
    return { corrected, stripped };
  }
  // 拆分回答为句子（中文标点 + 换行），对每个含 [原文 N] 的句子做校验
  const corrected = reply.replace(/([^。！？\n]*?)\s*\[原文\s*(\d+)\]/g, (match, sentence: string, nStr: string) => {
    const n = parseInt(nStr);
    if (isNaN(n) || n < 1 || n > quotes.length) {
      stripped.push({ n, reason: "out-of-range", snippet: sentence.slice(-40) });
      return sentence;  // 越界引用直接剥
    }
    const quote = quotes[n - 1];
    const quoteText = (quote.text_n || quote.text || "").toLowerCase();
    const sentTokens = tokenize(sentence).filter(t => t.length >= 2);
    if (sentTokens.length === 0) {
      stripped.push({ n, reason: "no-tokens", snippet: sentence.slice(-40) });
      return sentence;
    }
    let hits = 0;
    for (const t of sentTokens) if (quoteText.includes(t.toLowerCase())) hits++;
    const overlap = hits / sentTokens.length;
    // 阈值 0.15：句子有 ≥15% 的 token 出现在 quote 文本里，才认为引用合理
    if (overlap < 0.15) {
      stripped.push({ n, reason: `overlap-${overlap.toFixed(2)}`, snippet: sentence.slice(-40) });
      return sentence;  // 剥引用标号，保留句子
    }
    return match;  // 通过校验
  });
  return { corrected, stripped };
}

function makeExecuteTool(sage: SageData) {
  const searchSagePost = makeTool_searchSagePost(sage);
  return async function (name: string, args: any): Promise<string> {
    try {
      if (name === "search_sage_post") return await searchSagePost(args.query, args.top);
      if (name === "web_search") return await tool_web_search(args.query, args.count);
      if (name === "get_realtime_quote") return await tool_realtime_quote(args.stock);
      if (name === "get_kline") return await tool_kline(args.stock, args.days);
      if (name === "get_pe_history_pct") return await tool_pe_history_pct(args.stock, args.years);
      if (name === "get_financials") return await tool_financials(args.stock);
      if (name === "get_dividend_history") return await tool_dividend_history(args.stock, args.years);
      if (name === "compare_stocks") return await tool_compare_stocks(args.tickers || args.stocks);
      return `未知工具: ${name}`;
    } catch (e: any) { return `工具异常: ${e.message}`; }
  };
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
        // === Prefetch 环境信息（不分类，无脑准备）===
        const [quotes, sageSkill] = await Promise.all([
          Promise.resolve(findRelevant(sage, userMsg)),  // v57.1: 动态条数，不传 limit 走默认 maxCap=15
          loadSageSkill(sage.slug, req),  // 加载 6-file sage skill 作为 persona
        ]);
        controller.enqueue(sse("quotes", quotes));

        const executeTool = makeExecuteTool(sage);
        const ragCtx = buildRagContext(quotes);
        // ⭐ 系统 prompt 由三层组成:
        // 1. sage skill 文件包 (SKILL.md + methodology + decision_framework + voice_samples + classic_holdings + triggers)
        // 2. 本轮 quick RAG 召回的 5 条历史发言 (动态)
        // 3. 工具使用规则
        const sageSkillBlock = sageSkill
          || SAGE_PROMPTS[sage.slug]
          || (SAGE_BY_ID[sage.slug] ? buildFallbackSkillBlock(SAGE_BY_ID[sage.slug]) : `你是${sage.display}。`);
        const sys = `${sageSkillBlock}

=== 本轮 quick RAG 召回的相关历史发言（如不够深可调 search_sage_post 工具）===
${ragCtx}

=== 工具使用规则（v60.6 完整 8 工具，按 SKILL.md 5 步推理路径中的"取数"指引调用）===
- search_sage_post: 在自己历史发言里语义搜（BM25+rerank）— 用户问"你过去对 X 怎么看"时**必调**
- web_search: 联网搜最新事件/政策/新闻 / 公司主营业务描述
- get_realtime_quote: 当前股价/PE/PB/股息（任何"现在能买吗"必调）
- get_pe_history_pct: PE/PB 历史分位（管哥步骤 1 必调，段哥步骤 4 必调）
- get_financials: 近 4 年年报关键指标（毛利率/ROE/资产负债/现金流 — 排雷+商业稳态都要）
- get_dividend_history: 5 年派息历史（管哥步骤 3 必调；段哥步骤 3 看回购信号）
- get_kline: 历史 K 线（备用，sage 多半不看 K 线，但管哥技术追问可一句话回怼）
- compare_stocks: 多股对比（同行参照时用）

**核心原则**：估值/股价/最新事件类问题**必先调工具**取真数据再回答；问到你过去具体观点时**优先 search_sage_post**。**没有真数据不要瞎答。**

═══════════════════════════════════════════════════════════════
🧠 v60.6 推理深度强制 — 必须先按 SKILL.md 的 5 步推理路径走完
═══════════════════════════════════════════════════════════════

⭐ **任何公司分析类问题，你必须按你 SKILL.md 第三节"5 步推理路径"完成思考再写答案**。这是硬约束，不是建议。

具体到段永平 / 管我财，5 步分别是：

**段永平**：
1. 能力圈检验（看不懂直接说看不懂，不硬答）
2. 商业模式（4 个问题：客户为何回来 / 竞品为何打不过 / 10 年后是否更好 / 怎么死）
3. 团队（讲不讲大话 / owner 意识 / 资本配置）
4. 价格（vs 国债 vs 其他好公司 — **第三位**）
5. Stop Doing 检验（触发任一不投）

**管我财**：
1. 价位（PE/PB 历史分位 — 高于 80% 立刻没兴趣）
2. 排雷（5 颗：负债 / 现金流 / 大股东 / 商誉 / 鬼故事 — 任一一票否决）
3. 股息安全垫（5% 起步）
4. 商业稳态（ROE 长期 / 行业第一第二）
5. 荒岛测试（一年不能换睡得着吗）

**思考阶段（reasoning_content）**：必须能反推出"5 步全走过"，每步要从工具数据里找证据。
**输出阶段（content）**：把推理融进散文流，**绝不写"Step 1 / Step 2"**。

⚠️ 思考时必须**具体不空泛**：
- ❌ "right business"（空 mantra）→ ✅ "right business：用户每年自愿换机，跟茅台喝完还想喝一个意思"
- ❌ "PE 30 倍"（裸数字）→ ✅ "PE 30 倍，按 8% 增长 7 年回本，vs 国债 4% 差 100%"
- ❌ "团队靠谱" → ✅ "库克 2015 之后回购减股 30%，比 Steve Ballmer 那种乱花钱强多了"
- ❌ "看十年"（mantra）→ ✅ "10 年后还在，类比可口可乐 1990-2000 那 10 年..."
- ❌ "估值便宜" → ✅ "PE 14 倍 历史分位 35%，跟 2018 年熊市底部 PE 12 倍差 2 倍空间"

⛔ **认知边界铁律**：用户问的问题落在你的 cognitive stand "❌ 你不做" 那列时（如问段永平"周期股反转"，问管哥"商业模式好坏"），**必须承认这不是你看的角度，把球踢给适合的方法论**。这才是本分，硬答是失败。

最终输出（content）用 sage 口吻把 5 步推理成果**写成 4-7 段散文**，每段含具体类比/数字/竞品/历史决策。**不能简化回 mantra。读者能反推出 5 步走完。**

═══════════════════════════════════════════════════════════════
🚨🚨🚨 输出格式硬约束 — 违反任何一条都是失败 🚨🚨🚨
═══════════════════════════════════════════════════════════════

你回答用户时，**禁止**任何形式的：
1. ❌ 禁止 markdown 标题（不准用 \`#\`、\`##\`、\`###\`）
2. ❌ 禁止 markdown 表格（不准用 \`| 项 | 值 |\` 任何格式）
3. ❌ 禁止 emoji 装饰列表（不准用 ✅ ❌ ⚠️ 📊 🚀 等）
4. ❌ 禁止 "Step 1 / Step 2 / Step 3" 编号步骤
5. ❌ 禁止 "**第一**、**第二**、**第三**" 强分点
6. ❌ 禁止 "好的，让我按框架走一遍" 之类的 stage direction 开场
7. ❌ 禁止 "**最终判决：可买/观望/不买**" 这种总结框

**唯一允许的样子**：自然散文段落，像在雪球发的长帖，像跟朋友闲聊。
- **每段 2-4 句话**，每段一个核心意思
- **段落之间必须用空行（\\n\\n）分隔** — 这一条最重要，长段落顶到一起是失败
- **完整回答必须有 4-7 段** — 不要堆成一大段
- 数字嵌在句子里讲（不是表格列出）
- 判断散在叙述里（不是评分卡）
- 结论自然落在最后一段
- 最后可以加你的招牌结尾

⚠️ **典型烂样子**：一大段 800+ 字不换行不分段，用户读起来累死。
⚠️ **正确样子**：段段分明，每段 2-4 句，段间空一行，整体 4-7 段。

═══════════════════════════════════════════════════════════════
📎 引用规则（v55 严格化 — 违反等于伪造证据）
═══════════════════════════════════════════════════════════════

🚨 **铁律**：\`[原文 N]\` 只能引用**内容确实支撑你这句话**的 quote。

判定流程（每次想加 [原文 N] 之前 self-check）：
1. 我这句话讨论的主题（如"存储芯片周期"）→ quote N 的内容是否真的是这个主题？
2. 不是 → 不引用，宁可不加 chip 也别张冠李戴
3. 是 → 才加 [原文 N]

🛑 **如果上方 ragCtx 显示"未召回到相关历史发言"，整段回答禁止出现任何 [原文 N]。**

🛑 **如果召回的 quote 主题与用户问的明显无关**（比如用户问存储芯片，召回的是泡泡玛特/苹果/茅台）：
- 不要引用它们
- 明确说"这个不是我能力圈"或"我没专门讨论过这块"
- 这是符合 sage 本分的做法，硬撑是失败

❌ **v54 真实失败案例**（必须避免）：
   用户问："存储芯片这个行业怎么投"
   召回 quote #2 = 苹果换仓帖, quote #5 = 茅台买入帖
   错误输出："存储芯片比台积电还狠 [原文 2] ... 亏钱是必然的 [原文 5]"
   ↑ 把苹果帖伪造成存储证据，把茅台帖伪造成亏损证据 = 严重失败

✅ **正确做法**：
   "存储这块不是我能力圈，我没专门讨论过半导体周期。
    你问我十年后存储公司能赚多少钱，我算不出来。算不出来就是不懂，
    不懂就不投——这是 stop doing list 第一条。"
   （注意：完全不加 [原文 N]，因为没有相关 quote）

✅ **引用真的支撑时**：
   "我 5 月 7 号说过把神华换成泡泡玛特 [原文 1]"
   （前提：quote #1 的内容真的是这个换仓事件）

每个 [原文 N] 必须有可对照的具体锚点（日期/数字/具体事件），空泛感想禁止硬塞引用。

═══════════════════════════════════════════════════════════════
🧠 用户问"现在怎么操作 / 能买吗 / 该不该加仓"时的硬约束
═══════════════════════════════════════════════════════════════

**不要只复述自己的历史持仓**！历史只是背景，用户要的是**现在的判断**。

按照 mental_models.md + decision_framework.md 走完整分析：

1. **生意本质（1 段）**：这家公司怎么赚钱？right business 还是坏生意？护城河是什么？
2. **10 年视角（1 段）**：10 年后还在不在？变得更好还是更差？关键不确定性是什么？
3. **估值算账（1 段，必须用工具数据）**：当前 PE/PB/FCF 多少？年化预期回报怎么算？跟国债比划算吗？
4. **仓位建议（1 段）**：按 default_position_logic.md 给具体建议（段永平：集中持仓的逻辑 / 管我财：5% 上限分散）
5. **风险提醒（1 段）**：什么情况下你会卖？什么信号让你重新评估？

**示范**（段永平问泡泡玛特操作）：

> 泡泡玛特卖的不是玩具，是情绪价值——这是 right business [原文 1]。用户在 Westfield 排队不是被打折逼的，是自愿的，这跟茅台喝完还想喝是一个意思。
>
> 10 年后这门生意还在吗？只要还有人喜欢潮玩，他们就会找泡泡玛特。但潮玩本身的持续性是真争议——这是我也想不透的地方 [原文 2]。
>
> 算估值：现在 167 港元，PE 大概 50 倍，按王宁说的明年 20% 增长，FCF 收益率 2-3%。坦白讲，这价位贵了。我 5 月 7 号 269 买的时候算账是合理的，现在涨这么多对新进者不算便宜 [原文 3]。
>
> 你现在该怎么操作？如果你看得懂这个生意 + 能接受短期跌 30%+ → 5-10% 仓位慢慢买；如果你只是因为涨了想追 → 千万别 all-in。我说过 stop doing list 第一条就是不投不懂的。
>
> 我自己会一直拿，因为我看 10 年。但我不卖也不加，市场不是我的仆人。

═══════════════════════════════════════════════════════════════
🔁 收尾铁律（v57 反复读机）—— 违反等于失败
═══════════════════════════════════════════════════════════════

🚨 用户已经抱怨过你**每次都用 "反正我是这么看的，对错我自己负责" 收尾**。这是失败。

**self-check**：在写最后一段前，先看看上方 history 里你上一次回答怎么结尾的。如果上一次用了 "反正我是这么看的"——**这一次必须换一种**。

**多种自然收尾方式，按场景轮换**（不要 70% 都用同一种）：
1. ✅ **直接以结论落停，不加任何招牌**（最推荐，40% 用这个）
2. ✅ "看十年。" 或 "我看 10 年。"
3. ✅ "本分。不懂不投。"
4. ✅ "I'll be back."（节制使用，主要用在换仓/错过类话题）
5. ✅ "对的事慢慢做。"
6. ✅ 自嘲式："我能力圈窄，乱出圈才丢人。"
7. ⚠️ "反正我是这么看的，对错我自己负责。"（**每 10 个回答最多用 2 次**）

❌ **绝对禁止**：连续两次回答都用同一种招牌结尾

═══════════════════════════════════════════════════════════════`;

        // ⭐ Few-shot examples per sage — 让模型从样本学风格而不是从规则推理
        const FEW_SHOT: Record<string, Array<{role: string; content: string}>> = {
          "guan-wo-cai": [
            { role: "user", content: "招行 H 股能买吗" },
            { role: "assistant", content: `招行 H 现在大概 38 港元附近，PE-TTM 在 6.5 倍上下，跟历史比已经在 25 分位以下了，不算贵。

我看招行的核心是它的零售存款成本。对公比拼的是规模，零售比拼的是粘性，招行在零售这块护城河十几年没人撼动，活期占比 60% 多——这是它净息差领先同业 30-40 个 bp 的根本原因。

股息率呢，6% 出头，按我"5% 股息打底"的标准，过线了。下行有保护。

我 26 年荒岛组合里招行 H 是常客。现在这个位置如果你没仓位，分批入是合理的。但别一次梭哈——零售贷款不良率还在抬头，房地产链这几年也拖了它一把，如果再跌 20% 到 PE 5 倍以下、股息率打到 8%，那是更舒服的击球区。

放长线钓大鱼。` },
          ],
          "duan-yongping": [
            { role: "user", content: "你怎么看苹果 现在还能拿吗" },
            { role: "assistant", content: `苹果我从 2002 年开始买，到现在拿了 20 多年，没怎么动过。我大部分时候不知道下个季度财报怎么样，但我从来没怀疑过 10 年后苹果还在。

iPhone 用户每年自愿换机，App Store 30% 抽成全自动收上来——这就是 right business。它不是科技公司，是消费品公司，跟茅台一个意思，用户买的是身份认同。

库克接手 12 年，回购、分红、产品节奏、AI 慢但稳——他做的每件大事我看下来基本都是对的。他不是乔布斯，但他知道自己不是乔布斯，没乱搞。这是 right people。

至于现在 PE 30 倍上下不算便宜。但你算 1000 亿美金 FCF 一年，回购加分红一年还回 3-4%，加上 5-8% 长期增长，年化 10% 是合理预期，比国债强。

我自己还在拿。你要新进，看十年。能接受下个月跌 30%，慢慢加；不能接受，就别买。

本分。看十年。` },
            { role: "user", content: "存储芯片现在能投吗" },
            { role: "assistant", content: `存储这事不在我能力圈，我没专门研究过半导体周期。

DRAM、NAND 这种生意，重资产建厂几百亿砸下去，技术两年一换代，价格全看供需——三样叠一起，在我 stop doing list 上排得挺靠前。不是说不能赚钱，是我算不出 10 年后哪家能稳稳把钱装进口袋。

你要是看得懂，自己算明白现金流，那该投就投。我看不懂的东西，哪怕短期景气，我也不碰。

能力圈窄不丢人，乱出圈才丢人。` },
          ],
        };
        const examples = FEW_SHOT[sage.slug] || [];

        // Tool-calling loop (最多 3 轮 tool call)
        const messages: any[] = [{ role: "system", content: sys }, ...examples, ...hist, { role: "user", content: userMsg }];
        let fullReply = "";
        let toolRounds = 0;
        const MAX_ROUNDS = 3;

        while (toolRounds < MAX_ROUNDS) {
          const isLastRound = toolRounds === MAX_ROUNDS - 1;
          // v60.3: 最后一轮（写答案）切到 fast model，TTFT 降到 3-5s
          // 前面轮次（thinking + tool calls）保持 v4-pro 深度思考
          const modelForRound = isLastRound ? LLM_FAST_MODEL : LLM_MODEL;
          const llmRes = await fetch(`${LLM_BASE}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: modelForRound,
              messages,
              tools: isLastRound ? undefined : TOOLS,
              tool_choice: isLastRound ? undefined : "auto",
              max_tokens: 2500,
              temperature: isLastRound ? 0.85 : 0.7,
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
          let buf = "", roundContent = "", roundReasoning = "", emitBuf = "", inDSML = false;
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
                  // ⭐ 完整 DSML 块抑制：进入 DSML 块后完全静默，直到 </...tool_calls>
                  emitBuf += delta.content;
                  let outSeg = "";
                  while (emitBuf.length > 0) {
                    if (!inDSML) {
                      // 找下一个 DSML 开始标记
                      const m = emitBuf.match(/<[^<>]{0,400}DSML[^<>]{0,400}tool_calls\s*>/);
                      if (m && m.index !== undefined) {
                        outSeg += emitBuf.slice(0, m.index);
                        emitBuf = emitBuf.slice(m.index + m[0].length);
                        inDSML = true;
                      } else {
                        // 末尾可能有未闭合的 < 留住等下一 chunk
                        const lastOpen = emitBuf.lastIndexOf("<");
                        const lastClose = emitBuf.lastIndexOf(">");
                        const safeEnd = lastOpen > lastClose ? lastOpen : emitBuf.length;
                        outSeg += emitBuf.slice(0, safeEnd);
                        emitBuf = emitBuf.slice(safeEnd);
                        break;
                      }
                    } else {
                      // DSML 块内：等闭合标记
                      const m = emitBuf.match(/<\/[^<>]{0,400}DSML[^<>]{0,400}tool_calls\s*>/);
                      if (m && m.index !== undefined) {
                        emitBuf = emitBuf.slice(m.index + m[0].length);
                        inDSML = false;
                      } else {
                        // 还没看到闭合，整段丢弃（已经在 DSML 内部）
                        emitBuf = "";
                        break;
                      }
                    }
                  }
                  if (outSeg) {
                    roundContent += outSeg;
                    fullReply += outSeg;
                    // v60.4.4: 大 outSeg 切 80 字符小段再 emit，避免 DeepSeek/Vercel 上游
                    // 把整个回复打包成单个 SSE event（实测 1-2 chunk 现象），让前端有流式视觉
                    const MAX_CHUNK = 80;
                    if (outSeg.length > MAX_CHUNK) {
                      for (let i = 0; i < outSeg.length; i += MAX_CHUNK) {
                        controller.enqueue(sse("chunk", { delta: outSeg.slice(i, i + MAX_CHUNK) }));
                      }
                    } else {
                      controller.enqueue(sse("chunk", { delta: outSeg }));
                    }
                  }
                }
                if (delta?.reasoning_content) {
                  roundReasoning += delta.reasoning_content;
                  // v60.2: 思考流式 push 给前端，让用户看到"内心分析"实时进行
                  controller.enqueue(sse("analyst_chunk", { delta: delta.reasoning_content }));
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

        // ═══════════════════════════════════════════════════════════════════════
        // v60.2: 取消 Analyst+Writer 双 pass —— 单 LLM 同时流 reasoning_content + content
        // 用户在 thinking mode 下立即看到思考流式（analyst_chunk）+ 答案流式（chunk）
        // 数据来自上方 tool loop 已经流过的 content 和 reasoning_content
        // ═══════════════════════════════════════════════════════════════════════

        // v60.2: 单 LLM 流式分离已经在 tool loop 内完成 (reasoning + content 都流过了)
        // 下方旧 Analyst + Writer 块全删，只保留 followups + audit
        /* ──── 旧 Analyst pass (v60.1: 流式 markdown，不再 JSON) ────
        const analystSys = `你是【${sage.display} 的内心专家分析器】—— 不是表达者，是分析者。

你的唯一任务：基于工具数据 + RAG 召回的真实历史发言 + sage skill 文件，做 5 维度深度内心分析。

⚠️ 输出要求（每一维必须有以下 4 个具体抓手中的 3+ 个）：
1. **具体类比**："X 跟 Y 一个意思" / "类似当年 Z" / "跟 1990 年代日本万代是一码事"
2. **具体数字 + sanity check**：不只列 PE，要算"7 年回本 vs 国债 4% 哪个划算"
3. **具体竞争对手或反例**：不能空泛"竞争激烈"，得说"52TOYS / 名创优品 TOP TOY 为什么没打下来"
4. **段永平真实历史决策**："我 2002 年算的账是 X..." / "我拒绝百度因为 Y..."

✋ **禁止 mantra**："right business" 后必须跟为什么，"看十年"后必须跟具体推理。

输出格式（严格 Markdown 模板，不要 JSON，不要散文）：

## 商业模式 (business_essence)
- 一句话讲清：[≤30字]
- 跨行业类比：[X 跟 Y 一个意思，为什么相似，哪点不同]
- 护城河具体：[量化的护城河]
- 竞品检查：[列具体竞品 + 为什么打不过]

## 10 年视角 (ten_year_view)
- 10 年后还在吗：[凭什么]
- 历史类比案例：[万代/可乐/茅台/Funko 真实案例对照]
- 关键不确定性：[我无法预测的变量]

## 估值算账 (valuation_math)
- 当前数字：[PE/PB/FCF margin/ROE 等]
- 年化预期回报：[按当前价 + 增长假设，给百分比]
- vs 国债/其他持仓：[算账对比]
- Sanity check：[历史案例对照，如 苹果2002我算的账]

## 团队评价 (team_quality)
- CEO 具体评价：[做对了什么具体事，不是空泛说靠谱]
- 资本配置信号：[回购/分红/收购模式]
- 对比参照 CEO：[库克/丁磊/巴菲特 正例或反例]

## 能力圈边界 (circle_boundary)
- 我懂的部分：[具体说哪部分]
- 我不懂的部分：[具体说为什么不懂]
- stop doing list 触发：[触发了第几条就承认]

## 核心结论 + 引用
- 一句话结论：[给用户的最终建议]
- 真正支撑的 RAG 原文：[列 N，用 1,3,5 这种逗号分隔，最多 5 个]

═══════════════════════════════════════════════════════════════
工具数据：
${toolResultsBlock || "（本轮未调用工具）"}

RAG 召回（[原文 N] 编号供你选证据）：
${ragCtx}

Sage skill 核心：
${sageSkillBlock.slice(0, 3500)}`;

        let analystRaw = "";
        try {
          const ar = await fetch(`${LLM_BASE}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: LLM_MODEL,
              messages: [
                { role: "system", content: analystSys },
                { role: "user", content: `用户问题：${userMsg}\n\n现在做 5 维度深度分析。直接按 markdown 模板输出。` },
              ],
              max_tokens: 3000,
              temperature: 0.3,
              stream: true,  // v60.1: 流式
            }),
          });
          if (ar.ok && ar.body) {
            const reader = ar.body.getReader();
            const dec = new TextDecoder();
            let abuf = "";
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              abuf += dec.decode(value, { stream: true });
              const lines = abuf.split("\n");
              abuf = lines.pop() || "";
              for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith("data:")) continue;
                const p = t.slice(5).trim();
                if (p === "[DONE]") continue;
                try {
                  const j = JSON.parse(p);
                  const delta = j?.choices?.[0]?.delta?.content;
                  if (delta) {
                    analystRaw += delta;
                    // v60.1: 流式 push 给前端，让用户看到思考在进行
                    controller.enqueue(sse("analyst_chunk", { delta }));
                  }
                } catch {}
              }
            }
          }
        } catch (e: any) {
          console.error("Analyst error:", e?.message);
        }
        controller.enqueue(sse("analyst_done", { length: analystRaw.length }));

        // ──── Writer pass (stream) ────
        controller.enqueue(sse("phase", { name: "writer", message: `${sage.display} 落笔中...` }));

        const analystForWriter = analystRaw || "（Analyst 失败，请基于工具数据自行综合）";

        const writerSys = `${sageSkillBlock}

═══════════════════════════════════════════════════════════════
🎯 你刚才（内心）做了 5 维度深度分析（见 user msg 中的 markdown）
═══════════════════════════════════════════════════════════════

现在用 ${sage.display} 的口吻把这套分析**写成 5-7 段散文**。

⚠️ **必须保留**（违反即失败）：
- 每个"跨行业类比" / "历史类比案例" / "对比参照 CEO" —— 类比必须出现
- 每个"年化预期回报" / "Sanity check" —— 具体数字 + 算账必须保留
- 每个"竞品检查" —— 竞品名字必须提
- "我懂的部分" / "我不懂的部分" —— 边界要写清楚
- "stop doing list 触发" 触发了就承认

❌ 禁止简化成"右生意 + 看十年 + 本分"这种空 mantra
✅ 必须保留所有具体决策、数字、对比 —— 把每个 specific point 都翻译成散文

═══════════════════════════════════════════════════════════════
📎 引用规则（v55 + v60）
═══════════════════════════════════════════════════════════════
- markdown 末尾"真正支撑的 RAG 原文"字段给了你哪些 [原文 N] 可引用
- 你引用历史发言时，**只能用这个列表里的 N**
- 在对应句尾加 \`[原文 N]\`，前端会渲染成可点击 chip

═══════════════════════════════════════════════════════════════
🔁 收尾铁律
═══════════════════════════════════════════════════════════════
不要每次都用 "反正我是这么看的，对错我自己负责" 收尾。优先**直接以结论落停**，或换用 "看十年" / "本分" / "I'll be back" / 自嘲式。

═══════════════════════════════════════════════════════════════
RAG 引用池：
${ragCtx}`;

        // stream Writer
        let writerOk = false;
        try {
          const wr = await fetch(`${LLM_BASE}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: LLM_MODEL,
              messages: [
                { role: "system", content: writerSys },
                { role: "user", content: `用户问题：${userMsg}\n\n你的内心 5 维度深度分析（必须完整保留所有具体点）:\n\n${analystForWriter}\n\n现在用 ${sage.display} 的口吻写 5-7 段散文。每段 2-4 句，段间空行。保留所有具体类比、数字、决策、边界。` },
              ],
              max_tokens: 2500,
              temperature: 0.85,
              stream: true,
            }),
          });
          if (wr.ok && wr.body) {
            writerOk = true;
            const reader = wr.body.getReader();
            const dec = new TextDecoder();
            let wbuf = "", wemitBuf = "", winDSML = false;
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              wbuf += dec.decode(value, { stream: true });
              const lines = wbuf.split("\n");
              wbuf = lines.pop() || "";
              for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith("data:")) continue;
                const p = t.slice(5).trim();
                if (p === "[DONE]") continue;
                try {
                  const j = JSON.parse(p);
                  const delta = j?.choices?.[0]?.delta?.content;
                  if (delta) {
                    wemitBuf += delta;
                    let outSeg = "";
                    while (wemitBuf.length > 0) {
                      if (!winDSML) {
                        const m = wemitBuf.match(/<[^<>]{0,400}DSML[^<>]{0,400}tool_calls\s*>/);
                        if (m && m.index !== undefined) { outSeg += wemitBuf.slice(0, m.index); wemitBuf = wemitBuf.slice(m.index + m[0].length); winDSML = true; }
                        else { const lo = wemitBuf.lastIndexOf("<"), lc = wemitBuf.lastIndexOf(">"); const safe = lo > lc ? lo : wemitBuf.length; outSeg += wemitBuf.slice(0, safe); wemitBuf = wemitBuf.slice(safe); break; }
                      } else {
                        const m = wemitBuf.match(/<\/[^<>]{0,400}DSML[^<>]{0,400}tool_calls\s*>/);
                        if (m && m.index !== undefined) { wemitBuf = wemitBuf.slice(m.index + m[0].length); winDSML = false; }
                        else { wemitBuf = ""; break; }
                      }
                    }
                    if (outSeg) { fullReply += outSeg; controller.enqueue(sse("chunk", { delta: outSeg })); }
                  }
                } catch {}
              }
            }
          }
        } catch (e: any) {
          console.error("Writer error:", e?.message);
        }

        */
        // v60.4.5: 兜底升级 —— 如果 tool loop 没产出内容（duan+苹果 可复现），
        // 做一次真正的 retry：用 FAST_MODEL + 明确指令"现在写完整答案"。
        // 比 v60.2 的"请重试"假回答好很多。
        if (!fullReply.trim()) {
          try {
            const retryMessages = [
              ...messages,
              { role: "user", content: `（系统提示）请综合以上工具数据和你的内心思考，用 ${sage.display} 的口吻给用户写一段完整的回答（5-7 段散文，每段 2-4 句，段间空行）。不要再调工具。直接写。` },
            ];
            const rr = await fetch(`${LLM_BASE}/chat/completions`, {
              method: "POST",
              headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: LLM_FAST_MODEL,
                messages: retryMessages,
                max_tokens: 2000,
                temperature: 0.85,
                stream: true,
              }),
            });
            if (rr.ok && rr.body) {
              const rreader = rr.body.getReader();
              const rdec = new TextDecoder();
              let rbuf = "";
              const MAX_CHUNK = 80;
              while (true) {
                const { value, done: rdone } = await rreader.read();
                if (rdone) break;
                rbuf += rdec.decode(value, { stream: true });
                const rlines = rbuf.split("\n");
                rbuf = rlines.pop() || "";
                for (const line of rlines) {
                  const t = line.trim();
                  if (!t.startsWith("data:")) continue;
                  const p = t.slice(5).trim();
                  if (p === "[DONE]") continue;
                  try {
                    const j = JSON.parse(p);
                    const delta = j?.choices?.[0]?.delta?.content;
                    if (delta) {
                      fullReply += delta;
                      // 同 v60.4.4 切 80 字符段
                      if (delta.length > MAX_CHUNK) {
                        for (let i = 0; i < delta.length; i += MAX_CHUNK) {
                          controller.enqueue(sse("chunk", { delta: delta.slice(i, i + MAX_CHUNK) }));
                        }
                      } else {
                        controller.enqueue(sse("chunk", { delta }));
                      }
                    }
                  } catch {}
                }
              }
            }
          } catch (e: any) {
            console.error("Round 2 retry error:", e?.message);
          }
          // 还是空 → 最后的兜底字符串（远小于触发概率）
          if (!fullReply.trim()) {
            fullReply = "（本轮回答未生成，请重试。如果反复出现，可以尝试换个问法）";
            controller.enqueue(sse("chunk", { delta: fullReply }));
          }
        }

        // followups (v60.4: 切 FAST_MODEL，避免 done 前白等 5-10s)
        let followups: string[] = [];
        try {
          const fr = await fetch(`${LLM_BASE}/chat/completions`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: LLM_FAST_MODEL,
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

        // v55: 服务端 citation 校验 —— 剥除张冠李戴的 [原文 N]
        const audit = auditCitations(fullReply, quotes);
        if (audit.stripped.length > 0) {
          controller.enqueue(sse("citation_audit", { stripped: audit.stripped, kept: (audit.corrected.match(/\[原文\s*\d+\]/g) || []).length }));
        }
        controller.enqueue(sse("done", { followups, fullReply: audit.corrected, citationStrippedCount: audit.stripped.length }));
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
