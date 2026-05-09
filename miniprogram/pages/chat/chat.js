// chat.js
const app = getApp();
const { callChatStream } = require('../../utils/api');
const sess = require('../../utils/sessions');

const STARTERS = {
  'duan-yongping': ['段大你为什么换神华去泡泡玛特？', '苹果还能拿吗？', '拼多多怎么看？'],
  'guan-wo-cai':   ['腾讯能买吗？', '招行 PE 历史什么分位？', '26 年荒岛策略选什么？'],
  'lao-tang':      ['茅台老唐估值法多少？', '腾讯三年合理估值？', '洋河怎么看？'],
  'dan-bin':       ['英伟达还能拿吗？', '茅台拿 20 年还成立吗？', '特斯拉怎么看？'],
};

Page({
  data: {
    sages: [],
    activeSage: null,
    activeSession: null,
    messages: [],
    input: '',
    loading: false,
    sagePickerOpen: false,
    starters: [],
    scrollTo: '',
  },

  onLoad() {
    const sages = app.globalData.sages;
    // 还原上次 session
    const sessions = sess.load();
    const activeId = sess.getActiveId();
    let activeSession = sessions.find(s => s.id === activeId);
    let activeSage = sages[0];
    if (activeSession) {
      const found = sages.find(s => s.slug === activeSession.sage_id);
      if (found) activeSage = found;
    }
    this.setData({
      sages,
      activeSage,
      activeSession,
      messages: activeSession?.msgs || [],
      starters: STARTERS[activeSage.slug] || [],
    });
    this.scrollBottom();
  },

  onShow() {
    // 切回页面时刷新（可能在 sessions 页面切换了）
    const activeId = sess.getActiveId();
    if (activeId && (!this.data.activeSession || this.data.activeSession.id !== activeId)) {
      const sessions = sess.load();
      const activeSession = sessions.find(s => s.id === activeId);
      if (activeSession) {
        const sages = this.data.sages;
        const activeSage = sages.find(s => s.slug === activeSession.sage_id) || sages[0];
        this.setData({
          activeSage, activeSession,
          messages: activeSession.msgs || [],
          starters: STARTERS[activeSage.slug] || [],
        });
        this.scrollBottom();
      }
    }
  },

  onSagePickerToggle() { this.setData({ sagePickerOpen: !this.data.sagePickerOpen }); },

  onSelectSage(e) {
    const slug = e.currentTarget.dataset.slug;
    const sage = this.data.sages.find(s => s.slug === slug);
    if (!sage) return;
    // 切 sage 时新建 session
    this.setData({ sagePickerOpen: false });
    this.createSession(sage);
  },

  onNewSession() { this.createSession(this.data.activeSage); },

  createSession(sage) {
    const newSess = sess.newSession(sage);
    const all = [newSess, ...sess.load()];
    sess.save(all);
    sess.setActiveId(newSess.id);
    this.setData({
      activeSage: sage,
      activeSession: newSess,
      messages: [],
      starters: STARTERS[sage.slug] || [],
    });
  },

  onGoSessions() {
    wx.navigateTo({ url: '/pages/sessions/sessions' });
  },

  onInputChange(e) { this.setData({ input: e.detail.value }); },

  onStarter(e) {
    const q = e.currentTarget.dataset.q;
    if (!q) return;
    this.submit(q);
  },

  onSubmit() {
    if (this.data.loading || !this.data.input) return;
    this.submit(this.data.input);
  },

  async submit(text) {
    if (!text || !text.trim()) return;
    text = text.trim();
    this.setData({ input: '', loading: true });

    // 确保 session
    let session = this.data.activeSession;
    if (!session) {
      session = sess.newSession(this.data.activeSage);
      const all = [session, ...sess.load()];
      sess.save(all);
      sess.setActiveId(session.id);
    }

    // history (取已完成的 user/sage msgs)
    const histPayload = (session.msgs || [])
      .filter(m => !m.loading && m.content)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    // 推 user + loading sage
    const userMsg = { role: 'user', content: text, ts: Date.now() };
    const sageMsg = { role: 'sage', content: '', loading: true, ts: Date.now() + 1, toolCalls: [], quotes: [], followups: [] };
    const newMsgs = [...(session.msgs || []), userMsg, sageMsg];
    session.msgs = newMsgs;
    session.ts_updated = Date.now();
    this.persistSession(session);
    this.setData({ activeSession: session, messages: newMsgs, scrollTo: 'm' + (newMsgs.length - 1) });

    try {
      const onProgress = (patch) => {
        const msgs = this.data.messages;
        const last = { ...msgs[msgs.length - 1] };
        if (patch.content !== undefined) last.content = patch.content;
        if (patch.quotes !== undefined) last.quotes = patch.quotes.map(q => ({ ...q, textPreview: (q.text || '').slice(0, 80) }));
        if (patch.toolCalls !== undefined) last.toolCalls = patch.toolCalls.map(tc => ({ ...tc, resultPreview: tc.result ? String(tc.result).slice(0, 240) : '' }));
        if (patch.followups !== undefined) last.followups = patch.followups;
        if (patch.content) last.loading = false;
        msgs[msgs.length - 1] = last;
        this.setData({ messages: [...msgs], scrollTo: 'm' + (msgs.length - 1) });
      };
      const result = await callChatStream({
        sage_id: this.data.activeSage.slug,
        message: text,
        history: histPayload,
      }, onProgress);

      // 完成
      const msgs = this.data.messages;
      const last = { ...msgs[msgs.length - 1], loading: false };
      if (result && result.reply) last.content = result.reply;
      if (result && result.quotes && result.quotes.length) last.quotes = result.quotes.map(q => ({ ...q, textPreview: (q.text || '').slice(0, 80) }));
      if (result && result.toolCalls && result.toolCalls.length) last.toolCalls = result.toolCalls.map(tc => ({ ...tc, resultPreview: tc.result ? String(tc.result).slice(0, 240) : '' }));
      if (result && result.followups && result.followups.length) last.followups = result.followups;
      msgs[msgs.length - 1] = last;
      session.msgs = msgs;
      session.ts_updated = Date.now();
      this.persistSession(session);
      this.setData({ activeSession: session, messages: [...msgs], loading: false });

      // 首轮自动生成标题
      const turns = msgs.filter(m => m.role === 'user').length;
      if (turns === 1) this.fetchTitle(session.id, text, last.content);
    } catch (e) {
      const msgs = this.data.messages;
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: 'Error: ' + (e.errMsg || e.message || JSON.stringify(e)), loading: false };
      session.msgs = msgs;
      this.persistSession(session);
      this.setData({ activeSession: session, messages: [...msgs], loading: false });
    }
  },

  fetchTitle(sessId, user, reply) {
    wx.request({
      url: app.globalData.apiBase + '/api/chat/title',
      method: 'POST',
      header: { 'Content-Type': 'application/json' },
      data: { user, reply: (reply || '').slice(0, 400) },
      success: (res) => {
        const title = res?.data?.title;
        if (!title) return;
        const sessions = sess.load();
        const updated = sessions.map(s => s.id === sessId ? { ...s, title: title.slice(0, 20) } : s);
        sess.save(updated);
        if (this.data.activeSession && this.data.activeSession.id === sessId) {
          this.setData({ activeSession: { ...this.data.activeSession, title } });
        }
      },
    });
  },

  persistSession(session) {
    const sessions = sess.load();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) sessions[idx] = session;
    else sessions.unshift(session);
    sess.save(sessions);
  },

  scrollBottom() {
    const len = (this.data.messages || []).length;
    if (len > 0) this.setData({ scrollTo: 'm' + (len - 1) });
  },
});
