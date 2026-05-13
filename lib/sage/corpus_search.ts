// lib/sage/corpus_search.ts
// v60.8.2: BM25/token-overlap 检索 sage 真实雪球语料，注入 LLM prompt
// 来源: public/sages-quotes/{duan-yongping, guan-wo-cai}.json
// 字段: high_quality_originals + deep_analysis_originals + by_stock + by_concept

interface RawQuote {
  id?: number;
  date?: string;
  text?: string;
  text_n?: string;
  kw?: string[];
  likes?: number;
  url?: string;
}

interface SageCorpus {
  slug: string;
  display: string;
  high_quality_originals?: RawQuote[];
  deep_analysis_originals?: RawQuote[];
  by_stock?: Record<string, RawQuote[]>;
  by_concept?: Record<string, RawQuote[]>;
}

export interface RelevantQuote {
  date: string;
  text: string;
  likes: number;
  url: string;
  score: number;
}

// 粤语→普通话简单归一（管哥发言用）
const HK_TO_M: Array<[string, string]> = [
  ["點解","为什么"],["嘅","的"],["咗","了"],["喺","在"],["啲","些"],["冇","没"],
  ["畀","给"],["俾","给"],["咁","这么"],["咩","什么"],["邊","哪"],["唔","不"],
  ["睇","看"],["識","会"],
];
function normalize(s: string): string {
  if (!s) return "";
  for (const [h, m] of HK_TO_M) s = s.split(h).join(m);
  return s;
}

const STOPWORDS = new Set("的了是在我你他她它们也都这那有不就要把和与及与对从被".split(""));

function tokenize(q: string): string[] {
  const n = normalize(q);
  const segs = n.split(/[\s,，。！？!?、:：；;\(\)（）"'""''「」『』]+/).filter(Boolean);
  const t = new Set<string>();
  for (const s of segs) {
    if (s.length >= 2 && !STOPWORDS.has(s)) t.add(s);
    if (/^[一-龥]+$/.test(s)) {
      // bigram
      for (let i = 0; i < s.length - 1; i++) {
        const bi = s.slice(i, i + 2);
        if (!STOPWORDS.has(bi)) t.add(bi);
      }
      // trigram
      for (let i = 0; i < s.length - 2; i++) t.add(s.slice(i, i + 3));
    } else {
      t.add(s);
    }
  }
  return [...t];
}

// 加载 sage corpus（edge runtime: fetch public/ asset）
async function loadCorpus(sage_id: string, req: { url: string }): Promise<SageCorpus | null> {
  try {
    const u = new URL(`/sages-quotes/${sage_id}.json`, req.url);
    const r = await fetch(u.toString(), { cache: "force-cache" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** 给一个 sage corpus 中所有 quote 打分（token 命中 + by_stock/by_concept 加权） */
function scoreQuote(q: RawQuote, qTokens: string[], stockHint: string | null): number {
  const txt = normalize((q.text_n || q.text || "").toLowerCase());
  const kwSet = new Set((q.kw || []).map(k => k.toLowerCase()));
  let score = 0;
  for (const t of qTokens) {
    const lt = t.toLowerCase();
    if (kwSet.has(lt)) score += 3;
    if (txt.includes(lt)) score += 1;
  }
  // 股票名/代码命中加权
  if (stockHint && txt.includes(stockHint.toLowerCase())) score += 5;
  // likes 加权（log10 增长）
  const likes = q.likes || 0;
  if (likes > 100) score += Math.log10(likes) * 0.5;
  return score;
}

/** 检索 sage 历史发言 top N（按相关性 + 点赞） */
export async function searchSagePosts(
  sage_id: string,
  userQuery: string,
  stockName: string | null,
  req: { url: string },
  topN = 5
): Promise<RelevantQuote[]> {
  const corpus = await loadCorpus(sage_id, req);
  if (!corpus) return [];

  const qTokens = tokenize(userQuery + " " + (stockName || ""));
  const stockHint = stockName ? normalize(stockName) : null;

  // 候选池：deep_analysis_originals + high_quality_originals + by_stock 命中
  const seen = new Set<number>();
  const pool: RawQuote[] = [];
  const push = (arr?: RawQuote[]) => {
    for (const q of arr || []) {
      if (q.id && !seen.has(q.id)) { seen.add(q.id); pool.push(q); }
    }
  };
  push(corpus.deep_analysis_originals);
  push(corpus.high_quality_originals);
  if (stockHint && corpus.by_stock) {
    for (const k of Object.keys(corpus.by_stock)) {
      if (k.toLowerCase().includes(stockHint.toLowerCase()) || stockHint.toLowerCase().includes(k.toLowerCase())) {
        push(corpus.by_stock[k]);
      }
    }
  }

  const scored = pool
    .map(q => ({
      date: q.date || "",
      text: q.text || "",
      likes: q.likes || 0,
      url: q.url || "",
      score: scoreQuote(q, qTokens, stockHint),
    }))
    .filter(q => q.score > 0 && q.text.length > 30) // 至少有命中且非超短
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return scored;
}

/** 格式化为 prompt 注入块 */
export function formatHistoricalPosts(posts: RelevantQuote[], maxCharsEach = 300): string {
  if (!posts.length) return "（无相关历史发言）";
  return posts.map((p, i) =>
    `[${p.date} 赞${p.likes}] ${p.text.slice(0, maxCharsEach)}${p.text.length > maxCharsEach ? "..." : ""}`
  ).join("\n\n");
}
