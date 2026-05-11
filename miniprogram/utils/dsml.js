// utils/dsml.js — 客户端 DSML 强清洗（状态机版）
// v60.5-mp.1: 与 web server-side `app/api/chat/stream/route.ts` 的 inDSML 状态机对齐。
// regex 只剥标签不吞 body，server 漏过滤时 client 仍会泄漏参数文本。
// 状态机吃掉整段 <DSML>...</DSML> + <tool_calls>...</tool_calls> + <invoke ...>...</invoke> 包围 body。

// 触发标签（开 + 闭）。检测到开标签就进入 inDSML 模式，吞所有字符直到对应闭标签。
const OPEN_TRIGGERS = [
  /^<\s*DSML\b/i,
  /^<\s*tool_calls\b/i,
  /^<\s*invoke\b/i,
  /^<\s*parameter\b/i,
];
const CLOSE_TRIGGERS = [
  /^<\s*\/\s*DSML\s*>/i,
  /^<\s*\/\s*tool_calls\s*>/i,
  /^<\s*\/\s*invoke\s*>/i,
  /^<\s*\/\s*parameter\s*>/i,
];

// 单标签自闭合：<DSML version="1" />
const SELF_CLOSE = /^<\s*(DSML|tool_calls|invoke|parameter)\b[^>]*\/>/i;

function stripDSML(s) {
  if (!s) return s;
  let out = '';
  let i = 0;
  let inDSML = 0;  // 嵌套计数
  const len = s.length;
  while (i < len) {
    const rest = s.slice(i);
    // 1. 检查自闭合标签（不增加嵌套）
    const sc = rest.match(SELF_CLOSE);
    if (sc) { i += sc[0].length; continue; }
    // 2. 检查开标签
    let opened = false;
    for (const tr of OPEN_TRIGGERS) {
      if (tr.test(rest)) {
        // 找到本标签的 > 结尾
        const gt = rest.indexOf('>');
        if (gt > -1 && gt < 800) {
          inDSML++;
          i += gt + 1;
          opened = true;
          break;
        }
        // 没结尾标签 — 容忍：当作不是开标签
      }
    }
    if (opened) continue;
    // 3. 检查闭标签
    let closed = false;
    for (const tr of CLOSE_TRIGGERS) {
      const m = rest.match(tr);
      if (m) {
        if (inDSML > 0) inDSML--;
        i += m[0].length;
        closed = true;
        break;
      }
    }
    if (closed) continue;
    // 4. 普通字符：在 DSML 内吞掉，在外保留
    if (inDSML > 0) { i++; continue; }
    out += s[i];
    i++;
  }
  return out;
}

// 与原有 cleanDSML 链路兼容的入口（先状态机，再 markdown 残留兜底）
function cleanDSMLStrict(s) {
  if (!s) return s;
  let t = stripDSML(s);
  // 兜底 regex（如果状态机漏过某些畸形标签）
  t = t.replace(/<[\s\S]{0,200}?DSML[\s\S]{0,500}?>/g, '');
  return t;
}

module.exports = { stripDSML, cleanDSMLStrict };
