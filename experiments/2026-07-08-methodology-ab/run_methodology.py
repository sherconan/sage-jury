#!/usr/bin/env python3
"""方法论驱动版：同模型(deepseek-v4-pro) + 同数据(buildDossier档案) + 方法论skill，让模型自己推理"""
import json, os, pathlib, sys, urllib.request

HERE = pathlib.Path(__file__).parent

# 从项目 .env.local 读 LLM 配置（与线上同一通道）
env = {}
for line in pathlib.Path("/Users/USER/sage-jury/.env.local").read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

BASE = env.get("SAGE_LLM_BASE", "https://api.bocha.cn/v1")
KEY = env.get("SAGE_LLM_KEY") or env.get("BOCHA_API_KEY")
MODEL = env.get("SAGE_LLM_FAST_MODEL", "deepseek-v4-pro")
assert KEY, "缺 LLM key"

CASES = [
    ("duan_aapl",  "methodology_duan.md", "dossier_AAPL.json",   "苹果现在还能买吗？"),
    ("guan_cmb",   "methodology_guan.md", "dossier_600036.json", "招商银行怎么看，值得拿吗？"),
    ("guan_cosco", "methodology_guan.md", "dossier_601919.json", "中远海控股息率十几个点，能买吗？"),
]

outdir = HERE / "methodology"
outdir.mkdir(exist_ok=True)

only = sys.argv[1:]  # 传 case 名则只跑这些
for name, skill_file, dossier_file, question in CASES:
    if only and name not in only:
        continue
    system = (HERE / skill_file).read_text()
    dossier = json.loads((HERE / dossier_file).read_text())
    user = f"""用户问：{question}

# 研究档案（真实数据，来自东方财富/Wind，单位见字段注释：revenue/netProfit 为亿元，各比率为 %）

{json.dumps(dossier, ensure_ascii=False, indent=1)}

# 你的任务

按你的方法论，把这家公司从头到尾亲自想一遍——每一关都要真的用档案里的多年数据去验证，不要跳步。想清楚之后，写出你的分析和结论。"""

    print(f"=== {name}: {question}", flush=True)
    req = urllib.request.Request(
        f"{BASE}/chat/completions",
        data=json.dumps({
            "model": MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": 2400,
            "temperature": 0.85,
        }).encode(),
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            resp = json.loads(r.read())
        reply = resp["choices"][0]["message"]["content"]
        (outdir / f"{name}.md").write_text(reply)
        print(f"  OK, {len(reply)} chars", flush=True)
    except Exception as e:
        print(f"  ERROR: {e}", flush=True)

print("ALL DONE", flush=True)
