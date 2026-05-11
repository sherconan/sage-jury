#!/usr/bin/env node
// scripts/lint-miniprogram.js
// 离线回归套件 — 真机 IDE 不可用时跑这个验证小程序代码完整性。
//
// 7 项检查：
//   [1] JS 语法 lint (Function constructor)
//   [2] JSON 配置文件可解析
//   [3] WXML bindtap/bindlongpress handler → JS Page 方法存在
//   [4] WXML template 定义 ↔ template is 引用一致
//   [5] WXML wx:if/wx:elif/wx:else 数量平衡（粗略，防遗漏配对）
//   [6] mock wx + require 全模块加载
//   [7] chat Page 关键方法存在
//
// 用法： node scripts/lint-miniprogram.js
// CI： 退出码 = 失败数（0 表示全绿）

const fs = require('fs');
const path = require('path');

const MP = path.resolve(__dirname, '..', 'miniprogram');
let PASS = 0, FAIL = 0;
const ok = (s) => { console.log('  \x1b[32m✓\x1b[0m', s); PASS++; };
const fail = (s) => { console.log('  \x1b[31m✗\x1b[0m', s); FAIL++; };
const hdr = (s) => console.log('\n\x1b[1m' + s + '\x1b[0m');

// === [1] JS Lint ===
hdr('[1] JS syntax lint');
const jsFiles = [
  'app.js',
  'utils/sessions.js', 'utils/api.js', 'utils/markdown.js', 'utils/dsml.js',
  'pages/chat/chat.js', 'pages/sessions/sessions.js',
];
for (const f of jsFiles) {
  const p = path.join(MP, f);
  if (!fs.existsSync(p)) { fail(`${f} NOT FOUND`); continue; }
  const src = fs.readFileSync(p, 'utf8');
  try {
    new Function('wx', 'getApp', 'Page', 'App', 'getCurrentPages', 'module', 'require', 'console', 'setTimeout', 'clearTimeout', src);
    ok(`${f} (${src.split('\n').length}L)`);
  } catch (e) { fail(`${f}: ${e.message}`); }
}

// === [2] JSON ===
hdr('[2] JSON config files');
for (const f of ['app.json', 'project.config.json', 'sitemap.json', 'pages/chat/chat.json', 'pages/sessions/sessions.json']) {
  try { JSON.parse(fs.readFileSync(path.join(MP, f), 'utf8')); ok(f); }
  catch (e) { fail(`${f}: ${e.message}`); }
}

// === [3] WXML handler ↔ JS handler ===
hdr('[3] WXML handler → JS handler cross-check');
function collectWxmlHandlers(wxmlPath) {
  const src = fs.readFileSync(wxmlPath, 'utf8');
  const re = /\b(bindtap|bindlongpress|bindinput|bindconfirm|catchtap|bindchange|bindfocus|bindblur|bindscroll)="(\w+)"/g;
  const out = new Set(); let m;
  while ((m = re.exec(src)) !== null) out.add(m[2]);
  return out;
}
function collectJsHandlers(jsPath) {
  const src = fs.readFileSync(jsPath, 'utf8');
  const re = /^\s*(?:async\s+)?(on\w+|fetchTitle|persistSession|scrollBottom|submit|refresh|startRename|confirmDelete|hydrateMessages)\s*[\(:]/gm;
  const out = new Set(); let m;
  while ((m = re.exec(src)) !== null) out.add(m[1]);
  return out;
}
for (const [name, base] of [['chat', 'pages/chat/chat'], ['sessions', 'pages/sessions/sessions']]) {
  const wxh = collectWxmlHandlers(path.join(MP, base + '.wxml'));
  const jsh = collectJsHandlers(path.join(MP, base + '.js'));
  const missing = [...wxh].filter(h => !jsh.has(h));
  if (missing.length === 0) ok(`${name}: ${wxh.size} handlers all defined`);
  else fail(`${name}: missing in js — ${missing.join(', ')}`);
}

// === [4] template 引用 ===
hdr('[4] WXML template definitions vs uses');
for (const f of ['pages/chat/chat.wxml', 'pages/sessions/sessions.wxml']) {
  const src = fs.readFileSync(path.join(MP, f), 'utf8');
  const defs = [...src.matchAll(/<template name="([\w-]+)"/g)].map(m => m[1]);
  const uses = [...src.matchAll(/is="([\w-]+)"/g)].map(m => m[1]);
  const unknown = uses.filter(u => !defs.includes(u));
  if (unknown.length === 0) ok(`${f}: ${defs.length} def / ${uses.length} uses`);
  else fail(`${f}: unknown template — ${unknown.join(', ')}`);
}

// === [5] wx:if 平衡（防 elif/else 写错位置）===
hdr('[5] WXML wx:if branch counts');
for (const f of ['pages/chat/chat.wxml', 'pages/sessions/sessions.wxml']) {
  const src = fs.readFileSync(path.join(MP, f), 'utf8');
  const ifs = (src.match(/wx:if=/g) || []).length;
  const elifs = (src.match(/wx:elif=/g) || []).length;
  const elses = (src.match(/wx:else(?![:\w-])/g) || []).length;
  if (ifs > 0) ok(`${f}: ${ifs} if / ${elifs} elif / ${elses} else`);
  else fail(`${f}: no wx:if found (unexpected)`);
}

// === [6] Mock wx + require all modules ===
hdr('[6] Mock wx + require all modules');
const wxMock = {
  getStorageSync: () => null,
  setStorageSync: () => {},
  request: () => ({ onChunkReceived: () => {} }),
  navigateTo: () => Promise.resolve(),
  navigateBack: () => Promise.resolve(),
  switchTab: () => Promise.resolve(),
  showModal: () => {}, showToast: () => {}, showActionSheet: () => {},
  setClipboardData: () => {},
  getSystemInfoSync: () => ({ windowHeight: 800 }),
};
let pageObj = null;
const App = (opts) => { global._app = opts; };
const Page = (opts) => { pageObj = opts; };
const getApp = () => global._app;

function loadModule(relFromMP) {
  const src = fs.readFileSync(path.join(MP, relFromMP), 'utf8');
  const m = { exports: {} };
  const dir = path.dirname(relFromMP);
  const requireMock = (p) => {
    if (p.startsWith('.')) return loadModule(path.normalize(path.join(dir, p)) + '.js');
    throw new Error('unknown require: ' + p);
  };
  new Function('module', 'wx', 'getApp', 'Page', 'console', 'require', 'setTimeout', 'clearTimeout', src)
    (m, wxMock, getApp, Page, console, requireMock, setTimeout, clearTimeout);
  return m.exports;
}

try {
  const appSrc = fs.readFileSync(path.join(MP, 'app.js'), 'utf8');
  new Function('wx', 'App', 'console', appSrc)(wxMock, App, console);
  ok(`app.js globalData ${Object.keys(global._app.globalData).length} keys`);
  const apiE = loadModule('utils/api.js');
  ok(`utils/api.js exports: ${Object.keys(apiE).length}`);
  const sessE = loadModule('utils/sessions.js');
  ok(`utils/sessions.js exports: ${Object.keys(sessE).length}`);
  const mdE = loadModule('utils/markdown.js');
  ok(`utils/markdown.js exports: ${Object.keys(mdE).length}`);
  const dsmlE = loadModule('utils/dsml.js');
  ok(`utils/dsml.js exports: ${Object.keys(dsmlE).length}`);
  loadModule('pages/chat/chat.js');
  ok(`chat Page: ${Object.keys(pageObj || {}).length} keys`);
  loadModule('pages/sessions/sessions.js');
  ok(`sessions Page: ${Object.keys(pageObj || {}).length} keys`);
} catch (e) {
  fail('module load: ' + e.message);
}

// === [7] critical methods on chat Page ===
hdr('[7] chat page critical methods');
loadModule('pages/chat/chat.js');
const chatMethods = [
  'onLoad', 'onShow', 'onSubmit', 'submit', 'onSelectSage', 'onNewSession',
  'onCiteTap', 'onRetry', 'onToggleTools', 'onToggleAnalyst', 'onLongPressMsg',
  'onMessagesScroll', 'onScrollToBottom', 'onCopyQuoteUrl',
  'hydrateMessages', 'persistSession',
];
for (const k of chatMethods) {
  if (typeof pageObj[k] === 'function') ok(k);
  else fail(`${k} missing`);
}

// === final ===
console.log('\n' + (FAIL === 0 ? '\x1b[42;30m PASS \x1b[0m' : '\x1b[41;37m FAIL \x1b[0m')
  + ` ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL);
