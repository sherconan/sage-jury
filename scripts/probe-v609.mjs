// v60.9 线上探针 — node fetch 实测 v2 endpoint，绕开 sandbox 30s 超时
const sage = process.argv[2] || "duan-yongping";
const msg = process.argv[3] || "阿里巴巴你怎么看呢";
const r = await fetch("https://sage-jury.vercel.app/api/chat/v2/stream", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ sage_id: sage, message: msg }),
});
const t = await r.text();
let reply = "", verdict = null, errs = null;
for (const ln of t.split("\n")) {
  if (!ln.startsWith("data:")) continue;
  try {
    const j = JSON.parse(ln.slice(5).trim());
    if (j.signal && j.dims) verdict = j;
    if (j.fullReply !== undefined) { reply = j.fullReply; errs = j.data_errors; }
  } catch {}
}
console.log(`[${sage}] <- ${msg}`);
console.log("signal:", verdict?.signal, "conf:", verdict?.confidence);
const peDim = verdict?.dims?.business?.note || verdict?.dims?.position?.note;
console.log("PE维度:", peDim);
console.log("data_errors:", JSON.stringify(errs));
console.log("reply(" + reply.length + "字):", reply);
