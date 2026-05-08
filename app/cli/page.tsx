// CLI 下载和使用说明 - terminal 用 sage 命令秒查陪审团
import Link from "next/link";
import { ArrowLeft, Terminal, Download, Copy } from "lucide-react";

export const metadata = {
  title: "Sage Jury CLI · 在 Terminal 里查陪审团 | 大佬陪审团",
  description: "无需打开浏览器，在 terminal 跑 `sage 600519` 直接看 8 大佬完整判决书。",
};

const CLI_SCRIPT = `#!/usr/bin/env bash
# sage — Sage Jury CLI
# 用法: sage <ticker>
#   sage 600519           # 贵州茅台
#   sage 000858           # 五粮液
#   sage 300750           # 宁德时代
#   sage 00700            # 港股: 腾讯

set -e
URL="\${SAGE_JURY_URL:-https://sage-jury.vercel.app}"
TICKER="\${1:-}"

if [ -z "$TICKER" ]; then
  echo "用法: sage <股票代码>"; exit 1
fi

curl -fsSL "$URL/api/lookup?ticker=$TICKER" | python3 -c "
import json, sys
d = json.load(sys.stdin)
f = d.get('fetched', {})
r = d.get('report', {})
print(f\\"\\\\n📋 {f.get('name')} ({d.get('ticker')})\\")
print(f\\"   {d.get('inferredFromIndustry') or '?'} · PE {f.get('pe')} · PB {f.get('pb')} · ¥{f.get('lastPrice')}\\")
print(f\\"\\\\n⚖️  综合: {r.get('consensusScore')}/100  |  {r.get('consensusLabel')}  |  {r.get('agreementLevel')}\\\\n\\")
for v in r.get('verdicts', []):
  print(f\\"  {v['sageName']:<10} {v['letterGrade']} {v['finalScore']:>3}/100  {v['verdictLabel']}\\")
"`;

export default function CliPage() {
  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">CLI</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-3xl px-5 py-12 text-center">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>Command Line Interface</span>
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold text-navy-700 md:text-5xl">
            <Terminal className="mr-2 inline h-7 w-7" />
            在 Terminal 里查陪审团
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-ink-600">
            无需打开浏览器。<code className="rounded bg-cream-100 px-2 py-0.5 font-mono text-sm">sage 600519</code> 一行命令出 8 大佬完整判决书。
          </p>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-4xl px-5 py-12">
          <h2 className="mb-4 font-serif text-2xl font-bold text-navy-700"><Download className="mr-2 inline h-5 w-5" />一键安装</h2>

          <div className="court-card overflow-hidden">
            <div className="flex items-center justify-between bg-navy-700 px-5 py-2">
              <span className="font-mono text-xs text-cream-200">macOS / Linux</span>
              <Copy className="h-3 w-3 text-cream-300" />
            </div>
            <pre className="overflow-x-auto bg-ink-900 p-5 text-xs leading-relaxed text-cream-100">
{`# 一键安装到 /usr/local/bin/sage
curl -fsSL https://sage-jury.vercel.app/sage.sh > /tmp/sage
chmod +x /tmp/sage
sudo mv /tmp/sage /usr/local/bin/sage

# 验证
sage 600519`}
            </pre>
          </div>

          <p className="mt-4 text-sm text-ink-600">
            或直接下载脚本：<a href="/sage.sh" download className="font-mono text-navy-700 underline hover:text-gold-700">/sage.sh</a>（150 行 bash + Python，含批量模式）
          </p>
        </div>
      </section>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-4xl px-5 py-12">
          <h2 className="mb-4 font-serif text-2xl font-bold text-navy-700">用法</h2>
          <div className="space-y-3">
            {[
              { cmd: "sage 600519", desc: "查贵州茅台 — 8 大佬完整判决" },
              { cmd: "sage 000858", desc: "查五粮液" },
              { cmd: "sage 300750", desc: "查宁德时代" },
              { cmd: "sage 00700", desc: "查港股腾讯" },
              { cmd: "sage NVDA", desc: "查美股英伟达" },
              { cmd: "sage", desc: "显示帮助" },
            ].map((e) => (
              <div key={e.cmd} className="flex items-baseline gap-3 rounded-lg border border-ink-200 bg-cream-50 px-4 py-3">
                <code className="font-mono text-sm text-navy-700">$ {e.cmd}</code>
                <span className="text-xs text-ink-600">— {e.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-4xl px-5 py-12">
          <h2 className="mb-4 font-serif text-2xl font-bold text-navy-700">输出示例</h2>
          <div className="court-card overflow-hidden">
            <div className="flex items-center gap-2 bg-navy-700 px-5 py-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              <span className="ml-2 font-mono text-xs text-cream-200">~ $ sage 600519</span>
            </div>
            <pre className="overflow-x-auto bg-ink-900 p-5 text-xs leading-relaxed text-cream-100">
{`📋 案件: 贵州茅台 (600519)
   白酒 · PE 15.8 · PB 6.36 · ¥1375.3

⚖️  陪审团综合判决: 63/100  |  观望 · 看清再说  |  SPLIT

陪审员        等级    分数    判决
────────────────────────────────────
段永平        C      64      观望
冯柳         C      50      观望
但斌         C      59      观望
林园         B      76      可买
张坤         C      59      观望
巴菲特        C      65      观望
邱国鹭        B      69      观望
唐朝（老唐）     C      61      观望

📜 陪审员看法分散，无明显共识。

🔗 https://sage-jury.vercel.app/stock/600519`}
            </pre>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-3xl px-5 py-10 text-center">
          <h2 className="font-serif text-2xl font-bold text-navy-700">配合 alias / shell function 用更顺</h2>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-ink-900 p-5 text-left text-xs text-cream-100">
{`# 加到 ~/.zshrc 或 ~/.bashrc
alias mt='sage 600519'   # 茅台
alias bd='sage 002594'   # 比亚迪
alias plat='sage 0700'   # 腾讯`}
          </pre>
          <Link href="/api/lookup" target="_blank" className="btn-ghost mt-5 inline-flex">直接查看 API JSON →</Link>
        </div>
      </section>

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">← 返回陪审团首页</Link>
      </footer>
    </main>
  );
}
