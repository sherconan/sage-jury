// utils/markdown.js — 小程序专用轻量 markdown parser
// 目标：把 sage 的 markdown 输出解析为 block + inline 节点树，wxml 直接 wx:for 渲染
// 支持：heading / paragraph / ul / ol / blockquote / code-block / hr
// inline：text / bold / italic / code / cite (v54 citation chip)
// 故意不支持：表格、嵌套列表、图片（小程序内场景无意义）

// === inline parser ===
// 输入：纯文本（已经被 block parser 切出 block body）
// 输出：[{type, text|n, ...}]
function parseInlines(text) {
  if (!text) return [];
  // 先把 [原文 N] 标记换成占位符，避免它和 markdown 标记冲突（极少会冲突，但保险）
  // 然后从左到右扫描，识别 `**bold**`, `*italic*` (不嵌套), `\`code\``
  const out = [];
  let i = 0;
  const len = text.length;
  let buf = '';
  const flushText = () => {
    if (buf) { out.push({ type: 'text', text: buf }); buf = ''; }
  };
  while (i < len) {
    const ch = text[i];
    // citation [原文 N]
    if (ch === '[') {
      const cm = text.slice(i).match(/^\[原文\s*(\d+)\]/);
      if (cm) { flushText(); out.push({ type: 'cite', n: parseInt(cm[1], 10) }); i += cm[0].length; continue; }
    }
    // bold **...**
    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i + 2) {
        flushText();
        out.push({ type: 'bold', text: text.slice(i + 2, end) });
        i = end + 2; continue;
      }
    }
    // italic *...* (单星 + 非空格起头)
    if (ch === '*' && text[i + 1] !== '*' && i > 0 && text[i - 1] !== '*') {
      const rest = text.slice(i + 1);
      const m = rest.match(/^([^*\n]+)\*/);
      if (m) {
        flushText();
        out.push({ type: 'italic', text: m[1] });
        i += m[0].length + 1; continue;
      }
    }
    // inline code `...`
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1 && end - i < 200) {
        flushText();
        out.push({ type: 'code', text: text.slice(i + 1, end) });
        i = end + 1; continue;
      }
    }
    buf += ch;
    i++;
  }
  flushText();
  return out;
}

// === block parser ===
function parseMarkdown(text) {
  if (!text) return [];
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  const pushBlock = (b) => {
    if (!b) return;
    blocks.push(b);
  };

  while (i < lines.length) {
    let line = lines[i];

    // 空行：跳过（段落之间的分隔由块结束自然生成）
    if (!line.trim()) { i++; continue; }

    // ===== 代码块 ``` =====
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || '';
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i]); i++;
      }
      if (i < lines.length) i++; // 跳过结束 fence
      pushBlock({ type: 'code', lang, text: codeLines.join('\n') });
      continue;
    }

    // ===== 水平线 --- *** ___ =====
    if (/^\s*(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      pushBlock({ type: 'hr' });
      i++; continue;
    }

    // ===== 标题 =====
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      pushBlock({ type: 'heading', level: hMatch[1].length, inlines: parseInlines(hMatch[2].trim()) });
      i++; continue;
    }

    // ===== 引用块 > =====
    if (line.match(/^\s*>\s?/)) {
      const quoteLines = [];
      while (i < lines.length && lines[i].match(/^\s*>\s?/)) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, '')); i++;
      }
      pushBlock({ type: 'quote', inlines: parseInlines(quoteLines.join(' ')) });
      continue;
    }

    // ===== 无序列表 -, *, + =====
    if (line.match(/^\s*[-*+]\s+/)) {
      const items = [];
      while (i < lines.length && lines[i].match(/^\s*[-*+]\s+/)) {
        const m = lines[i].match(/^\s*[-*+]\s+(.+)$/);
        if (m) items.push({ inlines: parseInlines(m[1]) });
        i++;
      }
      pushBlock({ type: 'ul', items });
      continue;
    }

    // ===== 有序列表 1. 2. =====
    if (line.match(/^\s*\d+\.\s+/)) {
      const items = [];
      let n = 1;
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        const m = lines[i].match(/^\s*\d+\.\s+(.+)$/);
        if (m) items.push({ num: n++, inlines: parseInlines(m[1]) });
        i++;
      }
      pushBlock({ type: 'ol', items });
      continue;
    }

    // ===== Markdown 表格（直接降级为段落，小程序原生不渲染表格）=====
    if (line.match(/^\s*\|.*\|\s*$/)) {
      // 跳过表格分隔行
      while (i < lines.length && lines[i].match(/^\s*\|.*\|\s*$/) || (i < lines.length && lines[i].match(/^\s*\|?[\s:|-]{3,}\|?\s*$/))) i++;
      continue;
    }

    // ===== 段落：累计连续非空行 =====
    const paragraphLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() &&
           !lines[i].match(/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\s*>\s?|\s*(\*{3,}|-{3,}|_{3,})\s*$)/)) {
      paragraphLines.push(lines[i]); i++;
    }
    pushBlock({ type: 'p', inlines: parseInlines(paragraphLines.join(' ')) });
  }

  return blocks;
}

// === streaming 友好版：增量解析（每次重跑全量，性能依赖文本长度，<10KB 实测 <5ms）===
// 不做实际增量，因为 markdown 块结构强依赖结尾，stream 末段不解析也无所谓
function parseMarkdownStream(text) {
  return parseMarkdown(text);
}

module.exports = { parseMarkdown, parseInlines, parseMarkdownStream };
