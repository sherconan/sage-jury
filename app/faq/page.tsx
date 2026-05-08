// FAQ 常见问题 — 用户进站第一时间想问的 12 个问题
import Link from "next/link";
import { ArrowLeft, HelpCircle } from "lucide-react";

export const metadata = {
  title: "常见问题 FAQ | 大佬陪审团",
  description: "陪审团是真的大佬观点吗？方法论怎么拟合？数据准吗？为什么共识反而是危险信号？",
};

const FAQS = [
  {
    q: "陪审团给出的判决是真的大佬本人观点吗？",
    a: "**不是**。这是基于 6-8 位大佬的公开方法论（书 / 季报 / 访谈）拟合出来的结构化评分。比如段永平的'商业模式 35% 权重'是基于他在雪球反复讲的'生意 > 公司 > 价格'排序。**判决不代表大佬本人对这只股票的真实看法**。但当你的输入符合大佬的方法论框架时，分数应该接近他的真实倾向。",
  },
  {
    q: "为什么陪审团评分常常 SPLIT 或 CONTROVERSIAL？",
    a: "**这是设计意图，不是缺陷**。8 位大佬本来就是不同流派——价值派、逆向派、消费派、嘴巴股派、集中派、护城河派。如果他们意见一致，要么这是个**绝对好的或绝对烂的标的**，要么**就该警惕了**。冯柳就明确说过：共识本身就是风险信号。分歧才是真正的思考起点。",
  },
  {
    q: "数据从哪里来？准吗？",
    a: "**A 股数据**：东方财富 push2 实时行情 API（PE / PB / 股价 / 涨跌）。**港股**：东方财富 116.{code}。**美股**：东方财富 105.{ticker}。**财务深度数据**（ROE / 毛利 / 现金流）：当前需要用户自己输入或在前端表单调整。**所有数据每 10 分钟刷新一次**，不存储用户输入。",
  },
  {
    q: "时光机的 71% 命中率是真的吗？",
    a: "**是真的，但样本只有 7 个**。我们选了 4 个历史时点（2003 / 2014 / 2019 / 2021-2022）的 7 个真实案例（茅台 / 网易 / 海康 / 瑞幸 / 特斯拉 / 宁德 / 腾讯），把陪审团方法论拉回当年评一次，对照真实历史结局。5 命中 2 偏离 = 71%。**这不是科学的回测**——更多案例可能让命中率上下浮动 ±20%。但至少证明方法论**有可证伪性**。",
  },
  {
    q: "为什么有 8 位陪审员？以前是 6 位？",
    a: "v1 是 6 位（段永平 / 冯柳 / 但斌 / 林园 / 张坤 / 巴菲特），后来加了 2 位互补：**邱国鹭**（投资三大思路）补足'行业评估'盲区；**唐朝/老唐**（老唐估值法）补足'什么时候买'的明确数学规则。陪审团从 30 → 40 个评分函数，方法论矩阵更全面。",
  },
  {
    q: "陪审团是不是只懂 A 股？港股美股能用吗？",
    a: "**A 股最准**（数据源最完整）。港股能拉名字 + PB，但 PE 字段在港股市场是不同的 secid 编码，目前 PE 拉不到。美股可以拉但定性指标的行业匹配较弱。**结论**：港股美股建议**配合 `/api/evaluate` POST 自定义 CaseInput 使用**，效果最佳。",
  },
  {
    q: "我能调用 API 集成到我自己的系统吗？",
    a: "可以。`POST /api/evaluate` 接受 JSON body（33 个可选字段），返回完整陪审团判决书。`GET /api/lookup?ticker=600519` 只需股票代码，自动从东方财富抓数据再调评估。**两个端点都开放 CORS**，可以直接在浏览器 / 服务端 / 自动化脚本调用。详细 schema 见 `GET /api/evaluate` 和 `GET /api/lookup`。",
  },
  {
    q: "陪审团踩雷过吗？",
    a: "**踩过**。时光机里特斯拉 2019 → 段永平/巴菲特能力圈外打 AVOID，但实际涨 10 倍。腾讯 2022 → 部分大佬保守打不到 STRONG_BUY。**这两个都是方法论的边界**：能力圈外的颠覆性技术 + 政策严寒里的优秀公司，传统价值方法论会偏保守。这就是为什么需要 8 位大佬而不是 1 位——互补降低单点失误。",
  },
  {
    q: "我不懂这些指标怎么填怎么办？",
    a: "**最快路径**：用 ⚡ 一键代码查询（输 6 位 A 股代码）。东方财富会自动拉 PE / PB / 名称，行业从名字推断（茅台→白酒→默认 monopolyLevel=5），其他定性指标用行业默认。**进阶**：在表单展开「进阶维度」手动调整。**最快了解**：直接看 `/market` 12 只股 SSR 实时跑分。",
  },
  {
    q: "判决书能分享吗？",
    a: "可以。提交评估后下面有「📤 分享判决书」按钮，会复制一个 base64 编码的永久链接（如 `?case=eyJuIjoi...`）。对方打开链接，案件输入会自动填入并显示同样的判决。**所有数据在 URL 里，不依赖后端存储**。",
  },
  {
    q: "陪审团能告诉我什么时候卖吗？",
    a: "**不能**。陪审团评估的是**当下买入决策**，不是择时卖出。卖出依赖你的目标价、心理价位、组合调整需求，这些非常个人化。一个**间接信号**：当一只你持有的股票综合分从 70+ 跌到 30-，可能是基本面恶化或估值过高了，值得复盘。",
  },
  {
    q: "这是投资建议吗？",
    a: "**绝对不是**。这是一个**结构化方法论拟合工具**，帮你用大佬视角扫描决策的可能盲区。所有投资有风险，请独立判断。**陪审团的最大价值不是给你答案，是让你看到一个决策在不同方法论下的分歧点**——分歧点往往就是你需要重点思考的地方。",
  },
];

export default function FAQPage() {
  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">FAQ</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-3xl px-5 py-12 text-center">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>FAQ</span>
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-navy-700 md:text-5xl">
            <HelpCircle className="mr-2 inline h-7 w-7" />
            常见问题
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-600">用户进站第一时间想问的 12 个问题。</p>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <div className="space-y-5">
            {FAQS.map((f, i) => (
              <details key={i} className="court-card group p-5" open={i === 0}>
                <summary className="cursor-pointer list-none">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-gold-400 bg-cream-50 font-serif text-sm font-bold text-gold-700">{i + 1}</span>
                    <h3 className="font-serif text-lg font-bold text-ink-900 group-hover:text-navy-700">{f.q}</h3>
                  </div>
                </summary>
                <div className="mt-3 ml-11 prose prose-sm max-w-none text-ink-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: f.a.replace(/\*\*([^*]+)\*\*/g, "<strong class=\"text-navy-700\">$1</strong>").replace(/`([^`]+)`/g, "<code class=\"font-mono text-xs bg-cream-100 px-1.5 py-0.5 rounded text-ink-800\">$1</code>") }} />
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-3xl px-5 py-10 text-center">
          <h2 className="font-serif text-2xl font-bold text-navy-700">还有问题？</h2>
          <p className="mt-2 text-ink-600">回到主页直接试一只股票，可能比答案更有用。</p>
          <Link href="/" className="btn-primary mt-5 inline-flex">⚡ 输代码 3 秒看判决</Link>
        </div>
      </section>

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">← 返回陪审团首页</Link>
      </footer>
    </main>
  );
}
