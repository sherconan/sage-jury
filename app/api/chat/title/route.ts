// POST /api/chat/title — 用一次轻量 LLM 调用为 session 生成 ≤16 字标题
import { NextRequest, NextResponse } from "next/server";
export const runtime = "edge";
export const dynamic = "force-dynamic";

const LLM_BASE = process.env.SAGE_LLM_BASE || "https://api.deepseek.com";
const LLM_KEY  = process.env.SAGE_LLM_KEY  || "***DEEPSEEK_KEY_REMOVED***";
const LLM_MODEL = process.env.SAGE_LLM_MODEL || "deepseek-v4-pro";

export async function POST(req: NextRequest) {
  const { user, reply } = await req.json().catch(() => ({} as any));
  if (!user) return NextResponse.json({ title: "新对话" });
  try {
    const r = await fetch(`${LLM_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages: [
          { role: "system", content: "为投资对话生成 ≤16 字的简短标题。只输出标题本身，无引号无标点。如「茅台估值讨论」「腾讯能买吗」「老唐估值法」。" },
          { role: "user", content: `用户问：${String(user).slice(0, 200)}\n回答首句：${String(reply || "").split("\n")[0].slice(0, 100)}\n\n标题：` },
        ],
        max_tokens: 50, temperature: 0.4, stream: false,
      }),
    });
    if (!r.ok) return NextResponse.json({ title: String(user).slice(0, 16) });
    const d: any = await r.json();
    let t: string = d?.choices?.[0]?.message?.content || "";
    t = t.trim().replace(/^[「『""'《]+|[」』""'》]+$/g, "").replace(/^标题[:：\s]*/, "").trim();
    if (t.length > 20) t = t.slice(0, 18) + "…";
    return NextResponse.json({ title: t || String(user).slice(0, 16) });
  } catch { return NextResponse.json({ title: String(user).slice(0, 16) }); }
}
