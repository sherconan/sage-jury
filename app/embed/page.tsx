// Embed 文档页 — 教用户怎么把陪审团判决卡嵌到 Notion / 博客 / README
import Link from "next/link";
import { ArrowLeft, Code2 } from "lucide-react";

export const metadata = {
  title: "Embed · 在任何地方嵌入陪审团判决卡 | 大佬陪审团",
  description: "把陪审团实时判决以 SVG 嵌入 Notion / 博客 / GitHub README — 数据自动 10 分钟刷新。",
};

const SAMPLES = [
  { ticker: "600519", label: "茅台" },
  { ticker: "000858", label: "五粮液" },
  { ticker: "300750", label: "宁德时代" },
  { ticker: "002594", label: "比亚迪" },
];

export default function EmbedPage() {
  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">EMBED</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-3xl px-5 py-12 text-center">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>SVG Embed</span>
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-navy-700 md:text-5xl">
            <Code2 className="mr-2 inline h-7 w-7" />
            把陪审团嵌入任何地方
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-600">
            一行 <code className="rounded bg-cream-100 px-2 py-0.5 font-mono text-sm">&lt;img&gt;</code> 标签把陪审团实时判决卡嵌入 Notion / 博客 / GitHub README。**数据每 10 分钟自动刷新**。
          </p>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-4xl px-5 py-12">
          <h2 className="mb-4 font-serif text-2xl font-bold text-navy-700">用法</h2>

          <div className="court-card overflow-hidden">
            <div className="bg-navy-700 px-5 py-2"><span className="font-mono text-xs text-cream-200">HTML / Markdown</span></div>
            <pre className="overflow-x-auto bg-ink-900 p-5 text-xs leading-relaxed text-cream-100">
{`<!-- 嵌入茅台陪审团判决卡 -->
<img src="https://sage-jury.vercel.app/api/embed?ticker=600519"
     alt="贵州茅台陪审团判决"
     width="360" height="540" />

<!-- Markdown -->
![茅台陪审团](https://sage-jury.vercel.app/api/embed?ticker=600519)

<!-- Notion: 直接粘贴 URL 自动渲染 -->
https://sage-jury.vercel.app/api/embed?ticker=600519`}
            </pre>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-4xl px-5 py-12">
          <h2 className="mb-6 font-serif text-2xl font-bold text-navy-700">实时预览</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {SAMPLES.map((s) => (
              <div key={s.ticker} className="court-card overflow-hidden p-4">
                <p className="mb-2 font-mono text-xs text-ink-600">{s.label} · {s.ticker}</p>
                <img
                  src={`/api/embed?ticker=${s.ticker}`}
                  alt={`${s.label} 陪审团判决`}
                  className="mx-auto block w-full max-w-[360px]"
                />
                <p className="mt-2 text-center font-mono text-[10px] text-ink-500 break-all">
                  /api/embed?ticker={s.ticker}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-3xl px-5 py-10 text-center">
          <h2 className="font-serif text-2xl font-bold text-navy-700">为什么用 SVG？</h2>
          <ul className="mt-4 space-y-2 text-left text-ink-700 max-w-xl mx-auto">
            <li>• <strong>矢量</strong>：任何尺寸放大都不糊</li>
            <li>• <strong>可被 Notion / GitHub 直接渲染</strong> — 无需第三方 image hosting</li>
            <li>• <strong>实时</strong>：每次访问都跑最新数据，10 分钟 CDN 缓存平衡负载</li>
            <li>• <strong>无依赖</strong>：纯 SVG 文本，不依赖 JavaScript</li>
          </ul>
        </div>
      </section>

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">← 返回陪审团首页</Link>
      </footer>
    </main>
  );
}
