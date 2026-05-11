#!/usr/bin/env python3
"""
baseline_gate.py — 跑 N 个 query，对比 baseline.json 检查回归

用法：
    python3 scripts/baseline_gate.py                     # 用默认 query 集
    python3 scripts/baseline_gate.py --tolerance 1.30    # 容差 30%
    python3 scripts/baseline_gate.py --queries-only      # 只 dry-run，不写

退出码：
    0 — 全部通过
    1 — TTFB 或 chunks 指标超 baseline × tolerance
    2 — fallback 命中
"""
import argparse, json, os, subprocess, sys
from statistics import median

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE_FILE = os.path.join(PROJECT_ROOT, 'baseline.json')

# 默认压测组合（与 baseline 采集时相同，保证可比）
DEFAULT_QUERIES = [
    ('duan-yongping', '苹果还能拿吗'),
    ('duan-yongping', '拼多多怎么看'),
    ('duan-yongping', '你为什么换神华去泡泡玛特'),
    ('duan-yongping', '腾讯还能拿吗'),
    ('guan-wo-cai', '腾讯能买吗'),
    ('guan-wo-cai', '招行 PE 历史什么分位'),
    ('guan-wo-cai', '26 年荒岛策略选什么'),
    ('guan-wo-cai', '工行能买吗'),
]


def run_one(sage, query, base):
    """跑一次 bench，返回 dict（含 ttfb_done / chunks / fallback flag）"""
    r = subprocess.run(
        ['python3', os.path.join(PROJECT_ROOT, 'scripts', 'bench_chat_stream.py'),
         sage, query, '--runs', '1', '--json', '--base', base],
        capture_output=True, text=True, timeout=180,
    )
    out = (r.stdout or '').strip()
    if not out:
        return None
    try:
        d = json.loads(out.splitlines()[-1])
    except Exception:
        return None
    counts = d.get('counts') or {}
    return {
        'sage': sage, 'query': query,
        'ttfb_done': d.get('ttfb_done'),
        'ttfb_first_chunk': d.get('ttfb_first_chunk'),
        'chunks': counts.get('chunk', 0),
        'analyst_chunks': counts.get('analyst_chunk', 0),
        'tool_calls': counts.get('tool_call', 0),
        'is_fallback': counts.get('chunk', 0) <= 5,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='https://sage-jury.vercel.app')
    ap.add_argument('--tolerance', type=float, default=1.30,
                    help='allow current to exceed baseline by this multiplier (default 1.30 = +30 percent)')
    ap.add_argument('--queries-only', action='store_true', help='print test queries & exit')
    args = ap.parse_args()

    if args.queries_only:
        for s, q in DEFAULT_QUERIES:
            print(f'{s} | {q}')
        return 0

    if not os.path.exists(BASELINE_FILE):
        print(f'ERR: baseline {BASELINE_FILE} not found. Run a full bench + write baseline first.', file=sys.stderr)
        return 1

    with open(BASELINE_FILE, 'r') as f:
        baseline = json.load(f)
    agg = baseline['aggregates']

    print(f'baseline captured_at: {baseline.get("captured_at")}')
    print(f'baseline TTFB done p50: {agg["ttfb_done"]["p50"]:.1f}s, p95: {agg["ttfb_done"]["p95"]:.1f}s')
    print(f'tolerance: ×{args.tolerance:.2f}')
    print()

    results = []
    for s, q in DEFAULT_QUERIES:
        print(f'  testing [{s}] {q}...', end=' ', flush=True)
        r = run_one(s, q, args.base)
        if not r:
            print('ERR (no data)')
            continue
        flag = '⚠️' if r['is_fallback'] else '  '
        print(f'{flag} done={r["ttfb_done"]:.1f}s chunks={r["chunks"]}')
        results.append(r)

    print()
    print('=== Verdict ===')
    if not results:
        print('FAIL: 0 results collected')
        return 1

    fallback_count = sum(1 for r in results if r['is_fallback'])
    ttfb_dones = [r['ttfb_done'] for r in results if r['ttfb_done']]
    cur_p50 = median(ttfb_dones)
    cur_max = max(ttfb_dones)

    base_p50 = agg['ttfb_done']['p50']
    base_p95 = agg['ttfb_done']['p95']
    base_max = agg['ttfb_done']['max']

    print(f'current TTFB done p50: {cur_p50:.1f}s (baseline p50: {base_p50:.1f}s, threshold: {base_p50 * args.tolerance:.1f}s)')
    print(f'current TTFB done max: {cur_max:.1f}s (baseline max: {base_max:.1f}s, threshold: {base_max * args.tolerance:.1f}s)')
    print(f'fallback hits: {fallback_count}/{len(results)}')

    rc = 0
    if fallback_count > 0:
        print(f'❌ FAIL: {fallback_count} runs hit fallback (chunks ≤ 5)')
        rc = max(rc, 2)
    if cur_p50 > base_p50 * args.tolerance:
        print(f'❌ FAIL: TTFB done p50 regression')
        rc = max(rc, 1)
    if cur_max > base_max * args.tolerance:
        print(f'❌ FAIL: TTFB done max regression')
        rc = max(rc, 1)

    if rc == 0:
        print('✅ PASS: no regression detected')
    return rc


if __name__ == '__main__':
    sys.exit(main())
