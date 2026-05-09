const sess = require('../../utils/sessions');

Page({
  data: { sessions: [] },

  onShow() { this.refresh(); },

  refresh() {
    const list = sess.load().map(s => ({
      ...s,
      userTurnCount: (s.msgs || []).filter(m => m.role === 'user').length,
      timeFmt: sess.fmtTime(s.ts_updated || s.ts_created),
    }));
    this.setData({ sessions: list });
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.id;
    sess.setActiveId(id);
    wx.navigateBack().catch(() => wx.switchTab({ url: '/pages/chat/chat' }));
    // 因为是 navigateTo 进来的，navigateBack 即可。chat 页面 onShow 会自动刷新
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确认删除这个对话？',
      success: (r) => {
        if (!r.confirm) return;
        const filtered = sess.load().filter(s => s.id !== id);
        sess.save(filtered);
        if (sess.getActiveId() === id) sess.setActiveId('');
        this.refresh();
      },
    });
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
