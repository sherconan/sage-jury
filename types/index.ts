// 评估系统类型定义

export type Verdict = "STRONG_BUY" | "BUY" | "HOLD" | "AVOID" | "STRONG_AVOID";

export interface CaseInput {
  ticker?: string;
  name: string;
  industry: string;
  briefBusiness: string;

  marketCap?: number;
  pe?: number;
  pb?: number;
  ps?: number;
  roe?: number;
  roic?: number;
  grossMargin?: number;
  netMargin?: number;
  debtToAsset?: number;
  fcfMargin?: number;
  dividendYield?: number;
  yearsListed?: number;
  capexRatio?: number;

  monopolyLevel?: 1 | 2 | 3 | 4 | 5;
  brandStrength?: 1 | 2 | 3 | 4 | 5;
  consumerStickiness?: 1 | 2 | 3 | 4 | 5;
  repeatedConsumption?: 1 | 2 | 3 | 4 | 5;
  techDisruption?: 1 | 2 | 3 | 4 | 5;
  regulatoryRisk?: 1 | 2 | 3 | 4 | 5;
  managementQuality?: 1 | 2 | 3 | 4 | 5;
  inUserCircle?: boolean;
  cyclical?: boolean;
  oversoldRecently?: boolean;
  recentDrawdown?: number;
  consensusBullish?: boolean;
  catalystVisible?: boolean;
  pricedFairly?: 1 | 2 | 3 | 4 | 5;
  intendedHoldYears?: number;
  userBuyReason?: string;
}

export interface DimensionScore {
  key: string;
  label: string;
  weight: number;
  rawScore: number;
  weightedScore: number;
  reason: string;
}

export interface RedFlagHit {
  key: string;
  label: string;
  severity: "veto" | "major" | "warning";
  reason: string;
}

export interface SageVerdict {
  sageId: string;
  sageName: string;
  finalScore: number;
  letterGrade: "S" | "A" | "B" | "C" | "D" | "F";
  verdict: Verdict;
  verdictLabel: string;
  oneLine: string;
  comment: string;
  dimensions: DimensionScore[];
  redFlags: RedFlagHit[];
  bonusHits: string[];
  signatureQuote: string;
}

export interface JuryReport {
  caseInput: CaseInput;
  verdicts: SageVerdict[];
  consensusScore: number;
  consensusVerdict: Verdict;
  consensusLabel: string;
  agreementLevel: "UNANIMOUS" | "MAJORITY" | "SPLIT" | "CONTROVERSIAL";
  topPro: string;
  topCon: string;
  finalJudgment: string;
  generatedAt: string;
}
