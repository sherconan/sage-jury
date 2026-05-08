// URL hash 编码/解码 — 把案例输入编进 URL，可分享永久链接

import type { CaseInput } from "@/types";

const KEY_MAP: Record<string, string> = {
  ticker: "tk", name: "n", industry: "ind", briefBusiness: "bb",
  pe: "pe", pb: "pb", ps: "ps", roe: "roe", roic: "roic",
  grossMargin: "gm", netMargin: "nm", debtToAsset: "da",
  fcfMargin: "fcf", dividendYield: "dy", yearsListed: "yl",
  capexRatio: "cr", marketCap: "mc",
  monopolyLevel: "mn", brandStrength: "bs", consumerStickiness: "cs",
  repeatedConsumption: "rc", techDisruption: "td", regulatoryRisk: "rr",
  managementQuality: "mq", inUserCircle: "ic", cyclical: "cy",
  oversoldRecently: "or", recentDrawdown: "rd", consensusBullish: "cb",
  catalystVisible: "cv", pricedFairly: "pf", intendedHoldYears: "hy",
  userBuyReason: "br",
};

const REV_MAP = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k]));

export function encodeCase(input: CaseInput): string {
  const compact: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null || v === "") continue;
    const short = KEY_MAP[k] || k;
    compact[short] = v;
  }
  const json = JSON.stringify(compact);
  if (typeof window === "undefined") {
    return Buffer.from(json, "utf-8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  }
  // browser-safe base64 (handle utf-8)
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeCase(hash: string): Partial<CaseInput> | null {
  try {
    const b64 = hash.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    let json: string;
    if (typeof window === "undefined") {
      json = Buffer.from(padded, "base64").toString("utf-8");
    } else {
      json = decodeURIComponent(escape(atob(padded)));
    }
    const compact = JSON.parse(json);
    const out: Partial<CaseInput> = {};
    for (const [k, v] of Object.entries(compact)) {
      const full = REV_MAP[k] || k;
      (out as any)[full] = v;
    }
    return out;
  } catch (e) {
    return null;
  }
}

export function buildShareUrl(input: CaseInput, baseUrl?: string): string {
  const hash = encodeCase(input);
  const base = baseUrl || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/?case=${hash}`;
}
