// app.js
App({
  onLaunch() {
    // 启动时打印版本
    console.log('Sage Chat 启动');
  },
  globalData: {
    apiBase: 'https://sage-jury.vercel.app',  // 生产域名（开发版需在小程序后台开"不校验合法域名"）
    sages: [
      { slug: 'duan-yongping', display: '段永平', alias: '大道无形我有型',
        philosophy: '本分 · 不懂不投 · 看十年后', total_posts: 10497,
        initials: 'DYP', color: '#3b82f6' },
      { slug: 'guan-wo-cai', display: '管我财', alias: '管我财',
        philosophy: '低估逆向平均赢 · 排雷胜选股', total_posts: 33853,
        initials: 'GWC', color: '#10b981' },
      { slug: 'dan-bin', display: '但斌', alias: '但斌',
        philosophy: '时间的玫瑰 · 长期持有伟大公司', total_posts: 597,
        initials: 'DB', color: '#f59e0b' },
      { slug: 'lao-tang', display: '唐朝', alias: '老唐',
        philosophy: '老唐估值法 · 三年一倍 · 守正用奇', total_posts: 116,
        initials: 'LT', color: '#8b5cf6' },
    ],
  },
});
