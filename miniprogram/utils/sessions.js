// utils/sessions.js — 多对话 session 持久化（wx.setStorageSync）
const SESS_KEY = 'sj_chat_sessions_v1';
const ACTIVE_KEY = 'sj_chat_active_session_v1';

// v60.4-mp.2: 容量护栏（wx.storage 单 key 上限 10MB）
const MAX_SESSIONS = 100;
const MAX_MSGS_PER_SESSION = 200;

function load() {
  try { return wx.getStorageSync(SESS_KEY) || []; } catch { return []; }
}
function save(sessions) {
  try {
    // 1) 单个 session 内 msg 数量裁剪（保留最近 N 条，老消息丢弃）
    const safe = (sessions || []).map(s => {
      if (Array.isArray(s.msgs) && s.msgs.length > MAX_MSGS_PER_SESSION) {
        return { ...s, msgs: s.msgs.slice(s.msgs.length - MAX_MSGS_PER_SESSION) };
      }
      return s;
    });
    // 2) session 数量上限
    wx.setStorageSync(SESS_KEY, safe.slice(0, MAX_SESSIONS));
  } catch (e) {
    // 持久化失败常见原因：storage 满。降级 → 只保留最近 20 个 session
    try { wx.setStorageSync(SESS_KEY, (sessions || []).slice(0, 20)); } catch {}
  }
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
