"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import type { CaseInput } from "@/types";
import { buildShareUrl } from "@/lib/share";
import { cn } from "@/lib/utils";

interface Props {
  input: CaseInput;
  className?: string;
}

export function ShareBar({ input, className }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = buildShareUrl(input);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback
      window.prompt("复制此链接分享判决书：", url);
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="font-mono text-[11px] uppercase tracking-widest text-ink-500">
        <Share2 className="mr-1 inline h-3 w-3" /> 分享判决书
      </span>
      <button onClick={handleCopy} className="btn-ghost text-xs">
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-600" />
            <span className="text-emerald-700">已复制永久链接</span>
          </>
        ) : (
          <>
            <Link2 className="h-3.5 w-3.5" />
            复制永久链接
          </>
        )}
      </button>
    </div>
  );
}
