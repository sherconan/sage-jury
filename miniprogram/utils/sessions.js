// utils/sessions.js — 多对话 session 持久化（wx.setStorageSync）
const SESS_KEY = 'sj_chat_sessions_v1';
const ACTIVE_KEY = 'sj_chat_active_session_v1';

function load() {
  try { return wx.getStorageSync(SESS_KEY) || []; } catch { return []; }
}
function save(sessions) {
  try { wx.setStorageSync(SESS_KEY, sessions.slice(0, 100)); } catch {}
}
function getActiveId() {
  try { return wx.getStorageSync(ACTIVE_KEY) || null; } catch { return null; }
}
function setActiveId(id) {
  try { wx.setStorageSync(ACTIVE_KEY, id); } catch {}
}
function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
function newSession(sage) {
  return {
    id: genId(),
    sage_id: sage.slug,
    sage_name: sage.display,
    sage_initials: sage.initials,
    sage_color: sage.color,
    title: '新对话',
    msgs: [],
    ts_created: Date.now(),
    ts_updated: Date.now(),
  };
}
function fmtTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return Math.floor(diff/60_000) + ' 分钟前';
  if (diff < 86400_000) return Math.floor(diff/3600_000) + ' 小时前';
  const d = new Date(ts);
  return (d.getMonth()+1) + '/' + d.getDate();
}
// v59: 清理 hydrate 后仍是空 msgs 的 session（lazy 创建逻辑的兜底）
function purgeEmpty(sessions) {
  return (sessions || []).filter(s => Array.isArray(s.msgs) && s.msgs.length > 0);
}
module.exports = { load, save, getActiveId, setActiveId, genId, newSession, fmtTime, purgeEmpty };
