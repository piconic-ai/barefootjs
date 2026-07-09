# Generative divergence probe (evaluator)

A discovery harness that **systematically** hunts for places where a backend
`ParsedExpr` evaluator (Go / Ruby / Perl / Python / PHP) disagrees with the JS
reference — the class of bug that stays green in the hand-written
`eval-vectors.json` corpus simply because nobody enumerated the offending
input. (The `Number("5.")` Ruby SSR crash and the Go `"1_000"` / hex-float
over-acceptance fixed in the evaluator were exactly this.)

Nothing here is a committed conformance vector — it is a **dev tool**. The
generated corpus (`probe-vectors.json`) is git-ignored and regenerated on every
run.

## How it works

1. `generate-probe.ts` crosses a set of expression **templates** (one per
   evaluator-subset feature: `Number(s)`, `String(n)`, `+`, relational,
   `.length`, `.includes`, `.join`, nested `.map`, `Math.*`, …) with a curated
   corpus of **spicy values** (edge inputs where JS coercion is subtle:
   `"5."`, `"1_000"`, `"0x1p4"`, `1e21`, `0.1+0.2`, `"café"`, `"😀"`, `null`,
   `-0`, numeric strings, …). Each generated case's expected value is computed
   by the JS reference evaluator (`eval-reference.ts`) — a free, always-correct
   oracle. Generation is deterministic (pure enumeration, no RNG).
2. Each case is tagged with a `known` flag when JS parity there is a
   **documented limitation**, not a bug:
   - string `.length` / char ops on **non-ASCII** input (spec: string ops are
     ASCII-domain; JS counts UTF-16 units, hosts count codepoints/bytes),
   - **inexact-float / big-number** stringification (`0.1+0.2`, `1e21`; spec's
     reduce/sort float-stringify caveat),
   - `Number()` of **radix-integer** strings (`0x1F` / `0b101` / `0o17`; the
     documented radix-divergence region).
3. `run-probe.ts` regenerates the corpus, replays it through every backend
   whose runtime is installed, and classifies each mismatch as `NEW`
   (undocumented → **fails**), `KNOWN` (tolerated, reported), or `ERROR` (the
   backend threw → **fails**; the evaluator must never raise on in-subset
   input).

## Run

```sh
cd packages/adapter-tests
bun vectors/probe/run-probe.ts
```

Exit code is non-zero iff any `NEW` divergence or `ERROR` is found, so this is
CI-wireable (in a job with all five language runtimes). Backends whose runtime
is absent are skipped visibly.

Run a single backend directly:

```sh
bun vectors/probe/generate-probe.ts          # writes probe-vectors.json
PROBE_VECTORS=$PWD/vectors/probe/probe-vectors.json ruby -I ../adapter-erb/lib vectors/probe/runners/probe.rb
# …and .pl / .py (PYTHONPATH=../adapter-jinja/python) / .php, or `go run .` in runners/go
```

## Triaging a `NEW` divergence

A `NEW` line is a genuine bug. Two outcomes:

- **Fix it** in the backend evaluator, then add the offending case to
  `vectors/eval-cases.ts` and regenerate `eval-vectors.json` so the committed
  corpus pins it forever (this is what landed the `Number()` grammar fix).
- **It's a newly-discovered documented limitation** → flag the contributing
  value `known` in `generate-probe.ts` with a comment pointing at the spec
  clause, so the probe stays green on it while staying loud about anything new.
