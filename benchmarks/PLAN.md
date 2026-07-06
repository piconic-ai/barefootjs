# Benchmark Suite Design

> Design rationale for `benchmarks/`. The user-facing methodology and
> run instructions live in `README.md`; the binding per-app spec lives in
> `CONTRACT.md`. Goal: demonstrate that BarefootJS performs on par with
> well-optimized React and SolidJS — measured fairly, reproducibly, and with
> respect for both frameworks. This is not about "beating" anyone; React and
> Solid are excellent frameworks and the point is to show BarefootJS holds
> its own using the same yardstick the community already trusts.

## Why the previous benchmark is not enough

The previous `benchmarks/` (commit eee53f4) was a sanity check, not a
comparison. Specific problems a careful reader would (rightly) call out:

1. **BarefootJS side didn't use the framework.** It hand-wrote DOM nodes and
   attached signals — that benchmarks `document.createElement` + a signal
   library, not the compiler output a real app ships.
2. **SolidJS was used without its compiler.** Solid's performance comes from
   its JSX → template compilation (`<For>`, cloned templates). Using only
   `solid-js` signals with hand-written DOM understates what Solid actually
   does.
3. **React was hand-driven `createElement` + `flushSync` in a loop** — not an
   idiomatic, optimized React app (no `memo`, no keys strategy shown, dev
   behavior not controlled).
4. **Non-standard operations and timing.** Medians of tiny synchronous
   batches, no paint-inclusive timing, no memory, no bundle size, no
   statistical spread reported.

## Design principles (the "logic armor")

1. **Use the yardstick the community trusts: krausest js-framework-benchmark
   semantics.** Same table markup, same data generator (adjectives × colours ×
   nouns), same operations, same button-driven interaction model. Anyone can
   line results up against implementations they already know.
2. **Each framework in its best, idiomatic form:**
   - **React 19**: production build, functional components, `memo`ized `Row`,
     keyed lists, state updates modeled on the official krausest React hooks
     implementation.
   - **SolidJS 1.9**: compiled JSX via `babel-preset-solid`, `<For>` keyed
     flow, production build — modeled on the official krausest Solid
     implementation.
   - **BarefootJS**: the actual compiler output (`bf` pipeline / compile API),
     exactly what a user's app would ship. No hand-tuned DOM code.
   - **Vanilla JS**: reference baseline so all three are normalized against
     the same floor.
3. **Real interactions, paint-inclusive timing.** The harness clicks real
   buttons via Playwright/CDP and measures from event dispatch to after the
   next paint (double-rAF fence), not just synchronous JS time. GC is forced
   between iterations via CDP where available.
4. **Statistics, not single numbers.** Warmup runs discarded; N measured runs;
   report median + min/max + IQR. Publish exact library versions and the
   environment (CPU, headless Chromium version).
5. **Beyond one microbenchmark — multiple use cases:**
   - **DOM update suite** (krausest operations) — where Solid is the
     acknowledged leader; parity here is the headline claim.
   - **SSR + hydration** — server render time, hydration time, and
     time-to-interactive for the same app; BarefootJS is server-first, React
     (`renderToString`/`hydrateRoot`) and Solid (`renderToStringAsync`/`hydrate`)
     both have first-class SSR to compare against.
   - **Shipped JS / bundle size** — minified + gzipped client bytes for the
     bench app and for a minimal interactive island, identical minifier
     settings for all.
   - **Reactive-primitives microbench** — signals-level ops vs solid-js only
     (same paradigm). React is deliberately excluded from this one because it
     has no equivalent primitive — comparing would be a strawman.
6. **Honesty about limitations.** The README must state what we did not
   measure, why numbers differ from krausest's published chrome results, and
   that microbenchmarks ≠ app performance. Where BarefootJS loses, the number
   is published anyway.

## Operations (DOM update suite)

| id | Operation | Notes |
|----|-----------|-------|
| 01 | create 1,000 rows | from empty |
| 02 | replace all 1,000 rows | fresh data over existing |
| 03 | partial update: every 10th of 1,000 | append ' !!!' to label |
| 04 | select row | highlight one row (class change) |
| 05 | swap rows | rows 2 and 999 (1-indexed 2/999, krausest semantics) |
| 06 | remove one row | middle row |
| 07 | create 10,000 rows | stress |
| 08 | append 1,000 rows to 10,000 | |
| 09 | clear 10,000 rows | |

Standard buttons: `#run`, `#runlots`, `#add`, `#update`, `#clear`,
`#swaprows`; rows have select/remove links. Table markup identical across
frameworks (same `<tr><td>id</td><td><a>label</a></td><td><a>remove</a></td><td/></tr>`
shape, Bootstrap-free minimal CSS shared by all).

## Directory layout

```
benchmarks/
  PLAN.md                — this file (design rationale)
  README.md              — methodology + how to run + results
  apps/
    shared/              — data generator, shared CSS, page scaffold
    vanilla/
    react/
    solid/
    barefoot/
  runner/
    build.ts             — production builds for all apps (+ bundle-size report)
    bench-dom.ts         — Playwright: click-driven DOM update suite
    bench-ssr.ts         — SSR render + hydration timing
    stats.ts             — median/IQR helpers
    report.ts            — plain/markdown tables
  reactive.ts            — signals microbench (BarefootJS vs Solid), refreshed
```

## SSR + hydration bench design

Scenario: the same 1,000-row table, server-rendered, then made interactive.
Three metrics, measured separately:

1. **Server render time** (Bun process, no browser): median over N=20 of
   rendering 1,000 rows to an HTML string.
   - React: `renderToString` from `react-dom/server`.
   - Solid: `renderToString` from `solid-js/web` (SSR-compiled build via
     `babel-preset-solid` with `generate: 'ssr', hydratable: true`).
   - BarefootJS: the compiled marked template rendered through the Hono
     adapter (`renderToHtml` from `@barefootjs/adapter-hono/render`) — the
     real server path.
2. **Hydration time** (browser): serve the SSR HTML + client bundle; measure
   from client-script execution start to hydration complete:
   - React: `performance.mark` before `hydrateRoot`, end after double-rAF
     (hydration of a non-Suspense tree completes in the initial commit).
   - Solid: mark around `hydrate()` (synchronous) + double-rAF.
   - BarefootJS: mark before the `.client.js` import, call
     `flushHydration()` for a deterministic completion point, + double-rAF.
   Then a **post-hydration interactivity check**: click row 2's label and
   assert the selection applies (all frameworks must be truly interactive,
   not just "done executing").
3. **Shipped hydration JS**: total gzipped client JS required to make the
   SSR page interactive.

Honesty notes to publish: hydration strategies differ by design (React
re-builds its VDOM against existing DOM; Solid attaches via hydration
markers; BarefootJS attaches effects/listeners to marked scopes without
re-rendering). The metric is "cost to interactive on the same page", which
is what a user experiences; we do not claim the frameworks do equivalent
work internally.

## Execution split

- **Planning & verification: Fable 5 (this session's main agent).** Fairness
  audits of each implementation against the official krausest counterparts,
  methodology review, final run + analysis + README.
- **Implementation: Sonnet 5 subagents**, one per well-scoped work package:
  1. Harness + vanilla app + shared assets (defines the contract).
  2. React app.
  3. Solid app (incl. babel-preset-solid build wiring).
  4. BarefootJS app via the real compiler (spec depends on capability report).
  5. SSR/hydration + bundle-size benches.

## Resolved questions

- **BarefootJS CSR mount**: `render(container, 'Name', props)` from
  `@barefootjs/client/runtime` (`packages/client/src/runtime/render.ts`);
  `integrations/csr/` is the reference app (`bf build` → `dist/*.client.js`
  + `barefoot.js`, importmap, no SSR needed). The bench app uses this path.
- **List reconciliation**: compiled `.map()` lowers to `mapArray`
  (`packages/client/src/runtime/map-array.ts`) — keyed diff, per-item roots
  and signals, element-preserving reorder via `insertBefore`. Swap/remove
  are fair to run as-is.
- **Effects are synchronous** (unbatched `set` runs subscribers inline;
  `batch()` is opt-in) — the double-rAF fence cleanly covers all three
  frameworks' flush models.
- **Solid build wiring**: `babel-preset-solid@1.9.12` + `@babel/core@7.29.x`
  (babel 8 is incompatible with the Solid preset; pinned to 7) transform,
  then `Bun.build` bundles. Verified working (`_$template`/`For` output).
- **Contract**: see `benchmarks/CONTRACT.md`; shared workload generator in
  `apps/shared/data.ts`, shared CSS in `apps/shared/styles.css`.
- **CI**: `.github/workflows/benchmark.yml` currently runs the old
  `run-browser.ts`; must be updated to the new runner (quick mode) when the
  old files are removed.
