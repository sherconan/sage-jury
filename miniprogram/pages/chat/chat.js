// chat.js
const app = getApp();
const { callChatStream, decorateToolCall, parseCitationSegments, decorateQuote } = require('../../utils/api');
const sess = require('../../utils/sessions');

// v60.4: starters 仅保留 v60 quality 的两位 sage
const STARTERS = {
  'duan-yongping': ['段大你为什么换神华去泡泡玛特？', '苹果还能拿吗？', '拼多多怎么看？'],
  'guan-wo-cai':   ['腾讯能买吗？', '招行 PE 历史什么分位？', '26 年荒岛策略选什么？'],
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
    // v56: 全局注册 streaming，sessions 页面可见 session 正在跑
    app.globalData.streamingIds = app.globalData.streamingIds || {};
    app.globalData.streamingIds[session.id] = true;

    // history (取已完成的 user/sage msgs)
    const histPayload = (session.msgs || [])
      .filter(m => !m.loading && m.content)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

    // 推 user + loading sage（含 v60.1 新字段初始化）
    const userMsg = { role: 'user', content: text, ts: Date.now() };
    const sageMsg = {
      role: 'sage', content: '', loading: true, ts: Date.now() + 1,
      toolCalls: [], quotes: [], followups: [],
      contentSegments: [], // v54
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

    // v60.4-mp.2: throttle + precise setData
    // - analyst_chunk/content delta 高频，60ms 内合并；setData 用精准路径 messages[lastIdx].field
    // - 其他事件（quotes/toolCalls/followups/done）低频，立即 flush
    // - 防止 race: lastIdx 在 setData 时取自当时 this.data.messages.length-1
    let _pendingPatch = {};
    let _flushTimer = null;
    let _scrollDirty = false;
    const FLUSH_INTERVAL_MS = 60;
    const _doFlush = () => {
      _flushTimer = null;
      if (!_pendingPatch || Object.keys(_pendingPatch).length === 0) return;
      const stillActive = this.data.activeSession && this.data.activeSession.id === session.id;
      if (!stillActive) {
        // 不在当前会话视图，跳过 setData，仅累积进 storage（通过下一次 flush 也无意义；丢弃 _pendingPatch）
        _pendingPatch = {};
        _scrollDirty = false;
        return;
      }
      const msgs = this.data.messages;
      const lastIdx = msgs.length - 1;
      if (lastIdx < 0) { _pendingPatch = {}; return; }
      // 构建 precise setData payload
      const sd = {};
      const p = _pendingPatch;
      _pendingPatch = {};
      if (p.content !== undefined) {
        sd[`messages[${lastIdx}].content`] = p.content;
        sd[`messages[${lastIdx}].contentSegments`] = parseCitationSegments(p.content);
        sd[`messages[${lastIdx}].loading`] = false;
      }
      if (p.quotes !== undefined) sd[`messages[${lastIdx}].quotes`] = p.quotes.map(decorateQuote);
      if (p.toolCalls !== undefined) {
        const decorated = p.toolCalls.map(decorateToolCall);
        sd[`messages[${lastIdx}].toolCalls`] = decorated;
        sd[`messages[${lastIdx}].toolsAllDone`] = decorated.every(tc => !!tc.result);
      }
      if (p.followups !== undefined) sd[`messages[${lastIdx}].followups`] = p.followups;
      if (p.analystThinking !== undefined) {
        sd[`messages[${lastIdx}].analystThinking`] = p.analystThinking;
        sd[`messages[${lastIdx}].loading`] = false;
      }
      if (p.analystDone !== undefined) sd[`messages[${lastIdx}].analystDone`] = p.analystDone;
      if (p.writerStarted !== undefined) {
        sd[`messages[${lastIdx}].writerStarted`] = p.writerStarted;
        sd[`messages[${lastIdx}].analystOpen`] = false;
      }
      if (_scrollDirty) {
        sd.scrollTo = 'm' + lastIdx;
        _scrollDirty = false;
      }
      this.setData(sd);
    };

    try {
      const onProgress = (patch) => {
        const stillActive = this.data.activeSession && this.data.activeSession.id === session.id;
        if (!stillActive) {
          // 累积进 storage 里的 session（无 UI 反馈也要持久化）
          const msgs = (session.msgs || []).slice();
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
          if (patch.analystThinking !== undefined) last.analystThinking = patch.analystThinking;
          if (patch.analystDone !== undefined) last.analystDone = patch.analystDone;
          if (patch.writerStarted !== undefined) { last.writerStarted = patch.writerStarted; last.analystOpen = false; }
          msgs[msgs.length - 1] = last;
          session.msgs = msgs;
          session.ts_updated = Date.now();
          this.persistSession(session);
          return;
        }
        // 合并到 _pendingPatch（覆盖前值；后到的 chunk 累积值已经在 makeStreamState 里）
        if (patch.content !== undefined) { _pendingPatch.content = patch.content; _scrollDirty = true; }
        if (patch.analystThinking !== undefined) { _pendingPatch.analystThinking = patch.analystThinking; _scrollDirty = true; }
        if (patch.quotes !== undefined) _pendingPatch.quotes = patch.quotes;
        if (patch.toolCalls !== undefined) _pendingPatch.toolCalls = patch.toolCalls;
        if (patch.followups !== undefined) _pendingPatch.followups = patch.followups;
        if (patch.analystDone !== undefined) _pendingPatch.analystDone = patch.analystDone;
        if (patch.writerStarted !== undefined) _pendingPatch.writerStarted = patch.writerStarted;
        // 高频字段（content / analystThinking）走 60ms throttle；
        // 低频字段（done/writerStarted/quotes/toolCalls）也合到同窗口里一起刷
        if (_flushTimer == null) _flushTimer = setTimeout(_doFlush, FLUSH_INTERVAL_MS);
      };
      const result = await callChatStream({
        sage_id: this.data.activeSage.slug,
        message: text,
        history: histPayload,
      }, onProgress);

      // 完成：取消挂起的 throttle flush（避免覆盖 final state）
      if (_flushTimer != null) { clearTimeout(_flushTimer); _flushTimer = null; _pendingPatch = {}; }

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
      // 取消挂起 flush
      if (_flushTimer != null) { clearTimeout(_flushTimer); _flushTimer = null; _pendingPatch = {}; }
      const msgs = this.data.messages;
      msgs[msgs.length - 1] = {
        ...msgs[msgs.length - 1],
        content: 'Error: ' + (e.errMsg || e.message || JSON.stringify(e)),
        contentSegments: [{ type: 'text', text: 'Error: ' + (e.errMsg || e.message || '请求失败') }],
        loading: false,
        errorState: true,
      };
      session.msgs = msgs;
      this.persistSession(session);
      this.setData({ activeSession: session, messages: [...msgs], loading: false });
    } finally {
      // v56: 解除 streaming 注册
      if (app.globalData.streamingIds) delete app.globalData.streamingIds[session.id];
    }
  },

  // v60.4-mp.1: 重试上一条失败的 sage 回复
  onRetry(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const msgs = this.data.messages;
    // 找该 sage msg 的前一条 user msg
    if (!msgs[idx] || msgs[idx].role !== 'sage') return;
    const userMsg = msgs[idx - 1];
    if (!userMsg || userMsg.role !== 'user') return;
    // 删除失败的 sage msg + 触发重试
    const trimmed = msgs.slice(0, idx);
    const session = { ...this.data.activeSession, msgs: trimmed };
    this.persistSession(session);
    this.setData({ activeSession: session, messages: trimmed });
    this.submit(userMsg.content);
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

  // v54: 点击文中 #N chip → 滚到对应 quote 卡 + 闪烁高亮
  onCiteTap(e) {
    const mi = Number(e.currentTarget.dataset.mi);
    const n = Number(e.currentTarget.dataset.n);
    if (!Number.isFinite(mi) || !Number.isFinite(n)) return;
    const msgs = this.data.messages;
    const target = msgs[mi];
    if (!target || !target.quotes || n < 1 || n > target.quotes.length) {
      wx.showToast({ title: '该引用不存在', icon: 'none', duration: 1200 });
      return;
    }
    const scrollId = 'q-' + target.ts + '-' + n;
    // 先设 highlight 标记，再 setScroll
    msgs[mi] = {
      ...target,
      quotes: target.quotes.map((q, i) => i === n - 1 ? { ...q, highlight: true } : { ...q, highlight: false }),
    };
    this.setData({ messages: [...msgs], scrollTo: scrollId });
    // 1.5s 后撤掉高亮
    setTimeout(() => {
      const cur = this.data.messages;
      if (!cur[mi]) return;
      cur[mi] = { ...cur[mi], quotes: (cur[mi].quotes || []).map(q => ({ ...q, highlight: false })) };
      this.setData({ messages: [...cur] });
    }, 1500);
  },

  // v56: 打开 quote 链接（外部跳转，小程序限制 webview 域名，先 copy）
  onCopyQuoteUrl(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'success', duration: 1000 }) });
  },

  // v60.4: 长按消息复制
  onLongPressMsg(e) {
    const idx = e.currentTarget.dataset.idx;
    const msg = this.data.messages[idx];
    if (!msg || !msg.content) return;
    wx.setClipboardData({
      data: msg.content,
      success: () => wx.showToast({ title: '已复制', icon: 'success', duration: 800 }),
    });
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
