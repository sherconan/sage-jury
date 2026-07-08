import Link from "next/link";
import { ScrollText } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="court-card max-w-lg p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-gold-400 bg-cream-50">
          <ScrollText className="h-8 w-8 text-gold-600" />
        </div>
        <h1 className="mt-4 font-serif text-3xl font-bold text-navy-700">页面没找到</h1>
        <p className="mt-2 text-ink-700">这里没有可以对线的内容。</p>
        <div className="mt-5">
          <Link href="/" className="btn-primary">回到首页开始对线</Link>
        </div>
      </div>
    </main>
  );
}
