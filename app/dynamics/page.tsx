import Link from "next/link";
import { ArrowLeft, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { SAGES } from "@/data/sages";
import { PRESET_CASES } from "@/data/cases";
import {
  getJurorScores,
  getCorrelationMatrix,
  getMostAgreeingPair,
  getMostDisagreeingPair,
} from "@/lib/correlations";
import { SageAvatar } from "@/components/SageAvatar";

export const metadata = {
  title: "陪审员意见相关性 | 大佬陪审团",
  description:
    "在 11 个历史案例上，15 位投资大佬两两之间的评分相关性 + 最一致 / 最分歧组合。",
};

const corrColor = (c: number) => {
  if (c >= 0.85) return "bg-emerald-700 text-cream-50";
  if (c >= 0.65) return "bg-emerald-500 text-cream-50";
  if (c >= 0.4) return "bg-emerald-200 text-emerald-900";
  if (c >= 0.1) return "bg-amber-200 text-amber-900";
  if (c >= -0.2) return "bg-orange-300 text-orange-900";
  return "bg-red-400 text-red-50";
};

export default function DynamicsPage() {
  const jurors = getJurorScores();
  const matrix = getCorrelationMatrix();
  const top = getMostAgreeingPair();
  const bot = getMostDisagreeingPair();

  // build matrix grid
  const grid: Record<string, Record<string, { c: number; ag: number; gap: number }>> = {};
  matrix.forEach((cell) => {
    if (!grid[cell.a]) grid[cell.a] = {};
    grid[cell.a][cell.b] = { c: cell.correlation, ag: cell.agreement, gap: cell.meanGap };
  });

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">JURY DYNAMICS</span>
        </div>
      </nav>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-ink-500">
            <span>Jury Dynamics</span>
          </p>
          <h1 className="mt-4 text-center font-serif text-4xl font-bold text-navy-700 md:text-5xl">
            陪审员意见 · 相关性热点
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-center text-ink-700">
            在 11 个历史案例上跑完 15 位大佬的评分，统计他们两两之间的相关性。
            数字越接近 1 越像，越接近 -1 越对立。
          </p>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="court-card p-6" style={{ borderTopColor: "#10B981", borderTopWidth: 4 }}>
              <div className="mb-3 flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-emerald-700">
                <TrendingUp className="h-4 w-4" /> 最一致组合
              </div>
              <h3 className="font-serif text-2xl font-bold text-navy-700">
                {top.aName} × {top.bName}
              </h3>
              <p className="mt-2 text-ink-700">
                相关性 <span className="font-mono font-bold text-emerald-700">{top.correlation.toFixed(2)}</span> · 同向投票
                <span className="font-mono font-bold text-emerald-700"> {(top.agreement * 100).toFixed(0)}%</span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">
                这两位大佬的方法论非常相似——他们对同一笔交易的判断高度一致。如果他们意见统一，决策可信度高；
                但如果他们都看好，意味着这是个&ldquo;舒适区&rdquo;的决策，可能少了反向校验。
              </p>
            </div>

            <div className="court-card p-6" style={{ borderTopColor: "#DC2626", borderTopWidth: 4 }}>
              <div className="mb-3 flex items-center gap-2 text-sm font-mono uppercase tracking-widest text-red-700">
                <TrendingDown className="h-4 w-4" /> 最分歧组合
              </div>
              <h3 className="font-serif text-2xl font-bold text-navy-700">
                {bot.aName} × {bot.bName}
              </h3>
              <p className="mt-2 text-ink-700">
                相关性 <span className="font-mono font-bold text-red-700">{bot.correlation.toFixed(2)}</span> · 同向投票
                <span className="font-mono font-bold text-red-700"> {(bot.agreement * 100).toFixed(0)}%</span>
              </p>
              <p className="mt-3 text-sm leading-relaxed text-ink-600">
                这两位大佬的方法论形成强烈对冲——一个看好的另一个往往不看好。
                这是陪审团里最有价值的一对：他们的分歧本身就是&ldquo;思考死角&rdquo;的提示器。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h2 className="mb-2 font-serif text-2xl font-bold text-navy-700">
            <Activity className="mr-2 inline h-5 w-5" /> 相关性矩阵
          </h2>
          <p className="mb-6 text-sm text-ink-600">
            数值范围 -1（完全反向）→ 0（无关）→ +1（完全正相关）。基于 11 个历史案例的实际跑分。
          </p>

          <div className="overflow-x-auto rounded-xl border border-ink-200 bg-cream-50 shadow-bench">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-cream-100">
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500"> </th>
                  {SAGES.map((s) => (
                    <th key={s.id} className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <SageAvatar
                          initials={s.avatar}
                          bgColor={s.color}
                          accentColor={s.accentColor}
                          size="sm"
                        />
                        <span className="text-xs font-medium text-ink-700">{s.name}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SAGES.map((row) => (
                  <tr key={row.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <SageAvatar
                          initials={row.avatar}
                          bgColor={row.color}
                          accentColor={row.accentColor}
                          size="sm"
                        />
                        <span className="font-medium text-ink-800">{row.name}</span>
                      </div>
                    </td>
                    {SAGES.map((col) => {
                      const cell = grid[row.id]?.[col.id];
                      const c = cell?.c ?? 0;
                      return (
                        <td key={col.id} className="px-1 py-1 text-center">
                          <div
                            className={`mx-auto flex h-12 w-16 flex-col items-center justify-center rounded-md text-xs font-bold tabular-nums ${corrColor(c)}`}
                            title={`Same direction: ${(cell?.ag ?? 0) * 100}% · Mean gap: ${cell?.gap.toFixed(1)}`}
                          >
                            <span className="text-sm">{c.toFixed(2)}</span>
                            <span className="text-[9px] opacity-80">
                              {((cell?.ag ?? 0) * 100).toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="font-mono uppercase tracking-widest text-ink-500">图例：</span>
            {[
              { c: 0.9, label: "强一致" },
              { c: 0.7, label: "一致" },
              { c: 0.5, label: "弱一致" },
              { c: 0.2, label: "中性" },
              { c: -0.1, label: "弱对立" },
              { c: -0.5, label: "强对立" },
            ].map((g) => (
              <span key={g.c} className={`rounded px-2 py-0.5 ${corrColor(g.c)}`}>
                {g.label}（{g.c.toFixed(2)}）
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h2 className="mb-2 font-serif text-2xl font-bold text-navy-700">案例评分热图</h2>
          <p className="mb-6 text-sm text-ink-600">
            横轴：11 个历史案例 · 纵轴：15 位陪审员 · 单元格颜色：评分（绿色越深=越看好）
          </p>
          <div className="overflow-x-auto rounded-xl border border-ink-200 bg-cream-50 shadow-bench">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-200 bg-cream-100">
                  <th className="px-3 py-3 text-left font-mono text-xs uppercase text-ink-500">陪审员 \\ 案例</th>
                  {PRESET_CASES.map((c) => (
                    <th key={c.id} className="px-2 py-3 text-center">
                      <div className="text-2xl">{c.emojiTag}</div>
                      <div className="text-[10px] font-normal text-ink-500">{c.title.split(" · ")[0]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jurors.map((j) => (
                  <tr key={j.sageId} className="border-b border-ink-100 last:border-0">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <SageAvatar
                          initials={j.avatar}
                          bgColor={j.color}
                          accentColor={j.accent}
                          size="sm"
                        />
                        <span className="font-medium text-ink-800">{j.sageName}</span>
                      </div>
                    </td>
                    {j.scores.map((s, i) => {
                      const intensity = Math.max(0, Math.min(1, s / 100));
                      const bg =
                        s >= 75 ? "bg-emerald-600 text-cream-50" :
                        s >= 60 ? "bg-emerald-300 text-emerald-900" :
                        s >= 45 ? "bg-amber-200 text-amber-900" :
                        s >= 30 ? "bg-orange-300 text-orange-900" :
                                  "bg-red-500 text-cream-50";
                      return (
                        <td key={i} className="px-1 py-1 text-center">
                          <div className={`mx-auto flex h-10 w-12 items-center justify-center rounded-md text-sm font-bold tabular-nums ${bg}`}>
                            {s}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer className="bg-navy-700 py-8 text-center text-cream-200">
        <Link href="/" className="text-sm underline hover:text-gold-300">
          ← 返回陪审团首页
        </Link>
      </footer>
    </main>
  );
}
