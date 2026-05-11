// utils/api.js
// 微信小程序 wx.request 不直接支持 SSE 流式，但 enableChunked + onChunkReceived 可以伪流式：
// - chunkReceived 边收边解析（真机/PC 工具支持，老版本 fallback 到 success 一次性）
// - 服务端有时会把 DeepSeek 的 DSML 内部 tool-call 标签泄漏到 content，必须清洗
// - done 事件包含 fullReply + followups，是真正的"完成"信号

const app = getApp();

// === DSML 清洗 + Markdown 去格式化（小程序不能渲染 md，去符号留文本）===
function cleanDSML(s) {
  if (!s) return s;
  return s
    // 1. DSML 内部 tool-call 标签
    .replace(/<[^<>\n]{0,200}DSML[^<>\n]{0,200}>/g, '')
    .replace(/<\/?\s*(invoke|parameter|tool_calls)[^>]*>/gi, '')
    .replace(/name="[a-z_]+"\s+string="(true|false)"\s*>/g, '')
    // 2. Markdown 去格式（保留文本，去标记符号）
    .replace(/```[\s\S]*?```/g, m => m.replace(/```\w*\n?/g, '').replace(/```/g, ''))  // 代码块去 fence
    .replace(/^#{1,6}\s+/gm, '')          // 去 ## heading 标记
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // **粗体** → 粗体
    .replace(/(?<!\*)\*([^*\n]+)\*/g, '$1')  // *斜体* → 斜体
    .replace(/`([^`]+)`/g, '$1')          // `code` → code
    .replace(/^\s*[-*+]\s+/gm, '• ')      // - item → • item
    .replace(/^\s*>\s+/gm, '')             // > quote → quote
    .replace(/^\s*\|.*\|.*$/gm, '')        // markdown 表格行直接去掉
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, '')  // 表格分隔行
    .replace(/^\s+|\s+$/g, '');
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
  let buf = '', evt = '', accumulated = '', emitBuf = '', inDSML = false;
  let quotes = [], toolCalls = [], followups = [], doneFired = false;

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
          onProgress && onProgress({ content: accumulated });
        }
      } else if (evt === 'tool_call') {
        toolCalls.push({ name: d.name, args: d.args, id: d.id });
        onProgress && onProgress({ toolCalls: toolCalls.slice() });
      } else if (evt === 'tool_result') {
        const tc = toolCalls.find(t => t.id === d.id);
        if (tc) tc.result = d.result;
        onProgress && onProgress({ toolCalls: toolCalls.slice() });
      } else if (evt === 'done') {
        doneFired = true;
        followups = d.followups || [];
        // 如果流式没收到 chunks（fallback 模式），用 fullReply
        if (!accumulated && d.fullReply) accumulated = cleanDSML(d.fullReply);
        onProgress && onProgress({ content: accumulated, followups });
      } else if (evt === 'error') {
        onProgress && onProgress({ error: d.message || 'unknown' });
      }
    }
  }

  function finalize() {
    // 如果 buf 还有残留行未处理，喂入
    if (buf) feed('\n');
    return { reply: accumulated, quotes, toolCalls, followups, doneFired };
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

module.exports = { callChatStream, cleanDSML };
