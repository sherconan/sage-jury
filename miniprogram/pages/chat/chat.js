// chat.js
const app = getApp();
const { callChatStream, decorateToolCall, parseCitationSegments, decorateQuote } = require('../../utils/api');
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
    // v59: 加载时清理空 session（lazy 创建逻辑的兜底，万一遗留垃圾）
    const all = sess.load();
    const cleaned = sess.purgeEmpty(all);
    if (cleaned.length !== all.length) sess.save(cleaned);
    const activeId = sess.getActiveId();
    let activeSession = cleaned.find(s => s.id === activeId) || null;
    let activeSage = sages[0];
    if (activeSession) {
      const found = sages.find(s => s.slug === activeSession.sage_id);
      if (found) activeSage = found;
    }
    this.setData({
      sages,
      activeSage,
      activeSession,
      messages: this.hydrateMessages(activeSession?.msgs || []),
      starters: STARTERS[activeSage.slug] || [],
    });
    this.scrollBottom();
  },

  onShow() {
    // 切回页面时刷新（可能在 sessions 页面切换了）
    const activeId = sess.getActiveId();
    if (activeId && (!this.data.activeSession || this.data.activeSession.id !== activeId)) {
      const sessions = sess.purgeEmpty(sess.load());
      const activeSession = sessions.find(s => s.id === activeId);
      if (activeSession) {
        const sages = this.data.sages;
        const activeSage = sages.find(s => s.slug === activeSession.sage_id) || sages[0];
        this.setData({
          activeSage, activeSession,
          messages: this.hydrateMessages(activeSession.msgs || []),
          starters: STARTERS[activeSage.slug] || [],
        });
        this.scrollBottom();
      }
    }
  },

  // 从 storage 取出的 msgs 重新装饰 toolCalls / segments / quotes + 折叠状态字段
  hydrateMessages(msgs) {
    return (msgs || []).map(m => {
      const out = { ...m };
      if (out.role === 'sage') {
        if (Array.isArray(out.toolCalls) && out.toolCalls.length) {
          out.toolCalls = out.toolCalls.map(decorateToolCall);
          out.toolsAllDone = out.toolCalls.every(tc => !!tc.result);
        }
        // v54: 把 content 切成 cite-aware segments
        if (out.content) out.contentSegments = parseCitationSegments(out.content);
        // v57.2: quote 卡装饰
        if (Array.isArray(out.quotes) && out.quotes.length) {
          out.quotes = out.quotes.map(decorateQuote);
        }
      }
      // 历史消息默认折叠 tool + analyst（节省视觉空间）
      if (out.toolsOpen === undefined) out.toolsOpen = false;
      if (out.analystOpen === undefined) out.analystOpen = false;
      return out;
    });
  },

  onSagePickerToggle() { this.setData({ sagePickerOpen: !this.data.sagePickerOpen }); },

  onSelectSage(e) {
    const slug = e.currentTarget.dataset.slug;
    const sage = this.data.sages.find(s => s.slug === slug);
    if (!sage) return;
    this.setData({ sagePickerOpen: false });
    // v59: lazy session —— 不论当前是不是有内容的 session，都不立即建新 session 实体
    // 切到 sage + 清 active，等用户发第一条消息时再由 submit() 建
    this.setData({
      activeSage: sage,
      activeSession: null,
      messages: [],
      starters: STARTERS[sage.slug] || [],
    });
    sess.setActiveId(null);
  },

  // v59: 新对话 = 清状态进 empty，不写 storage；真 session 在 submit 首次创建
  onNewSession() {
    this.setData({
      activeSession: null,
      messages: [],
      starters: STARTERS[this.data.activeSage.slug] || [],
    });
    sess.setActiveId(null);
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

    // v59: lazy —— session 在第一条消息发出时才真正写 storage
    let session = this.data.activeSession;
    if (!session) {
      session = sess.newSession(this.data.activeSage);
      const all = sess.purgeEmpty(sess.load());
      all.unshift(session);
      sess.save(all);
      sess.setActiveId(session.id);
    }

    // history (取已完成的 user/sage msgs)
    const histPayload = (session.msgs || [])
      .filter(m => !m.loading && m.content)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    // 推 user + loading sage（含 v60.1 新字段初始化）
    const userMsg = { role: 'user', content: text, ts: Date.now() };
    const sageMsg = {
      role: 'sage', content: '', loading: true, ts: Date.now() + 1,
      toolCalls: [], quotes: [], followups: [],
      // v60.1
      analystThinking: '', analystDone: false, writerStarted: false,
      // UI 折叠状态：tool 默认折叠（视觉干净），analyst 默认展开（实时看思考）
      toolsOpen: false, analystOpen: true, toolsAllDone: false,
    };
    const newMsgs = [...(session.msgs || []), userMsg, sageMsg];
    session.msgs = newMsgs;
    session.ts_updated = Date.now();
    this.persistSession(session);
    this.setData({ activeSession: session, messages: newMsgs, scrollTo: 'm' + (newMsgs.length - 1) });

    try {
      const onProgress = (patch) => {
        const msgs = this.data.messages;
        const last = { ...msgs[msgs.length - 1] };
        if (patch.content !== undefined) {
          last.content = patch.content;
          last.contentSegments = parseCitationSegments(patch.content);
        }
        if (patch.quotes !== undefined) last.quotes = patch.quotes.map(decorateQuote);
        if (patch.toolCalls !== undefined) {
          last.toolCalls = patch.toolCalls.map(decorateToolCall);
          last.toolsAllDone = last.toolCalls.every(tc => !!tc.result);
        }
        if (patch.followups !== undefined) last.followups = patch.followups;
        // v60.1
        if (patch.analystThinking !== undefined) {
          last.analystThinking = patch.analystThinking;
          last.loading = false;
        }
        if (patch.analystDone !== undefined) last.analystDone = patch.analystDone;
        if (patch.writerStarted !== undefined) {
          last.writerStarted = patch.writerStarted;
          // writer 一开始就自动折叠 analyst 卡（与 web 端 details open={!writerStarted} 等价）
          last.analystOpen = false;
        }
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
      if (result && result.reply) {
        last.content = result.reply;
        last.contentSegments = parseCitationSegments(result.reply);
      }
      if (result && result.quotes && result.quotes.length) last.quotes = result.quotes.map(decorateQuote);
      if (result && result.toolCalls && result.toolCalls.length) {
        last.toolCalls = result.toolCalls.map(decorateToolCall);
        last.toolsAllDone = last.toolCalls.every(tc => !!tc.result);
      }
      if (result && result.followups && result.followups.length) last.followups = result.followups;
      if (result && result.analystThinking) last.analystThinking = result.analystThinking;
      if (result) { last.analystDone = true; last.writerStarted = true; last.analystOpen = false; }
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

  // v58/v60.1: 折叠面板切换
  onToggleTools(e) {
    const mi = e.currentTarget.dataset.mi;
    const msgs = this.data.messages;
    if (msgs[mi]) {
      msgs[mi] = { ...msgs[mi], toolsOpen: !msgs[mi].toolsOpen };
      this.setData({ messages: [...msgs] });
    }
  },
  onToggleAnalyst(e) {
    const mi = e.currentTarget.dataset.mi;
    const msgs = this.data.messages;
    if (msgs[mi]) {
      msgs[mi] = { ...msgs[mi], analystOpen: !msgs[mi].analystOpen };
      this.setData({ messages: [...msgs] });
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
