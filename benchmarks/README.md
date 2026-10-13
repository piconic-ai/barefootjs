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
(raw + gzip bytes of the production bundle). The memory metric is
sensitive to per-row effect granularity: BarefootJS emits one
consolidated `createEffect` per plain loop row (slot unification row
granularity, `spec/slot-unification.md` §5a), so a compiler change that
splits or multiplies per-row effects shows up here first.

This app exercises the lazy row graph (§9). Its row reads the selection
signal directly (`selected() === row.id`, the same pattern as the SSR app
below); an earlier version went through `createSelector`, an opaque local
whose CALL was the reactive read, which the eligibility gate (§9.4) refused
until the runtime's re-subscribe seam (§9.3a) took over that obligation.
`createSelector` was then removed from `@barefootjs/client` (#3091, no
authored caller besides this benchmark). The lazy row graph is still
exercised through the ordinary primable-signal-getter path.

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
documents why, with measured evidence). Runs on Bun, not in a browser.

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
- **Same page everywhere.** Layout is a large share of click-to-frame time
  on a 1,000-row table, so the runner checks that the shared stylesheet
  actually applied before timing an app and reports every op FAILED when it
  did not. This gate exists because the BarefootJS app once linked its
  stylesheet with a root-absolute href that 404'd under the runner's
  `/<app>/` mount, and its whole DOM column was measured on an unstyled
  table (`update10th` read ~1.8x vanilla from the extra layout work alone).
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
bun run --filter '@barefootjs/vite' build && \
bun run --filter '@barefootjs/client' build

bun benchmarks/runner/build.ts          # build all four DOM-suite apps (+ size table)
bun benchmarks/ssr/apps/react/build.ts  # SSR apps (also built on demand by bench-ssr.ts)
bun benchmarks/ssr/apps/solid/build.ts
bun benchmarks/ssr/apps/barefoot/build.ts

bun benchmarks/runner/bench-dom.ts      # full DOM suite (~10 min)
bun benchmarks/runner/bench-dom.ts --quick --md   # reduced iterations, markdown
bun benchmarks/ssr/bench-ssr.ts         # SSR + hydration
bun benchmarks/ssr/bench-ssr-memory.ts  # SSR post-hydration heap
bun benchmarks/reactive.ts              # reactive primitives microbench
```

Every bench accepts `--md` (GitHub-flavored markdown instead of the plain
table); `bench-dom.ts` and `bench-ssr.ts` also take `--framework=a,b`, and
`bench-dom.ts` takes `--op=x,y`. The `@barefootjs/vite` build is required:
the BarefootJS apps are compiled through its `barefoot()` plugin.

Each bench writes its raw per-iteration data, library versions, Chromium
version and CPU model to `benchmarks/results/` (gitignored):
`latest.json` (DOM), `ssr-latest.json`, `ssr-memory-latest.json`,
`reactive-latest.json`. Those four files feed the snapshot below:

```sh
bun benchmarks/runner/update-readme.ts            # rewrite the Results block from results/*.json
bun benchmarks/runner/update-readme.ts --dry-run  # print the block instead
```

The script replaces only the text between the `benchmark-results` HTML
comment markers and refuses a `--quick` DOM run.

Per-app Playwright smoke tests (correctness only):
`bun benchmarks/apps/<react|solid|barefoot>/smoke.ts`. The one-off
investigation scripts under `ssr/measure-*.ts` and
`ssr/apps/barefoot/measure-*.ts` are documented in their file headers; they
are not part of the suite.

Chromium is resolved by `runner/chromium.ts`: a pre-provisioned build at
`$PLAYWRIGHT_BROWSERS_PATH/chromium` (the managed dev environment) wins,
otherwise Playwright's own install (`bunx playwright install chromium`).

### CI

Two workflows:

- **`.github/workflows/benchmark.yml`** runs the quick DOM suite, the SSR
  bench and the SSR post-hydration heap bench on main-based PRs touching
  `packages/client/**` or `benchmarks/**`, and posts the tables as a PR
  comment. It is a regression smoke check, not a source of publishable
  numbers. A stacked PR (base is not `main`) does not run it; dispatch it by
  hand against the branch when you need the numbers early (see AGENTS.md,
  "CI on stacked PRs").
- **`.github/workflows/update-benchmark-results.yml`** runs all four benches
  in full weekly (and on `workflow_dispatch`), regenerates the Results block
  below with `runner/update-readme.ts`, and opens or refreshes a PR on the
  `benchmark-results/update` branch with the diff. Review the diff against
  the previous snapshot before merging: single cells swing between runs on
  shared runners, so compare whole columns. With the default `GITHUB_TOKEN`
  the PR gets no `pull_request` workflow runs (so no `heavy-ci-ran`); push
  to the branch to start them, or set the `BENCHMARK_RESULTS_TOKEN` secret
  so the workflow opens the PR as a contributor (details in the workflow's
  header comment).

Two different memory numbers appear in both places, and they are not
comparable: the DOM suite's **memory** row is a heap DELTA around a
client-side create of 1,000 rows, while **SSR post-hydration heap**
(`ssr/bench-ssr-memory.ts`) is the ABSOLUTE heap after hydrating a
server-rendered 1,000-row table. The second isolates per-row hydration
bookkeeping — signals, effects, claim tables — for a DOM both sides already
have, which is why it is the metric the lazy row graph moves most.

## Results

<!-- benchmark-results:start -->
<!-- Generated by `bun benchmarks/runner/update-readme.ts` from benchmarks/results/*.json. Do not edit by hand. -->

Snapshot from one full run on 2026-10-12. Environment: headless Chromium 156.0.8078.4, Bun 1.3.14,
React 19.3.0, Solid 1.9.17, AMD EPYC 7763 64-Core Processor (containerized
CI-class hardware — rerun locally for your own numbers; ratios are the signal, wall-clock
will differ).

### DOM update suite (median, ×factor vs vanilla)

| Operation | vanilla | barefoot | react | solid |
|---|---|---|---|---|
| create1k | 83.30 ms | 85.45 ms (1.03x) | 85.35 ms (1.02x) | 68.55 ms (0.82x) |
| replace1k | 100.90 ms | 95.10 ms (0.94x) | 95.00 ms (0.94x) | 81.10 ms (0.80x) |
| update10th | 14.05 ms | 13.10 ms (0.93x) | 13.10 ms (0.93x) | 12.20 ms (0.87x) |
| select | 3.20 ms | 3.10 ms (0.97x) | 4.05 ms (1.27x) | 3.60 ms (1.13x) |
| swap | 14.65 ms | 15.25 ms (1.04x) | 73.35 ms (5.01x) | 15.10 ms (1.03x) |
| remove | 17.00 ms | 18.45 ms (1.09x) | 20.20 ms (1.19x) | 18.60 ms (1.09x) |
| create10k | 769.00 ms | 860.20 ms (1.12x) | 1025.30 ms (1.33x) | 772.40 ms (1.00x) |
| append1k | 229.80 ms | 233.40 ms (1.02x) | 239.90 ms (1.04x) | 211.90 ms (0.92x) |
| clear10k | 53.40 ms | 69.60 ms (1.30x) | 93.60 ms (1.75x) | 52.10 ms (0.98x) |
| startup | 25.60 ms | 36.00 ms (1.41x) | 54.40 ms (2.13x) | 23.00 ms (0.90x) |
| memory (1k rows) | 251.5KB | 750.1KB (2.98x) | 2053.3KB (8.16x) | 1480.9KB (5.89x) |
| shipped JS | 2.7KB raw / 1.1KB gzip | 29.2KB raw / 11.2KB gzip (9.90x) | 212.7KB raw / 68.3KB gzip (60.16x) | 17.4KB raw / 6.9KB gzip (6.04x) |

### SSR + hydration (1,000-row table)

| Metric | react | solid | barefoot |
|---|---|---|---|
| Server render (median, n=20) | 17.60 ms | 0.22 ms | 5.19 ms |
| Hydration time (median, n=10) | 29.25 ms | 21.75 ms | 15.25 ms |
| Interactivity gate | PASS | PASS | PASS |
| Client JS (raw / gzip) | 210.9KB / 67.6KB | 17.1KB / 6.7KB | 28.4KB / 10.4KB |
| HTML document (raw / gzip) | 220.0KB / 14.7KB | 235.9KB / 18.5KB | 318.6KB / 19.1KB |

### SSR post-hydration JS heap

| Metric | react | solid | barefoot |
|---|---|---|---|
| Post-hydration heap (median, n=3) | 3462.7KB | 2536.3KB | 1612.8KB |
| stdev | 0.2KB | 0.2KB | 0.1KB |

### Reactive primitives

| Case | BarefootJS (ms) | BarefootJS (ops/sec) | SolidJS (ms) | SolidJS (ops/sec) |
|---|---|---|---|---|
| Create 100,000 signals | 1.458 | 68,580,991 | 1.645 | 60,800,364 |
| Read 100,000 signals | 0.622 | 160,702,721 | 1.309 | 76,399,272 |
| Write 100,000 signals (no sub) | 0.597 | 167,509,799 | 0.578 | 172,918,835 |
| Update signal -> 1 effect x 10,000 | 1.088 | 9,192,089 | 0.921 | 10,853,733 |
| Fan-out: 1 signal -> 1,000 effects | 0.066 | 15,116,472 | 0.073 | 13,684,383 |
| Deep chain (100 memos) x 1,000 updates | 10.897 | 91,766 | 12.846 | 77,846 |
| Deep chain batched (100 memos) x 1,000 | 0.045 | 22,434,603 | 0.075 | 13,292,746 |
| 1,000 independent signal->memo->effect | 0.024 | 41,416,442 | 0.013 | 74,710,497 |
| Partial update: 100 of 1000 rows | 0.026 | 3,800,981 | 0.042 | 2,394,177 |
<!-- benchmark-results:end -->

The block above is generated; what follows is hand-written against the
snapshot dated there and may lag it — the table is the source of truth.

**DOM update suite.** Compare whole columns, not single cells: individual
cells swing between runs on shared hardware (the vanilla `startup` cell
moved by ten milliseconds between two runs an hour apart). In this snapshot
BarefootJS sits within roughly 1.0-1.3x of the vanilla baseline on every
operation, in the same band as Solid and ahead of React on the paths where
React's reconciliation shows (`swap`, `create10k`, `clear10k`, `startup`).
Its heap per 1,000 rows is the lowest of the three frameworks — the
compiler emits one consolidated `createEffect` per plain loop row
(`spec/slot-unification.md` §5a) on top of the lazy row graph (§9), which is
what moved this column from the ~1.5MB of earlier snapshots. Shipped JS
sits above Solid's. The creation-path numbers of the first published run
were at 1.4-1.5x before the hoisted shared loop template (one HTML parse per
loop, clone per row), the generation-stamped dependency tracking, and
tree-shaking of the runtime bundle to each project's used exports landed.

A note on the snapshot before this one: it had `update10th` at ~1.8x and
`select` at ~0.1x for BarefootJS. Both were artifacts of the app being
measured without the shared stylesheet (see "Same page everywhere" above):
an unstyled auto-layout table is far more expensive to relayout after a
text change, and far cheaper to restyle for a class change. With the
stylesheet applied both cells sit in the same band as the rest of the
column.

**SSR + hydration.** Solid's sub-millisecond server render (precompiled
string templates) is a genuine strength of its SSR design. BarefootJS
renders faster than React and hydrates between the two, with a client
payload in Solid's range; its HTML is the largest because props ride in the
`bf-p` attribute (see limitations). The post-hydration heap is where the
lazy row graph shows most clearly: BarefootJS hydrates the same 1,000-row
DOM with the smallest JS heap of the three.

**Reactive primitives.** In this snapshot BarefootJS is ahead of SolidJS on
every case. Earlier snapshots had Solid ahead on raw no-subscriber writes
and batched deep-chain propagation, so treat a per-case lead as
run-dependent rather than structural. This is the reactive graph in
isolation on Bun/JSC, not browser frame cost.

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
