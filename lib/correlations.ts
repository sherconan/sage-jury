// 陪审员相关性分析 — 通过 9 个 preset cases 计算每两位大佬之间的评分相关性

import { evaluate } from "./engine";
import { PRESET_CASES } from "@/data/cases";
import { SAGES } from "@/data/sages";

export interface SageScores {
  sageId: string;
  sageName: string;
  avatar: string;
  color: string;
  accent: string;
  scores: number[];
  caseLabels: string[];
}

export interface CorrelationCell {
  a: string;
  aName: string;
  b: string;
  bName: string;
  correlation: number;
  agreement: number;
  meanGap: number;
}

function pearson(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const mx = x.reduce((s, v) => s + v, 0) / x.length;
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

export function getJurorScores(): SageScores[] {
  const reports = PRESET_CASES.map((c) => ({ caseLabel: c.title, report: evaluate(c.input) }));
  return SAGES.map((sage) => {
    const scores = reports.map((r) => {
      const v = r.report.verdicts.find((x) => x.sageId === sage.id);
      return v ? v.finalScore : 0;
    });
    return {
      sageId: sage.id,
      sageName: sage.name,
      avatar: sage.avatar,
      color: sage.color,
      accent: sage.accentColor,
      scores,
      caseLabels: reports.map((r) => r.caseLabel),
    };
  });
}

export function getCorrelationMatrix(): CorrelationCell[] {
  const data = getJurorScores();
  const out: CorrelationCell[] = [];
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data.length; j++) {
      const a = data[i], b = data[j];
      const corr = i === j ? 1 : pearson(a.scores, b.scores);
      const gaps = a.scores.map((s, k) => Math.abs(s - b.scores[k]));
      const meanGap = gaps.reduce((s, v) => s + v, 0) / gaps.length;
      // agreement: % of cases where both gave same buy/avoid direction
      let same = 0;
      for (let k = 0; k < a.scores.length; k++) {
        const aBuy = a.scores[k] >= 60;
        const bBuy = b.scores[k] >= 60;
        if (aBuy === bBuy) same++;
      }
      const agreement = same / a.scores.length;
      out.push({
        a: a.sageId, aName: a.sageName,
        b: b.sageId, bName: b.sageName,
        correlation: corr,
        agreement,
        meanGap,
      });
    }
  }
  return out;
}

export function getMostAgreeingPair() {
  const cells = getCorrelationMatrix().filter((c) => c.a !== c.b);
  return [...cells].sort((a, b) => b.correlation - a.correlation)[0];
}

export function getMostDisagreeingPair() {
  const cells = getCorrelationMatrix().filter((c) => c.a !== c.b);
  return [...cells].sort((a, b) => a.correlation - b.correlation)[0];
}
