// utils/api.js
// 微信小程序 wx.request 不直接支持 SSE 流式，但 enableChunked + onChunkReceived 可以伪流式：
// - chunkReceived 边收边解析（真机/PC 工具支持，老版本 fallback 到 success 一次性）
// - 服务端有时会把 DeepSeek 的 DSML 内部 tool-call 标签泄漏到 content，必须清洗
// - done 事件包含 fullReply + followups，是真正的"完成"信号
// - v58+: tool 折叠 + 人话标签；v60.1+: analyst_chunk / analyst_done / phase 新事件
// - v62-mp.1: 切到 /api/chat/v2/stream 三阶段架构。v2 不发 analyst_chunk，改用
//   phase:analyzing（Python 端取数）+ facts（识别股票+10年数据深度）+ verdict
//   （sage-specific 5 维加权评分 signal/headline/dims）+ strip_warning（跨角色清洗）。
//   保留 analyst_* / citation_audit 兼容路径以便 v1 fallback / jury 复用。

const app = getApp();

// v58: 工具调用人话化映射（与 web 端 app/page.tsx 保持一致）
const TOOL_LABELS = {
  get_realtime_quote: '实时行情',
  get_financials: '财务数据',
  get_pe_history_pct: 'PE 历史分位',
  get_dividend_history: '股息历史',
  get_kline: 'K 线',
  search_sage_post: '查历史发言',
  web_search: '联网搜索',
  compare_stocks: '对比股票',
};
const TOOL_ICONS = {
  get_realtime_quote: '📊',
  get_financials: '💰',
  get_pe_history_pct: '📈',
  get_dividend_history: '💵',
  get_kline: '📉',
  search_sage_post: '🔍',
  web_search: '🌐',
  compare_stocks: '⚖️',
};
function formatToolArgs(args) {
  if (!args || typeof args !== 'object') return '';
  if (args.stock) return String(args.stock);
  if (args.query) {
    const q = String(args.query);
    return '"' + q.slice(0, 50) + (q.length > 50 ? '…' : '') + '"';
  }
  if (args.tickers) return (Array.isArray(args.tickers) ? args.tickers : [args.tickers]).join(' / ');
  if (args.symbol) return String(args.symbol);
  // 兜底：拼前两个 key
  const keys = Object.keys(args).slice(0, 2);
  return keys.map(k => k + '=' + String(args[k]).slice(0, 20)).join(' ');
}
// 给 wxml 直接用的装饰字段
function decorateToolCall(tc) {
  const name = tc.name || '';
  return {
    id: tc.id,
    name,
    args: tc.args,
    result: tc.result,
    icon: TOOL_ICONS[name] || '🔧',
    label: TOOL_LABELS[name] || name,
    argsStr: formatToolArgs(tc.args),
    resultPreview: tc.result ? String(tc.result).slice(0, 800) : '',
  };
}

// v54: 把 sage 输出里的 [原文 N] / [原文N] 切成可点击 chip 段
// 返回 segments 数组：[{type:'text', text}, {type:'cite', n}]
function parseCitationSegments(text) {
  if (!text) return [{ type: 'text', text: '' }];
  const re = /\[原文\s*(\d+)\]/g;
  const out = [];
  let lastIdx = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out.push({ type: 'text', text: text.slice(lastIdx, m.index) });
    out.push({ type: 'cite', n: parseInt(m[1], 10) });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) out.push({ type: 'text', text: text.slice(lastIdx) });
  return out.length ? out : [{ type: 'text', text }];
}

// v62-mp.1: verdict 卡装饰（与 web /jury verdict 渲染对齐）
// 输入 server 端 verdict 事件 payload：{ sage, signal, confidence, headline, keyMetrics, dims, top_concerns }
// 输出 wxml 可直接 wx:for 的扁平结构。
const SIGNAL_LABEL = {
  bullish: '看好',
  buy: '看好',
  hold: '观察',
  watch: '观察',
  bearish: '不碰',
  sell: '不碰',
  too_hard: '能力圈外',
  pass: '能力圈外',
};
const SIGNAL_TONE = {
  bullish: 'bull', buy: 'bull',
  hold: 'hold', watch: 'hold',
  bearish: 'bear', sell: 'bear',
  too_hard: 'pass', pass: 'pass',
};
const DIM_LABEL = {
  // 段永平
  circle: '能力圈', business: '生意', team: '人',
  price: '价格', stop_doing: 'stop doing',
  // 管哥
  position: '分位', landmine: '排雷', dividend: '股息',
  stability: '稳态', island: '荒岛',
};
// v63-mp: verdict.sage 是 slug（server 端发 'duan-yongping'/'guan-wo-cai'），映射成中文名给五维标题用
const SAGE_DISPLAY = {
  'duan-yongping': '段永平',
  'guan-wo-cai': '管我财',
};
// v63-mp: 把 keyMetrics 文案串（"PE 20.0｜EY 5.0%"、"股息率 3.92%"…）解析成数值，
// 算好可视化所需的进度条宽度 / PE 游标位置 / 标签色。绑真实数据，不写死。
const BOND_YIELD = 2.5; // 10Y 国债收益率基准（管哥股息维度对标）
function clampPct(n) { return Math.max(4, Math.min(100, n)); }
function firstNum(str, re) { const m = str.match(re); return m ? parseFloat(m[1]) : null; }
function buildViz(keyMetrics) {
  const s = (keyMetrics || []).join(' ');
  if (!s) return null;
  const pe = firstNum(s, /PE[-\s]*(?:TTM)?\s*([0-9]+(?:\.[0-9]+)?)/i);
  const ey = firstNum(s, /EY\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  const pb = firstNum(s, /PB\s*([0-9]+(?:\.[0-9]+)?)/i);
  const div = firstNum(s, /股息率?\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
  const roe = firstNum(s, /ROE\s*5?\s*年?\s*均?\s*([0-9]+(?:\.[0-9]+)?)\s*%/i);
  const revC = firstNum(s, /营收\s*5?\s*年?\s*CAGR\s*([\-0-9]+(?:\.[0-9]+)?)\s*%/i);
  const npC = firstNum(s, /净利\s*5?\s*年?\s*CAGR\s*([\-0-9]+(?:\.[0-9]+)?)\s*%/i);
  const gm = firstNum(s, /毛利率?\s*([0-9]+(?:\.[0-9]+)?)\s*%/);
  const peTag = (p) => {
    if (p < 12) return { t: '便宜', tone: 'good' };
    if (p < 18) return { t: '合理', tone: 'good' };
    if (p < 28) return { t: '中性偏贵', tone: 'warn' };
    if (p < 45) return { t: '偏贵', tone: 'warn' };
    return { t: '贵', tone: 'bad' };
  };
  // 游标位置与标尺三锚点对齐：标签钉在 8×→0% / 20×→50% / 50×→100%，
  // 故用分段线性映射，让游标落在自己标签上（clampPct 的 4% 下限保证 PE≤8 时游标尖不被裁出轨道）。
  const peMarkerPct = (p) => {
    if (p <= 8) return 0;
    if (p <= 20) return (p - 8) / 12 * 50;       // 8–20 → 0–50%
    if (p <= 50) return 50 + (p - 20) / 30 * 50; // 20–50 → 50–100%
    return 100;
  };
  const viz = {
    pe: pe != null ? { val: pe, markerPct: clampPct(peMarkerPct(pe)), tag: peTag(pe).t, tagTone: peTag(pe).tone } : null,
    ey: ey != null ? { val: ey, pct: clampPct(ey / 7 * 100) } : null,
    pb: pb != null ? { val: pb, pct: clampPct(pb / 10 * 100) } : null,
    div: div != null ? { val: div, pct: clampPct(div / 5 * 100), bondPct: BOND_YIELD / 5 * 100, bond: BOND_YIELD, beats: div >= BOND_YIELD, diff: Math.round((div - BOND_YIELD) * 100) / 100 } : null,
    roe: roe != null ? { val: roe, pct: clampPct(roe / 40 * 100) } : null,
    revC: revC != null ? { val: revC, pct: clampPct(Math.abs(revC) / 20 * 100), up: revC >= 0 } : null,
    npC: npC != null ? { val: npC, pct: clampPct(Math.abs(npC) / 20 * 100), up: npC >= 0 } : null,
    gm: gm != null ? { val: gm, pct: clampPct(gm) } : null,
  };
  viz.hasValuation = !!(viz.pe || viz.div || viz.ey || viz.pb);
  viz.hasGrowth = !!(viz.revC || viz.npC || viz.roe || viz.gm);
  return (viz.hasValuation || viz.hasGrowth) ? viz : null;
}
function decorateVerdict(v) {
  if (!v) return null;
  const signalRaw = v.signal || 'hold';
  const dims = v.dims || {};
  const dimList = Object.keys(dims).map((k) => {
    const d = dims[k] || {};
    const score = typeof d.score === 'number' ? d.score : null;
    const pass = d.pass !== false;
    return {
      key: k,
      label: DIM_LABEL[k] || k,
      note: d.note || '',
      pass,
      score,
      weight: typeof d.weight === 'number' ? Math.round(d.weight * 100) : null,
      // 评分条宽度：有 score 用 score(0-100)，否则按通过/不通过给个体感宽度
      barPct: score != null && score > 0 ? clampPct(score) : (pass ? 78 : 26),
    };
  });
  const keyMetrics = Array.isArray(v.keyMetrics) ? v.keyMetrics : [];
  const passCount = dimList.filter((d) => d.pass).length;
  return {
    sage: v.sage || '',
    sageDisplay: SAGE_DISPLAY[v.sage] || '', // v63-mp: slug→中文名（五维标题用），未知 slug 留空降级
    v62: !!v.v62,
    signalRaw,
    signal: SIGNAL_LABEL[signalRaw] || signalRaw,
    tone: SIGNAL_TONE[signalRaw] || 'hold',
    confidence: typeof v.confidence === 'number' ? v.confidence : null,
    confPct: typeof v.confidence === 'number' ? Math.max(0, Math.min(100, v.confidence)) : null,
    // v63-mp: 置信度环 — 两半圆 rotate 进度环（纯 transform，真机稳，不用 conic-gradient）。
    // 0-100 → 顺时针填充：右半叶覆盖 0-180°，左半叶覆盖 180-360°。经 /tmp 视觉验证的角度映射：
    //   confDegR = 180 - min(deg,180)；confDegL = deg>180 ? (360-deg) : 180（deg=pct*3.6）
    ...(typeof v.confidence === 'number' ? (function () {
      const deg = Math.round(Math.max(0, Math.min(100, v.confidence)) * 3.6);
      return { confDegR: 180 - Math.min(deg, 180), confDegL: deg > 180 ? (360 - deg) : 180 };
    })() : { confDegR: null, confDegL: null }),
    headline: v.headline || '',
    keyMetrics,
    viz: buildViz(keyMetrics),
    dims: dimList,
    dimsPassText: dimList.length ? (passCount + ' / ' + dimList.length + ' 通过') : '',
    topConcerns: Array.isArray(v.top_concerns) ? v.top_concerns : [],
  };
}

// v62-mp.1: facts 卡装饰（识别股票 + 数据深度）
function decorateFacts(f) {
  if (!f) return null;
  const ticker = f.ticker || null;
  return {
    hasTicker: !!ticker,
    name: ticker?.name || '',
    code: ticker?.code || '',
    market: ticker?.market || '',
    v62: !!f.v62,
    depth: f.depth || '',
    years: typeof f.years === 'number' ? f.years : null,
    note: f.note || '',
  };
}

// v57.2: quote 卡 score badge 映射
function decorateQuote(q) {
  const recMul = q._rec_mul;
  const relScore = q._rel_score;
  const recLabel =
    recMul == null ? '' :
    recMul >= 1.5  ? '近期 🔥' :
    recMul >= 1.15 ? '近期' :
    recMul >= 0.9  ? '去年' :
    recMul >= 0.65 ? '1-2 年前' : '更早';
  const relLabel =
    relScore == null ? '' :
    relScore >= 10 ? '强相关' :
    relScore >= 5  ? '相关' : '弱相关';
  return {
    date: q.date || '',
    text: q.text || '',
    likes: q.likes || 0,
    url: q.url || '',
    textPreview: (q.text || '').slice(0, 120),
    recLabel,
    relLabel,
    // 用于 badge tone 切色
    recTone: recMul == null ? '' : recMul >= 1.15 ? 'hot' : (recMul >= 0.65 ? 'mid' : 'old'),
    relTone: relScore == null ? '' : relScore >= 10 ? 'strong' : (relScore >= 5 ? 'mid' : 'weak'),
  };
}

// === DSML 清洗 ===
// v60.5-mp.1: DSML 走 utils/dsml.js 状态机（吞 body），markdown 保留原文（chat.js parseMarkdown 渲染）
const { stripDSML } = require('./dsml');

function cleanDSML(s) {
  if (!s) return s;
  // 1. DSML 标签 + body 状态机吞掉（与 web server inDSML 等价）
  let t = stripDSML(s);
  // 2. 兜底 regex（万一状态机漏了某种奇形）
  t = t
    .replace(/<[\s\S]{0,200}?DSML[\s\S]{0,500}?>/g, '')
    .replace(/<\/?\s*(invoke|parameter|tool_calls)[\s\S]{0,500}?>/gi, '')
    .replace(/^\s+|\s+$/g, '');
  return t;
}

// === UTF-8 解码（小程序无 TextDecoder）===
function bytesToStr(arr) {
  let s = '';
  let i = 0;
  while (i < arr.length) {
    const b = arr[i];
    if (b < 0x80) { s += String.fromCharCode(b); i++; }
    else if (b < 0xc0) { i++; }
    else if (b < 0xe0) {
      const c2 = arr[i+1] || 0;
      s += String.fromCharCode(((b & 0x1f) << 6) | (c2 & 0x3f));
      i += 2;
    } else if (b < 0xf0) {
      const c2 = arr[i+1] || 0, c3 = arr[i+2] || 0;
      s += String.fromCharCode(((b & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
      i += 3;
    } else {
      const c2 = arr[i+1] || 0, c3 = arr[i+2] || 0, c4 = arr[i+3] || 0;
      const cp = ((b & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f);
      const off = cp - 0x10000;
      s += String.fromCharCode(0xd800 + (off >> 10), 0xdc00 + (off & 0x3ff));
      i += 4;
    }
  }
  return s;
}

// 共用 SSE 解析状态机
function makeStreamState(onProgress) {
  let buf = '', evt = '', accumulated = '', emitBuf = '';
  let quotes = [], toolCalls = [], followups = [], doneFired = false;
  // v60.1: analyst thinking 状态（v1 兼容；v2 端不发 analyst_chunk）
  let analystThinking = '', analystDone = false, writerStarted = false;
  // v62-mp.1: v2 三阶段新事件状态
  let verdict = null, facts = null, analyzingMsg = '', stripWarning = null, dataErrors = [];

  // 处理一段已收到的文本（增量）
  function feed(text) {
    buf += text;
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (line.startsWith('event: ')) { evt = line.slice(7).trim(); continue; }
      if (!line.startsWith('data: ')) continue;
      let d;
      try { d = JSON.parse(line.slice(6)); } catch { continue; }
      if (evt === 'quotes') {
        quotes = d || [];
        onProgress && onProgress({ quotes });
      } else if (evt === 'chunk' && d.delta) {
        // 边收边清洗 DSML
        emitBuf += d.delta;
        const lastOpen = emitBuf.lastIndexOf('<');
        const lastClose = emitBuf.lastIndexOf('>');
        const safeEnd = lastOpen > lastClose ? lastOpen : emitBuf.length;
        const safe = emitBuf.slice(0, safeEnd);
        emitBuf = emitBuf.slice(safeEnd);
        const cleaned = cleanDSML(safe);
        if (cleaned) {
          accumulated += cleaned;
          // v60.1: 首个 writer chunk 到达 → 标记 writerStarted（兜底，万一 phase 事件没到）
          if (!writerStarted) {
            writerStarted = true;
            onProgress && onProgress({ content: accumulated, writerStarted: true });
          } else {
            onProgress && onProgress({ content: accumulated });
          }
        }
      } else if (evt === 'tool_call') {
        toolCalls.push({ name: d.name, args: d.args, id: d.id });
        onProgress && onProgress({ toolCalls: toolCalls.slice() });
      } else if (evt === 'tool_result') {
        const tc = toolCalls.find(t => t.id === d.id);
        if (tc) tc.result = d.result;
        onProgress && onProgress({ toolCalls: toolCalls.slice() });
      } else if (evt === 'analyst_chunk' && d.delta) {
        // v60.1: Analyst 流式思考过程（reasoning_content） · v1 路径
        analystThinking += d.delta;
        onProgress && onProgress({ analystThinking });
      } else if (evt === 'analyst_done') {
        // v60.1: Analyst 思考结束（Writer 即将开始） · v1 路径
        analystDone = true;
        onProgress && onProgress({ analystDone: true });
      } else if (evt === 'phase' && d) {
        // v62-mp.1: phase 拆两阶段
        //   - analyzing: Python 端取数+评分（v2 新阶段，对应 v1 的 analyst loader）
        //   - writer: LLM 写答案
        if (d.name === 'analyzing') {
          analyzingMsg = d.message || 'Python 端分析中…';
          onProgress && onProgress({ analyzing: analyzingMsg, analyzingDone: false });
        } else if (d.name === 'writer') {
          writerStarted = true;
          // 分析阶段结束 → 折叠 analyzing 卡
          onProgress && onProgress({ writerStarted: true, analyzingDone: true, analystDone: true });
        }
      } else if (evt === 'facts') {
        // v62-mp.1: 股票识别 + 数据深度
        facts = decorateFacts(d);
        onProgress && onProgress({ facts });
      } else if (evt === 'verdict') {
        // v62-mp.1: sage-specific 5 维加权评分
        verdict = decorateVerdict(d);
        onProgress && onProgress({ verdict });
      } else if (evt === 'history') {
        // v62-mp.1: sage 历史发言（quotes 事件随后会发同样数据，这里忽略避免重复 setData）
      } else if (evt === 'strip_warning') {
        // v62-mp.1: server 端清洗了跨角色违禁词，记录但不打扰用户
        stripWarning = d;
        console.warn('[sage v2] strip_warning', d);
      } else if (evt === 'citation_audit') {
        // v55: 审计事件，前端可忽略
      } else if (evt === 'done') {
        doneFired = true;
        followups = d.followups || [];
        dataErrors = d.data_errors || [];
        // v55: fullReply 是 server 端最终校准过的，覆盖 streamed text 防引用伪造
        if (d.fullReply) accumulated = cleanDSML(d.fullReply);
        onProgress && onProgress({
          content: accumulated, followups, analystDone: true, writerStarted: true,
          analyzingDone: true, dataErrors,
        });
      } else if (evt === 'error') {
        onProgress && onProgress({ error: d.message || 'unknown' });
      }
    }
  }

  function finalize() {
    // 如果 buf 还有残留行未处理，喂入
    if (buf) feed('\n');
    return {
      reply: accumulated, quotes, toolCalls, followups, doneFired,
      analystThinking, analystDone, writerStarted,
      verdict, facts, analyzingMsg, stripWarning, dataErrors,
    };
  }

  return { feed, finalize };
}

// v62-mp.1: 默认走 v2 三阶段架构；如需回退 v1 可传 { useV1: true }
function callChatStream({ sage_id, message, history, useV1 }, onProgress) {
  return new Promise((resolve, reject) => {
    const state = makeStreamState(onProgress);
    let chunkReceived = false;
    const endpoint = useV1 ? '/api/chat/stream' : '/api/chat/v2/stream';

    const requestTask = wx.request({
      url: `${app.globalData.apiBase}${endpoint}`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { sage_id, message, history: history || [] },
      enableChunked: true,
      timeout: 180000, // v62 三阶段更慢（Phase1 取数 + Phase3 LLM），从 120s 调到 180s
      success: (res) => {
        // 如果 chunkReceived 没触发（老版本 fallback），res.data 是完整 SSE 字符串
        if (!chunkReceived && typeof res.data === 'string' && res.data.length > 10) {
          state.feed(res.data);
        }
        const final = state.finalize();
        resolve(final);
      },
      fail: (err) => reject(err),
    });

    if (requestTask && requestTask.onChunkReceived) {
      requestTask.onChunkReceived((res) => {
        chunkReceived = true;
        try {
          const arr = new Uint8Array(res.data);
          const text = bytesToStr(arr);
          state.feed(text);
        } catch (e) {
          console.error('chunk decode error', e);
        }
      });
    }
  });
}

// v62-mp.1: 调 /api/jury/stream 跑 multi-sage 多人对线
// SSE 事件包装为 jury_event / jury_done，本函数把 jury_event 按 sage_id 路由给 onSageProgress(sage_id, patch)
// onAllDone(sageStates) 在 jury_done 触发。
//
// 入参：
//   sage_ids: [2-5] 个 sage slug
//   message: 用户问
//   history: [{role,content}]
//   onSageProgress(sage_id, patch) - 单 sage 累积态
//   onAllDone(sageStates) - 全部 sage 完成
function callJurySSE({ sage_ids, message, history }, onSageProgress, onAllDone) {
  return new Promise((resolve, reject) => {
    // 每个 sage 一个累积 buffer（content + toolCalls + done + analystThinking）
    const perSage = {};
    sage_ids.forEach(id => {
      perSage[id] = { content: '', emitBuf: '', toolCalls: [], analystThinking: '', followups: [], done: false };
    });
    let buf = '', evt = '';
    let chunkReceived = false;
    let allDoneFired = false;

    function emitToSage(sage_id, patch) {
      onSageProgress && onSageProgress(sage_id, patch);
    }

    function feedBytes(text) {
      buf += text;
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event: ')) { evt = line.slice(7).trim(); continue; }
        if (!line.startsWith('data: ')) continue;
        let d; try { d = JSON.parse(line.slice(6)); } catch { continue; }
        if (evt === 'jury_event') {
          const sage_id = d.sage_id;
          const inner = d.type;
          const p = d.payload || {};
          const s = perSage[sage_id];
          if (!s) continue;
          if (inner === 'chunk' && p.delta) {
            s.emitBuf += p.delta;
            const lastOpen = s.emitBuf.lastIndexOf('<');
            const lastClose = s.emitBuf.lastIndexOf('>');
            const safeEnd = lastOpen > lastClose ? lastOpen : s.emitBuf.length;
            const safe = s.emitBuf.slice(0, safeEnd);
            s.emitBuf = s.emitBuf.slice(safeEnd);
            const cleaned = cleanDSML(safe);
            if (cleaned) {
              s.content += cleaned;
              emitToSage(sage_id, { content: s.content });
            }
          } else if (inner === 'analyst_chunk' && p.delta) {
            s.analystThinking += p.delta;
            emitToSage(sage_id, { analystThinking: s.analystThinking });
          } else if (inner === 'analyst_done') {
            emitToSage(sage_id, { analystDone: true });
          } else if (inner === 'tool_call') {
            s.toolCalls.push({ name: p.name, args: p.args, id: p.id });
            emitToSage(sage_id, { toolCalls: s.toolCalls.slice() });
          } else if (inner === 'tool_result') {
            const tc = s.toolCalls.find(t => t.id === p.id);
            if (tc) tc.result = p.result;
            emitToSage(sage_id, { toolCalls: s.toolCalls.slice() });
          } else if (inner === 'phase' && p.name === 'writer') {
            emitToSage(sage_id, { writerStarted: true });
          } else if (inner === 'done') {
            s.done = true;
            s.followups = p.followups || [];
            if (p.fullReply) s.content = cleanDSML(p.fullReply);
            emitToSage(sage_id, {
              content: s.content, followups: s.followups,
              analystDone: true, writerStarted: true, done: true,
            });
          } else if (inner === 'error') {
            emitToSage(sage_id, { error: p.message || 'unknown' });
          }
        } else if (evt === 'jury_done') {
          allDoneFired = true;
          onAllDone && onAllDone(d.sage_states || perSage);
        }
      }
    }

    const requestTask = wx.request({
      url: `${app.globalData.apiBase}/api/jury/stream`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { sage_ids, message, history: history || [] },
      enableChunked: true,
      timeout: 240000, // jury 并行 N sage，宽限到 4 分钟
      success: (res) => {
        if (!chunkReceived && typeof res.data === 'string' && res.data.length > 10) feedBytes(res.data);
        if (!allDoneFired) onAllDone && onAllDone(perSage);
        resolve(perSage);
      },
      fail: (err) => reject(err),
    });
    if (requestTask && requestTask.onChunkReceived) {
      requestTask.onChunkReceived((res) => {
        chunkReceived = true;
        try {
          const arr = new Uint8Array(res.data);
          const text = bytesToStr(arr);
          feedBytes(text);
        } catch (e) { console.error('jury chunk decode error', e); }
      });
    }
  });
}

// v62-mp.1: 调 /api/chat/title 让 LLM 生成 ≤16 字 session 标题
// 失败兜底返回 user 文本前 16 字。非 stream，简单 POST。
function callChatTitle(user, reply) {
  return new Promise((resolve) => {
    const fallback = String(user || '').slice(0, 16) || '新对话';
    if (!user) return resolve(fallback);
    wx.request({
      url: `${app.globalData.apiBase}/api/chat/title`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { user: String(user).slice(0, 200), reply: String(reply || '').slice(0, 200) },
      timeout: 12000,
      success: (res) => {
        const t = res && res.data && res.data.title;
        resolve(typeof t === 'string' && t.trim() ? t.trim() : fallback);
      },
      fail: () => resolve(fallback),
    });
  });
}

module.exports = {
  callChatStream,
  callChatTitle,
  callJurySSE,
  cleanDSML,
  TOOL_LABELS,
  TOOL_ICONS,
  formatToolArgs,
  decorateToolCall,
  decorateVerdict,
  decorateFacts,
  parseCitationSegments,
  decorateQuote,
  SIGNAL_LABEL,
  SIGNAL_TONE,
  DIM_LABEL,
};
