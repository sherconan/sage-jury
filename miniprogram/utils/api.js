// utils/api.js
// 微信小程序 wx.request 不支持 SSE 流式，所以我们写一个 chunk-poll 版：
// - 调用 /api/chat/stream POST，返回完整 SSE 流（响应体一次性返回）
// - 在前端解析 event/data 行，挤出最终 reply + tool calls + quotes + followups
// 体验：用户看不到流式 token，但能看到「正在思考...」+ 完整结果一次性出现

const app = getApp();

function callChatStream({ sage_id, message, history }, onProgress) {
  return new Promise((resolve, reject) => {
    const requestTask = wx.request({
      url: `${app.globalData.apiBase}/api/chat/stream`,
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { sage_id, message, history: history || [] },
      enableChunked: true,
      timeout: 90000,
      success: (res) => {
        // 非流式 fallback 路径（如果 enableChunked 不工作，res.data 是完整 SSE 字符串）
        if (typeof res.data === 'string') {
          const parsed = parseSSE(res.data);
          resolve(parsed);
        } else {
          resolve({ reply: '', error: '空响应' });
        }
      },
      fail: (err) => reject(err),
    });

    // 试着监听 chunkReceived 实现伪流式
    if (requestTask && requestTask.onChunkReceived) {
      let buf = '';
      let evt = '';
      let accumulated = '';
      let quotes = [];
      let toolCalls = [];
      requestTask.onChunkReceived((res) => {
        const arr = new Uint8Array(res.data);
        const text = bytesToStr(arr);
        buf += text;
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('event: ')) { evt = line.slice(7).trim(); continue; }
          if (!line.startsWith('data: ')) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (evt === 'quotes') { quotes = data || []; onProgress && onProgress({ quotes }); }
          else if (evt === 'chunk' && data.delta) {
            accumulated += data.delta;
            onProgress && onProgress({ content: accumulated });
          } else if (evt === 'tool_call') {
            toolCalls.push({ name: data.name, args: data.args, id: data.id });
            onProgress && onProgress({ toolCalls: [...toolCalls] });
          } else if (evt === 'tool_result') {
            const tc = toolCalls.find(t => t.id === data.id);
            if (tc) tc.result = data.result;
            onProgress && onProgress({ toolCalls: [...toolCalls] });
          } else if (evt === 'done') {
            onProgress && onProgress({ content: accumulated || data.fullReply || '', followups: data.followups || [] });
          }
        }
      });
    }
  });
}

function bytesToStr(arr) {
  // UTF-8 decode
  let s = '';
  let i = 0;
  while (i < arr.length) {
    const b = arr[i];
    if (b < 0x80) { s += String.fromCharCode(b); i++; }
    else if (b < 0xc0) { i++; }  // 不该出现，跳过
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

function parseSSE(text) {
  const lines = text.split('\n');
  let evt = '', accumulated = '', quotes = [], toolCalls = [], followups = [];
  for (const line of lines) {
    if (line.startsWith('event: ')) { evt = line.slice(7).trim(); continue; }
    if (!line.startsWith('data: ')) continue;
    let d; try { d = JSON.parse(line.slice(6)); } catch { continue; }
    if (evt === 'quotes') quotes = d || [];
    else if (evt === 'chunk' && d.delta) accumulated += d.delta;
    else if (evt === 'tool_call') toolCalls.push({ name: d.name, args: d.args, id: d.id });
    else if (evt === 'tool_result') {
      const tc = toolCalls.find(t => t.id === d.id);
      if (tc) tc.result = d.result;
    }
    else if (evt === 'done') {
      accumulated = accumulated || d.fullReply || accumulated;
      followups = d.followups || [];
    }
  }
  return { reply: accumulated, quotes, toolCalls, followups };
}

module.exports = { callChatStream };
