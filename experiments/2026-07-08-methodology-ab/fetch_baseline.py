#!/usr/bin/env python3
"""抓交易对线线上 API 的基线回答（现有流水线）"""
import json, urllib.request, sys, pathlib

BASE = "https://jiaoyi-duixian.vercel.app/api/chat/v2/stream"
CASES = [
    ("duan_aapl",  "duan-yongping", "苹果现在还能买吗？"),
    ("guan_cmb",   "guan-wo-cai",   "招商银行怎么看，值得拿吗？"),
    ("guan_cosco", "guan-wo-cai",   "中远海控股息率十几个点，能买吗？"),
]

outdir = pathlib.Path(__file__).parent / "baseline"
outdir.mkdir(exist_ok=True)

for name, sage, msg in CASES:
    print(f"=== {name}: {sage} × {msg}", flush=True)
    req = urllib.request.Request(
        BASE,
        data=json.dumps({"sage_id": sage, "message": msg}).encode(),
        headers={"Content-Type": "application/json"},
    )
    events = []
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            cur_event = None
            for raw in r:
                line = raw.decode("utf-8", "replace").rstrip("\n")
                if line.startswith("event: "):
                    cur_event = line[7:]
                elif line.startswith("data: ") and cur_event:
                    try:
                        events.append({"event": cur_event, "data": json.loads(line[6:])})
                    except json.JSONDecodeError:
                        events.append({"event": cur_event, "raw": line[6:]})
    except Exception as e:
        print(f"  ERROR: {e}", flush=True)
        events.append({"event": "fetch_error", "data": str(e)})

    (outdir / f"{name}.json").write_text(json.dumps(events, ensure_ascii=False, indent=1))
    done = next((e for e in events if e["event"] == "done"), None)
    if done:
        reply = done["data"].get("fullReply", "")
        print(f"  OK, {len(reply)} chars", flush=True)
    else:
        print(f"  NO done event, {len(events)} events: {[e['event'] for e in events][:10]}", flush=True)
print("ALL DONE", flush=True)
