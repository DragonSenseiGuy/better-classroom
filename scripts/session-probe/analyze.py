"""Offline shape analyzer for Classroom RPC captures.

Reads raw capture files (stream-*.txt, subquery-*.txt), extracts the
batchexecute payload, and prints a REDACTED structural skeleton:
slot indices with value KINDS only. No string values, names, titles,
emails or text ever print — only lengths and pattern classes. Safe to
paste the output anywhere.

Usage:
    python3 scripts/session-probe/analyze.py <capture> [max-items]
"""

import json
import re
import sys

MS_EPOCH = 10**12


def extract(rpc: str, text: str):
    body = text
    if body.startswith(")]}'"):
        body = body[4:]
    for line in body.split('\n'):
        if not line.startswith('[['):
            continue
        try:
            parsed = json.loads(line)
        except Exception:
            continue
        if not isinstance(parsed, list):
            continue
        for entry in parsed:
            if (
                isinstance(entry, list)
                and len(entry) > 2
                and entry[0] == 'wrb.fr'
                and entry[1] == rpc
                and isinstance(entry[2], str)
            ):
                return json.loads(entry[2])
    raise SystemExit(f'no payload for rpc {rpc}')


def classify(v):
    if v is None:
        return 'null'
    if isinstance(v, bool):
        return 'bool'
    if isinstance(v, (int, float)):
        if isinstance(v, int) and v > MS_EPOCH:
            return 'ms-epoch'
        if isinstance(v, int) and abs(v) < 10000:
            return 'small-int'
        return 'number'
    if isinstance(v, str):
        if re.fullmatch(r'\d{9,25}', v):
            return f'id-str[{len(v)}d]'
        if v.startswith(('http://', 'https://', '//')):
            host = v.split('/')[2] if '//' in v else ''
            return f'url[{host}]'
        if v == 'edu.rt':
            return 'edu.rt-marker'
        if len(v) <= 60 and re.fullmatch(r'[\w .,;:!?\-\(\)/]+', v):
            return f'str[{len(v)}]'
        return f'text[{len(v)}]'
    if isinstance(v, list):
        return 'list'
    if isinstance(v, dict):
        return 'dict'
    return type(v).__name__


def skeleton(node, depth=0, max_depth=6):
    """(index-or-key, kind-or-nested) structural dump."""
    if isinstance(node, list):
        if depth >= max_depth:
            return f'list[{len(node)}]<cut>'
        return {str(i): skeleton(v, depth + 1, max_depth) for i, v in enumerate(node)}
    if isinstance(node, dict):
        if depth >= max_depth:
            return f'dict[{len(node)}]<cut>'
        return {k: skeleton(v, depth + 1, max_depth) for k, v in node.items()}
    return classify(node)


def summarize_items(payload, limit):
    if not isinstance(payload, list) or len(payload) < 3:
        print('unexpected payload shape')
        return
    entries = payload[2] if isinstance(payload[2], list) else []
    print(f'tag={payload[0]!r} entries={len(entries)}')
    for n, entry in enumerate(entries[:limit]):
        wrapper = entry[0] if isinstance(entry, list) else None
        print(f'--- entry {n} wrapper={wrapper!r}')
        print(json.dumps(skeleton(entry), indent=1)[:4000])


def main():
    path = sys.argv[1]
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else 8
    with open(path) as f:
        text = f.read()
    text = re.sub(r'^STATUS \d+\n', '', text)
    rpc = 'pONvgf' if 'stream-' in path else 'Zj93ge'
    payload = extract(rpc, text)
    if rpc == 'pONvgf':
        summarize_items(payload, limit)
    else:
        print(json.dumps(skeleton(payload), indent=1)[:6000])


main()
