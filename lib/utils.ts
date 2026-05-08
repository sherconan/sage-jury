import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case "S": return "border-gold-400 text-gold-600 bg-gold-50";
    case "A": return "border-emerald-500 text-emerald-700 bg-emerald-50";
    case "B": return "border-sky-500 text-sky-700 bg-sky-50";
    case "C": return "border-amber-500 text-amber-700 bg-amber-50";
    case "D": return "border-orange-500 text-orange-700 bg-orange-50";
    case "F": return "border-red-500 text-red-700 bg-red-50";
    default: return "border-ink-300 text-ink-600 bg-cream-100";
  }
}

export function verdictColor(v: string): string {
  switch (v) {
    case "STRONG_BUY": return "border-emerald-700 text-emerald-800 bg-emerald-50";
    case "BUY": return "border-emerald-500 text-emerald-700 bg-emerald-50";
    case "HOLD": return "border-amber-500 text-amber-700 bg-amber-50";
    case "AVOID": return "border-orange-600 text-orange-700 bg-orange-50";
    case "STRONG_AVOID": return "border-red-700 text-red-800 bg-red-50";
    default: return "border-ink-300 text-ink-600 bg-cream-100";
  }
}

export function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-gradient-to-r from-emerald-500 to-emerald-600";
  if (score >= 60) return "bg-gradient-to-r from-sky-500 to-sky-600";
  if (score >= 40) return "bg-gradient-to-r from-amber-500 to-amber-600";
  if (score >= 25) return "bg-gradient-to-r from-orange-500 to-orange-600";
  return "bg-gradient-to-r from-red-500 to-red-600";
}
