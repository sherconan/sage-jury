// POST /api/battle/verdict — 陪审团判决书
// 4 位 sage 各自答完后，调一次 LLM 生成 1 段共识/分歧总结 + 综合判决（买/等/不买）

import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "***DEEPSEEK_KEY_REMOVED***";
const LLM_MODEL = process.env.SAGE_LLM_MODEL || "deepseek-v4-pro";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: cors }); }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { question, replies } = body;
  if (!question || !Array.isArray(replies) || replies.length < 2) {
    return NextResponse.json({ error: "Need question + replies[2+]" }, { status: 400, headers: cors });
  }
  // replies = [{ sage_name, content }, ...]
  const repBlock = replies.map((r: any, i: number) =>
    `【${r.sage_name}】\n${(r.content || "").slice(0, 800)}\n`
  ).join("\n");

  const sys = `你是「陪审团判决书」生成器。给定一个用户问题 + N 位投资大佬的回答，输出一份**结构化判决书**：

1. **共识** (1-2 行): 几位大佬都同意的点
2. **分歧** (1-2 行): 谁vs谁，争在哪里
3. **综合判决**: 买入 / 观望 / 不买 / 看不懂——给一个明确判断
4. **行动建议**: 1 行——基于以上分析，普通投资者该怎么办

要求：
- 总长度不超过 250 字
- 客观、克制、不站队
- 引用具体大佬名字和他们的关键论点
- 用简体中文`;

  const user = `用户问：${question}\n\n${replies.length} 位大佬回答如下：\n\n${repBlock}\n\n请生成陪审团判决书。`;

  try {
    const res = await fetch(`${LLM_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        max_tokens: 600, temperature: 0.5, stream: false,
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `LLM ${res.status}` }, { status: 500, headers: cors });
    }
    const d: any = await res.json();
    const verdict = d?.choices?.[0]?.message?.content || "";
    return NextResponse.json({ verdict }, { headers: cors });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500, headers: cors });
  }
}
