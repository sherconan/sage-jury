// utils/api.js
// 微信小程序 wx.request 不直接支持 SSE 流式，但 enableChunked + onChunkReceived 可以伪流式：
// - chunkReceived 边收边解析（真机/PC 工具支持，老版本 fallback 到 success 一次性）
// - 服务端有时会把 DeepSeek 的 DSML 内部 tool-call 标签泄漏到 content，必须清洗
// - done 事件包含 fullReply + followups，是真正的"完成"信号
// - v58+: tool 折叠 + 人话标签；v60.1+: analyst_chunk / analyst_done / phase 新事件

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
  // v60.1: analyst thinking 状态
  let analystThinking = '', analystDone = false, writerStarted = false;

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
        // v60.1: Analyst 流式思考过程（reasoning_content）
        analystThinking += d.delta;
        onProgress && onProgress({ analystThinking });
      } else if (evt === 'analyst_done') {
        // v60.1: Analyst 思考结束（Writer 即将开始）
        analystDone = true;
        onProgress && onProgress({ analystDone: true });
      } else if (evt === 'phase' && d && d.name === 'writer') {
        // v60: Writer 阶段开始 → analyst 卡自动折叠
        writerStarted = true;
        onProgress && onProgress({ writerStarted: true });
      } else if (evt === 'citation_audit') {
        // v55: 审计事件，前端可忽略
      } else if (evt === 'done') {
        doneFired = true;
        followups = d.followups || [];
        // v55: fullReply 是 server 端最终校准过的，覆盖 streamed text 防引用伪造
        if (d.fullReply) accumulated = cleanDSML(d.fullReply);
        onProgress && onProgress({ content: accumulated, followups, analystDone: true, writerStarted: true });
      } else if (evt === 'error') {
        onProgress && onProgress({ error: d.message || 'unknown' });
      }
    }
  }

  function finalize() {
    // 如果 buf 还有残留行未处理，喂入
    if (buf) feed('\n');
    return { reply: accumulated, quotes, toolCalls, followups, doneFired, analystThinking, analystDone, writerStarted };
  }

  return { feed, finalize };
}

function callChatStream({ sage_id, message, history }, onProgress) {
  return new Promise((resolve, reject) => {
    const state = makeStreamState(onProgress);
    let chunkReceived = false;

    const requestTask = wx.request({
      url: `${app.globalData.apiBase}/api/chat/stream`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { sage_id, message, history: history || [] },
      enableChunked: true,
      timeout: 120000,
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

module.exports = { callChatStream, cleanDSML, TOOL_LABELS, TOOL_ICONS, formatToolArgs, decorateToolCall, parseCitationSegments, decorateQuote };
