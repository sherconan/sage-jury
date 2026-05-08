"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[sage-jury] runtime error:", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-5">
      <div className="court-card max-w-lg p-8 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-400 bg-red-50">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="mt-4 font-serif text-2xl font-bold text-navy-700">陪审团暂停休庭</h1>
        <p className="mt-2 text-ink-700">
          页面出了点意外。可能是输入解析错误，或临时网络问题。
        </p>
        <pre className="mt-3 max-h-32 overflow-auto rounded-md bg-cream-100 p-3 text-left text-xs text-ink-600">
          {error.message || "Unknown error"}
        </pre>
        <div className="mt-5 flex justify-center gap-3">
          <button onClick={reset} className="btn-primary">重试</button>
          <Link href="/" className="btn-ghost">回到首页</Link>
        </div>
      </div>
    </main>
  );
}
