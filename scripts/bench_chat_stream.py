#!/usr/bin/env python3
"""
bench_chat_stream.py — 给 sage-jury /api/chat/stream 跑 TTFB / 各事件耗时基线

用法：
    python3 scripts/bench_chat_stream.py guan-wo-cai "腾讯现在能买吗" \
        --base https://sage-jury.vercel.app --runs 1
    python3 scripts/bench_chat_stream.py guan-wo-cai "腾讯能买吗" --runs 3 --json

输出（每 run）：
    ttfb_first_event       # SSE 任意第一事件
    ttfb_first_quotes
    ttfb_first_tool_call
    ttfb_first_analyst     # 第一个 analyst_chunk（思考流）
    ttfb_first_chunk       # 第一个 content chunk（writer）
    ttfb_done              # done 事件
    duration_total         # 整体响应
    counts: { event_type: count }

退出码: 0 OK；1 query 失败；2 done 没出现
"""
import argparse, json, sys, time, urllib.request, urllib.error
from statistics import mean, median


def stream_one(base_url, sage_id, message, history, timeout=180):
    """跑一次 stream，返回时间戳事件列表 + counts"""
    url = base_url.rstrip('/') + '/api/chat/stream'
    body = json.dumps({'sage_id': sage_id, 'message': message, 'history': history or []}).encode()
    req = urllib.request.Request(url, data=body, headers={'Content-Type': 'application/json'}, method='POST')

    t0 = time.monotonic()
    events = []  # (relative_seconds, event_type)
    counts = {}
    err = None
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            buf = b''
            current_evt = ''
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buf += chunk
                # SSE 行以 \n 分割；事件块以空行结尾
                while b'\n' in buf:
                    line, buf = buf.split(b'\n', 1)
                    line = line.decode('utf-8', errors='replace').rstrip('\r')
                    if line.startswith('event: '):
                        current_evt = line[7:].strip()
                    elif line.startswith('data: '):
                        if current_evt:
                            t = time.monotonic() - t0
                            events.append((t, current_evt))
                            counts[current_evt] = counts.get(current_evt, 0) + 1
                        current_evt = ''
                    # 空行忽略
    except (urllib.error.URLError, TimeoutError) as e:
        err = str(e)

    duration = time.monotonic() - t0
    return events, counts, duration, err


def first_ts(events, evt_name):
    for t, e in events:
        if e == evt_name:
            return t
    return None


def summarize(events, counts, duration, err):
    return {
        'ttfb_first_event': events[0][0] if events else None,
        'ttfb_first_quotes': first_ts(events, 'quotes'),
        'ttfb_first_tool_call': first_ts(events, 'tool_call'),
        'ttfb_first_analyst': first_ts(events, 'analyst_chunk'),
        'ttfb_first_chunk': first_ts(events, 'chunk'),
        'ttfb_done': first_ts(events, 'done'),
        'duration_total': duration,
        'counts': counts,
        'err': err,
    }


def fmt_ms(s):
    if s is None:
        return '   -   '
    return f'{int(s * 1000):>5d}ms'


def print_run(idx, summary):
    print(f'\n--- Run #{idx} ---')
    if summary['err']:
        print(f'  ERR: {summary["err"]}')
    print(f'  TTFB first event   : {fmt_ms(summary["ttfb_first_event"])}')
    print(f'  TTFB first quotes  : {fmt_ms(summary["ttfb_first_quotes"])}')
    print(f'  TTFB first tool    : {fmt_ms(summary["ttfb_first_tool_call"])}')
    print(f'  TTFB first analyst : {fmt_ms(summary["ttfb_first_analyst"])}')
    print(f'  TTFB first chunk   : {fmt_ms(summary["ttfb_first_chunk"])}')
    print(f'  TTFB done          : {fmt_ms(summary["ttfb_done"])}')
    print(f'  total duration     : {fmt_ms(summary["duration_total"])}')
    print(f'  event counts       : {summary["counts"]}')


def aggregate(summaries, key):
    vals = [s[key] for s in summaries if s[key] is not None and not s.get('err')]
    if not vals:
        return None
    return {'min': min(vals), 'p50': median(vals), 'mean': mean(vals), 'max': max(vals), 'n': len(vals)}


def print_aggregate(name, agg):
    if not agg:
        print(f'  {name}: no data')
        return
    print(f'  {name}: p50={fmt_ms(agg["p50"])}  mean={fmt_ms(agg["mean"])}  '
          f'min={fmt_ms(agg["min"])}  max={fmt_ms(agg["max"])}  n={agg["n"]}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sage_id')
    ap.add_argument('message')
    ap.add_argument('--base', default='https://sage-jury.vercel.app')
    ap.add_argument('--runs', type=int, default=1)
    ap.add_argument('--json', action='store_true', help='emit JSON line(s) instead of pretty print')
    ap.add_argument('--timeout', type=int, default=180)
    args = ap.parse_args()

    summaries = []
    for i in range(1, args.runs + 1):
        events, counts, duration, err = stream_one(args.base, args.sage_id, args.message, [], args.timeout)
        s = summarize(events, counts, duration, err)
        summaries.append(s)
        if args.json:
            print(json.dumps({'run': i, **s}, ensure_ascii=False))
        else:
            print_run(i, s)
        if i < args.runs:
            time.sleep(2)  # 间隔 2s 避免速率打架

    if args.runs > 1 and not args.json:
        print('\n=== Aggregate ===')
        for k in ['ttfb_first_analyst', 'ttfb_first_chunk', 'ttfb_done', 'duration_total']:
            print_aggregate(k, aggregate(summaries, k))

    # 退出码
    if any(s.get('err') for s in summaries):
        return 1
    if not all(s['ttfb_done'] for s in summaries):
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
