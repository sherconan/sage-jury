// pages/jury/jury.js — v62-mp.1 multi-sage 多人对线
const app = getApp();
const { callJurySSE, decorateToolCall, parseCitationSegments } = require('../../utils/api');
const { parseMarkdown } = require('../../utils/markdown');

const STARTER_QUESTIONS = [
  '茅台还能买吗？',
  '腾讯怎么看？',
  '苹果当前估值偏贵吗？',
  '招商银行 PE 历史分位？',
];

Page({
  data: {
    sages: [],
    selectedSlugs: [], // 默认全选
    input: '',
    loading: false,
    sageStates: {}, // { slug: { content, contentBlocks, toolCalls, done, writerStarted, error } }
    starters: STARTER_QUESTIONS,
    runUid: 0, // 每跑一次自增，用于 wxml wx:key
  },

  onLoad() {
    const sages = app.globalData.sages || [];
    this.setData({
      sages,
      selectedSlugs: sages.map(s => s.slug), // 默认全选 = duan + guan
    });
  },

  onSageToggle(e) {
    if (this.data.loading) return;
    const slug = e.currentTarget.dataset.slug;
    const cur = this.data.selectedSlugs.slice();
    const idx = cur.indexOf(slug);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push(slug);
    // 至少保留 1 个；jury 要求 2-5，所以单选时也提示
    this.setData({ selectedSlugs: cur });
  },

  onInputChange(e) { this.setData({ input: e.detail.value }); },

  onStarter(e) {
    const q = e.currentTarget.dataset.q;
    if (!q || this.data.loading) return;
    this.setData({ input: q });
  },

  onBack() { wx.navigateBack({ delta: 1 }); },

  async onSubmit() {
    const text = (this.data.input || '').trim();
    if (!text) {
      wx.showToast({ title: '请输入问题', icon: 'none', duration: 1200 });
      return;
    }
    const sage_ids = this.data.selectedSlugs.slice();
    if (sage_ids.length < 2) {
      wx.showToast({ title: '多人对线至少 2 位大佬', icon: 'none', duration: 1600 });
      return;
    }

    // 初始化每位 sage 的状态卡
    const initStates = {};
    sage_ids.forEach(slug => {
      const sage = this.data.sages.find(s => s.slug === slug) || { slug, display: slug, initials: '?', color: '#94a3b8' };
      initStates[slug] = {
        slug,
        display: sage.display,
        initials: sage.initials,
        color: sage.color,
        content: '',
        contentBlocks: [],
        toolCalls: [],
        toolsAllDone: false,
        analystThinking: '',
        writerStarted: false,
        done: false,
        error: '',
      };
    });

    this.setData({
      loading: true,
      sageStates: initStates,
      runUid: this.data.runUid + 1,
      input: '', // 清空输入但保留 selectedSlugs
    });

    try {
      await callJurySSE(
        { sage_ids, message: text, history: [] },
        (sage_id, patch) => {
          // 单 sage 增量更新
          const cur = this.data.sageStates[sage_id];
          if (!cur) return;
          const next = { ...cur };
          if (patch.content !== undefined) {
            next.content = patch.content;
            next.contentBlocks = parseMarkdown(patch.content);
          }
          if (patch.analystThinking !== undefined) next.analystThinking = patch.analystThinking;
          if (patch.toolCalls !== undefined) {
            next.toolCalls = patch.toolCalls.map(decorateToolCall);
            next.toolsAllDone = next.toolCalls.every(tc => !!tc.result);
          }
          if (patch.writerStarted !== undefined) next.writerStarted = patch.writerStarted;
          if (patch.done !== undefined) next.done = patch.done;
          if (patch.error !== undefined) next.error = patch.error;
          this.setData({ [`sageStates.${sage_id}`]: next });
        },
        (allStates) => {
          // jury_done：标记每位 sage 都 done（兜底）
          const cur = this.data.sageStates;
          const next = {};
          Object.keys(cur).forEach(slug => {
            next[slug] = { ...cur[slug], done: true, writerStarted: true };
          });
          this.setData({ sageStates: next, loading: false });
        }
      );
    } catch (e) {
      wx.showToast({ title: '请求失败：' + (e.errMsg || e.message || ''), icon: 'none', duration: 2200 });
      this.setData({ loading: false });
    }
  },
});
