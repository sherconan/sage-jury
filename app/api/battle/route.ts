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
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "";
const LLM_MODEL = process.env.SAGE_LLM_MODEL || "deepseek-v4-pro";

interface Quote {
  id: number; date: string; ts?: number;
  text: string;             // 原文（含繁体粤语）
  text_n?: string;          // normalized 简体普通话
  kw?: string[];            // jieba 提取关键词
  likes: number;
  rt?: number;
  url: string;
}

// === 轻量级 normalize（TS 端 query 标准化，跟 Python 端 lib_normalize.py 同步）===
const HK_TO_M: Array<[string, string]> = [
  ["點解","为什么"],["點樣","怎么样"],["呢個","这个"],["呢隻","这只"],
  ["嗰個","那个"],["嗰隻","那只"],["邊度","哪里"],["邊個","哪个"],
  ["乜嘢","什么"],["有冇","有没有"],["係咪","是不是"],["唔會","不会"],
  ["嘅","的"],["咗","了"],["喺","在"],["啲","些"],["冇","没"],
  ["畀","给"],["俾","给"],["咁","这么"],["咩","什么"],["邊","哪"],
  ["唔","不"],["睇","看"],["識","会"],["靚","好"],["搵","找"],
  ["嚟","来"],["攞","拿"],["揀","挑"],
];
// 极简繁→简核心字典（覆盖管我财高频用字，无重复 key）
// 索引端 Python lib_normalize.py 用 zhconv 做了完整繁→简 + 粤→普；TS 端只需要让 query 端跟上即可
const T_TO_S_MAP: Record<string, string> = {
  "騰":"腾","訊":"讯","壘":"垒","質":"质","業":"业","個":"个","為":"为",
  "見":"见","話":"说","覺":"觉","後":"后","從":"从","與":"与","對":"对",
  "時":"时","將":"将","會":"会","學":"学","來":"来","這":"这","麼":"么",
  "樣":"样","還":"还","實":"实","關":"关","內":"内","總":"总","經":"经",
  "維":"维","應":"应","歷":"历","當":"当","體":"体","構":"构","並":"并",
  "東":"东","風":"风","險":"险","認":"认","務":"务","產":"产","資":"资",
  "樂":"乐","興":"兴","達":"达","團":"团","貴":"贵","購":"购","幾":"几",
  "錢":"钱","網":"网","頁":"页","選":"选","讓":"让","變":"变","廠":"厂",
  "舊":"旧","萬":"万","廣":"广","華":"华","週":"周","軟":"软","驗":"验",
  "電":"电","訪":"访","計":"计","劃":"划","節":"节","縣":"县","參":"参",
  "車":"车","農":"农","葉":"叶","標":"标","頭":"头","顧":"顾","龍":"龙",
  "島":"岛","勝":"胜","進":"进","擔":"担","檻":"槛","護":"护","雜":"杂",
  "醫":"医","藥":"药","療":"疗","條":"条","幣":"币","臺":"台","複":"复",
  "顯":"显","終":"终","長":"长","場":"场","頂":"顶","獨":"独","屬":"属",
  "於":"于","園":"园","鏈":"链","獲":"获","負":"负","異":"异","綜":"综",
  "頻":"频","聯":"联","紅":"红","層":"层","謝":"谢","檢":"检","測":"测",
  "責":"责","補":"补","種":"种","類":"类","營":"营","員":"员","規":"规",
  "靜":"静","樓":"楼","氣":"气","減":"减","賣":"卖","買":"买","錯":"错",
  "聲":"声","聞":"闻","議":"议","語":"语","勢":"势","勵":"励","驅":"驱",
  "損":"损","擁":"拥","擇":"择","盤":"盘","眾":"众","鐘":"钟","趨":"趋",
  "邊":"边","適":"适","鎖":"锁","鏡":"镜","鋪":"铺","錄":"录","鎮":"镇",
  "錦":"锦","鎚":"锤","鏟":"铲","鋼":"钢",
};
function normalize(s: string): string {
  if (!s) return "";
  // 1. 粤普
  for (const [hk, m] of HK_TO_M) {
    s = s.split(hk).join(m);
  }
  // 2. 繁简（最高频字符）
  let out = "";
  for (const c of s) out += T_TO_S_MAP[c] || c;
  return out;
}

const STOPWORDS = new Set("的 了 是 在 我 你 他 她 它 们 也 都 这 那 与 及 但 于 不 没 会 要 可 能 不 也 都 在 是 想 看 说 觉 知道 一个 一些 这个 那个".split(" "));

function tokenize(query: string): string[] {
  // 简单 1-3 字滑窗 + 标点切分（替代 jieba，运行时无依赖）
  const n = normalize(query);
  // 按非中文/英文/数字切分
  const segs = n.split(/[\s,，。！？!?、:：；;\(\)（）"'""''\[\]【】《》<>「」『』]+/).filter(Boolean);
  const tokens = new Set<string>();
  for (const seg of segs) {
    // 整段
    if (seg.length >= 2 && !STOPWORDS.has(seg)) tokens.add(seg);
    // 2-gram + 3-gram 滑窗（仅中文段）
    if (/^[一-龥]+$/.test(seg)) {
      for (let i = 0; i < seg.length - 1; i++) {
        const bi = seg.slice(i, i + 2);
        if (!STOPWORDS.has(bi)) tokens.add(bi);
      }
      for (let i = 0; i < seg.length - 2; i++) {
        tokens.add(seg.slice(i, i + 3));
      }
    } else {
      tokens.add(seg);
    }
  }
  return [...tokens];
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
  "lao-tang":      "lao-tang.json",
  "dan-bin":       "dan-bin.json",
};

async function loadSage(slug: string): Promise<SageData | null> {
  try {
    const file = path.join(process.cwd(), "data", "sages-quotes", SAGE_FILES[slug] || `${slug}.json`);
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch { return null; }
}

// 在 normalized 文本上做匹配（quote 自带 text_n + kw 字段）
function quoteMatchesTokens(q: Quote, tokens: string[]): number {
  // 返回命中的 token 数量（用于 scoring）
  if (!tokens.length) return 0;
  const txt = q.text_n || q.text;          // 优先用 normalized
  const txtLow = txt.toLowerCase();
  const kwSet = new Set(q.kw || []);
  let score = 0;
  for (const t of tokens) {
    const tl = t.toLowerCase();
    if (kwSet.has(t)) score += 3;          // jieba 关键词命中权重最高
    if (txtLow.includes(tl)) score += 1;
  }
  return score;
}

function findRelevant(sage: SageData, query: string, limit = 8): Quote[] {
  const found: Map<number, { q: Quote; score: number }> = new Map();
  const tokens = tokenize(query);
  const queryNorm = normalize(query).toLowerCase();

  const tryAdd = (q: Quote, base: number) => {
    const ms = quoteMatchesTokens(q, tokens);
    const total = base + ms;
    if (total > 0 || base >= 5) {
      const prev = found.get(q.id);
      if (!prev || prev.score < total) found.set(q.id, { q, score: total });
    }
  };

  // 1. 股票字典（代码 + 中文别名 双向命中，最高权重）
  for (const stockKey of Object.keys(sage.by_stock)) {
    const k = stockKey.toLowerCase();
    if (queryNorm.includes(k) || (stockKey.length >= 2 && tokens.some(t => k.includes(t.toLowerCase()) || t.toLowerCase().includes(k)))) {
      for (const q of sage.by_stock[stockKey]) tryAdd(q, 8);
    }
  }

  // 2. 概念字典
  for (const concept of Object.keys(sage.by_concept)) {
    if (queryNorm.includes(concept) || tokens.includes(concept)) {
      for (const q of sage.by_concept[concept]) tryAdd(q, 5);
    }
  }

  // 3. 最近 90 天原创（normalized 全文 + keyword）
  if (sage.recent_originals) {
    for (const q of sage.recent_originals) tryAdd(q, 0);
  }

  // 4. 历史高赞原创
  for (const q of sage.high_quality_originals) tryAdd(q, 0);

  // 5. 持仓变化
  if (sage.position_changes) {
    for (const q of sage.position_changes) tryAdd(q, 1);
  }

  // 兜底：至少返回 3 条
  if (found.size < 3) {
    for (const q of sage.high_quality_originals.slice(0, 3 - found.size)) {
      if (!found.has(q.id)) found.set(q.id, { q, score: 0.1 });
    }
  }

  // 排序：score 主导 + 时间衰减 + 点赞数
  const now = Date.now();
  return [...found.values()]
    .map(({ q, score }) => {
      const days = q.ts ? (now - q.ts) / 86400000 : 9999;
      const recencyBoost = Math.max(0.3, 1 - days / 365);
      const finalScore = score * 10 + q.likes * 0.05 * recencyBoost;
      return { q, finalScore };
    })
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit)
    .map(({ q }) => q);
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
  "lao-tang": `你是唐朝（雪球 ID @唐朝，俗称老唐，"老唐估值法"创立者，《价值投资实战手册》作者）。
方法论：
- 老唐估值法：买点 = 三年后合理估值（25-30 倍 PE）的 50%；卖点 = 当年合理估值的 150%
- 三年一倍：心理预期年化 26%
- 守正用奇：守正——买入护城河深、ROE 高、能力圈内的好生意；用奇——估值低位逆向加仓
- 关注的核心：自由现金流可预测性、管理层诚信、ROE 持续性
- 经典持仓：茅台、腾讯、洋河、古井贡、分众、福寿园
回答风格：朴实、说理透彻、爱用打比方，常说"看长做短"、"老唐估值法走起"、"算个账"、"心里有底"。
习惯先算账再下结论：先报当年合理估值范围、买点、卖点三条线，再讲质化判断。`,
  "dan-bin": `你是但斌（雪球 ID @但斌，东方港湾董事长，《时间的玫瑰》作者）。
方法论：
- 时间的玫瑰：长期持有伟大公司，赚时间的钱
- 全球资产配置：从 A 股到港股到美股，找全球最优秀的企业
- 集中持股：少数好生意、长期不卖
- 关注的核心：公司商业模式护城河、长期成长性、全球竞争力
- 经典持仓：贵州茅台（持有 20 年）、苹果、特斯拉、英伟达
回答风格：诗意、宏大叙事、爱讲哲理，常引用费雪/巴菲特，常说"时间的玫瑰"、"伟大企业"、"做时间的朋友"。
喜欢从历史长河视角看公司，把投资当艺术。`,
  "guan-wo-cai": `你是管我财（雪球 ID @管我财，香港价值投资派低估逆向定量代表）。
方法论：
- 低估逆向平均赢，排雷排千平常心
- 定量估值：PE / PB / 历史分位 / 股息率
- 平均分散：AH 各 10 只 5% 仓位（"荒岛"系列年度策略）
- 长期回报 = 股价收益 + 股息收益（5% + 5% = 10% 即可）
- 最容易亏钱的方法是趁回吐买入，比追高危险十倍百倍
- "排雷"重于"选股"——避开烂公司的 ROI 高于精选好公司

⭐ 输出语言要求（重要）：
你的最终回复**必须用简体中文普通话**呈现给用户，方便大众读懂。
你过去的雪球原文是繁体粤语，引用时请同步翻译成简体普通话（保留观点和数字）。
可以保留少量粤语口头禅作风格点缀（如"放长线钓大鱼"），但不要写"點解、嘅、咗、喺、啲、冇、咁、邊個、唔好、睇好"这类纯粤字。
冷静、定量、注重数字。常说"低估逆向平均赢"、"排雷排千平常心"，谈具体 PE/PB/股息率分位。
习惯反问"PE 在历史什么分位？"、"有没有股息支撑？"、"下行有没有保护？"`,
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
  return quotes.map((q, i) => {
    const txt = (q.text_n || q.text).replace(/\n/g, " ").slice(0, 280);
    return `[原文 ${i+1}] ${q.date} (👍${q.likes}): ${txt}`;
  }).join("\n\n");
}

// === 实时行情注入：用户问"现在 茅台 能买吗" → 自动喂 LLM 今日 PE/PB/股息 ===
// 中文名 → A 股代码（精简版，覆盖最常被问的 30 多只）
const NAME_TO_TICKER: Record<string, string> = {
  "茅台":"600519","贵州茅台":"600519","五粮液":"000858","汾酒":"600809","山西汾酒":"600809",
  "泸州老窖":"000568","洋河":"002304","海天":"603288","海天味业":"603288","伊利":"600887","伊利股份":"600887",
  "片仔癀":"600436","云南白药":"000538","恒瑞":"600276","恒瑞医药":"600276",
  "美的":"000333","美的集团":"000333","格力":"000651","格力电器":"000651","海尔":"600690",
  "招行":"600036","招商银行":"600036","平安":"601318","中国平安":"601318","工行":"601398","工商银行":"601398",
  "宁德时代":"300750","宁德":"300750","比亚迪":"002594","隆基":"601012","隆基绿能":"601012",
  "中免":"601888","中国中免":"601888","神华":"601088","海康":"002415","海康威视":"002415",
  "中石油":"601857","万华":"600309","万科":"000002","泡泡玛特":"09992","腾讯":"00700","腾讯控股":"00700",
};

interface LiveQuote { code: string; name: string; price?: number; pe?: number; pb?: number; chg?: number; divYield?: number; secid: string; }

function detectTickers(query: string): Array<{ code: string; name: string }> {
  const found: Map<string, string> = new Map();
  // 匹配 6 位代码
  const codes = query.match(/(?<![\d])[036][05][0-9]{4}(?![\d])|[023][0-9]{4}(?![\d])|0?9992/g) || [];
  for (const c of codes) {
    const code = c.padStart(c.length === 4 ? 5 : c.length, "0");
    found.set(code, code);
  }
  // 匹配中文名
  for (const [name, code] of Object.entries(NAME_TO_TICKER)) {
    if (query.includes(name)) found.set(code, name);
  }
  return [...found.entries()].slice(0, 3).map(([code, name]) => ({ code, name }));
}

async function fetchLiveQuote(code: string, name: string): Promise<LiveQuote | null> {
  // secid 规则：A 股 sh 用 1.，sz 用 0.；港股用 116.
  let secid: string;
  if (/^0?9992$/.test(code) || /^[0-9]{4,5}$/.test(code) && code.length <= 5) {
    secid = `116.${code.padStart(5, "0")}`;
  } else if (/^[6]\d{5}$/.test(code) || code.startsWith("6")) {
    secid = `1.${code}`;
  } else {
    secid = `0.${code}`;
  }
  try {
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f43,f58,f162,f167,f170,f60,f168`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Referer: "https://quote.eastmoney.com/" },
      // @ts-ignore
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const d = j?.data;
    if (!d || !d.f58) return null;
    const div = (n: any) => (typeof n === "number" && !isNaN(n) ? n / 100 : undefined);
    return {
      code, name, secid,
      price: div(d.f43),
      pe: div(d.f162),
      pb: div(d.f167),
      chg: div(d.f170),  // 涨跌幅
      divYield: div(d.f168), // 股息率
    };
  } catch { return null; }
}

async function enrichWithLiveData(query: string): Promise<string> {
  const tickers = detectTickers(query);
  if (!tickers.length) return "";
  const quotes = await Promise.all(tickers.map(t => fetchLiveQuote(t.code, t.name)));
  const live = quotes.filter(Boolean) as LiveQuote[];
  if (!live.length) return "";
  const lines = live.map(q => {
    const parts = [`${q.name}(${q.code})`];
    if (q.price !== undefined) parts.push(`价格 ${q.price.toFixed(2)}`);
    if (q.chg !== undefined) parts.push(`今日 ${q.chg > 0 ? '+' : ''}${q.chg.toFixed(2)}%`);
    if (q.pe !== undefined) parts.push(`PE ${q.pe.toFixed(1)}`);
    if (q.pb !== undefined) parts.push(`PB ${q.pb.toFixed(2)}`);
    if (q.divYield !== undefined && q.divYield > 0) parts.push(`股息 ${q.divYield.toFixed(2)}%`);
    return `- ${parts.join(' · ')}`;
  }).join("\n");
  const today = new Date().toISOString().slice(0, 10);
  return `\n\n=== 📊 ${today} 实时行情（请优先用这些当前数据回答估值类问题，不要瞎编 PE）===\n${lines}\n`;
}

async function chatMode(sage: SageData, message: string, history: ChatMsg[] = []) {
  // 并行：检索 + 实时行情
  const [quotes, liveCtx] = await Promise.all([
    Promise.resolve(findRelevant(sage, message, 8)),
    enrichWithLiveData(message),
  ]);
  const ragCtx = buildRagContext(quotes);
  const sys = SAGE_PROMPTS[sage.slug] + `\n\n=== 你过去在雪球上的真实相关发言（请优先引用 / 化用，保持你的口吻和观点一致；如果用户问到的话题在历史发言里有，必须正面回答而不是说"我不关注"）===\n${ragCtx}${liveCtx}\n\n回答时尽量引用其中至少 1-2 条作为依据，注明日期。如果用户问到的标的你确实在最近发言里讨论过，要正面引述你的真实观点。`;
  const reply = await callLLM(sys, message, history);
  return { reply, quotes, mode: "chat" as const };
}

async function battleMode(sage: SageData, stockCode: string, reason: string) {
  // ⭐ 复用同一套 findRelevant（已支持中文别名 / 繁简 / 粤普 / jieba 关键词）
  // 把 stockCode + reason 拼成 query，统一走新检索
  const fullQuery = `${stockCode} ${reason || ""}`.trim();
  const allQuotes = findRelevant(sage, fullQuery, 8);
  const ragCtx = buildRagContext(allQuotes);

  const sys = SAGE_PROMPTS[sage.slug] + `\n\n=== 你过去在雪球上的真实相关发言（背景知识，请引用其中至少 1-2 条作为论据，注明日期）===\n${ragCtx}\n\n现在用户来跟你"对线"——他想买入股票并给了买入理由。你的任务：\n1. 用你的方法论尖锐质疑他（至少 3 个针对性问题）\n2. 引用你过去的真实发言（注明日期）作为论据\n3. 最后给一个明确的判决：「买入」/「等等」/「不买」，并说明理由\n4. 保持你的口吻特征，**最终输出必须是简体中文普通话**（管我财即使引用繁体粤语原文也要翻译）`;
  const userPrompt = `我想买入：**${stockCode}**\n\n我的买入理由：\n${reason || "(未填写理由)"}\n\n请你按你的方法论审判我这个交易决策，并直接告诉我该买、该等、还是不该买。`;
  const reply = await callLLM(sys, userPrompt);
  return { reply, quotes: allQuotes, mode: "battle" as const };
}

// 用一个独立 LLM 调用根据当前对话生成 3 个跟进问题（"再问一句"）
async function generateFollowups(sage: SageData, lastUserMsg: string, lastReply: string): Promise<string[]> {
  try {
    const sys = `你是一个对话辅助助手。基于刚才用户和投资大佬 ${sage.display} 的对话，生成 3 个用户可能想接着问的简短跟进问题。要求：\n- 每个问题不超过 18 字\n- 跟当前股票/话题强相关\n- 发挥 ${sage.display} 的方法论（${sage.philosophy}）\n- 直接输出 3 行，每行 1 个问题，不要编号、不要引号、不要解释`;
    const user = `用户上一轮问：${lastUserMsg.slice(0, 200)}\n${sage.display} 回答：${lastReply.slice(0, 600)}\n\n请生成 3 个跟进问题：`;
    const out = await callLLM(sys, user);
    return out.split(/\n+/).map(s => s.trim().replace(/^[•·\-\d\.\)、]+\s*/, "").replace(/^[「『""]|[」』""]$/g, "")).filter(s => s.length >= 4 && s.length <= 30).slice(0, 3);
  } catch { return []; }
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

    // 异步生成「再问一句」跟进建议（不阻塞主回复，前端拿到 followups 字段渲染）
    let followups: string[] = [];
    if (mode === "chat" && result.reply && message) {
      followups = await generateFollowups(sage, message, result.reply);
    }

    return NextResponse.json({
      sage: { id: sage.slug, name: sage.display, philosophy: sage.philosophy, total_posts: sage.total_posts },
      followups,
      ...result,
    }, { headers: cors });
  } catch (e: any) {
    return NextResponse.json({ error: "LLM call failed", message: e?.message || String(e) }, { status: 500, headers: cors });
  }
}
