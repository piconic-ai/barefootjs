# @barefootjs/client

## 0.18.7

### Patch Changes

- fd73cf0: Perf: new `createSelector(source, fn?)` primitive (SolidJS-compatible, #2143 gap 5) — an O(changed) selection accessor for `class={isSelected(row.id) ? ... : ...}` patterns. Each row's effect subscribes to its own key instead of the raw signal, so a selection change re-runs two effects (deselected + selected row) regardless of list size. The returned accessor is `Reactive<>`-branded, so the existing type-based reactivity analysis recognises `isSelected(row.id)` with no analyzer changes beyond registering the export and a `needsTypeBasedDetection` trigger for bare selector usage outside `.map()`. `@barefootjs/hono` gains the matching SSR client-shim stub.
- 42e9066: Perf: new `runtimeBundle: 'treeshake-exact'` build mode (#2143 gap 4) drops the always-kept public mount API (`render`, `hydrate`, `flushHydration`, `rehydrateAll`, `rehydrateScope`, `disposeScope`, `setupStreaming`, `createSearchParams`) that `'treeshake'` (the default) unconditionally keeps in `barefoot.js` regardless of whether the project actually uses them. Under `'treeshake-exact'` these names ship only if the compiled output, `bundleEntries`, `externals`, or an explicit `runtimeKeep` entry actually reaches them — a hand-written page script the CLI never compiles (e.g. an inline `<script type="module">` calling `hydrate()` directly) must list any such name in `runtimeKeep` or it's silently dropped. Fully opt-in; `'treeshake'` stays the default with unchanged behavior. Also fixes a real crash-to-full-copy bug the new mode could hit: a project with zero reachable runtime exports now skips `barefoot.js` generation (and removes any stale copy from a prior build) instead of failing into shipping the entire uncompressed runtime.
  - @barefootjs/shared@0.18.7

## 0.18.6

### Patch Changes

- 09e8eb9: Perf: hoisted single-root `mapArray` loop bodies (#2143 gap 1) now resolve reactive attr/text/ref slots on a fresh clone via compile-time child-index paths (`.firstChild.nextSibling...`, Solid-style) instead of a per-row `qsa()`/`$t()` runtime lookup, computed from the loop's existing skeleton IR and bailing to the runtime lookup for any loop shape the HTML parser could restructure (tables, `<select>`, `<p>` auto-close, `<pre>`/`<template>`, cross-tag auto-close groups, or content a bare `<tr>` would foster-parent out of the row) or for hydration. `@barefootjs/client` exports the existing text-marker helper as `tAfter` for this codegen to call.
  - @barefootjs/shared@0.18.6

## 0.18.5

### Patch Changes

- Updated dependencies [7bd1762]
  - @barefootjs/shared@0.18.5

## 0.18.4

### Patch Changes

- 23cc4dc: Normalize intrinsic-element attribute names ONCE in Phase 1: `IRAttribute.name` now carries the HTML/SVG attribute name, so every adapter emits it verbatim. The shared `dom-prop` classifier grows an `HTML_CAMEL_ALIASES` table (React-style camelCase → HTML: `tabIndex` → `tabindex`, `maxLength` → `maxlength`, `autoComplete` → `autocomplete`, `readOnly` → the boolean `readonly`, `spellCheck` → the enumerated `spellcheck`, …) consulted by both `toHTMLAttrName` (now applied in `jsx-to-ir`'s `processAttributes`) and `toHTMLAttrNameRuntime` (spread paths). Previously each adapter mapped at most `className` → `class` itself and every other alias leaked into the emitted HTML as an unknown attribute the browser ignores — `htmlFor` never became `for` (broken label association on template backends), `readOnly` rendered as `readOnly="true"` vs bare presence depending on backend, and SVG `strokeWidth`/`strokeLinecap` passed through unmapped. Component props (`IRProp`) keep the user's API names; unknown names (`data-*`, custom-element attributes, `viewBox`-style case-sensitive SVG XML names) pass through unchanged. The `camelcase-attributes`, `svg-icon`, and `boolean-attr-literals` fixtures graduate from every adapter's `renderDivergences` declaration and the CSR skip list.
- Updated dependencies [23cc4dc]
  - @barefootjs/shared@0.18.4

## 0.18.3

### Patch Changes

- @barefootjs/shared@0.18.3

## 0.18.2

### Patch Changes

- @barefootjs/shared@0.18.2

## 0.18.1

### Patch Changes

- @barefootjs/shared@0.18.1

## 0.18.0

### Patch Changes

- 0636582: `bf build` now tree-shakes the client runtime bundle (`barefoot.js`) down to only the `@barefootjs/client*` exports a project's compiled client JS (components, `bundleEntries`, rebundled `externals` chunks) actually imports, plus a small always-kept public mount API (`render`, `hydrate`, `flushHydration`, `rehydrateAll`, `rehydrateScope`, `disposeScope`, `setupStreaming`, `createSearchParams`) for hand-written page scripts the compiler never sees. Previously `barefoot.js` was always a byte-for-byte copy of the entire prebuilt runtime regardless of what the project used — on the CSR benchmark app this shipped ~72KB raw / ~19.4KB gzip; the same app now ships ~24KB raw / ~8.8KB gzip.

  New config surface (`createConfig()` in `@barefootjs/client/build`, or any `barefoot.config.ts`):

  - `runtimeBundle?: 'treeshake' | 'full'` — defaults to `'treeshake'`. Set to `'full'` to restore the previous verbatim-copy behavior.
  - `runtimeKeep?: string[]` — extra runtime export names to force-keep, for names only ever referenced from hand-written page scripts beyond the always-kept set.

  Safety: if the collector sees an import shape it can't safely narrow (a namespace import, a default import, or a dynamic `import()` of the runtime — reachable only through `bundleEntries`/rebundled `externals`, since the compiler's own component codegen never emits these shapes), the build falls back to a full runtime copy for that build and logs why, rather than risk shipping a `barefoot.js` missing something that's actually used.

- 99cae9d: Performance: `mapArray` now reorders keyed lists with minimal DOM moves (LIS-based — a two-row swap moves two scopes instead of re-inserting every row), batches contiguous new rows through a `DocumentFragment`, clears emptied lists in bulk via `Range.deleteContents()`/`textContent`, and caches its loop boundary markers between updates. Effect disposal bookkeeping is now O(1) per child (lazily-allocated insertion-ordered `Set` instead of `indexOf`+`splice`), removing an O(n²) cost when disposing large lists. No behavioral changes: keyed reconciliation semantics, cascade-disposal order, hydration, multi-root items, and focus preservation are unchanged and covered by new regression tests.
- d05cc49: Performance: signal→effect dispatch is significantly faster. Effect dependency tracking now uses generation-stamped diffing, so an effect whose read set is unchanged between runs no longer unsubscribes/resubscribes on every run, and unbatched `set()` reuses a cached subscriber snapshot instead of allocating a new array per write (invalidated only when membership actually changes). Observable semantics are unchanged — synchronous dispatch order, snapshot-at-dispatch behavior for mid-dispatch subscribe/unsubscribe, dynamic dependency drop, `Object.is` bail, `batch()`, `untrack`, cleanup timing, and the circular-run guard are all preserved and pinned by new tests; the profiler-instrumented path emits a byte-identical event stream.
- 435d996: `escapeText` — the runtime helper that escapes interpolated text content for the initial client render (`<!--bf:sN-->${escapeText(expr)}<!--/-->` slots) — now renders a nullish value as empty text instead of stringifying it into literal `"undefined"` / `"null"`. This matches the JSX/Solid semantics the Hono SSR reference follows (`{undefined}` / `{null}` produce no text) and the reactive text-update path, which already coerces via `String(value ?? '')` (`dynamic-text.ts`, `client-marker.ts`). Previously a bare `{props.x}` reading an absent prop diverged from the server-rendered output at first paint — empty on SSR, literal `"undefined"` on CSR (#2137). Non-nullish values (including `0` and `false`) keep their `String()` form, matching the reactive path.
  - @barefootjs/shared@0.18.0

## 0.17.1

### Patch Changes

- @barefootjs/shared@0.17.1

## 0.17.0

### Minor Changes

- e9ed338: Add `queryHref` — a pure, functional URL-query builder (#2042).

  `queryHref(base, { … })` is the build counterpart to `searchParams()` (the reactive reader): instead of imperatively mutating a `URLSearchParams`, pass a params object of **string** values. Each entry is included iff its value is a non-empty string (so a conditional include folds into the value as `cond ? value : undefined`); values are encoded with `URLSearchParams`. It runs natively on the client and is a pure function (no reactivity). (Number/boolean values are intentionally not accepted — JS truthiness omits `0`/`false`, which the SSR string guard can't model without per-value type info; stringify at the call site.)

  The go-template adapter lowers a `queryHref(base, { … })` call to `bf_query` directly — because the call and its object literal are already structured IR, there is no block-body recognizer and no emit-time re-parse. This is the functional alternative to the imperative `URLSearchParams` builder idiom: write the query inline (`href={queryHref(base, { … })}`) rather than a multi-statement helper.

  Notes / scope:

  - go-template SSR lowering only in this cut; Mojolicious / Xslate parity (their query helpers) is a follow-up. They keep the generic lowering until then.
  - Helper wrappers whose params-object references the helper's params aren't inlined yet (a pre-existing inliner limitation, since object literals lower opaquely from source) — the direct call is the supported idiom.

- caba215: `queryHref` now accepts an **array value** for multi-value query keys (#2048, the Q4 follow-up to #2042): `queryHref(base, { tag: ['a', 'b'] })` → `?tag=a&tag=b`, i.e. `URLSearchParams.append` rather than `set`. Empty / falsy members are skipped (same truthy-omit as a scalar), so an empty — or all-empty — array contributes nothing. `QueryParamValue` becomes `string | string[] | null | undefined`.

  This works across the client and all SSR adapters byte-for-byte:

  - **`@barefootjs/client`**: `queryHref` appends each non-empty array member.
  - **`@barefootjs/perl`** (Mojolicious + Xslate via the shared `query` helper): an array ref appends one pair per non-empty member.
  - **`@barefootjs/go-template`**: `bf_query` appends each non-empty member of a `[]string` (or `[]any`) value. To support this, the value-emptiness check moved from the lowering into the `bf_query` helper itself — a plain `key: v` now lowers to a `(true)` include and a conditional to `(cond)`, and the helper drops an included-but-empty value. This matches the client and Perl exactly (it also removes the previous Go-only divergence where an explicitly-included empty value was kept as `k=`); rendered output for existing scalar usage is unchanged.

  The `query` helper's array behaviour is conformance-tested across the Go and Perl backends via the shared golden helper vectors.

- c8c7d50: Recognize the `searchParams` env signal structurally via `createSearchParams()` (#2057, part 1).

  The request-scoped query env signal is now a `createSignal`-shaped factory the compiler recognizes by structure, removing the `searchParams` name allow-list from the compiler core:

  ```tsx
  // before
  import { searchParams } from "@barefootjs/client";
  searchParams().get("sort");

  // after
  import { createSearchParams } from "@barefootjs/client";
  const [searchParams, setSearchParams] = createSearchParams();
  searchParams().get("sort"); // reactive read
  setSearchParams({ sort: "price" }); // single imperative navigation path
  ```

  Because `searchParams` is now a real signal getter, it lands in the fold purity oracle and reactive-getter set structurally — the clean fix for the fold-oracle special-casing (superseding the reverted #2055) with no name allow-list.

  - `@barefootjs/client`: **breaking** — the bare `searchParams` export is replaced by `createSearchParams()`, which returns a `[getter, setter]` tuple. The getter is the request-scoped query reader (unchanged SSR + client resolution); `setSearchParams(next)` is the single imperative navigation path (soft same-route nav via the router seam, hard-nav fallback otherwise), replacing the confusing mutable-`URLSearchParams` write path. `SearchParamsInit` accepts a query string, `URLSearchParams`, or a record.
  - `@barefootjs/jsx`: `createSearchParams` is a recognized signal primitive tagged with an `envReader` key on `SignalInfo`; `CLIENT_EXPORTS` swaps `searchParams` for `createSearchParams`; env-signal recognition flows from IR structure, not import names. Codegen keeps env signals out of normal value/field emission while leaving them in the reactivity graph.
  - `@barefootjs/shared`: new `BF_SEAM_NAV_SEARCH` seam for imperative query navigation.
  - Adapters (`go-template`, `hono`, `mojolicious`, `xslate`): env-signal reader lowering keys off signal structure instead of the import name; the per-request reader binding (`bf.SearchParams` / `$searchParams`) is unchanged.

  Migration: replace `import { searchParams } from '@barefootjs/client'` + `searchParams()` with `import { createSearchParams } from '@barefootjs/client'` + `const [searchParams] = createSearchParams()`, and use `setSearchParams(...)` for imperative query navigation.

### Patch Changes

- Updated dependencies [c8c7d50]
  - @barefootjs/shared@0.17.0

## 0.16.0

### Patch Changes

- @barefootjs/shared@0.16.0

## 0.15.2

### Patch Changes

- @barefootjs/shared@0.15.2

## 0.15.1

### Patch Changes

- @barefootjs/shared@0.15.1

## 0.15.0

### Minor Changes

- 2339a2f: `<Async>` and `<Region>` are now **import-scoped, import-required** built-ins instead of bare capitalized tag-name matches (#1915, follow-up to #1914).

  The compiler recognises them only when their local binding is imported from `@barefootjs/client` (keyed off `ir.metadata.imports`), so a user's own `<Async>` / `<Region>` component — imported from elsewhere or declared locally — no longer collides with the built-in, and an aliased `import { Async as Boundary }` maps `<Boundary>` through. Real, type-checked `Async` / `Region` stubs now ship from `@barefootjs/client` (they throw if ever executed, since the compiler compiles the tags away), giving authors prop-checking and completion — the model `Portal` already follows, and how Solid imports `<Show>` / `<Suspense>` from `solid-js`. The import is elided on emit (both `templateImports` and the client-JS DOM imports) so it never survives as a phantom runtime import.

  A bare `<Async>` / `<Region>` used without the import and with no other in-scope binding now raises `BF054`. This replaces the per-file `declare function Async(...)` workaround and the `@barefootjs/hono` JSX runtime's `export declare function Async` (removed).

  **Migration:** add `import { Async, Region } from '@barefootjs/client'` to files that use these tags.

- c6212ab: Request-scoped environment signals (`searchParams()`, and future cookies/…) now resolve at SSR for the non-Hono JS hosts that render via `renderToHtml` (h3 / Elysia / any WinterCG handler), through one **keyed** request-env mechanism. #1922 (follow-up to router v0.5).

  Hono resolves a request's environment through `useRequestContext()` inside its `jsxRenderer` async context; `renderToHtml` has none, so `searchParams()` previously resolved to the empty default regardless of the request — query-dependent initial content flashed / mismatched on hydration.

  - **`@barefootjs/client`**: the searchParams-specific server reader seam is generalised to a single keyed one. `__bfSetServerSearchReader` → `__bfSetServerEnvReader((key) => …)` and `globalThis.__bf_serverSearchReader` → `globalThis.__bf_serverEnvReader(key)` (`createEnvSignal` now takes the env `key`). One seam serves every env signal, so a new signal (cookies, …) needs no new seam, setter, or host function.
  - **`@barefootjs/hono`**: new `@barefootjs/hono/request-env` subpath. It scopes the request env with a Node `AsyncLocalStorage`, so each render reads its own request's values and concurrent renders never race (a process-wide per-request global would, which the spec forbids). It installs on the shared keyed `__bf_serverEnvReader` seam (no `@barefootjs/client` import) and delegates to any prior reader when no scope is active, so a process mixing Hono and `renderToHtml` hosts keeps resolving both ways, and it lives behind its own subpath so the always-on `renderToHtml` path never loads `node:async_hooks`. Two entry points:
    - `withRequestEnv(handler)` — wrap a WinterCG `fetch` handler once at the entry point. It derives the env from the `Request`, so the whole request runs with it bound and every `renderToHtml` inside resolves it with **no per-render plumbing**; the host never names env keys.
    - `runWithRequestEnv(env, fn)` + the keyed `BfRequestEnv` type — the lower-level primitive for hosts that bind env manually.

  Usage (the bundled h3 and Elysia demos are wired this way — bind once, pages are plain `renderToHtml`):

  ```ts
  import { withRequestEnv } from "@barefootjs/hono/request-env";

  export default { port, fetch: withRequestEnv(myFetchHandler) };
  ```

  Adding the cookie env signal later is then: define it in `@barefootjs/client`, add a `cookie` field to `BfRequestEnv` (and to the `Request`→env derivation behind `withRequestEnv`) — every host wired with `withRequestEnv` picks it up with **no code change**.

- e627b29: `searchParams()` — a request-scoped reactive **environment signal** (spec/router.md **v0.5**, "The wedge"). A same-route, query-only navigation (`/list?sort=price`) driven by `@barefootjs/router` now updates `searchParams()` and the URL **with no swap and no re-hydration** — islands reconcile fine-grained.

  - **`@barefootjs/client`**: new top-level `searchParams: Reactive<() => URLSearchParams>`. It rides the shared `@barefootjs/client/reactive` runtime (structurally one instance), so the existing reactivity analysis wires DOM updates with no new compiler feature. The underlying signal is created lazily on first read (and the router push seam `window.__bf_pushSearch` is installed there, on first read — not at import), so the module has **no import-time side effects** and an island that never reads it can be tree-shaken out of it. The generic `createEnvSignal` stays internal; only `searchParams` is exported. (The spec's package-level `"sideEffects": false` hint is deferred: it currently triggers a bun bundler bug that collapses the runtime entry to a broken re-export facade — a separate follow-up.)
  - **Request-scoped SSR**: on the server `searchParams()` resolves per-request through an injected reader (`__bfSetServerSearchReader`, or a `globalThis.__bf_serverSearchReader` seam) — never a process-wide module global, which would race across concurrent requests.
  - **`@barefootjs/hono`**: auto-wires that reader via `useRequestContext().req` (async-context scoped, race-free) when the SSR scripts are rendered — no opt-in step. `searchParams` is also re-exported from the Hono `client-shim` (SSR) and from `@barefootjs/client/runtime` (the island bundle's import source), and is allow-listed in the compiler so importing it no longer trips `BF051`.

  Covered by a cross-adapter conformance fixture (`search-params`): it runs on Hono today; the Go / Mojolicious / Xslate template adapters are skipped pending env-signal SSR lowering + runtime, tracked in [#1922](https://github.com/piconic-ai/barefootjs/issues/1922).

  The router's query-only short-circuit (shipped in v0) activates automatically once an island reads `searchParams()`; until then query-only navigations fall back to a full swap.

- 623c0f7: Add subtree-scoped re-hydration and precise per-scope disposal to the runtime.

  - `rehydrateScope(root)` runs a synchronous hydration walk over just `root`'s subtree (cost O(scopes in `root`)), beside the existing whole-document `rehydrateAll()`. Lets a caller that knows which region changed — a client router after a content swap, a streaming chunk, a conditional/loop that just inserted a branch — hydrate only that region instead of re-walking the document.
  - `disposeScope(root)` tears down the reactive graphs (effects, memos, `onCleanup`) of every scope inside `root`. Each scope's `init` now runs inside a `createRoot` so its bindings have a disposable owner. This is additive: nothing disposes a root unless `disposeScope` is called, so existing component lifetimes are unchanged.
  - Both are exposed on `window` via `setupStreaming` as `__bf_hydrate_within` / `__bf_dispose_within`.

### Patch Changes

- Updated dependencies [071a1a3]
  - @barefootjs/shared@0.15.0

## 0.14.0

### Patch Changes

- @barefootjs/shared@0.14.0

## 0.13.0

### Patch Changes

- @barefootjs/shared@0.13.0

## 0.12.0

### Patch Changes

- @barefootjs/shared@0.12.0

## 0.11.0

### Minor Changes

- c26b408: Attribute conditional-branch DOM-binding effects in the profiler (#1690, #1795 Phase 1).

  A conditional's `insert()` effect and the attribute / text binding effects
  emitted inside its branch `bindEvents` now carry a
  `<Component>#binding:<slotId>` id in profile mode, and `buildIdIndex` resolves
  them from the graph's `domBindings` (conditional / attribute / text slot + loc):

  - **`insert()` runtime** — takes an optional trailing `bfId` and forwards it to
    the internal conditional re-eval `createEffect`, so a conditional's re-runs are
    attributed to its source line instead of showing as a bare runtime id.
  - **branch attribute effects** — `createDisposableEffect(…, "<Comp>#binding:<slotId>")`
    for `class={…}` / reactive attrs written inside a branch swap.
  - **branch text effects** — the `__bfText` re-splice effect carries the id too.

  `profileComponentName` is threaded through `buildInsertPlan` → `InsertPlan` →
  `stringifyInsert`, including recursively into nested conditionals. Previously
  these branch-scoped re-runs surfaced in the hot-subscribers list as
  unattributed runtime ids and inflated the coverage gap, even though a toggled
  conditional is often the _most_ re-run subscriber.

  Off by default the emitted effects are byte-for-byte unchanged (SR8). Loop-child
  text/attribute binding effects remain a follow-up (#1795 Phase 2).

- 271350a: Attribute the loop reconcile effect in the profiler (#1690, #1795).

  `mapArray` / `mapArrayAnchored` gain an optional `bfId` forwarded to their
  internal reconcile `createEffect`, and the loop emitter passes
  `<Component>#binding:<slotId>` for it in profile mode. `buildIdIndex` already
  resolves that id from the graph's `loop` domBinding (slot + loc).

  Dogfooding a list component showed the loop's reconcile effect is typically the
  **single costliest subscriber** (it re-renders the list on every change) yet was
  unattributed — it dominated the hot list as a bare `e1`. Now it reads
  `s7 (loop)  3 runs, 4.8ms  (TodoApp.tsx:29)`. Off by default the `mapArray`
  call is byte-for-byte unchanged (SR8). Per-item loop-child text effects remain
  a follow-up under #1795.

- b5067dc: Add dev-only reactive instrumentation hooks for `bf debug profile` (#1690, SR1).

  The runtime gains a single, gated measurement sink installed via
  `setProfilerSink(sink | null)`. When a sink is set, the reactive choke points in
  `reactive.ts` emit events — `signalSet`, `subscribeAdd`/`subscribeRemove`,
  `effectCreate`/`effectEnter`/`effectExit`/`effectDispose`, and
  `batchBegin`/`batchFlush` — carrying node ids, timing, and batch state. A memo's
  effect-run and its private signal-set share one id so the profiler can collapse
  them into a single node.

  The sink is null by default (production), so every choke point stays a single
  null-check branch with no allocation and no behavior change — reactive
  semantics are unaffected (SR8). The `ProfilerEventSink` / `SubscriberKind` types
  and `setProfilerSink` are exported from `@barefootjs/client`.

- 9877323: Add profile-mode turn-boundary markers around event handlers (#1690, SR3).

  The runtime gains `beginTurn(handlerId, loc?)` / `endTurn()` (and the matching
  `turnBegin`/`turnEnd` sink hooks). In profile mode the client-JS codegen wraps
  each event handler so the reactive work it triggers is attributed to one turn:

  ```js
  _el.addEventListener("click", (...__bfa) => {
    beginTurn("Counter#handler:s0:click");
    try {
      return HANDLER(...__bfa);
    } finally {
      endTurn();
    }
  });
  ```

  A single `wrapHandlerForTurn` helper produces the wrapper, and `beginTurn`/
  `endTurn` are registered as runtime imports so the import line is auto-wired.

  Measurement-only: the handler's behavior and `set()`'s synchronous semantics
  are unchanged. Off by default the emitted code carries no markers and no turn
  import (SR8). This PR wraps the top-level handler path; the delegation / branch
  / loop-child handler paths are wrapped in a follow-up.

- 07b95ad: Add the SR2 event collector and SR4 IR join for `bf debug profile` (#1690).

  - **`@barefootjs/shared`**: `ProfilerEvent` / `ProfilerEventType` — the
    normalized event wire contract shared by the runtime producer and the jsx
    consumer. It lives in `shared` (built first, depended on by both) so the
    jsx↔client peer relationship stays free of a build-order cycle.
  - **`@barefootjs/client`**: `createRecordingSink()` (SR2) — turns the raw
    `ProfilerEventSink` callbacks (SR1) into a flat, ordered, **turn-stamped**
    event log. It tracks the `beginTurn`/`endTurn` stack (SR3) and stamps every
    event with the handler id in scope, so per-turn metrics need no microtask
    guesswork.
  - **`@barefootjs/jsx`**: `buildIdIndex(graph)` + `joinProfilerEvents(events,
index)` (SR4) — resolve each event's compiler-assigned id to its source-mapped
    IR node (signals/memos/effects, including controlled-signal sync effects).
    Unresolved ids are surfaced as coverage gaps, never dropped (SR4 invariant).

  These are the substrate the v1 analyses (hot subscribers / wasted re-runs /
  batch advisor) consume next. Dev-only; no effect on production builds (SR8).

- 7079ca0: Count turn _invocations_, not handler ids, in profiler metrics (#1690).

  Dogfooding a list whose rows share one `onClick` revealed that firing the same
  handler N times (clicking N rows) collapsed into a single "turn" — because
  events were keyed by the handler-id string. That inflated `runsPerTurn` and
  batch-advisor savings (N interactions summed into one turn).

  `ProfilerEvent` now carries `turnSeq` (a unique per-invocation counter the
  recording sink stamps at each `beginTurn`). The analyses count distinct turns by
  `turnSeq`: hot-subscribers `runsPerTurn` divides by real invocations, the batch
  advisor evaluates each invocation separately (reporting the worst per handler),
  and `report.turns` reflects interactions while `coverage.handlersFired` still
  counts distinct handlers. A 3-row list now reads `turns: 3, handlers: 1/1`
  (was `turns: 1`).

- 1919a0c: Add the wasted-re-runs analysis — v1 (#1690, §4.2.2).

  A reactive effect/memo that re-ran but produced output identical to its
  previous run did removable work — the complement to hot subscribers (where the
  cost is, vs. how much of it is removable).

  - **Fingerprint (SR1, dev-only/SR8):** new optional `effectOutput(id, changed)`
    sink method on the SR2 stream. The runtime aggregates a per-run output verdict
    via `__bfReportOutput` (flushed once at run exit): memos compare the recomputed
    value by `Object.is`; text bindings (`__bfText`) compare the written string —
    and a stale-element cleanup counts as a real DOM change. A run with no
    fingerprint emits no event and isn't counted. `effectOutput` is optional on the
    exported `ProfilerEventSink`, so a pre-existing custom sink stays valid.
  - **Analysis (SR2 + SR4):** `analyzeWastedReReruns` / `formatWastedReReruns`,
    `wasted = wastedRuns / totalRuns`, joined to IR source loc and ranked by
    removable cost then ratio (deterministic). Surfaced in `buildProfileReport` /
    `formatProfileReport` (text + `--json`) behind the new `--wasted-pct` flag
    (default 50%).

### Patch Changes

- Updated dependencies [07b95ad]
- Updated dependencies [7079ca0]
- Updated dependencies [1919a0c]
  - @barefootjs/shared@0.11.0

## 0.10.1

### Patch Changes

- @barefootjs/shared@0.10.1

## 0.10.0

### Patch Changes

- @barefootjs/shared@0.10.0

## 0.9.6

### Patch Changes

- @barefootjs/shared@0.9.6

## 0.9.5

### Patch Changes

- @barefootjs/shared@0.9.5

## 0.9.4

### Patch Changes

- @barefootjs/shared@0.9.4

## 0.9.3

### Patch Changes

- @barefootjs/shared@0.9.3

## 0.9.2

### Patch Changes

- @barefootjs/shared@0.9.2

## 0.9.1

### Patch Changes

- @barefootjs/shared@0.9.1

## 0.9.0

### Patch Changes

- @barefootjs/shared@0.9.0

## 0.8.0

### Patch Changes

- @barefootjs/shared@0.8.0

## 0.7.0

### Patch Changes

- @barefootjs/shared@0.7.0

## 0.6.1

### Patch Changes

- @barefootjs/shared@0.6.1

## 0.6.0

### Patch Changes

- b24a1e6: Fix dropped component props in CSR render. A parent passing a non-statically-inlinable value (e.g. `Array.from(...)` or an init-scope local) as a prop to a child component emitted `renderChild('Child', {})` — silently dropping the prop — so the child's template read it eagerly and threw (`Cannot read properties of undefined`). Such children now defer to a placeholder + `upsertChild` (`createComponent` with the complete getter props), mirroring the existing clientOnly-conditional / loop-placeholder paths. SSR adapters are unaffected.
  - @barefootjs/shared@0.6.0

## 0.5.3

### Patch Changes

- 5842c03: `__bfSlot` now HTML-escapes its plain-string path, so text rendered inside a conditional `template()` branch is escaped to match the SSR output (closing the branch-text gap left by #1694, where only top-level text slots were escaped). The escape is applied on the string path only — live `Node` values still return raw `<!--bf-slot:N-->` markers for `insert()` to splice, so slotted content is preserved.
- 2c1f3ad: Client-render templates now HTML-escape interpolated attribute values (via a new `escapeAttr` runtime helper) to match the SSR adapters' attribute escaping (`& " ' < >`). Previously a dynamic attribute value containing `"`, `<`, `>`, or `&` — e.g. UnoCSS arbitrary variants like `[class*="size-"]` or `has-[>svg]` — was concatenated raw into the client template string, which corrupts attribute parsing when the template is inserted via `innerHTML` and diverges from the server-rendered bytes. Escaping at interpolation time is the only correct layer (a post-assembly pass can't tell a delimiter `"` from a value `"`).
- 5231cc8: Client-render templates now HTML-escape interpolated **text content** (the `<!--bf:sN-->${expr}<!--/-->` slots) via a new `escapeText` runtime helper — the parallel of the #1692 attribute-value fix. A string child containing `<` / `&` (e.g. `{user.name}`) was previously concatenated raw into the template string, which diverges from the SSR-escaped bytes and is a markup-injection vector when the template is inserted via `innerHTML`. Only the text-marker slots are escaped; bare `${children}` passthrough and `renderChild(...)` output are pre-rendered HTML and are left untouched. Hono escapes text with the same set as attribute values (`& " ' < >`), so `escapeText` delegates to the same operation for byte-parity with the conformance layer.
- d87144d: Handle `dangerouslySetInnerHTML` arriving through a spread/rest object in the runtime spread helpers (follow-up to the explicit-attribute support in #1704). `classifyDOMProp` now classifies it as a dedicated `innerHTML` kind; `spreadAttrs` skips it (so a spread carrying it no longer serialises a bogus `dangerouslySetInnerHTML="[object Object]"` attribute), and `applyRestAttrs` assigns the raw `el.innerHTML = value.__html` (the escape hatch) instead of `setAttribute`.
- Updated dependencies [d87144d]
  - @barefootjs/shared@0.5.3

## 0.5.2

### Patch Changes

- @barefootjs/shared@0.5.2

## 0.5.1

### Patch Changes

- 8742059: Fix two follow-up issues from the #1663 dynamic-dispatch work.

  `__bfText` could render both a stale element and fresh text in a conditional slot: that path re-resolves the anchor via `$t()` each run, which inserts a new text node before an element left by a previous Node-valued run. Writing a primitive now clears any remaining siblings up to the end marker, so switching JSX → text leaves only the text.

  The no-arg props default (`= {}`) is now asserted to the param's annotated type (`= {} as T`) in both the test and Hono adapters. `hasRequiredProps` treats a prop with a destructuring default as non-required, but the declared props type may still mark that field required, so a bare `= {}` failed `tsc` ("Property 'x' is missing in type '{}'..."). The destructuring defaults still supply the values at runtime.

- 9dcffdf: Compile JSX used as an object-literal arrow value and render dynamic dispatch (#1663).

  A `Record<K, () => JSX>` lookup map (`{ piconic: () => <BrandLogo/> }`) was never lowered: a module-level map had its const dropped from the emitted module (`ReferenceError` at SSR), and a function-local map leaked raw `<...>` into the client bundle (`SyntaxError: Unexpected token '<'`). The preprocessor now hoists arrow values in object-literal property assignments into synthesized components, the same lowering already applied to arrows in JSX-attribute position, so the lookup map survives as component references.

  Dynamic dispatch of such a map in child position (`<div>{themeLogo(props.id)}</div>`) now renders on the client: the dynamic-text effect routes through a new `__bfText` runtime helper that splices the live component element into the slot by identity instead of stringifying it to `"[object HTMLElement]"`. Adapters and `createComponent` default missing props to `{}` so a bare no-arg shim call (`LOGOS[id]()`) no longer crashes destructuring `undefined`.

- 113a17c: Reactive whole-item conditionals in loops (#1665).

  `arr.map(t => cond(t) && <li/>)` (and `cond ? <li/> : null`, `expr || <li/>`,
  `expr ?? <li/>`) makes the conditional the entire loop item, so an item renders
  0-or-1 element per pass. Previously this either threw at hydration (the loop's
  children stayed empty and the whole `.map(...)` was emitted verbatim as
  reactive text — uncompiled inline JSX, undeclared module-level helpers) or, once
  compiled, crashed at runtime (`firstElementChild.cloneNode` on a null element)
  or froze at its server-rendered value.

  This is now fully reactive, with identical behaviour whether the array is a
  `const` or a `signal()`:

  - **Runtime** — new `mapArrayAnchored` tracks each item by an always-present
    `<!--bf-loop-i:KEY-->` anchor comment (not a root element, which the item may
    not have); content lives between the anchor and the next anchor / loop end and
    is derived from the live DOM range each pass. `insert()` accepts the anchor as
    its scope so a whole-item conditional toggles range-scoped to its own item.
  - **Compiler** — detect the whole-item conditional, hoist the key from the
    rendering branch, emit per-item anchors plus a `mapArrayAnchored` renderItem;
    static-array bodies route through the same path. Logical (`&&`/`||`/`??`) and
    ternary JSX-helper map bodies are inlined, and BF023 now requires a key on
    those bodies.
  - **SSR adapters** — Hono, Go, and Mojo emit the per-item `bf-loop-i:KEY` anchor
    so server-rendered lists hydrate. Hono also emits `data-key` on the
    conditional branch's loop-item root, matching Go / CSR.

  Both-branch-element ternaries (`cond ? <A/> : <B/>`) render exactly one element
  and keep their existing `mapArray` path.

- Updated dependencies [113a17c]
  - @barefootjs/shared@0.5.1

## 0.5.0

### Patch Changes

- @barefootjs/shared@0.5.0

## 0.4.0

### Patch Changes

- @barefootjs/shared@0.4.0

## 0.3.0

### Patch Changes

- b136f8d: Remove internal @barefootjs/\* from published devDependencies to avoid npm registry dependency graph pollution
- 7e9570d: Fix CSR `render()` dropping all but the first root of a multi-root (fragment) component. `render()` now mounts every root element; for the multi-root case it recreates the SSR fragment layout (a `bf-scope:` comment marker before the sibling roots) so `$c()` resolves sibling child scopes via the comment range. The async hydration walk no longer re-initializes a `render()`'d fragment scope — the comment-scope path now honours `hydratedScopes`, matching the element-scope path — so multi-root components mount every root and initialize exactly once.
- 44c3466: Fix two mapArray bugs (#1627):

  - Hydration now removes orphaned SSR nodes when the client signal has fewer items than the server rendered.
  - Components created via `createComponent` (the CSR path mapArray takes for new loop items post-hydration) now thread their own scope id into `_parentScopeId`, so child components rendered by `renderChild` get parent-prefixed `bf-s`/`bf-h`/`bf-m` markers. This lets the component's init resolve them via `$c(scope, 'sN')` and wire up event handlers, matching the SSR convention.
  - @barefootjs/shared@0.3.0

## 0.2.0

### Patch Changes

- 2313724: Fix classifyDOMProp review issues: strict event detection, boolean attr DOM property handling, immutable BOOLEAN_ATTRS export
- bac95e6: Extract classifyDOMProp as single source of truth for DOM attribute vs JSX prop classification
- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
- Updated dependencies [4e4d31a]
- Updated dependencies [bff7df6]
- Updated dependencies [31ce089]
- Updated dependencies [89a6ad5]
  - @barefootjs/shared@0.2.0
  - @barefootjs/jsx@0.2.0

## 0.1.3

### Patch Changes

- Updated dependencies [91523ba]
- Updated dependencies [a5a466c]
- Updated dependencies [a57e113]
  - @barefootjs/jsx@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/jsx@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/jsx@0.1.1
  - @barefootjs/shared@0.1.1
