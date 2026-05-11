const sess = require('../../utils/sessions');
const app = getApp();

Page({
  data: { sessions: [], totalCount: 0, searchQuery: '' },

  onShow() { this.refresh(); },

  refresh() {
    const streaming = (app.globalData && app.globalData.streamingIds) || {};
    const q = (this.data.searchQuery || '').trim().toLowerCase();
    const all = sess.load();
    let list = all.map(s => {
      const msgs = s.msgs || [];
      const lastSage = [...msgs].reverse().find(m => m.role === 'sage' && m.content);
      const lastUser = [...msgs].reverse().find(m => m.role === 'user' && m.content);
      const preview = (lastSage && lastSage.content) || (lastUser && lastUser.content) || '';
      return {
        ...s,
        userTurnCount: msgs.filter(m => m.role === 'user').length,
        timeFmt: sess.fmtTime(s.ts_updated || s.ts_created),
        preview: String(preview).replace(/\s+/g, ' ').slice(0, 60),
        streaming: !!streaming[s.id],
      };
    });
    if (q) {
      list = list.filter(s =>
        (s.title || '').toLowerCase().includes(q) ||
        (s.preview || '').toLowerCase().includes(q) ||
        (s.sage_name || '').toLowerCase().includes(q)
      );
    }
    this.setData({ sessions: list, totalCount: all.length });
  },

  onSearchInput(e) {
    this.setData({ searchQuery: e.detail.value });
    this.refresh();
  },
  onSearchClear() {
    this.setData({ searchQuery: '' });
    this.refresh();
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    sess.setActiveId(id);
    wx.navigateBack().catch(() => wx.switchTab({ url: '/pages/chat/chat' }));
    // 因为是 navigateTo 进来的，navigateBack 即可。chat 页面 onShow 会自动刷新
  },

  // v60.4-mp.5: 长按 session 出操作菜单
  onLongPressSession(e) {
    const id = e.currentTarget.dataset.id;
    const s = this.data.sessions.find(x => x.id === id);
    if (!s) return;
    wx.showActionSheet({
      itemList: ['重命名', '复制标题', '删除对话'],
      success: (r) => {
        if (r.tapIndex === 0) this.startRename(id, s.title);
        else if (r.tapIndex === 1) {
          wx.setClipboardData({ data: s.title || '新对话', success: () => wx.showToast({ title: '标题已复制', icon: 'success', duration: 800 }) });
        } else if (r.tapIndex === 2) this.confirmDelete(id);
      },
    });
  },

  startRename(id, currentTitle) {
    wx.showModal({
      title: '重命名对话',
      editable: true,
      placeholderText: currentTitle || '新对话',
      content: currentTitle || '',
      confirmText: '保存',
      success: (r) => {
        if (!r.confirm) return;
        const newTitle = String(r.content || '').trim().slice(0, 30);
        if (!newTitle) return;
        const list = sess.load();
        const updated = list.map(x => x.id === id ? { ...x, title: newTitle, ts_updated: Date.now() } : x);
        sess.save(updated);
        this.refresh();
        wx.showToast({ title: '已重命名', icon: 'success', duration: 800 });
      },
    });
  },

  confirmDelete(id) {
    wx.showModal({
      title: '确认删除',
      content: '确认删除这个对话？',
      confirmColor: '#dc2626',
      success: (r) => {
        if (!r.confirm) return;
        const filtered = sess.load().filter(s => s.id !== id);
        sess.save(filtered);
        if (sess.getActiveId() === id) sess.setActiveId('');
        this.refresh();
      },
    });
  },

  onDelete(e) {
    this.confirmDelete(e.currentTarget.dataset.id);
  },

  onClearAll() {
    wx.showModal({
      title: '确认清空',
      content: '所有历史对话都会被删除，无法恢复。',
      success: (r) => {
        if (!r.confirm) return;
        sess.save([]);
        sess.setActiveId('');
        this.refresh();
      },
    });
  },

  onBack() { wx.navigateBack().catch(() => {}); },
});
