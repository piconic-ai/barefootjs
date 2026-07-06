# BarefootJS Benchmarks

Performance comparison of **BarefootJS** against **React**, **SolidJS**, and
a **vanilla JS** baseline, measured with the operation set and semantics of
the community-standard [krausest js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
(keyed category), plus an SSR + hydration scenario and a
reactive-primitives microbenchmark.

**A note on intent.** React and Solid are excellent frameworks that we
respect and learn from — BarefootJS's reactivity is openly Solid-inspired.
These benchmarks exist to check that BarefootJS holds its own, not to
diminish anyone. Every implementation here is each framework at its
*idiomatic best* (modeled on the official krausest implementations), the
harness verifies correctness before it accepts a timing, and results are
published as measured — including the ones where BarefootJS loses.

## What is measured

### 1. DOM update suite (`runner/bench-dom.ts`)

The nine krausest keyed operations, driven by real button clicks in
headless Chromium:

| Op | Meaning |
|----|---------|
| create1k | create 1,000 rows from empty |
| replace1k | replace all 1,000 rows with fresh data |
| update10th | append ` !!!` to every 10th label |
| select | highlight one row (class change) |
| swap | swap rows at index 1 and 998 |
| remove | remove one row |
| create10k | create 10,000 rows |
| append1k | append 1,000 rows to 10,000 |
| clear10k | remove all 10,000 rows |

Plus per-framework **startup** (navigation → interactive), **memory**
(JS heap delta for 1,000 rows, after forced GC), and **shipped JS**
(raw + gzip bytes of the production bundle).

### 2. SSR + hydration (`ssr/bench-ssr.ts`)

The same 1,000-row table server-rendered, then hydrated:
**server render time** (pure runtime, no browser), **hydration time**
(client-script start → interactive, double-rAF fenced), an
**interactivity gate** (a real click must apply the selection — a
framework that fails gets no timing), and **payload sizes** (client JS and
HTML document, raw + gzip). No vanilla column — there is no meaningful
vanilla hydration story.

### 3. Reactive primitives (`reactive.ts`)

Signal/effect/memo micro-operations, BarefootJS vs SolidJS only. React is
deliberately excluded here: it has no equivalent standalone primitive, so
including it would be a strawman. Solid's `createComputed` is used as the
synchronous analogue of BarefootJS's `createEffect` (the file-top comment
documents why, with measured evidence).

## Why you can trust the comparison

- **Idiomatic, optimized implementations.** The React app mirrors the
  official krausest `react-hooks` implementation (single `useReducer`,
  stable `dispatch`, `memo`ized row with custom equality, keyed `.map`).
  The Solid app mirrors the official krausest `solid` implementation
  (`<For>`, per-row label signals, `batch`, `createSelector`). Both were
  written against the current upstream sources, not from memory.
- **BarefootJS runs its real pipeline.** The BarefootJS app is a normal
  `"use client"` component compiled by the actual `bf` CLI build — not
  hand-written DOM, not a special benchmark path. What's measured is what
  a user's app ships.
- **Correctness gates.** After every operation the harness asserts row
  counts, ids, labels, selection uniqueness, and swap/remove effects.
  A framework that fails an assertion is reported FAILED with no timing.
- **Keyed-behavior proof.** The BarefootJS smoke test additionally verifies
  by element identity that `swap` moves existing DOM nodes rather than
  rebuilding rows.
- **Same workload everywhere.** All apps share one data generator
  (`apps/shared/data.ts`, krausest's adjective/colour/noun tables) and one
  stylesheet. The SSR bench uses a single fixed `data.json` for
  byte-identical server workloads.
- **Statistics, not single numbers.** Warmup iterations are discarded;
  medians with quartile spread are reported; raw per-iteration data,
  library versions, Chromium version, and CPU model are written to
  `results/*.json`.

## Timing methodology

Measured time = in-page `performance.now()` from the button `.click()`
call to a **double-`requestAnimationFrame` fence** after it — i.e. event
handling, framework work, style/layout, and a produced frame.

Chromium runs with `--disable-gpu-vsync --disable-frame-rate-limit
--run-all-compositor-stages-before-draw`. Without these flags the bare
fence costs ~33 ms (two 60 Hz frames) in this environment, which would
swamp sub-frame operations; with them the bare-fence floor is < 1 ms —
verified by `runner/fence-floor-check.ts`, which you can run yourself.
Between iterations the harness resets state to the operation's
precondition and forces GC via CDP (`HeapProfiler.collectGarbage`).

This is wall-clock click-to-frame timing, not the CPU-trace slicing the
krausest harness uses, so absolute numbers are not comparable to the
published krausest tables — the cross-framework *ratios* under an
identical harness are the meaningful output.

## Running

```sh
bun install
bun run --filter '@barefootjs/shared' build && \
bun run --filter '@barefootjs/streaming' build && \
bun run --filter '@barefootjs/jsx' build && \
bun run --filter '@barefootjs/client' build

bun benchmarks/runner/build.ts          # build all four apps (+ size table)
bun benchmarks/runner/bench-dom.ts      # full DOM suite (~10 min)
bun benchmarks/runner/bench-dom.ts --quick --md   # reduced iterations, markdown
bun benchmarks/ssr/bench-ssr.ts         # SSR + hydration
bun benchmarks/reactive.ts              # reactive primitives microbench
```

Per-app Playwright smoke tests (correctness only):
`bun benchmarks/apps/<react|solid|barefoot>/smoke.ts`.

CI runs the quick DOM suite + SSR bench on PRs touching
`packages/client/**` or `benchmarks/**` and posts the tables as a PR
comment (`.github/workflows/benchmark.yml`).

## Results

Snapshot from one full run. Environment: headless Chromium 141.0.7390.37,
Bun 1.3.11, React 19.2.7, Solid 1.9.14, Intel Xeon @ 2.10GHz (containerized
CI-class hardware — rerun locally for your own numbers; ratios are the
signal, wall-clock will differ).

### DOM update suite (median, ×factor vs vanilla)

| Operation | vanilla | barefoot | react | solid |
|---|---|---|---|---|
| create1k | 104.20 ms | 116.40 ms (1.12x) | 105.85 ms (1.02x) | 111.35 ms (1.07x) |
| replace1k | 128.10 ms | 142.50 ms (1.11x) | 136.20 ms (1.06x) | 131.95 ms (1.03x) |
| update10th | 20.70 ms | 19.00 ms (0.92x) | 22.15 ms (1.07x) | 21.95 ms (1.06x) |
| select | 4.70 ms | 6.15 ms (1.31x) | 8.00 ms (1.70x) | 5.85 ms (1.24x) |
| swap | 20.85 ms | 21.35 ms (1.02x) | 104.15 ms (5.00x) | 29.95 ms (1.44x) |
| remove | 24.90 ms | 27.35 ms (1.10x) | 28.65 ms (1.15x) | 29.70 ms (1.19x) |
| create10k | 914.60 ms | 1027.60 ms (1.12x) | 1372.40 ms (1.50x) | 955.60 ms (1.04x) |
| append1k | 353.10 ms | 390.20 ms (1.11x) | 476.80 ms (1.35x) | 357.70 ms (1.01x) |
| clear10k | 73.70 ms | 92.50 ms (1.26x) | 155.80 ms (2.11x) | 84.00 ms (1.14x) |
| startup | 39.30 ms | 47.20 ms (1.20x) | 83.40 ms (2.12x) | 39.90 ms (1.02x) |
| memory (1k rows) | 253.2KB | 1495.4KB (5.91x) | 2092.3KB (8.26x) | 1483.4KB (5.86x) |
| shipped JS (gzip) | 1.1KB | 8.7KB | 58.8KB | 6.8KB |

Reading it honestly: BarefootJS sits close to the vanilla baseline on
every operation — competitive with React and Solid across the board
(individual cells swing a few tenths between runs on shared hardware;
compare whole columns, not single cells). Heap per 1k rows is at Solid's
level and shipped JS (8.7KB gzip) is near Solid's 6.8KB after the CLI
started tree-shaking the runtime bundle to each project's used exports.
These numbers include the compiler's hoisted shared loop template (one
HTML parse per loop, clone per row) and the runtime's generation-stamped
dependency tracking — the first published run of this suite predated all
three optimizations and had creation-path numbers at 1.4-1.5x and
19.4KB gzip shipped.

### SSR + hydration (1,000-row table)

| Metric | react | solid | barefoot |
|---|---|---|---|
| Server render (median, n=20) | 24.76 ms | 0.38 ms | 9.18 ms |
| Hydration time (median, n=10) | 43.35 ms | 25.05 ms | 31.15 ms |
| Interactivity gate | PASS | PASS | PASS |
| Client JS (raw / gzip) | 182.3KB / 58.1KB | 17.0KB / 6.6KB | 18.6KB / 7.0KB |
| HTML document (raw / gzip) | 220.0KB / 14.9KB | 235.9KB / 18.6KB | 318.6KB / 19.5KB |

Solid's sub-millisecond server render (precompiled string templates) is a
genuine strength of its SSR design. BarefootJS renders 3x faster than
React and hydrates between the two, with a Solid-sized client payload; its
HTML is the largest because props ride in the `bf-p` attribute (see
limitations).

### Reactive primitives (`bun benchmarks/reactive.ts`)

BarefootJS vs SolidJS on raw signal/effect/memo operations: after the
generation-stamped dependency-tracking optimization, BarefootJS leads on
signal creation, reads, effect dispatch (single-subscriber and fan-out),
unbatched deep chains, independent chains, and partial updates; Solid
stays ahead on raw no-subscriber writes and batched deep-chain
propagation. Run it locally for the full table — neither library is
uniformly faster at the primitive level.

## Honest limitations

- **Microbenchmarks are not app performance.** This suite measures list
  rendering hot paths; real applications are dominated by other things.
- **Headless, containerized hardware.** Numbers vary by machine; ratios
  are the signal. Environment details are captured in `results/*.json`.
- **Double-rAF fencing** measures through frame production but is not a
  paint-trace; it can differ from krausest's tracing-based numbers by a
  small constant.
- **Hydration strategies differ by design** (React reconciles a fresh
  VDOM against existing DOM; Solid attaches via hydration markers;
  BarefootJS attaches effects/listeners to marked scopes without
  re-rendering). The reported metric is user-experienced cost-to-
  interactive on the same page, not a claim that the internal work is
  equivalent.
- **BarefootJS SSR HTML is larger** in the hydration scenario: the
  framework serializes component props (here, all 1,000 rows) into the
  `bf-p` scope attribute, while the React/Solid pages deliver the same
  data via a `window.__DATA__` script. That's the real mechanism each
  framework ships; we did not hand-optimize around it.
- **Selection fan-out**: the BarefootJS app expresses selection as
  `selected() === row.id` per row (the natural user pattern), which
  subscribes every row to one signal; Solid's `createSelector` is O(1) by
  design. The measured `select` numbers include this difference.
- Findings that came out of building this suite (a CLI sibling-import gap
  in `clientOnly` builds, an O(n²) bulk-dispose pattern in the reactive
  core, list-reconciler move batching) are documented in the code and
  addressed where in scope — the benchmark reflects the framework as it
  is, improvements and all.
