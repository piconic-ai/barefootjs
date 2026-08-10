"""
SSR render-gap investigation, item 1 (where does hono/jsx's per-request
render time go?) -- NOT part of the product.

Parses the `--cpu-prof-md` markdown dump `profile-hono-render.ts` produces
(Bun's real JavaScriptCore sampling CPU profiler, not hand-rolled
instrumentation) and buckets its "Hot Functions (Self Time)" table into
named categories (hono's JSXNode tree-walk, native Object.entries(), the
escape pass, the compiled component body, etc.), separating one-time
compile/import cost (paid once before the measured loop, in the same
process) from the per-render-loop steady-state total.

Usage:
    bun --cpu-prof --cpu-prof-md --cpu-prof-name=hono-render.cpuprofile.md \\
      benchmarks/ssr/apps/barefoot/profile-hono-render.ts
    python3 benchmarks/ssr/apps/barefoot/analyze-profile.py \\
      benchmarks/ssr/apps/barefoot/hono-render.cpuprofile.md.md

The .md profile itself is a multi-MB generated artifact -- regenerate it
locally rather than expecting it committed.
"""
import re
import sys
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "hono-render.cpuprofile.md.md"
totals = defaultdict(float)
with open(path, encoding="utf-8") as f:
    lines = f.readlines()

start = next(i for i, l in enumerate(lines) if l.startswith("## Hot Functions (Self Time)"))
end = next(i for i, l in enumerate(lines) if l.startswith("## Call Tree"))
section = lines[start:end]

for line in section:
    m = re.match(
        r"\|\s*([\d.]+)% \| ([\d.]+)(m?s) \| ([\d.]+)% \| ([\d.]+)(m?s) \| `([^`]*)` \| `([^`]*)`",
        line,
    )
    if m:
        self_pct, self_val, self_unit, tot_pct, tot_val, tot_unit, fn, loc = m.groups()
        self_ms = float(self_val) * (1000 if self_unit == "s" else 1)
        totals[(fn, loc.split(":")[0])] += self_ms

ONE_TIME_NATIVE = {"resolve", "statSync", "readFileSync", "parseModule", "moduleDeclarationInstantiation", "join"}

per_render = defaultdict(float)
one_time = 0.0
for (fn, loc), ms in totals.items():
    if "typescript.js" in loc:
        one_time += ms
    elif loc == "[native code]" and fn in ONE_TIME_NATIVE:
        one_time += ms
    else:
        per_render[(fn, loc)] += ms

pr_total = sum(per_render.values())
print(f"per-render-loop total self time: {pr_total:.1f}ms   (one-time compile/import: {one_time:.1f}ms)")
print()
buckets = defaultdict(float)
for (fn, loc), ms in per_render.items():
    if "hono/dist/jsx/base.js" in loc and fn in ("toStringToBuffer", "childrenToStringToBuffer", "JSXNode", "JSXFunctionNode"):
        buckets["hono toStringToBuffer + childrenToStringToBuffer + JSXNode ctor"] += ms
    elif fn == "jsxFn":
        buckets["hono jsxFn (element factory / jsx() call)"] += ms
    elif "hono/dist/jsx/utils.js" in loc:
        buckets["hono normalizeIntrinsicElementKey / isValidAttributeName"] += ms
    elif "hono/dist/utils/html.js" in loc:
        buckets["hono escapeToBuffer + raw()"] += ms
    elif fn == "entries" and loc == "[native code]":
        buckets["native Object.entries() (called from toStringToBuffer attr loop)"] += ms
    elif fn == "search" and loc == "[native code]":
        buckets["native String.search (escapeToBuffer's regex probe)"] += ms
    elif loc == "[native code]" and fn == "/[&<>'\"]/":
        buckets["native regex literal (escapeToBuffer's escapeRe)"] += ms
    elif "jsx-dev-runtime" in loc:
        buckets["hono jsxDEV shim"] += ms
    elif "profile-compiled" in loc:
        buckets["compiled BenchSsr body (row .map, JSON.stringify, className calc)"] += ms
    elif fn == "stringify":
        buckets["native JSON.stringify (bf-p props payload)"] += ms
    elif fn == "map" and loc == "[native code]":
        buckets["native Array.prototype.map (row iteration)"] += ms
    else:
        buckets[f"other: {fn} ({loc})"] += ms

for k, v in sorted(buckets.items(), key=lambda x: -x[1]):
    print(f"{k:70s} {v:9.1f}ms  {100*v/pr_total:5.1f}%")
