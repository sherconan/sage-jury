import Link from "next/link";
import { ArrowLeft, Quote } from "lucide-react";
import { SAGES } from "@/data/sages";
import { SageAvatar } from "@/components/SageAvatar";

export const metadata = {
  title: "大佬金句墙 · 48 句投资箴言 | 大佬陪审团",
  description: "段永平、冯柳、但斌、林园、张坤、巴菲特——48 句关于价值、耐心、纪律的投资箴言。",
};

export default function QuotesPage() {
  // Flatten all quotes with sage attribution
  const allQuotes = SAGES.flatMap((s) =>
    s.quotes.map((q) => ({ quote: q, sage: s }))
  );

  return (
    <main className="min-h-screen">
      <nav className="sticky top-0 z-30 border-b border-ink-200/60 bg-cream-50/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-ink-700 hover:text-navy-700">
            <ArrowLeft className="h-4 w-4" /> 返回陪审团
          </Link>
          <span className="nameplate hidden md:inline-flex">QUOTES WALL</span>
        </div>
      </nav>

      <section className="relative overflow-hidden border-b border-ink-200/60">
        <div className="absolute inset-0 bg-gavel-rays opacity-60" />
        <div className="relative mx-auto max-w-5xl px-5 py-16 text-center">
          <p className="ornament-line mx-auto max-w-xs text-[11px] font-mono uppercase tracking-[0.3em] text-gold-600">
            <span>Wisdom from the Bench</span>
          </p>
          <h1 className="mt-4 font-serif text-5xl font-bold text-navy-700 md:text-6xl">大佬金句墙</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-ink-700">
            48 句关于<span className="font-serif italic">价值、耐心、纪律</span>的投资箴言。每一句都是一笔投资的浓缩。
          </p>
        </div>
      </section>

      <section className="border-b border-ink-200/60 bg-cream-50/40">
        <div className="mx-auto max-w-7xl px-5 py-16">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {allQuotes.map((item, i) => (
              <article
                key={i}
                className="court-card group p-6 transition-shadow hover:shadow-gold"
                style={{ borderTopColor: item.sage.accentColor, borderTopWidth: 3 }}
              >
                <Quote className="h-6 w-6 text-gold-400" strokeWidth={1.5} />
                <p className="mt-3 font-serif text-lg italic leading-relaxed text-ink-800">
                  "{item.quote}"
                </p>
                <div className="mt-5 flex items-center gap-3 border-t border-ink-200/60 pt-4">
                  <SageAvatar
                    initials={item.sage.avatar}
                    bgColor={item.sage.color}
                    accentColor={item.sage.accentColor}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <Link
                      href={`/sage/${item.sage.id}`}
                      className="block font-serif text-base font-bold text-ink-900 hover:text-navy-700"
                    >
                      {item.sage.name}
                    </Link>
                    <p className="truncate text-xs text-ink-500">{item.sage.title.split(" · ")[0]}</p>
                  </div>
                </div>
              </article>
            ))}
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
