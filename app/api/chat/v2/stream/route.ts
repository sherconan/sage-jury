// POST /api/chat/v2/stream — v60.8.2 两阶段架构 + 历史发言注入 + 多市场数据
//
// Phase 1 (Python-端 orchestrator):
//   - extract ticker (A/HK/US) from user msg
//   - 并行 fetch: 行情 + PE 分位 + 财务 + 派息 → typed StockFactsTyped
//   - 检索 sage 雪球 corpus top 3-5 条相关历史发言
//   - 5 维 deterministic 评分 → verdict
//
// Phase 2 (LLM 只写 voice):
//   - 极短 prompt + 12 voice few-shot + facts JSON + 历史发言注入
//   - 80-200 字 sage-voice 输出
//   - 不调任何工具

import { NextRequest } from "next/server";
import { DUAN_YONGPING_SAMPLES, GUAN_WO_CAI_SAMPLES, formatVoiceSamples } from "@/lib/sage/voice_samples";
import { resolveTicker, gatherFacts, type StockFactsTyped, type Ticker } from "@/lib/sage/stock_tools";
import { searchSagePosts, formatHistoricalPosts, type RelevantQuote } from "@/lib/sage/corpus_search";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "***DEEPSEEK_KEY_REMOVED***";
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

// ============ 5 维评分 ============
interface DimScore { score: number; pass: boolean; note: string; }
interface SageVerdict {
  sage: 'duan-yongping' | 'guan-wo-cai';
  dims: Record<string, DimScore>;
  signal: 'bullish' | 'bearish' | 'neutral' | 'out_of_circle';
  confidence: number;
}

const DUAN_CIRCLE = ["茅台","五粮液","苹果","AAPL","网易","NTES","腾讯","00700","拼多多","PDD","泡泡玛特","09992","Costco","可口可乐","美的","格力","海天","伯克希尔","BRK"];
const DUAN_OUT = ["生物医药","光伏","新能源车","搜索","百度","BIDU","煤炭","钢铁","周期","隆基"];
const GUAN_PORTFOLIO = ["招行","招商银行","工行","工商银行","建行","中行","腾讯","00700","江南布衣","03306","物管","首都机场","00694","北京控股"];

function scoreDuan(facts: StockFactsTyped | null, userMsg: string): SageVerdict {
  const dims: Record<string, DimScore> = {};
  const fullText = userMsg + " " + (facts?.ticker.name || "") + " " + (facts?.ticker.code || "");
  const inCircle = DUAN_CIRCLE.some(k => fullText.includes(k));
  const outCircle = DUAN_OUT.some(k => fullText.includes(k));

  dims.circle = { score: outCircle?0:inCircle?5:3, pass: !outCircle,
    note: outCircle?"明显能力圈外（周期/医药/光伏）": inCircle?"在已表态过的能力圈": "未明确表态，需谨慎" };

  if (facts?.pe_ttm && facts.pe_ttm > 0) {
    const pe = facts.pe_ttm;
    dims.business = { score: pe<8||pe>80?2:pe<15||pe>50?3:4, pass: pe<80,
      note: `PE-TTM ${pe.toFixed(1)} ${pe<15?"(便宜但生意可能一般)":pe>50?"(贵但反映成长)":"(中性)"}` };
  } else dims.business = { score: 0, pass: false, note: "无 PE 数据" };

  if (facts?.roe_pct !== undefined) {
    const roe = facts.roe_pct;
    dims.team = { score: roe>15?5:roe>10?3:1, pass: roe>5,
      note: `ROE ${roe.toFixed(1)}% ${roe>15?"(段永平喜欢长期 ROE>15%)":roe<5?"(差，效率低)":"(中性)"}` };
  } else dims.team = { score: 3, pass: true, note: "无 ROE 数据" };

  if (facts?.pe_ttm && facts.pe_ttm > 0) {
    const ey = 100/facts.pe_ttm;
    dims.price = { score: ey>8?4:ey>5?3:ey>3?2:1, pass: ey>3,
      note: `Earnings Yield ${ey.toFixed(1)}% vs 国债 ~3.5%` };
  } else dims.price = { score: 0, pass: false, note: "无 PE" };

  const red: string[] = [];
  if (outCircle) red.push("能力圈外");
  if (facts?.pe_ttm && facts.pe_ttm > 80) red.push("PE > 80 讲故事嫌疑");
  dims.stop_doing = { score: red.length===0?5:red.length===1?2:0, pass: red.length===0,
    note: red.length?"触发: "+red.join(", "):"无明显 stop doing" };

  const avg = (dims.circle.score+dims.business.score+dims.team.score+dims.price.score+dims.stop_doing.score)/5;
  const signal: SageVerdict['signal'] = outCircle?"out_of_circle":avg>=3.5?"bullish":avg>=2.5?"neutral":"bearish";
  return { sage: "duan-yongping", dims, signal, confidence: Math.round(avg*20) };
}

function scoreGuan(facts: StockFactsTyped | null, userMsg: string): SageVerdict {
  const dims: Record<string, DimScore> = {};
  const fullText = userMsg + " " + (facts?.ticker.name || "") + " " + (facts?.ticker.code || "");

  if (facts?.pe_pct_5y !== undefined) {
    const p = facts.pe_pct_5y;
    dims.position = { score: p>80?0:p>60?2:p>30?4:5, pass: p<80,
      note: `PE 5 年分位 ${p.toFixed(0)}% ${p<30?"(低估区)":p>80?"(高估，立刻没兴趣)":"(中性)"}` };
  } else if (facts?.pe_ttm) {
    dims.position = { score: 3, pass: true, note: `PE ${facts.pe_ttm.toFixed(1)} (无分位)` };
  } else dims.position = { score: 0, pass: false, note: "无 PE" };

  const red: string[] = [];
  if (facts?.pe_ttm && facts.pe_ttm > 100) red.push("PE > 100 极端");
  if (facts?.ticker.market === 'HK' && (facts?.dividend_yield_pct ?? 0) < 0.5 && (facts?.pe_ttm ?? 0) > 25)
    red.push("港股低股息高 PE 类（管哥不放心）");
  if (facts?.net_income_billion !== undefined && facts.net_income_billion < 0)
    red.push("净利亏损");
  dims.landmine = { score: red.length===0?4:1, pass: red.length===0,
    note: red.length?"触发: "+red.join(", "):"无明显排雷" };

  if (facts?.dividend_yield_pct !== undefined) {
    const dy = facts.dividend_yield_pct;
    dims.dividend = { score: dy>=5?5:dy>=3?3:dy>=1?2:0, pass: dy>=1,
      note: `股息率 ${dy.toFixed(2)}% ${dy>=5?"(打底过关)":dy<1?"(几乎无股息)":"(中等)"}` };
  } else dims.dividend = { score: 0, pass: false, note: "无股息数据" };

  if (facts?.roe_pct !== undefined) {
    const roe = facts.roe_pct;
    dims.stability = { score: roe>15?5:roe>10?4:roe>5?3:1, pass: roe>5,
      note: `ROE ${roe.toFixed(1)}% ${roe>10?"(稳态可)":roe<5?"(差)":"(中等)"}` };
  } else if (facts?.pb_mrq) {
    const pb = facts.pb_mrq;
    dims.stability = { score: pb<1?5:pb<2?4:pb<5?3:1, pass: pb<10,
      note: `PB ${pb.toFixed(2)} ${pb<1?"(破净低估)":pb<2?"(便宜稳健)":"(中等以上)"}` };
  } else dims.stability = { score: 3, pass: true, note: "无 PB/ROE" };

  const inPort = GUAN_PORTFOLIO.some(k => fullText.includes(k));
  dims.island = { score: inPort?5:3, pass: true,
    note: inPort?"在管哥过去重点关注/持仓池":"未明确表态" };

  const avg = (dims.position.score+dims.landmine.score+dims.dividend.score+dims.stability.score+dims.island.score)/5;
  const signal: SageVerdict['signal'] = (dims.position.score===0 && facts?.pe_pct_5y && facts.pe_pct_5y>80)?"bearish":avg>=3.5?"bullish":avg>=2.5?"neutral":"bearish";
  return { sage: "guan-wo-cai", dims, signal, confidence: Math.round(avg*20) };
}

// ============ LLM Voice Prompt (极短 + facts + 历史发言) ============
function buildVoicePrompt(
  sage_id: 'duan-yongping' | 'guan-wo-cai',
  userMsg: string,
  facts: StockFactsTyped | null,
  verdict: SageVerdict | null,
  historicalPosts: RelevantQuote[]
): { system: string; user: string } {
  const isDuan = sage_id === "duan-yongping";
  // v60.8.3: voice samples 删了不再注入 system — historicalPosts 块已足够提供语气学习，
  // 再注入 voice 会让 LLM 抄历史内容（违反"用今天数据现场推理"原则）
  void DUAN_YONGPING_SAMPLES; void GUAN_WO_CAI_SAMPLES; void formatVoiceSamples; // keep imports for type

  const frameworkBlock = isDuan ? `
# 段永平的分析逻辑（必须用今天数据按这 5 问现场推理，不是抄历史）

每次问到"X 能不能买"，段永平脑子里走这 5 问，每问都要用**今天的数据**给答案，绝不空谈：

1. **能力圈**：这门生意一句话能说清怎么赚钱吗？说不清直接"不懂"，不硬答
2. **商业模式 (right business)**：用今天数据看 — 用户为什么回来？10 年后还在吗？最容易死的方式是什么？毛利稳吗？
3. **团队 (right people)**：管理层讲不讲大话？回购+分红信号？
4. **价格 (right price，第三位)**：用**今天 PE / 股息率 / FCF** vs 10 年期国债 4% 比，年化预期是否值得？必须算账！
5. **stop doing**：是不是杠杆股 / 讲故事股 / 夕阳行业？触发就直接放弃

# ✅ 你（段永平）的独占元素
- 地点："加州后院"、"圆石滩"、"Westfield 门店"
- 招牌句："right business / right people / right price"、"I'll be back!"、"本分"、"看十年"、"stop doing list"、"千万别用 Margin 哈"
- 持仓："苹果（2002+）"、"网易（2001+）"、"拒绝百度"、"神华→泡泡玛特换仓"

# 🚨 管我财专属，你绝不使用
- ❌ "茶餐厅"、"在香港"（你在加州不在香港）
- ❌ "放长线钓大鱼"、"5% 股息打底"、"看分位不看 K 线"、"排雷胜选股"（管哥 mantra）
- ❌ "招行长持"、"工行"、"江南布衣"、"首都机场清仓"、"物管"（管哥持仓）
` : `
# 管我财的分析逻辑（必须用今天数据按这 5 步现场推理，不是抄历史）

每次问到"X 能不能买"，管哥脑子里走这 5 步，每步都要用**今天的数据**说话：

1. **价位**：今天 PE / PB / 股息率在历史什么分位？分位 > 80% 直接没兴趣
2. **排雷**：今天 ROE / 负债 / 现金流 / 商誉，任一异常一票否决
3. **股息安全垫**：今天股息率有 5%+ 吗？没有 → 下行没保护
4. **商业稳态**：今天 ROE / 行业第一第二、可预测吗？
5. **荒岛测试**：一年不能换还能拿吗？拿不住 → 仓位太重

# 你的身份独占元素（其他 sage 不会这么说）
- 地点/生活：在香港、茶餐厅、现场跑门店调研（首都机场免税店、江南布衣店）
- 招牌口头：低估逆向平均赢、排雷胜选股、5% 股息打底、5% + 5% = 10% 年化、放长线钓大鱼、看分位不看 K 线、荒岛 X 年组合、贵就是贵 再好都不动
- 持仓案例：招行/工行长持、江南布衣高股息、首都机场清仓（现场看免税被餐饮挤）、北京控股、物管行业
- 风格：港式口语、爱讲数字但不列表

# 🚨🚨🚨 段永平专属，你绝不使用（写出立刻失败）
- ❌ "圆石滩"（那是段永平在加州的高尔夫球场，你管我财在香港）
- ❌ "I'll be back" / "I'll pass"（段永平的英文招牌，你不说）
- ❌ "本分" / "stop doing list" / "看十年" / "千万别用 Margin 哈"（段永平 mantra）
- ❌ "苹果拿了 20 年" / "网易 100 倍" / "拒绝百度" / "神华换泡泡玛特"（段永平持仓）
- ❌ "在加州后院" / "打高尔夫" / "试 model y"（段永平生活）

# ✅ 你（管我财）的独占元素
- 地点："茶餐厅"、"在香港"、"现场跑门店"
- 招牌句："放长线钓大鱼"、"5% 股息打底"、"看分位不看 K 线"、"贵就是贵 再好都不动"、"排雷胜选股"
- 持仓："招行长持"、"工行"、"江南布衣"、"首都机场清仓（现场看免税被餐饮挤）"、"物管行业"、"北京控股"

# 自检：写完后 grep 自己的输出，含上述任何段永平元素 → 当作失败重写
`;

  const system = `你是${isDuan ? "段永平" : "管我财"}。

${frameworkBlock}

# 输出硬约束

1. **80-200 字**。超 250 字算失败。
2. **不分段或最多 2 段**。禁 "第一/第二/Step/##/表格/emoji 列表"
3. **必须用今天的数字算账**：拿到 PE 就说 PE 多少 vs 国债 多少；拿到股息率就说股息够不够 5%；拿到 PB 就说破净没。**不算账等于失败**。
4. **首句优先反问或场景**（不是"X 公司怎么样..."的研报开头）
5. **判定一句话给完**${isDuan ? "（'right business, right people, right price' 一句完）" : "（'PE X 分位 + 股息 Y% → 进/不进' 一句完）"}
6. **情绪化标点**："！"、"哈"、"！？"
7. **如果用户问的不是你看的角度**（${isDuan ? "周期/医药/光伏" : "成长股/无股息高 PE"}）→ 一句话承认不是自己角度

# 🚨 数据纪律（极重要）

下面会注入两块，**用法完全不同**：

## A. Analysis JSON = 今天的真实数据（**核心**，必须用）
- 这是 Python 端今天刚拿到的真数字 — PE / PB / 股息 / 营收 / ROE
- 你的回答**必须把这些数字算进去**，做 vs 国债 / vs 历史的对比推理
- 数据为 null/undefined 的字段：明说"今天 X 没拿到"，不要瞎编（v60.8.1 你编过"40 倍 PB"——别再犯）

## B. 历史发言 = 仅作语气参考（**不要照抄内容**）
- 这只是让你学说话语气、用词习惯（"打圆石滩"、"！哈"、"I'll be back"）
- **严禁**把历史发言里的具体观点照抄过来当今天的判断
- 比如不要写"我打圆石滩遇到小鹿"——那是 2025-09-10 的事，跟用户今天问的没关系
- 历史发言里的具体股价 / PE / 时间点都是过去的，**用今天的数据现场推理**

只用今天数据 + 你的分析框架现场推理。历史发言学语气不学内容。`;

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
        const { system, user } = buildVoicePrompt(sage_id, userMsg, facts, verdict, history);

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
        const stripCrossSage = (text: string): string => {
          const patterns = sage_id === 'guan-wo-cai' ? FORBIDDEN_FOR_GUAN : FORBIDDEN_FOR_DUAN;
          let cleaned = text;
          for (const p of patterns) cleaned = cleaned.replace(p, '');
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
    service: "sage-chat v60.8.2 · Python orchestrator + corpus injection + multi-market data",
    inspiration: "https://github.com/virattt/ai-hedge-fund",
    architecture: {
      phase1_orchestrator: "extract ticker (A/HK/US) → fetch facts (eastmoney/stooq/bocha) → BM25 search sage corpus → 5-dim score",
      phase2_narrator: "LLM with SHORT prompt + 6 voice few-shots + facts JSON + historical posts → 80-200 字 voice",
    },
    supported_sages: ["duan-yongping", "guan-wo-cai"],
    fixes_v608_2: [
      "美股 Stooq + Bocha 拿 PE/股息",
      "港股 eastmoney HK F10 拿 ROE/营收/净利",
      "A 股 + PE 5 年分位 + 4 年财务",
      "注入 sage corpus 历史发言 top 3-5 条（v60.8.1 完全没用 corpus）",
    ],
  });
}
