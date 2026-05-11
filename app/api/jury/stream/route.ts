// POST /api/jury/stream — 真 multi-sage 陪审团 SSE
//
// v60.5.0: sage-jury 名字核心终于兑现。并行调用 N 个 /api/chat/stream，
// 把每个 sage 的 SSE 事件包装成带 sage_id 的合并 stream 给前端。
//
// 入参：
//   { sage_ids: string[2-5], message: string, history?: Array<{role, content}> }
//
// 输出 SSE 事件格式：
//   event: jury_event
//   data: {"sage_id":"duan-yongping","type":"chunk","payload":{"delta":"..."}}
//
//   event: jury_done
//   data: {"all_done":true,"sage_states":{...}}
//
// 设计选择：直接 fetch 内部 /api/chat/stream（已支持 v60.4.7 fallback），
// 不重写 agent loop。优势：复用 retry / DSML 清洗 / chunk splitting 等
// chat/stream 全部修复；劣势：多一次 HTTP 跳转开销，可接受（同进程 edge）。

import { NextRequest } from "next/server";
import { SAGE_BY_ID } from "@/data/sages";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_SAGES = 5;
const MIN_SAGES = 2;

// 标准 SSE 事件序列化
function sse(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// 一个 sage 的子流 → 转成 jury 事件，写入主 controller
async function pumpSageStream(
  sage_id: string,
  baseUrl: string,
  body: any,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  sageStates: Record<string, any>
): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sage_id, message: body.message, history: body.history || [] }),
    });
    if (!res.ok || !res.body) {
      controller.enqueue(encoder.encode(sse("jury_event", {
        sage_id, type: "error", payload: { message: `chat/stream ${res.status}` },
      })));
      sageStates[sage_id].error = `http ${res.status}`;
      sageStates[sage_id].done = true;
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let evt = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          evt = line.slice(7).trim();
          continue;
        }
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        let parsed: any;
        try { parsed = JSON.parse(payload); } catch { continue; }
        // 转发：包装成 jury_event
        controller.enqueue(encoder.encode(sse("jury_event", {
          sage_id, type: evt, payload: parsed,
        })));
        // 维护每位 sage 的累积状态
        const state = sageStates[sage_id];
        if (evt === "chunk" && parsed.delta) {
          state.content += parsed.delta;
          state.chunks++;
        } else if (evt === "analyst_chunk" && parsed.delta) {
          state.analystChars += parsed.delta.length;
          state.analystChunks++;
        } else if (evt === "tool_call") {
          state.toolCalls++;
        } else if (evt === "done") {
          state.done = true;
          state.fullReply = parsed.fullReply || state.content;
          state.followups = parsed.followups || [];
        }
      }
    }
    if (!sageStates[sage_id].done) sageStates[sage_id].done = true;
  } catch (e: any) {
    controller.enqueue(encoder.encode(sse("jury_event", {
      sage_id, type: "error", payload: { message: e?.message || String(e) },
    })));
    sageStates[sage_id].error = e?.message || String(e);
    sageStates[sage_id].done = true;
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return new Response("Bad JSON", { status: 400 }); }
  const sage_ids: string[] = Array.isArray(body?.sage_ids) ? body.sage_ids : [];
  const message: string = (body?.message || "").trim();

  if (!message) return new Response("Empty message", { status: 400 });
  if (sage_ids.length < MIN_SAGES || sage_ids.length > MAX_SAGES) {
    return new Response(`sage_ids must have ${MIN_SAGES}-${MAX_SAGES} entries`, { status: 400 });
  }
  // 验证每个 sage_id 都合法
  for (const id of sage_ids) {
    if (!SAGE_BY_ID[id]) {
      return new Response(`Unknown sage: ${id}`, { status: 400 });
    }
  }
  // 去重
  const uniqIds = Array.from(new Set(sage_ids));

  // baseUrl from request — Vercel 内部调 self
  const u = new URL(req.url);
  const baseUrl = `${u.protocol}//${u.host}`;

  const sageStates: Record<string, any> = {};
  for (const id of uniqIds) {
    sageStates[id] = {
      sage_id: id,
      display: SAGE_BY_ID[id]?.name || id,
      content: "",
      chunks: 0,
      analystChars: 0,
      analystChunks: 0,
      toolCalls: 0,
      done: false,
      fullReply: "",
      followups: [] as string[],
      error: null as string | null,
    };
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 通知前端：jury 启动 + sage 列表
      controller.enqueue(encoder.encode(sse("jury_start", {
        sages: uniqIds.map(id => ({
          sage_id: id, display: SAGE_BY_ID[id]?.name || id,
        })),
      })));

      // 并行 pump 所有 sage 流
      await Promise.all(uniqIds.map(id =>
        pumpSageStream(id, baseUrl, body, controller, encoder, sageStates)
      ));

      // 全部 done
      controller.enqueue(encoder.encode(sse("jury_done", {
        all_done: true,
        sage_states: Object.fromEntries(
          uniqIds.map(id => [id, {
            chunks: sageStates[id].chunks,
            analystChunks: sageStates[id].analystChunks,
            toolCalls: sageStates[id].toolCalls,
            replyLength: sageStates[id].fullReply.length,
            error: sageStates[id].error,
            followups: sageStates[id].followups,
          }])
        ),
      })));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// GET 用于 health check / spec discovery
export async function GET() {
  return Response.json({
    service: "sage-jury · multi-sage jury",
    version: "v60.5.0",
    endpoint: "POST /api/jury/stream",
    input: {
      sage_ids: `string[${MIN_SAGES}-${MAX_SAGES}] (仅 SAGE_BY_ID 合法)`,
      message: "string (required)",
      history: "Array<{role,content}> (optional)",
    },
    output_events: [
      "jury_start: { sages: [{sage_id, display}] }",
      "jury_event: { sage_id, type: <upstream event name>, payload: <upstream data> }",
      "jury_done: { all_done, sage_states: {...} }",
    ],
    available_sages: Object.keys(SAGE_BY_ID),
  });
}
