# Probe runner (Python / Jinja evaluator). Reads $PROBE_VECTORS. See ../README.md.
import json, os
from barefootjs import evaluator

def _match(got, expect):
    if expect is None:
        return got is None
    if isinstance(expect, dict) and "$num" in expect:
        kind = expect["$num"]
        if isinstance(got, bool) or not isinstance(got, (int, float)):
            return False
        g = float(got)
        if kind == "NaN":
            return g != g
        return g == (float("inf") if kind == "Infinity" else float("-inf"))
    if isinstance(expect, bool):
        return isinstance(got, bool) and got == expect
    if isinstance(expect, list):
        return isinstance(got, list) and len(got) == len(expect) and all(_match(g, e) for g, e in zip(got, expect))
    if isinstance(expect, dict):
        return isinstance(got, dict) and len(got) == len(expect) and all(k in got and _match(got[k], v) for k, v in expect.items())
    if got is None or isinstance(got, (list, dict)):
        return False
    want_num = isinstance(expect, (int, float)) and not isinstance(expect, bool)
    got_num = isinstance(got, (int, float)) and not isinstance(got, bool)
    if want_num != got_num:
        return False
    if want_num:
        return float(got) == float(expect)
    return got == expect

doc = json.load(open(os.environ["PROBE_VECTORS"], encoding="utf-8"))
for c in doc["cases"]:
    try:
        got = evaluator.evaluate(c["expr"], c.get("env") or {})
    except Exception as exc:
        print(f"ERROR\t{c['category']}\t{c['note']}\t{type(exc).__name__}: {exc}")
        continue
    if not _match(got, c["expect"]):
        kind = "KNOWN" if c.get("known") else "NEW"
        print(f"{kind}\t{c['category']}\t{c['note']}\t{got!r}\t{c['expect']!r}")
print(f"RAN\t{len(doc['cases'])}")
