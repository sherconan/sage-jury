# 大佬陪审团 · Sage Jury

> 让 6 位投资大佬替你审判每一笔交易。

**🌐 线上地址**：[https://sage-jury.vercel.app](https://sage-jury.vercel.app)

## 这是什么

把段永平、冯柳、但斌、林园、张坤、巴菲特等投资大佬的公开方法论，提炼为结构化的评分卡。
你提交一个交易决策（公司基本面 + 商业属性 + 你的买入理由），6 位大佬独立评分 → 综合判决书 → 共识等级。

## 6 位陪审员

| 大佬 | 流派 | 核心方法 | 关键权重 |
|------|------|----------|----------|
| 段永平 | 价值派 | 不懂不投·商业模式优先 | 商业模式 35% |
| 冯柳 | 弱者体系 | 左侧抄底·预期差 | 预期差 30% |
| 但斌 | 长期主义 | 时间的玫瑰·消费品 | 生意可持续性 30% |
| 林园 | 嘴巴股派 | 垄断+上瘾+复购 | 垄断属性 30% |
| 张坤 | 集中持股 | 自由现金流·ROIC | FCF 质量 30% |
| 巴菲特 | 护城河派 | 经济护城河·内在价值 | 经济护城河 30% |

## 关键设计

- **结构化评分**：每位大佬 5 个评分维度 + 加权权重
- **红旗一票否决**：veto 级红旗（如段永平的"超出能力圈"）触发即顶格扣分
- **加分项**：符合大佬偏好的特征（高毛利、长寿命、稳定派息）会额外加分
- **共识等级**：UNANIMOUS / MAJORITY / SPLIT / CONTROVERSIAL
- **共识陷阱提醒**：完全一致是危险信号——冯柳就是教你警惕共识的那个
- **永久链接分享**：把案件输入 base64 编码到 URL hash，朋友打开即重现判决
- **本地运行**：评估引擎纯 TypeScript，运行在客户端，不上传任何输入数据

## 11 个历史案例（一键审议）

🍶 贵州茅台 (2003) · 🎮 网易 (2001) · 📹 海康威视 (2014) · ☕ 瑞幸 (2019 IPO)
📉 茅台 (2024) · 🔋 宁德时代 (2021 高位) · 🍎 苹果 (2003) · 🚕 滴滴 (2021)
⚡ 特斯拉 (2019) · 💬 腾讯 (2022 谷底) · 🛒 Costco (2014)

每个案例都附"陪审团判决 vs 历史结局"对比 — 在 retrospective table 一目了然。

## 7 个页面

| 路由 | 内容 |
|------|------|
| `/` | Hero · 6 陪审员卡 · 11 案例 · retrospective table · 输入表单 · 综合判决书 · 使用场景 · 方法论说明 |
| `/about` | 为什么是这 6 位 — 选人三条标准 |
| `/dynamics` | 陪审员意见相关性矩阵 + 案例评分热图 |
| `/quotes` | 48 句金句墙 |
| `/sage/[id]` | 6 个大佬完整方法论详情页 |
| `/sitemap.xml` · `/robots.txt` | SEO |
| `/opengraph-image` | 动态 OG 图（边缘运行时生成） |

## 技术栈

- **Next.js 14** · App Router
- **TypeScript** · 严格模式
- **Tailwind CSS** · 自定义设计系统（ink/navy/gold/cream/verdict 5 套色板）
- **Framer Motion** · 关键动效
- **Lucide Icons** · 全套图标
- **Bun** · 包管理 + 运行时
- **部署于 Vercel** · 边缘运行时生成 OG 图
- **JSON-LD WebApplication** · structured data

## 本地开发

```bash
bun install
bun run dev   # localhost:3401
bun run build # 生产构建
bun scripts/sanity.ts  # 跑评估引擎 sanity test
```

## 项目结构

```
sage-jury/
├── app/
│   ├── page.tsx                # 主页（Hero + 陪审员 + 案例 + retro + 表单 + 判决书 + 使用场景 + 方法论）
│   ├── quotes/page.tsx         # 48 句金句墙
│   ├── sage/[id]/page.tsx      # 6 个大佬详情页
│   ├── about/page.tsx          # 为什么是这 6 位
│   ├── dynamics/page.tsx       # 相关性矩阵 + 案例热图
│   ├── opengraph-image.tsx     # 动态 OG 图
│   ├── sitemap.ts · robots.ts  # SEO
│   ├── error.tsx · not-found.tsx
│   └── layout.tsx              # 全局字体 + JSON-LD
├── components/
│   ├── CaseInputForm.tsx       # 案件输入表单（含进阶维度展开）
│   ├── SageVerdictCard.tsx     # 大佬评分卡
│   ├── JuryReportPanel.tsx     # 陪审团综合判决书
│   ├── RetrospectiveTable.tsx  # 判决 vs 历史对比
│   ├── ShareBar.tsx            # 永久链接分享
│   └── SageAvatar.tsx          # 圆形头像组件
├── data/
│   ├── sages/index.ts          # 6 位大佬方法论数据库
│   └── cases/index.ts          # 11 个历史案例
├── lib/
│   ├── engine.ts               # 评估引擎（6 个评分函数 + 综合判决）
│   ├── correlations.ts         # 陪审员意见相关性计算
│   ├── share.ts                # URL hash 编码/解码
│   └── utils.ts
├── types/index.ts
└── scripts/
    ├── deploy.sh
    └── sanity.ts
```

## 7 小时挑战赛纪要

- 开始：2026-05-08 01:25 HKT
- 截止：2026-05-08 08:25 HKT
- 主体上线：开始后 35 分钟（v1 deploy）
- 后续抛光：v2 → v6（含 dynamics、retrospective、mobile menu、48 quotes、use cases）
- 总文件：约 25 个核心 .ts/.tsx
- 总代码：约 2500 行 TS

## 免责声明

本工具不构成投资建议。所有评分基于公开方法论的拟合，**不代表大佬本人的真实判断**。所有投资有风险，请独立判断。

---

🤖 Built solo in 7 hours · 2026-05-08
