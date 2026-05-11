// app.js
App({
  onLaunch() {
    // 启动时打印版本
    console.log('Sage Chat 启动 · miniprogram v60.4');
  },
  globalData: {
    apiBase: 'https://sage-jury.vercel.app',  // 生产域名（开发版需在小程序后台开"不校验合法域名"）
    // v56: per-session streaming registry —— 跨页面跟踪哪个 session 正在 stream
    // map: sessId → true。小程序 wx.setStorageSync 不支持 Set/Map 实例，用平民 object 简洁可序列化
    streamingIds: {},
    // v60.4: 与 web SAGES_RAW.tier="popular" 且有 corpus 的两位对齐
    // 但斌已移除（HANDOFF），老唐 corpus 报废暂下线
    sages: [
      { slug: 'duan-yongping', display: '段永平', alias: '大道无形我有型',
        philosophy: '本分 · 不懂不投 · 看十年后', total_posts: 10497,
        initials: 'DYP', color: '#3b82f6' },
      { slug: 'guan-wo-cai', display: '管我财', alias: '管我财',
        philosophy: '低估逆向平均赢 · 排雷胜选股', total_posts: 33877,
        initials: 'GWC', color: '#10b981' },
    ],
  },
});
