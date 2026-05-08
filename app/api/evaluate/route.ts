// POST /api/evaluate — 陪审团评估 API
// 让大佬陪审团从一个网页升级为一个可被外部调用的工具
//
// 用法：
//   curl -X POST https://sage-jury.vercel.app/api/evaluate \
//     -H "Content-Type: application/json" \
//     -d '{"name":"贵州茅台","industry":"白酒","pe":28,"roe":0.28,...}'
//
// 返回 JSON: { consensusScore, consensusVerdict, verdicts: [...], finalJudgment, ... }

import { NextRequest, NextResponse } from "next/server";
import { evaluate } from "@/lib/engine";
import type { CaseInput } from "@/types";

export const runtime = "nodejs";

const ALLOWED_KEYS = new Set([
  "ticker", "name", "industry", "briefBusiness",
  "marketCap", "pe", "pb", "ps", "roe", "roic",
  "grossMargin", "netMargin", "debtToAsset",
  "fcfMargin", "dividendYield", "yearsListed",
  "capexRatio",
  "monopolyLevel", "brandStrength", "consumerStickiness",
  "repeatedConsumption", "techDisruption", "regulatoryRisk",
  "managementQuality", "inUserCircle", "cyclical",
  "oversoldRecently", "recentDrawdown", "consensusBullish",
  "catalystVisible", "pricedFairly", "intendedHoldYears",
  "userBuyReason",
]);

function sanitize(input: any): CaseInput {
  const out: any = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  if (!out.name) out.name = "未命名标的";
  if (!out.industry) out.industry = "";
  if (!out.briefBusiness) out.briefBusiness = "";
  return out as CaseInput;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Cache-Control": "no-store",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  return NextResponse.json(
    {
      service: "sage-jury",
      version: "1.0",
      endpoints: {
        evaluate: { method: "POST", path: "/api/evaluate", description: "提交一笔交易决策，6 位投资大佬独立评分 + 综合判决" },
      },
      schema: {
        input: {
          required: ["name"],
          optional: [...ALLOWED_KEYS],
          types: {
            roe: "0~1 (eg 0.28 = 28%)",
            grossMargin: "0~1",
            monopolyLevel: "1-5",
            brandStrength: "1-5",
            consumerStickiness: "1-5",
            inUserCircle: "boolean",
            consensusBullish: "boolean",
            oversoldRecently: "boolean",
          },
        },
      },
      example: {
        request: {
          name: "贵州茅台",
          industry: "白酒",
          pe: 28,
          roe: 0.28,
          grossMargin: 0.92,
          monopolyLevel: 5,
          brandStrength: 5,
          inUserCircle: true,
          intendedHoldYears: 10,
        },
        response: "see POST /api/evaluate",
      },
      docs: "https://sage-jury.vercel.app",
    },
    { headers: corsHeaders() },
  );
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: corsHeaders() },
    );
  }

  const input = sanitize(body);
  if (!input.name || input.name === "未命名标的") {
    if (!body.name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400, headers: corsHeaders() },
      );
    }
  }

  const sageIds: string[] | undefined = Array.isArray(body.sageIds) && body.sageIds.length > 0
    ? body.sageIds
    : undefined;

  try {
    const report = evaluate(input, sageIds);
    return NextResponse.json(report, { headers: corsHeaders() });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Evaluation failed", message: e?.message || String(e) },
      { status: 500, headers: corsHeaders() },
    );
  }
}
