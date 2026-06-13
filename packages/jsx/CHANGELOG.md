# @barefootjs/jsx

## 0.15.0

### Minor Changes

- 166177d: Composed `site/ui` demo-corpus parity for the perl adapters (#1897):

  - **Xslate now renders the ENTIRE shared conformance corpus to Hono parity** (`skipJsx` is empty). `tabs` / `accordion` / `pagination` came off via: ARIA `aria-selected`/`aria-expanded` and boolean-TYPED prop routing through `bool_str`, compile-time resolution of module object-literal const property access (`variantClasses.ghost`), composed template-literal module consts, `attr={cond ? v : undefined}` attribute omission, and literal-const inlining (`totalPages`).
  - **Mojolicious closes the strict-vars seeding gap**: child renders now seed declared props (JSX default or `undef`), inherited `props.<x>` accesses (via the shared augmentation pass), signal initials, and memo `ssrDefaults` under the caller's props — `tabs` / `tooltip` / `pagination` render to parity and `skipJsx` is empty. The remaining composed fixtures stay pinned on the context-provider object-literal lowering (BF101), the tracked #1897 feature.
  - `@barefootjs/jsx` exports the shared static-const machinery all three SSR adapters now use: `collectModuleStringConsts` (fixed-point, incl. composed template-literal consts and `[...].join(sep)`) and `lookupStaticRecordLiteral` (module object-literal property/index lookup). The Go adapter delegates to it (no behavior change).

- 77974ee: Context-provider object-literal lowering for the Perl adapters (#1897):

  - `@barefootjs/jsx` exports `parseProviderObjectLiteral`, a structural (TS AST) classifier for `<Ctx.Provider value={{ … }}>` members: zero-param expression-body arrows are getters (SSR snapshot of the body), other function shapes are client-only behavior, everything else is a plain expression.
  - The Mojolicious and Xslate adapters lower object-literal provider values to Perl/Kolon hashrefs instead of refusing with BF101: getter members snapshot their body's SSR value, handler (`on[A-Z]`) and function-shaped members lower to `undef`/`nil`. Keys keep their JS names so consumer-side accesses map onto the same hashref keys.
  - `ref={fn}` props on imported components are skipped at SSR like `on*` handlers (Hono renders neither; client JS wires them at hydration).

  This un-pins the composed `site/ui` demo fixtures that were BF101-blocked on their context providers (`radio-group`, `accordion`, `dialog`, `popover`, `select`, `dropdown-menu`, `combobox`, `command`).

### Patch Changes

- ae67ac7: `augmentInheritedPropAccesses` (shared by the Go and Mojo adapters) now sees `props.X` reads inside template-literal attribute _parts_ and inside if-statement/conditional branches. Previously a `className={`… ${props.className ?? ''}`}` or an asChild early-return branch could reference a prop in the emitted template that the generated props type never declared.
  - @barefootjs/shared@0.15.0

## 0.14.0

### Minor Changes

- 9bba0d3: feat(profile): expose handlers in the static budget + `schemaVersion` on every JSON mode (#1841)

  The static reactivity budget exposed signal/memo/effect counts and fan-out, but
  **not the handlers `--scenario auto` would fire** — so an agent couldn't see
  "what gets fired" or "which handlers are uncovered" without an actual run. The
  remaining coverage gap (e.g. `coverage: 1/5 handlers exercised`) named a count
  but never the handler names or locations.

  `StaticBudget` now carries a `handlers` array — `{ name: "click@s1", loc: { file,
line } }` — built from the same `graph.domBindings` event slots the auto scenario
  fires, so the static list and the dynamic coverage share one identity (the
  slotId). The text output gains an optional `handlers (N):` section when handlers
  exist. This lets an agent predict the coverage gap and reference handler names
  before any run.

  All three `bf debug profile --json` modes (`static-budget` / `profile` / `diff`)
  now include a top-level `schemaVersion` (exported as `PROFILE_SCHEMA_VERSION`) so
  a machine consumer can branch on the output contract; the same major version is
  additive-only.

### Patch Changes

- @barefootjs/shared@0.14.0

## 0.13.0

### Patch Changes

- @barefootjs/shared@0.13.0

## 0.12.0

### Minor Changes

- 6489ede: feat(profile): split fan-out into direct vs via-memo, flag `⚠ high` on direct

  The static reactivity budget reported a single per-signal fan-out — the
  _transitive_ subscriber count — and flagged `⚠ high` off it. That conflated two
  very different things: subscribers a write re-runs directly, and subscribers
  sitting behind a memo barrier (which only re-run when the memo's value actually
  changes). It also made memo-barrier refactors look like regressions: routing N
  reads through a new memo _lowers_ real re-run pressure but _raises_ the
  transitive total (more nodes become statically attributable), so the number
  went up after an optimization.

  `FanOutEntry` now carries `direct` alongside `subscribers` (the transitive
  total). The text output shows the split — `currentYear → 11 subscribers
(6 direct · 5 via memo)` — and `⚠ high` keys off **direct** fan-out, the real
  per-write pressure. `bf debug profile --diff` likewise tracks direct fan-out, so
  a memo-barrier refactor reads as the improvement it is rather than a false
  regression.

### Patch Changes

- @barefootjs/shared@0.12.0

## 0.11.0

### Minor Changes

- 42974e4: feat: `bf debug profile` — static reactive profiler, v1 (#1690 SR5 + SR6)

  Implements `bf debug profile` and companion library support.

  **Command surface:**

  - `bf debug profile <component>` — static reactive budget for a single component
  - `bf debug profile --scenario auto` — ranked table for all reactive components in `ui/components/ui/`
  - `bf debug profile --scenario <path.tsx>` — profile a specific file
  - `bf debug profile <component> --diff` — compare current IR vs git HEAD (SR6 compile-diff)
  - `--json` flag throughout

  **Static analyses (SR5):**

  - Max signal fan-out and hot-signal identification
  - Max memo chain depth
  - Total subscription count (Σ deps across memos, effects, DOM bindings)
  - Batch candidates (handlers that set ≥2 distinct signals — `batch()` opportunities)
  - Findings: `high-fan-out`, `deep-memo-chain`, `batch-candidate`, `fallback-heavy`

  **SR6 (compile-diff):**

  - `diffProfiles(before, after)` — surfaces regressions in fan-out, chain depth, fallbacks, subscriptions; improvements in the same metrics; neutral structural count changes.

  **Bug fixes bundled in this PR:**

  - **Bug A (debug.ts):** `buildComponentGraph` now falls back to the caller-supplied `filePath` when `findSourceFile` returns empty for non-reactive components. Previously `bf debug graph Button` showed `Button ()` (empty path); now correctly shows `Button (/path/to/button/index.tsx)`.

  - **Bug C (debug-profile.ts):** Batch-candidate findings from handlers wired to multiple JSX locations (e.g. Calendar dual-month navigation) were reported once per JSX site. Deduplicated by `(kind, file, line, signals-set)` so each logically unique handler appears once.

  - **Bug D (debug-profile.ts):** `batchCandidateCount` in metrics and the batch-candidate findings list used independent counting, causing the table column to disagree with the findings section. Both now use the same deduplicated set.

  **Known limitation (Bug B — batch-candidate precision):** Static analysis resolves setter calls by regex without control flow awareness. Handlers that set one of two signals based on a condition (`if (isControlled()) { setA() } else { setB() }`) are reported as batch candidates even though only one setter fires per interaction. This is a known false positive documented in tests. A fix requires AST-level control flow analysis (v2 scope). The finding message now includes `(static; verify setters are not in separate if/else branches)` to help users self-triage.

- c4de967: fix(profile): stop the dynamic batch advisor flagging single-write turns

  `bf debug profile <component> --scenario` measures a run and advises wrapping
  _multi-write_ handlers in `batch()`. It inferred "multi-write" from repeated
  effect runs (`savings = totalRuns − distinctSubscribers`), which over-counted
  two ways:

  - a single `set()` that fans out to a loop re-runs one binding id once per item
    (e.g. a 42-cell calendar grid → one id, hundreds of runs), and
  - a memo recompute writes its own private signal (a memo is an effect that
    writes a signal sharing its id), so each cascade step looked like another
    write.

  Together these produced confident false positives like Calendar's day-click
  reported as `batch candidate 558→9 (saves 549)` and Slider's pointer drag as
  `5→4` — turns that each make exactly one handler write, where `batch()` saves
  nothing.

  The advisor now counts only `signalSet`s made directly in the handler body
  (effect-nesting depth 0, tracked via `effectEnter`/`effectExit`) and requires a
  turn to make ≥ 2 such writes before it is a candidate. Genuine multi-write turns
  still surface. `BatchCandidate` gains a `writes` field, and `savings` is
  documented as an upper bound (a loop's per-item runs share one id and are not
  collapsed by a batch).

- 4ccc227: Add `bf debug profile` — reactive performance profiler (#1690), static half.

  New CLI subcommand `bf debug profile <component>` prints a per-component static
  reactivity budget (no run required): signal/memo/effect/loop counts, total
  subscriptions, the longest memo→memo chain, and per-signal fan-out with a `hot`
  threshold. `--diff <ref>` compiles the component at a git ref and flags
  structural reactivity regressions (CI-able, exits non-zero on growth). Human
  table and `--json` output, consistent with the `bf debug *` family.

  `@barefootjs/jsx` gains the supporting static-analysis API: `buildStaticBudget`,
  `diffStaticBudget`, `formatStaticBudget`, `formatBudgetDiff`, and the
  `buildProfileReport` seam for the dynamic (scenario-driven) half specified in
  `spec/profiler.md`.

- ce2ea33: `bf debug profile --scenario auto` now attributes imported child components and quiets runtime-bookkeeping coverage noise (#1840).

  Two related attribution/coverage fixes:

  - **Imported child sources reach the id index.** Auto mode loaded a target's
    local imports to drive the run, but did not pass them into
    `buildProfileReport`, so events from composed children (e.g. `DatePicker`
    importing `Calendar`) resolved to `((unresolved))`. Auto mode now forwards
    those imported sources the same way the `--scenario <story.tsx>` path does,
    so `Calendar#binding:*` subscribers map back to their source location.

  - **Anonymous runtime ids no longer masquerade as coverage gaps.** The reactive
    runtime assigns fallback `s<n>`/`e<n>`/`m<n>`/`r<n>` ids to nodes with no
    compiler `__bfId`. These can never map to a source node, so reporting them as
    `coverage.unattributed` made healthy reports look broken. `joinProfilerEvents`
    now routes them to a separate non-actionable `diagnostics` bucket (surfaced,
    never dropped), leaving `unattributed` for actionable gaps only.

- ca59e22: Add the batch-advisor analysis — measured half (#1690, §4.2.3).

  `analyzeBatchAdvisor(events)` groups the SR2 stream by turn and, per turn,
  measures effect `totalRuns` vs `distinctSubscribers`; `savings = totalRuns −
distinctSubscribers` is the runs a `batch()` wrap would collapse. Turns with
  `savings > 0` are reported, ranked by savings. This is the cost BarefootJS's
  explicit-batching model uniquely incurs (`set()` notifies synchronously).

  Measured half only: every candidate is `safety: 'unverified'`. The static
  post-write-derived-read oracle that proves a `batch()` wrap is behavior-
  preserving (and the handler-loc join for the finding's source location) lands
  in a follow-up (#1790) — an advisory that could change behavior is never
  labeled `'safe'` (§4.2.3). `formatBatchAdvisor` renders the report.

- 54aaa91: Attribute DOM-binding effects in the profiler (#1690, closes #1795).

  Top-level reactive bindings — text (`{total()}`), attribute (`class={…}`,
  `data-state`), client-only markers, and component/child prop syncs — now emit
  `createEffect(…, "<Component>#binding:<slotId>")` in profile mode, and
  `buildIdIndex` resolves those ids from the graph's `domBindings` (slot + loc).

  Previously these showed in the hot-subscribers list as bare, unresolved runtime
  ids (`e1`, `e2`) and inflated the coverage gap — yet they are often the _most_
  re-run subscribers. Now every binding re-run is attributed to a source line, so
  `bf debug profile <component> --scenario auto` reports zero coverage gaps for a
  typical component (e.g. `switch`: both attribute syncs map to `index.tsx:146`
  and `:151`). Off by default the emitted effects are byte-for-byte unchanged
  (SR8). Loop/branch-scoped binding effects remain a follow-up under #1795.

- aafbccc: Wire `bf debug profile <component> --scenario auto` — the dynamic run (#1690).

  The CLI now mounts a component's instrumented build in happy-dom, fires each
  interactive element once, and prints the joined report (hot subscribers + batch
  advisor + coverage). `buildProfileReport(input)` becomes a real pure function
  (graph + SR4 join + analyses → ranked findings) and `formatProfileReport`
  renders it; `@barefootjs/jsx` now also exports the analysis functions and the
  dependency-free `testAdapter` for tooling.

  Also fixes a real bug found while dogfooding: the **multi-component** compile
  path did not thread `options.profile` to `generateClientJs`, so profile-mode
  ids were silently dropped for any file exporting more than one component. Now
  threaded — single- and multi-component files both emit ids (profile-off output
  is unchanged).

  happy-dom is a CLI devDependency, imported lazily so the static modes
  (`bf debug profile <component>` / `--diff`) carry no DOM cost.

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

- 0488005: Add the hot-subscribers analysis (#1690, §4.2.1) — the first v1 profiler insight.

  `analyzeHotSubscribers(events, index, options)` consumes the SR2 event stream
  and the SR4 id index and ranks effects/memos by total run time, each joined to
  its IR source loc:

  - `runs` (`effectEnter` count), `totalMs` (Σ `effectExit.dur`),
  - `runsPerTurn` — average runs per active turn, the re-run-pressure signal that
    flags batch / over-subscription candidates,
  - `hot` when `runsPerTurn` meets a configurable threshold (default 2),
  - `topN` to keep only the costliest.

  Pure and deterministic: the same stream yields the same ranking (timings vary,
  ranks/structure do not). Unresolved subscriber ids are surfaced as coverage
  gaps, never dropped. `formatHotSubscribers` renders the human report.

- e29bf9f: Attribute loop-child DOM-binding effects in the profiler (#1690, #1795 Phase 2).

  Inside a `{items().map(it => …)}` body the emitter wraps every loop-param read
  (`{it.t}`, `class={it.n > 0 ? …}`) in a per-item `createEffect`. In profile
  mode each of those loop-child attribute / outer-text effects now carries a
  `<Component>#binding:<slotId>` id, so the profiler attributes their re-runs to a
  source line instead of bare runtime ids:

  - **analyzer** — `collectDomBindings` now threads loop-param context, so a
    binding that reads a loop param (or index) registers as a reactive
    `domBinding` with its slot + loc. Detection uses the analyzer's lexer-resolved
    metadata (`origin.freeRefs` for text, `freeIdentifiers` for attributes), not a
    raw-string scan, so a param name appearing only inside a string literal
    (`i` vs `'i'`) is not mistaken for a read. `key={…}` is skipped (it is the
    loop's keyFn, never an effect). `buildIdIndex` then resolves every loop-child
    text/attribute slot to `<Component>#binding:<slotId>`.
  - **emit** — `ReactiveEffectsPlan` carries `profileComponentName`;
    `stringifyReactiveEffects` emits the id on each loop-child attribute and
    outer-text `createEffect`.

  Previously loop-child re-runs (often the hottest subscribers in a list view)
  surfaced unattributed and inflated the coverage gap. Off by default the emitted
  effects are byte-for-byte unchanged (SR8). Loop-child _conditional-branch_ texts
  remain a follow-up.

- 4e5d724: Attribute deeply-nested loop binding effects in the profiler (#1690, closes #1795).

  Phases 1–2 attributed top-level, conditional-branch, and direct loop-child
  binding effects. Phase 3 closes the remaining nested emit paths so every binding
  effect a loop produces carries a `<Component>#binding:<slotId>` id and every
  emitted id resolves via `buildIdIndex` — `bf debug profile` now reports zero
  coverage gap for nested list/conditional structures:

  - **analyzer** (`collectDomBindings`) — loop-param awareness now extends to the
    `conditional` case (`origin.freeRefs`) and the inner-`loop` case
    (`arrayFreeIdentifiers`), so a loop-child conditional (`{r.on ? …}`) and an
    inner loop reading the outer param (`{r.tags.map(…)}`) register as reactive
    `domBindings` with slot + loc.
  - **emit** — `profileComponentName` is threaded through the remaining loop
    stringifiers, each emitting the id via a shared `profileBindingId` helper:
    loop-child conditional `insert()` + branch text (`reactive-effects` /
    `loop-child-arm`), inner / nested loop `mapArray` + child text/attr
    (`inner-loop`), branch-scoped loop `mapArray` (`branch-loop`), static-array
    loop child effects (`loop`), composite and component loop `mapArray`
    (`composite-loop` / `component-loop`).

  Off by default the emitted effects are byte-for-byte unchanged (SR8). The one
  remaining residual is a child component's reactive _children_ text inside a
  component loop (`<Row>{it.label}</Row>`), which is a component-children binding
  rather than a DOM binding and is not yet resolved by the analyzer.

- e4a63f1: Batch-advisor safety oracle — post-write-derived-read (#1690, §4.2.3, closes #1790).

  `assessBatchSafety` upgrades a batch candidate from `'unverified'` to `'safe'`
  or `'unsafe'` by static analysis of the handler body, and `buildProfileReport`
  applies it per candidate (pairing the turn id to its `EventBinding` by source
  line). A `batch()` wrap defers effect flush; since a memo is a push-effect that
  writes a private signal, a memo read _after_ a write to one of its dependencies
  returns a stale value under batch. So the wrap is safe iff no such read happens.

  Conservative by construction — only `'safe'` when provably so: indirect setters
  (`via` a helper) or an unknown call after a write yield `'unverified'`; a
  downstream-memo getter read after the first write yields `'unsafe'`; signal
  reads are fine (`set()` updates the value synchronously). The report now reads
  `click@s0 batch candidate 4→2 (saves 2, safe) (Form.tsx:10)`.

- 3038728: Add scenario-file support to `bf debug profile` (#1690, #1796).

  `bf debug profile <component> --scenario <story.tsx>` now compiles a "story"
  file and its local relative imports, mounts the composition, and fires every
  handler — so a component composed from sub-components (the common case) is
  profiled as it's actually used, not as a bare mount.

  - driver: `loadStory` resolves the story's relative imports (dependency-first);
    `runScenario` compiles each in profile mode, dedupes the concatenated runtime
    imports into one, mounts the story, and fires all IR-known handlers across
    every component in every source.
  - jsx: `buildProfileReport` accepts `extraSources` and enumerates every
    component per source (`listComponentFunctions`), merging their id indexes and
    handler bindings — so events from composed sub-components resolve and the
    safety oracle reasons over the right component's graph.

  Verified end-to-end: a story composing `Switch` reports `1/1` coverage with its
  memos, attribute bindings, and controlled-signal effect source-mapped. Fully
  headless components whose handlers/bindings are wired through context remain
  limited by analyzer binding-coverage (the same gap as #1795), tracked on #1796.

- 650b672: Add profile-mode `__bfId` emission to client-JS codegen (#1690, SR3).

  A new `CompileOptions.profile` flag makes the client-JS generator append
  IR-aligned id arguments at reactive creation sites — `createSignal(init,
"Comp#signal:x")`, `createMemo(expr, "Comp#memo:y")`, `createEffect(body,
"Comp#effect:line")`, including controlled-signal sync effects. The runtime
  (`@barefootjs/client`) already accepts these ids, so a profiling run can join
  its event stream to IR nodes.

  Off by default: when `profile` is unset the emitted code is byte-for-byte
  unchanged (SR8). Ids are threaded purely through the declaration-emit plan and
  the effects phase; the stringifiers stay `ctx`-free.

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

- a76e460: Extend profile-mode turn markers (#1690, SR3) to the loop event-delegation path.

  A dynamic list delegates child events to one container listener. In profile
  mode each delegated handler call is now bracketed with `beginTurn`/`endTurn`
  (id `<Component>#handler:<childSlotId>:<eventName>`), so the reactive work a
  list-row interaction triggers is attributed to one turn — the same id namespace
  as direct handlers. The marker is a single-statement `beginTurn(id); try { … }
finally { endTurn() }` wrap, dropped into every item-lookup shape.

  Threaded via `EventDelegationPlan.profileComponentName`, set by the top-level
  and static-array delegation builders (which have `ctx`). Off by default the
  dispatcher is byte-for-byte unchanged (SR8). Branch-scoped delegation (a loop
  nested inside a conditional branch) does not yet carry markers — tracked as a
  follow-up.

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

- 3f99394: Visualize the profiler report with proportional bars (#1690).

  `bf debug profile --scenario` now renders mitata-style horizontal bars in the
  human report: hot subscribers get a bar proportional to their run count, and
  batch candidates a bar proportional to the runs a `batch()` would save. Bars are
  keyed on the deterministic metrics (`runs` / `savings`), so the chart is stable
  across runs (SR7); long names are ellipsized to keep columns aligned. `--json`
  output is unchanged.

      hot subscribers — most run / most time
        s1 (attribute)       ██████████████   2×  0.4ms  (switch/index.tsx:146)
        isControlled (memo)  ███████          1×  0.1ms  (switch/index.tsx:90)

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

- 0187b4c: fix(profile): add `kind: "diff"` discriminator to compile-diff JSON (#1849 B2)

  `BudgetDiff` now carries a `kind: "diff"` field so JSON consumers can distinguish a zero-delta diff ("no change") from a pure-static component with no reactive state.

- cafd0b4: fix(profile): label & locate uninstrumented `createEffect` in the hot table (#1849 B6)

  A `createEffect` nested in a ref callback (accordion/collapsible/sidebar/tabs/toast) gets no compiler `__bfId`, so the runtime assigns a fallback id like `e1` that surfaced as a bare `(unresolved)` hot row — reading like a broken profiler.

  The row is now kept (its cost is real, not hidden) and:

  - relabelled `(uninstrumented — createEffect in non-JSX scope)` so the missing location is understood as expected;
  - annotated with candidate source lines from a static scan (`createEffect` call sites minus the compiler-instrumented ones), e.g. `candidates: collapsible/index.tsx:82, :126, :184`.

  JSON gains `resolution: "uninstrumented"`, `resolutionNote`, and `candidates: [{ file, line }]` on those subscribers. New exports: `findUninstrumentedEffects`, `EffectCandidate`.

- 719a8fe: fix(profile): de-dup parens, gate the uninstrumented-effect scan, align candidate loc (#1849 B6 review)

  Follow-up to the B6 hot-subscribers work:

  - The hot-subscribers report no longer renders doubled parentheses (`((unresolved))` / `((uninstrumented — …))`) — the location is wrapped exactly once.
  - `buildProfileReport` skips the per-source `createEffect` candidate scan entirely unless a runtime fallback `e<n>` id is present, so the common fully-instrumented case does no extra work.
  - Candidate call-site line numbers are computed from the call node's start to match the compiler's effect locations exactly.

- a901c73: fix(profile): summarize `coverage.diagnostics` in JSON (#1849 B7)

  The JSON `coverage.diagnostics` field is now a compact `{ count, sample }` summary instead of a per-id array that could run to hundreds of non-actionable entries for loop-heavy components. The text report is unchanged (it only ever printed the count).

  Note: `ProfileReport.coverage.diagnostics` is now an object rather than an array.

- c15d550: fix(profile): attribute prop-derived-const bindings forwarded into child components (#1863)

  `bf debug profile button --scenario auto` (and `badge`/`avatar`/`kbd`) surfaced
  `Button#binding:s0`/`s1` as `(unresolved)` hot rows plus a coverage warning, even
  though those `createEffect`s have a real source location.

  Root cause: the binding reads a prop _indirectly_ through a local const —
  `const classes = `…${variant}…${className}``, then `<button class={classes}>`/`<Slot className={classes}>`. The emitter inlines `classes`, sees the prop reads,
and wraps both in a `createEffect`emitting`#binding:<slot>`; but the analyzer's
prop check only inspected direct references, so the expression's lone free
identifier `classes`matched nothing and the id never made it into`buildIdIndex`.

  `buildGraphFromIR` now precomputes the local consts whose value transitively
  derives from a prop and treats reading one as reading a prop. The `component`
  case of `collectDomBindings` also switches from the naive `includes('props.')`
  check to the shared prop predicate, so a prop (or prop-derived const) forwarded
  into a child component (`<Slot className={classes}>`) is tracked too. Both
  `#binding:<slot>` ids now resolve to their JSX source line in the hot table
  instead of `(unresolved)`.

- 67d6847: Extend profile-mode turn markers to conditional-branch handlers (#1690, #1786).

  `profileComponentName` is now threaded through `buildInsertPlan` so the two
  remaining handler paths get `beginTurn`/`endTurn` like the top-level and
  top-level-loop paths:

  - **branch-arm direct listeners** — `emitListenerLine` takes an optional turn id
    and wraps via `wrapHandlerForTurn`; arm events carry it (`ArmEventBind.turnId`).
  - **branch-scoped loop delegation** — `buildBranchLoopDelegationPlan` now sets
    `EventDelegationPlan.profileComponentName`, so a loop nested inside a
    conditional wraps its delegated handlers too.

  Off by default the emitted code carries no markers (SR8). With three handler
  sites — top-level, branch-arm, branch-loop — a profile build now emits exactly
  three `beginTurn`s. The loop-cond arm path (`BranchEventBindingsPlan`) remains a
  minor follow-up under #1786.

- c30e089: Profiler CLI ergonomics: robust flags + actionable build hint (#1690).

  Dogfooding `bf debug profile` surfaced three agent-facing rough edges:

  - **Flags leaked into the component name.** Unknown / mis-typed flags were
    pushed onto the positional list, so `bf debug profile --hot-ms 10 foo` read
    `--hot-ms` as the component and failed with `Cannot find component
"--hot-ms"`. `parseFlags` now rejects unknown `--flags` and validates numeric
    ones with an actionable message + usage, instead of silently mis-parsing.
  - **`--top` / `--hot-ms` are now wired.** `--top <n>` caps the hot-subscriber
    list (the `--json` set is unchanged); `--hot-ms <n>` drops sub-threshold
    subscribers so a grid component's long tail collapses to what is worth a fix.
    Threaded through `buildProfileReport` → `analyzeHotSubscribers` (new
    `minMs` option).
  - **Opaque "Cannot find module" on a fresh checkout.** The dynamic profiler
    imports the built client runtime (`@barefootjs/client/runtime`), so a checkout
    that ran `bun install` but not `bun run build` failed here with a raw module
    error. The scenario driver now catches it and points at `bun run build`,
    noting the static budget needs no build.

- 5caa4d9: Profiler: flag compound components in the static budget (#1844 follow-up).

  A compound component like `Select` / `Combobox` declares signals/memos but its
  consumers live in composed child components, so the single-component static
  budget reads `subscriptions: 0` with empty fan-out — which looks misleadingly
  "free". `buildStaticBudget` now sets a `crossComponentOnly` flag (and
  `formatStaticBudget` prints a `ⓘ compound:` note) when a component has reactive
  state but no in-component subscriber, pointing the user at `--scenario` to
  measure across the composition boundary. Self-contained components are
  unaffected.

- 1955cea: Rank hot subscribers deterministically (#1690, SR7).

  Dogfooding revealed the hot-subscribers list was ordered by `totalMs`
  (wall-clock), so the same scenario produced different rankings run to run — a
  component with many similarly-costed effects (e.g. `calendar`) reordered on
  every run, violating SR7 ("same scenario ⇒ same ranked findings; timings vary,
  ranks do not"). The structure (which subscribers, their run counts) was already
  deterministic; only the timing-based sort wasn't.

  The list now sorts by `runs` (a structural, timing-independent cost proxy) with
  the subscriber id as a stable final tiebreak; `totalMs` is still shown but never
  sorted on. `calendar`'s ranking is now identical across runs.

- f6d497d: Profiler dogfooding fixes: resilient mount + capped report (#1690).

  Sweeping `--scenario auto` across the UI library surfaced two rough edges:

  - **Crash on context-dependent components.** A bare mount of a component whose
    init reads a context provider (e.g. `sidebar`'s `ctx.state`) threw an
    uncaught `TypeError`, aborting `bf debug profile`. The driver now catches the
    mount failure and reports an actionable message ("…needs a context provider
    or composition — profile it with `--scenario <story.tsx>`").
  - **Unreadable hot list.** A grid component (e.g. `calendar`) produced 1000+
    subscribers, dumping a thousand rows. `formatHotSubscribers` now shows the top
    N (default 12) and summarizes the rest as "… and N more", keeping the report
    scannable (the full set remains in `--json`).

- 7d8cb6b: Refine the hot-subscribers per-turn metric and add end-to-end profiling proof
  (#1690).

  Running the full substrate end-to-end (real `reactive.ts` instrumentation +
  `createRecordingSink` + SR4 join + analyses) surfaced that `runsPerTurn`
  conflated the one-time mount run (`turn=null`) with interaction turns — an
  effect a click re-runs 5× read as a diluted `3.0`. Hot subscribers now split
  `mountRuns` out and compute `runsPerTurn = (runs − mountRuns) / interactionTurns`,
  matching the batch advisor's mount-excluding turn handling, and the report
  shows each subscriber's `kind` (memo vs effect).

  Adds `profiler-e2e.test.ts`: drives a mirrored Cart graph (exact compiler ids)
  through the live runtime and asserts the joined story — an unbatched 3-write
  click re-runs `total` 5×/turn; a `batch()` collapses 14 effect runs to 5.

- 23efcea: Exclude event handlers from static fan-out and subscription counts (#1690, SR5).

  Cross-checking the static budget against a dynamic run revealed the static
  fan-out over-counted: a signal read inside an event handler (e.g.
  `setCount(count() + 1)`) listed that handler as a "subscriber", but a handler
  runs outside any reactive scope and does **not** re-run when the signal changes.
  For a `count` read by one handler the static fan-out reported 8 while the run
  showed 7 actual subscribers. Fan-out and `subscriptions` now exclude event
  handlers, so the static prediction matches the measured reactive fan-out.

- 570e5bb: Resolve handler turn ids to source loc in the batch advisor (#1690, #1790).

  `buildIdIndex` now also registers handler turn ids
  (`<Component>#handler:<slotId>:<eventName>`) from the graph's `event`
  domBindings, and `analyzeBatchAdvisor(events, index?)` uses them so a candidate
  carries the handler's `loc` + friendly name. The report now reads

      click@s1   batch candidate 14→5 (saves 9, safety unverified)  (Cart.tsx:14)

  instead of citing the raw turn id. This is the handler-loc half of #1790; the
  post-write-derived-read safety oracle (upgrading `unverified` → `safe`/`unsafe`)
  is still tracked there.

- 526f165: Complete profile-mode turn markers on the loop-cond arm path (#1690, closes #1786).

  The last uncovered handler path — a conditional inside a loop item whose arm
  holds an event handler (`items.map(it => it.on ? <button onClick/> : …)`) —
  now gets `beginTurn`/`endTurn` like every other path. `profileComponentName` is
  threaded through `buildReactiveEffectsPlan` / `buildLoopReactiveEffectsPlan` →
  `buildOuterArm` → `buildBranchEventBindingsPlan`, which tags each arm listener
  with its turn id; `stringifyBranchEventBindings` passes it to `emitListenerLine`
  (already turn-aware). Off by default the emitted code is byte-for-byte unchanged
  (SR8); with this, all CSR handler emit paths are covered (#1244 risk-A).

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

- 0e41034: Reuse the TS program across components when profiling multi-component files (#1690).

  Dogfooding timing surfaced that a profile of a file declaring many components
  (e.g. `chart`, ~25) took ~30s, because `buildProfileReport` re-built a fresh
  TypeScript program (the dominant cost) for every component. It now builds the
  program once per source via `createProgramForFile` and threads it through
  `buildComponentAnalysis` / `buildEventSummary` — `chart` drops 30s → ~2.9s.
  `buildStaticBudget` likewise shares one program between its graph + summary
  passes. The per-file analysis functions gain an optional `program` parameter.

- bea6488: Profiler: resolve `#binding:<slot>` ids for prop-driven attributes (#1844 follow-up).

  The compiler wraps a prop-driven attribute (`id={props.id}`,
  `` class={`…${props.className}`} ``) in a `createEffect` and emits a
  `<Component>#binding:<slot>` profiler id for it — but the debug-side graph
  collector (`collectDomBindings`) only tracked signal/memo dependencies, so those
  bindings were absent from `graph.domBindings` and `buildIdIndex` had no node for
  them. The effect then showed as `(unresolved)` in `bf debug profile` even though
  the id was prefixed with the component's own name (e.g. `Slider#binding:s2`,
  `Accordion#binding:s0`, and imported children like `CheckIcon#binding:s0`).

  `collectDomBindings` now detects prop references on attribute expressions,
  mirroring the emitter's `needsEffectWrapper` prop gate exactly (prop names as
  lexer-aware bare identifiers plus the `<propsObject>.x` member pattern, both
  excluding `children`). Such bindings carry no signal/memo `deps`, so fan-out and
  subscription counts are unchanged — only the previously-missing source
  attribution is added. A `PropAttr` shape is added to the SR4 coverage-conformance
  matrix so the emit↔analyzer symmetry is guarded against regression.

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

- eb9d66a: Lower the object-rest `.map()` destructure param read via member access on all three SSR adapters, graduating the `rest-destructure-object-in-map` conformance fixture (previously pinned to BF104).

  `tasks().map(({ id, title, ...rest }) => <li>{title}:{rest.flag}</li>)` now resolves each binding against a per-item loop variable instead of refusing the destructure pattern:

  - **Go**: `{{range $_, $__bf_item0 := …}}` with `$__bf_item0.Title` / `$__bf_item0.Flag` (the `rest` binding maps to the bare range var so the member emitter renders `rest.flag` → `$__bf_item0.Flag`).
  - **Mojo**: a per-binding Perl `my` local off the item (`my $rest = $__bf_item;` so `$rest->{flag}` resolves).
  - **Xslate**: the equivalent Kolon `: my` binding locals.

  The synthetic per-item variable uses a reserved `__bf_item` name (depth-suffixed on Go) to avoid colliding with a user binding of the same name.

  Only the object-rest-via-member shape is graduated. The other three rest-destructure fixtures stay refused (BF104), because they need machinery the SSR `range`/`for` can't express inline:

  - `rest-destructure-object-spread-in-map` (`{...rest}`) needs a residual object excluding the consumed keys,
  - `rest-destructure-array-in-map` (`[a, ...t]`) needs index/slice,
  - `rest-destructure-nested-in-map` (`{ cells: [h, ...r] }`) needs nested index paths.

  A shared IR-level gate (`isLowerableObjectRestDestructure`, exported from `@barefootjs/jsx`) keeps every other shape on the existing BF104 diagnostic. It walks the whole loop subtree (elements, components, conditionals, async, providers, template literals) and refuses when the rest binding is spread or used as a bare value (`String(rest)`, `{rest}`) — those need a residual object — as well as when the loop also has a `.filter()` predicate. The Go adapter suffixes its synthetic range var with the nesting depth (`$__bf_item0`, `$__bf_item1`) so nested destructure loops don't shadow each other. Verified against real Go 1.25.6 / Mojolicious 9.35 / Text::Xslate v3.5.9; Hono reference snapshots unchanged.

- 207802f: Lower JSX `style={{ … }}` object literals to a CSS string on all three SSR adapters, graduating the `style-object-dynamic` and `style-3-signals` conformance fixtures (previously pinned to BF101 because a bare object literal in attribute position had no template form).

  A new shared `parseStyleObjectEntries` helper (`@barefootjs/jsx`) parses the object literal (wrapping in parens to force expression context, since a bare `{…}` parses as a block), kebab-cases each key (`backgroundColor` → `background-color`), and classifies each value as a static string literal or a JS expression. Each adapter assembles the CSS string with its own interpolation for dynamic values:

  - **Go**: `background-color:{{.Color}};padding:8px`
  - **Mojo**: `background-color:<%= $color %>;padding:8px`
  - **Xslate**: `background-color:<: $color :>;padding:8px`

  Each value expression is pre-checked with `isSupported`, so an unsupported value (or an unsupported object shape — spread, shorthand, computed key) keeps the existing BF101 refusal rather than emitting partial output.

  Static CSS key/value segments are HTML-attribute escaped before being inlined into the `style="…"` attribute (a value like `'"'` would otherwise break the attribute quoting / inject markup); dynamic values are escaped by each engine's own attribute context. The shared `cssKebabCase` also special-cases the `ms` vendor prefix (`msTransform` → `-ms-transform`) and is now reused by the compile-time static-style serializer so both paths agree. Verified against real Go 1.25.6 / Mojolicious 9.35 / Text::Xslate v3.5.9; Hono reference snapshots unchanged.

- Updated dependencies [07b95ad]
- Updated dependencies [7079ca0]
- Updated dependencies [1919a0c]
  - @barefootjs/shared@0.11.0

## 0.10.1

### Patch Changes

- a62612b: Fix SSR render crash for components whose signal/memo reads an optional prop (`createSignal(props.initial ?? 0)`). The bare-props-arg form now seeds those referenced props into the manifest `ssrDefaults`, so template-stash adapters no longer abort with `Global symbol "$initial" requires explicit package name` at top-level render. The Text::Xslate scaffold's `app.psgi` also seeds each component's `ssrDefaults` from the build manifest (a plain PSGI app has no plugin to do it automatically), so `<: $count :>` and friends resolve.
  - @barefootjs/shared@0.10.1

## 0.10.0

### Patch Changes

- @barefootjs/shared@0.10.0

## 0.9.6

### Patch Changes

- @barefootjs/shared@0.9.6

## 0.9.5

### Patch Changes

- 4812524: Make the `./jsx-runtime` and `./jsx-dev-runtime` type entries JSR-publishable
  so `@barefootjs/hono` can publish to JSR. They were `.d.ts` files, which JSR
  drops from a package's exports (JSR can't use a `.d.ts` as an export
  entrypoint). As a result `@barefootjs/jsx/jsx-runtime` did not exist on JSR,
  and `@barefootjs/hono`'s JSR publish failed at the documentation-generation
  step with `Failed resolving '@barefootjs/jsx/jsx-runtime'` (it resolved
  locally only via `node_modules`, which JSR's server doesn't have).

  Convert both shims from `.d.ts` to real `.ts` modules (ambient `export
declare` declarations — same type surface, no runtime added) so JSR publishes
  them as exports. The `jsx-dev-runtime` re-export becomes
  `import type { JSX } … ` + `export type { JSX }` to satisfy isolatedModules
  (TS1205) now that it is a real module. Types are unchanged — the
  `IntrinsicElements` catch-all stays `HTMLBaseAttributes` with the existing
  `@ts-nocheck`, so consumer type strength is preserved.

  - @barefootjs/shared@0.9.5

## 0.9.4

### Patch Changes

- 0a103b3: Fix the `@barefootjs/hono` JSR publish, which failed with 31 `TS2411`
  errors in `jsx-runtime/index.d.ts`. The `IntrinsicElements` catch-all
  `[tagName: string]: HTMLBaseAttributes` is incompatible with the
  explicitly-typed elements under TS's index-signature rule, because the
  per-element types intentionally narrow `ref` to a concrete subtype and
  re-declare event handlers (not assignable under `strictFunctionTypes`).
  The diagnostic is spurious for JSX — a tag name always resolves to its
  explicit entry, never the index signature. `tsc` never surfaced it
  (`skipLibCheck`), but `deno publish` always type-checks `.d.ts`.

  Suppress the self-check of this one declarative shim with `@ts-nocheck`
  instead of widening the catch-all to `Record<string, any>`. Widening
  would silently drop attribute checking for custom / web-component tags;
  `@ts-nocheck` keeps the types fully strict at every use site (it only
  disables errors _within_ the shim file) while letting the publish through.

  - @barefootjs/shared@0.9.4

## 0.9.3

### Patch Changes

- 79e64d5: Fix Deno/JSR type-checking failures so `deno publish` succeeds for all
  `@barefootjs/*` libraries.

  - Add explicit `.ts`/`.tsx` extensions to relative imports across each
    published package's `src/` (Deno's ESM resolver does not implicitly
    append TypeScript extensions the way Bun/Node bundlers do; without
    this the publisher fails with `TS2307`).
  - Switch Node built-in imports in `@barefootjs/jsx` (`path`, `fs`) to
    the `node:` prefix Deno requires for unambiguous specifier resolution.
  - Enable `allowImportingTsExtensions: true` (with
    `emitDeclarationOnly: true` as its prerequisite) in each published
    package's `tsconfig.json` so TypeScript accepts the now-explicit
    extensions.

  No consumer-facing API changes — the npm build still emits
  `.js`/`.d.ts` artifacts identical to before; only the JSR-published
  TypeScript source surface is affected.

- f00e74d: Compute prop/signal-derived memos at SSR time on the Mojolicious and Text::Xslate adapters, graduating the `props-reactivity-comparison` conformance fixture to Hono parity.

  A memo whose body isn't statically foldable — e.g. `createMemo(() => props.value * 10)` — gets a `null` static SSR default from `extractSsrDefaults` (a bare prop access resolves to `undefined`). The Perl SSR model seeds child memos from those static defaults, so `$displayValue` was never declared and the child rendered empty (Go matches Hono because it generates a child constructor that computes the memo from the passed prop; the Perl static path had no equivalent — the reason both adapters skipped the fixture).

  Each adapter now seeds such memos in-template from the already-seeded prop/signal vars:

  - **Mojo**: `% my $displayValue = $value * 10;`
  - **Xslate**: `: my $displayValue = $value * 10;`

  The seed is emitted only when the memo's static default is `null` (statically-foldable memos stay on the existing ssr-defaults path) and when every variable the lowered expression references is already in scope (props params + signals + prior memos), so a memo over an out-of-scope binding stays on the null path rather than tripping Perl strict mode. Verified end-to-end against real Mojolicious and Text::Xslate. Hono reference snapshots unchanged.

  The memo body is extracted with a new AST-backed `extractArrowBodyExpression` helper exported from `@barefootjs/jsx` (it parses the `() => …` computation with the TypeScript parser and returns the body node text), replacing a brittle `^\(...\)\s*=>` regex that desynced on parameter defaults containing calls or nested-arrow bodies. Shared by both Perl adapters.

  - @barefootjs/shared@0.9.3

## 0.9.2

### Patch Changes

- @barefootjs/shared@0.9.2

## 0.9.1

### Patch Changes

- @barefootjs/shared@0.9.1

## 0.9.0

### Patch Changes

- cfbb4b6: Implement SSR context propagation for the Go template adapter, bringing the `context-provider` conformance fixture to parity with the Hono reference (the Perl backends stay deferred).

  Template engines have no JS runtime context stack like the Hono adapter's `provideContextSSR`, so a `useContext` value has to be threaded in at the data-construction layer:

  - **`collectContextConsumers` (`@barefootjs/jsx`)** — a shared helper that, for a component, finds every `const x = useContext(Ctx)` consumer and resolves each `Ctx` to its `createContext(<default>)` default value (string / number / boolean literal). Single source of truth for the SSR-context adapters.

  - **Go consumer side** — each `useContext` consumer becomes a struct field on the component's `Input` / `Props` (named after the local binding, e.g. `theme` → `Theme`), defaulted in `NewXxxProps` to the `createContext` default when the caller doesn't set it. The template already lowers the `useContext` local to a `{{.Theme}}` root-field read; it now resolves against a real field instead of emitting `.Theme` against a struct that has none (the prior compile failure).

  - **Go provider side** — `collectStaticChildInstances` threads the active `<Ctx.Provider value>` bindings (literal values lowered to Go literals) down the IR tree. When a static child slot consumes a context an enclosing provider supplies, its `NewXxxProps(...Input{ ... })` construction sets the matching field to the provider value (cross-component consumer lookup via the existing `registerChildComponentShape` channel), so `useContext(Ctx)` resolves to the provided value at template-eval time.

  `context-provider` is unskipped on the Go conformance suite. It stays skipped on the Mojolicious / Xslate suites (their stash-seed render path would port the same way — tracked as a follow-up); their skip rationales are updated to reflect that the Go path now exists. Hono reference snapshots are unchanged.

- 7d91adc: Resolve local-const conditional spreads and `Record`-indexed spread values on intrinsic elements. Two related spread shapes that previously raised `BF101` now compile on both template adapters.

  Local-const conditional spread: a function-scope const holding a `cond ? { ... } : {}` ternary, spread as a bare identifier (`const sizeAttrs = size ? { ... } : {}; <svg {...sizeAttrs} />`), now resolves to that initializer and routes through the existing conditional-spread lowering. Only function-scope (non-module) consts qualify, and a const that aliases another bare identifier is not forwarded (loop guard) — it falls through to the standard path.

  `Record<staticKeys, scalar>[propKey]` spread value: a spread-object value of the form `IDENT[KEY]`, where `IDENT` is a module-scope `Record<staticKeys, scalar>` object literal (all scalar number/string values under static keys) and `KEY` is a bare prop identifier, now lowers to an inline indexed map. Go emits `map[string]any{"sm": 16, ...}[fmt.Sprint(in.Size)]` (adding the `"fmt"` import only when this fires); Mojo emits `{ 'sm' => 16, ... }->{$size}`. Any non-scalar value, non-static key, or non-prop index still falls through to `BF101`.

  Together these let the `CheckIcon` sibling (`ui/components/ui/icon`) — `const sizeAttrs = size ? { width: sizeMap[size], height: sizeMap[size] } : {}` spread onto its `<svg>` — compile standalone with zero `BF101` on both adapters.

  Additionally, unblock the Phase 2b `checkbox` conformance fixture end-to-end on both template adapters (Go + Mojolicious), which composes `CheckIcon` and uses the SolidJS props-object pattern:

  - **Sibling import survival (Go test harness).** The Go conformance harness strips each merged sibling type block's `import (...)`; it now re-adds standard-library imports a merged block still needs (today `"fmt"`, used by `CheckIcon`'s `fmt.Sprint(...)` `Record[key]` lookup) so the combined unit resolves the symbol. The harness also now emits only the child components a parent transitively references — a child _file_ exporting many components (`../icon`'s 30+ icons) no longer drags in dead components whose own codegen wouldn't compile (e.g. an icon's `strokePaths['chevron-down']` lowering to an invalid `{{.StrokePaths.Chevron-down}}`).
  - **Cross-component child rest-bag routing.** A child component attribute whose name isn't a declared child param and isn't a valid identifier (`<CheckIcon data-slot="checkbox-indicator" />`) now routes into the child's rest bag — Go's `Props map[string]any` field / Mojo's quoted `'data-slot' => ...` `render_child` arg — instead of an invalid hyphenated field (`Data-slot:`) or Perl bareword.
  - **Props-object inherited-attribute enumeration.** A component written as `function C(props: P)` only enumerates `P`'s own members; inherited `*HTMLAttributes` members it actually reads (`props.className`, `props.id`, `props.disabled`) are now enumerated as Input/Props fields (Go) / declared stash vars + `defined`-guarded attributes (Mojo), so a caller's `className` / `id` / `disabled` bind and unset optionals are omitted (Hono parity).
  - **Template-literal className memo + boolean memo SSR value.** The Go adapter computes a template-literal `classes` memo's SSR initial value by inlining module string consts (including `[…].join(' ')` consts) and resolving `props.className ?? ''`; a boolean ternary memo (`isChecked`) now renders its zero as `false` (not `0`). The `@barefootjs/jsx` `extractSsrDefaults` (Mojo's SSR seed) gains module-const seeding and `.join()` evaluation so the same `classes` memo resolves to a concrete string instead of empty.

  With these, `checkbox` is unskipped on both adapter conformance suites at byte parity with the Hono reference. `toggle` / `switch` share the inherited-attr fix but remain skipped (they carry an additional `Record[key]`-in-memo-className blocker).

- 52ec729: Bring the `switch` site/ui primitive to SSR conformance parity across the Go, Mojolicious, and Xslate template adapters.

  `switch` assembles its track/thumb classes in function-scope plain consts (`trackClasses`, `thumbClasses`) rather than a `Record`-indexed memo, so it needs no `Record` SSR lowering — only two gaps blocked cross-adapter parity:

  - **Function-scope const prop enumeration.** `augmentInheritedPropAccesses` (`@barefootjs/jsx`) previously scanned memos, signals, init statements, effects, and template attributes for inherited `props.X` reads, but not function-scope const initializers. The `props.className` read inside `const trackClasses = \`… ${props.className ?? ''}\``was therefore never enumerated, so the generated struct/stash had no field to bind a caller's`className`to. It now also scans non-module local consts (module consts can't reference the function-scoped`props`, so they're skipped).

  - **`[...].join(' ')` module-const inlining on the Perl adapters.** Module consts assembled as `const stateClasses = ['[&[data-state=…]]:…', …].join(' ')` were emitted as references (`$trackStateClasses`) to bindings that don't exist server-side. A new shared `evalStringArrayJoin` helper statically evaluates the join and inlines the flattened string byte-for-byte, matching the Hono reference and the Go adapter's existing private behaviour. Wired into the Mojolicious and Xslate `parsePureStringLiteral` module-const collectors.

  `switch` is unskipped on all three adapter conformance suites. Hono reference snapshots are unchanged.

- 0cb8081: Bring the `toggle` site/ui primitive to SSR conformance parity across the Go, Mojolicious, and Xslate template adapters.

  `toggle`'s `classes` is a block-bodied `createMemo` that indexes module-scope `Record<T, string>` maps by a memo-local key with a default: `const variant = props.variant ?? 'default'; … ${variantClasses[variant]} ${sizeClasses[size]} …`. Lowering it to an SSR value required three extensions:

  - **`parseRecordIndexAccess` (`@barefootjs/jsx`)** gains an optional key resolver so the index key can be a memo-local const (resolved to its underlying prop + `?? '<lit>'` default), not only a bare prop. The result now carries that `defaultKey`. The resolver takes precedence over the same-named prop, since only the local binding carries the fallback.

  - **Go adapter** template-literal memo path now handles block-bodied arrows (collecting leading `const X = props.Y ?? 'lit'` key bindings, then resolving the single returned template literal) and emits `recordConst[key]` as an inline `map[string]string{…}[fmt.Sprint(in.Field)]`. When the key has a `'default'` fallback, the map also maps the empty key `""` to that default entry's value, so an unset prop (Go zero value `""`) renders the default instead of an empty string — matching Hono's `props.X ?? 'default'` runtime evaluation. `inferMemoType` recognises a template-literal memo as `string` (so the class-string `/` in `ring-ring/50` no longer trips the arithmetic-int heuristic).

  - **`extractSsrDefaults` (`@barefootjs/jsx`)**, the Mojo / Xslate SSR stash seed, now statically evaluates block-bodied arrows (leading `const` declarations into a local scope, then the `return` expression) and indexes a resolved object / array with a resolved scalar key, so the seeded `classes` is a concrete string. The Xslate adapter consumes this through the same SSR-seed path as Mojo.

  Also adds an HTML character-reference canonicalisation to the shared `normalizeHTML` conformance helper: a literal `"` in an attribute value (the `[class*="size-"]` in `toggle`'s base classes) is escaped as the named `&quot;` by Hono but as the numeric `&#34;` by Go's `html/template`. Both decode to the same character, so the interchangeable numeric (decimal + hex) forms are now collapsed to one canonical named form on both sides of the comparison — adapter-neutral, same motivation as the existing boolean-attribute / void-element canonicalisation.

  `toggle` is unskipped on all three adapter conformance suites. Hono reference snapshots are unchanged.

  - @barefootjs/shared@0.9.0

## 0.8.0

### Patch Changes

- @barefootjs/shared@0.8.0

## 0.7.0

### Patch Changes

- 43cb708: Fix `applyRestAttrs` exclude list to key on consumed prop names instead of
  HTML attribute names. For components that destructure props and spread
  `...rest`, the generated exclude list now unions the destructured param
  names (the JS rest-exclusion set) with the statically-set attribute names.
  This prevents hydration from double-binding separately-wired event handlers
  (e.g. `onInput`/`onChange` firing twice) and from re-emitting consumed props
  (e.g. `error`, `describedBy`, `variant`, `size`) as raw DOM attributes.
- 677c614: Render the `Slot` component's runtime-chosen dynamic tag (`const Tag =
children.tag`) as a children passthrough in the Go template adapter
  instead of an impossible `{{template "Tag"}}` call, which Go's
  `html/template` rejected (`no such template "Tag"`) while escape-walking
  all registered templates. This lets components that use the `asChild` /
  `Slot` pattern (e.g. `Button`) be registered and rendered server-side on
  the Go adapter. A new additive `IRComponent.dynamicTag` flag marks the
  node; it is consumed only by the Go adapter (Hono/CSR/Mojo ignore it).
  Also fixes two latent Go-adapter divergences surfaced by this path. The
  `isValidElement(x)` element guard now lowers to a real server-side
  truthiness check (an element is renderable when there is markup to emit)
  instead of a bogus `.IsValidElement` field access; any other user-defined
  predicate call in a condition (e.g. `isAdmin(user)`), which a server-side
  template genuinely cannot evaluate, now refuses with a hard `BF102` error
  pointing to `/* @client */` rather than silently rendering a gated branch.
  And `Record<T,string>` case values in template-literal lookups are
  HTML-escaped to match the reference output.
  - @barefootjs/shared@0.7.0

## 0.6.1

### Patch Changes

- d4dc638: Fix silent missing hydration for a nested `.map()` of child components inside a **component-rooted** loop item (#1725). When a `.map()`'s item root was itself a child component (a passthrough wrapper like `SelectGroup`) whose JSX `children` contained a nested `.map()` of components (e.g. `SelectItem`), the parent init emitted `initChild()` only for the outer wrapper — never descending into its children to initialize the inner-loop component instances. They rendered from SSR but never hydrated (no error, just inert event handlers).

  The compiler now collects inner loops inside a child-component loop item and emits a document-order zip (`qsaChildScopes` + per-component cursor over the flattened `outer.forEach(o => inner.forEach(i => ...))` iteration). This addresses the inner components by their slot selector rather than element offsets, so it works whether the wrapper component's root is an element (`<div>{children}</div>`) or a fragment (`<>{children}</>`) — the latter emits no per-group wrapper element to index.

- 2d4edce: Lower `Array.prototype.flat(depth?)` to the template-language adapters (#1448 Tier C).

  The value-returning `.flat()` now compiles on both template adapters instead of refusing with BF101. The flatten depth is validated to a literal and normalised at parse time:

  - `arr.flat()` — flatten one level (the JS default)
  - `arr.flat(n)` — flatten `n` levels (a fractional literal truncates toward zero; a `0` / negative depth normalises to "no flatten" → shallow copy, matching JS)
  - `arr.flat(Infinity)` — flatten fully
  - a **non-literal** depth refuses with BF101 (it can't be resolved at template time) and keeps `/* @client */` as the escape hatch — `@client` is not suggested for this case since the remedy is a literal depth or pre-computing

  Non-array nested elements are preserved (JS only flattens nested arrays). This is the first half of the `.flat` / `.flatMap` Tier C row; the value-returning `.flatMap` stays deferred (the JSX-returning `.flatMap` already lowers as an `IRLoop`).

  - Parser: new `array-method` variant `flat` carrying a structured `FlatDepth` (`number | 'infinity'`); `flat` is removed from `UNSUPPORTED_METHODS`.
  - Emitter: new `flatMethod()` arm on `ParsedExprEmitter` — adding it makes every adapter implementor a TS compile error until handled (the same drift defence sort / reduce use).
  - Go: new `bf_flat` runtime helper (reflect-based recursive flatten; `-1` is the `Infinity` sentinel).
  - Mojo: new `bf->flat` helper (recursive ARRAY-ref flatten; same `-1` sentinel).

  Conformance fixtures (`array-flat`, `array-flat-depth`, `array-flat-infinity`) pin byte-equal output across Hono/CSR, Go, and Mojo.

- 8daf057: Lower value-returning `Array.prototype.flatMap(fn)` field projection to the template-language adapters (#1448 Tier C).

  The field-projection form of `.flatMap` now compiles on both template adapters instead of refusing with BF101. The callback is validated and extracted into a structured `FlatMapOp` at parse time (mirroring `.reduce` / `.sort`):

  - `arr.flatMap(i => i)` — self projection (equivalent to `.flat(1)`)
  - `arr.flatMap(i => i.field)` — flatten a per-item array field (the dominant real-world case, e.g. `items.flatMap(i => i.tags)`)
  - single-`return` block bodies unwrap to the returned expression

  The projected per-item value is flattened one level (`flatMap` = map + `flat(1)`); a non-array projection is kept as-is, matching JS. This composes as a loop base too — `items.flatMap(i => i.tags).map(t => <li>{t}</li>)` now lowers to a loop over the flattened array instead of refusing.

  Out-of-catalogue callbacks — array-literal / transform projections (`i => [i.a, i.b]`), deep field access (`i => i.a.b`), and the index/array callback params — stay refused with BF101 and keep `/* @client */` as the escape hatch. The JSX-returning `.flatMap` continues to lower as an `IRLoop` upstream (unchanged).

  - Parser: new `array-method` variant `flatMap` carrying a structured `FlatMapOp`; `flatMap` stays in `UNSUPPORTED_METHODS` so the degenerate / out-of-catalogue forms still refuse loudly.
  - Emitter: new `flatMapMethod()` arm on `ParsedExprEmitter` (drift defence, same as sort / reduce / flat).
  - Go: new `bf_flat_map` runtime helper (reflect-based projection + one-level flatten, reusing `getFieldValue` and `Flat`).
  - Mojo: new `bf->flat_map` helper (HASH-ref field projection + `flat(1)`).

  Conformance fixtures (`array-flatmap-field`, `array-flatmap-self`) pin byte-equal output across Hono/CSR, Go, and Mojo.

- 0a05dfc: Lower the array-literal (tuple) form of value-returning `Array.prototype.flatMap(fn)` to the template-language adapters (#1448 Tier C).

  Building on the field-projection form (#1734), the array-literal projection now compiles:

  - `arr.flatMap(i => [i.a, i.b])` — gather per-item fields into a flat list
  - `arr.flatMap(i => [i, i.tags])` — mixed self / field leaves

  Every array-literal element must be a `self` (`i`) or `field` (`i.field`) leaf. flatMap's one-level flatten removes only the array-literal wrapper, so each leaf is appended verbatim — an array-valued leaf is kept as a single element (not spread), matching JS `map(...).flat(1)`. A non-object element under a field leaf yields `undefined` / `nil`.

  Richer callbacks — elements with arithmetic / computed or deep access / calls / literals, the spread (`[...xs]`) form, and the 2-arg `flatMap(fn, thisArg)` form — stay refused with BF101 and keep `/* @client */` as the escape hatch.

  - Parser: `FlatMapOp.projection` gains a `tuple` variant (a list of `FlatMapLeaf`s); `extractFlatMapOpFromTS` classifies each array-literal element.
  - Go: new `bf_flat_map_tuple` runtime helper (variadic `(kind, name)` leaf specs).
  - Mojo: new `bf->flat_map_tuple` helper (one `[kind, key]` arrayref per leaf).

  Conformance fixture `array-flatmap-tuple` pins byte-equal output across Hono/CSR, Go, and Mojo. This completes the `.flat` / `.flatMap` Tier C row.

- 3529d0f: Give `.forEach()` a dedicated unsupported-method diagnostic and tighten the generic BF101 wording (#1448 Tier C).

  `.forEach()` returns `undefined`, so it is never a template-position lowering target — its only meaningful use is side effects inside event handlers / `createEffect` callbacks (client JS, which never reaches the adapter). The template-language adapters already refuse it in template position via the parser's `UNSUPPORTED_METHODS` gate (surfaced as BF101); this swaps the generic hint for a `forEach`-specific reason that explains the `undefined` return and points to `.map(...)` / `createEffect` instead.

  The generic BF101 reason for other unlowerable methods is also reworded to lead with the SSR-preserving fix and frame `/* @client */` as an escape hatch with its cost made explicit: `'<method>()' can't render on the server. Pre-compute the value, or add /* @client */ for client-only (no SSR).` These reasons are flagged `selfContained` on the `SupportResult`, so the Go-template adapter shows them as-is instead of appending its own "Options" block — which would have duplicated the remedies and, for `forEach`, contradicted the tailored message. Low-level reasons (operators, comparators, complex predicates) stay un-flagged, so the adapter still attaches its remediation options and users never lose actionable next steps.

  No behaviour change for the client-callback path: `.forEach()` inside event handlers / `createEffect` continues to pass straight through to the emitted runtime. A regression test pins both halves of the contract.

- 9420ef8: Lower `Array.prototype.reduceRight(fn, init)` to the template-language adapters (#1448 Tier C follow-up).

  `.reduceRight` reuses the `.reduce` arithmetic-fold catalogue (#1728) — same `ReduceOp` shapes (numeric sum / product over self or a field, string concatenation, single-`return` block bodies, literal init) — and threads a fold **direction** through to the runtime. The direction is only observable for string concatenation: a left-to-right concat of `[a, b, c]` is `abc`, while right-to-left is `cba`. Numeric sum / product are commutative, so the direction doesn't change them.

  - Parser: the existing reduce interception now also accepts `reduceRight`, preserving the method name on the `array-method` variant. Off-catalogue / no-init forms still refuse with BF101.
  - Emitter: `reduceMethod()` now receives the method name (mirroring `sortMethod()`), so adapters pick the direction.
  - Go: `bf_reduce` gains a trailing `"<direction>"` operand and folds right-to-left when it's `"right"`.
  - Mojo: `bf->reduce` takes a `direction => 'left' | 'right'` option and reverses the snapshot for `'right'`.

  Cross-adapter byte-equality (Hono/CSR, Go, Mojo) verified by a new `reduce-right-concat` conformance fixture (the concat case is the direction discriminator).

- b4a8df8: Lower `Array.prototype.reduce(fn, init)` arithmetic-fold catalogue to the template-language adapters (#1448 Tier C).

  The shapes that recur across the demo components (`playlist.reduce((s, t) => s + t.duration, 0)`, view-count / visitor sums, …) now compile on both template adapters. The accepted catalogue mirrors the `.sort` precedent (a finite, structured form rather than an arbitrary reducer body):

  - `arr.reduce((acc, x) => acc + x, 0)` — numeric sum over self
  - `arr.reduce((acc, x) => acc + x.field, 0)` — numeric sum over a struct field
  - `arr.reduce((acc, x) => acc * x.field, 1)` — numeric product
  - `arr.reduce((acc, x) => acc + x.field, '')` — string concatenation (string init flips `+` to concat)
  - single-`return` block bodies are unwrapped to the returned expression

  The accumulator must be the binary expression's left operand (`acc + x`, not `x + acc`), the per-item operand must be the item param or a single non-computed field access on it, and the init must be a number or string literal. Anything else (subtraction / division, deep field access, object-building reducers, 3- / 4-param forms, `.reduce(fn)` without an initial value) refuses with BF101 and keeps `/* @client */` as the escape hatch. `.reduceRight` stays refused entirely.

  - Parser: new `array-method` variant `reduce` with a structured `ReduceOp` (op / key / type / init) extracted at parse time; `reduce` stays in `UNSUPPORTED_METHODS` so the no-init fall-through still refuses loudly.
  - Emitter: new `reduceMethod()` arm on `ParsedExprEmitter` — adding it makes every adapter implementor a TS compile error until they handle it (the same drift defence sort uses).
  - Go: new `bf_reduce` runtime helper folding to float64 for numeric / Go string for concat.
  - Mojo: new `bf->reduce` helper folding via Perl numeric / string operators.

  Two narrow divergences from the JS / CSR path, both mirroring the `bf_sort` "auto" caveat: float stringification differs for inexact binary fractions (e.g. `0.1 + 0.2`), and numeric-_string_ keys fold numerically on the template adapters while JS `+` string-concatenates them. Genuine numbers — the common SSR case — agree across all three adapters.

  - @barefootjs/shared@0.6.1

## 0.6.0

### Patch Changes

- 35e5f73: Lower the Array / String methods at their full JS arity, instead of only a single fixed argument count (#1448).

  Previously each `array-method` lowering (`join`, `includes`, `at`, `concat`, `slice`, `reverse`, `toReversed`, `toLowerCase`, `toUpperCase`, `trim`, …) accepted exactly one argument shape; any other arity slipped past the parser and fell through to a generic emit that built with no diagnostic and only crashed at SSR render time. Now:

  - **Zero-arg defaults are supported**: `arr.join()` uses the default `,` separator, `arr.slice()` returns a full copy, `arr.at()` is `arr.at(0)`, and `arr.concat()` is a shallow copy — matching JS, no more refusal/crash.
  - **JS-ignored trailing arguments are accepted**: `str.trim(1)`, `arr.at(i, extra)`, `arr.slice(s, e, extra)`, `arr.reverse(extra)`, etc. lower the same as their base form (JS ignores the extras too).
  - **Genuinely-meaningful extra arguments that aren't lowered yet still refuse with BF101** — the `fromIndex` of `.includes` / `.indexOf` / `.lastIndexOf` and the variadic `.concat(a, b, …)` — because silently dropping them would make the SSR output _differ_ from the client (worse than a build error). The diagnostic names the specific unsupported form and does **not** push `/* @client */` (the wrong remedy for an arity issue, and it can't be applied in attribute/condition position anyway).

- b24a1e6: Fix dropped component props in CSR render. A parent passing a non-statically-inlinable value (e.g. `Array.from(...)` or an init-scope local) as a prop to a child component emitted `renderChild('Child', {})` — silently dropping the prop — so the child's template read it eagerly and threw (`Cannot read properties of undefined`). Such children now defer to a placeholder + `upsertChild` (`createComponent` with the complete getter props), mirroring the existing clientOnly-conditional / loop-placeholder paths. SSR adapters are unaffected.
- 9f6b711: Lower `String.prototype.padStart(target, pad?)` / `padEnd(target, pad?)` to the template-language adapters (#1448 Tier B).

  `value.padStart(5, '0')` / `value.padEnd(5, '.')` now compile to both template adapters, padding to the target width with the pad string (default a single space) repeated and truncated to fill. This completes the String Tier B set from #1448.

  - Parser: two new `array-method` variants `padStart` / `padEnd`, dropped from `UNSUPPORTED_METHODS`. Full JS arity: the no-argument form is `padStart(0)` → the receiver unchanged (JS coerces the missing target to 0), and a third+ argument is ignored. The adapter reads only target + padString.
  - Go: new `bf_pad_start` / `bf_pad_end` runtime helpers (shared `padTo`, rune-counted).
  - Mojo: new `bf->pad_start` / `bf->pad_end` helpers (shared `_pad`, character-counted).

  Length is measured in code points (Go runes / Perl chars) so the two adapters stay byte-equal; this differs from JS's UTF-16-unit `.length` only for astral-plane receivers, which are vanishingly rare in numeric / space padding. The target is truncated toward zero, and a receiver already at least `target` long (or an empty pad) is returned unchanged — all matching JS.

- bfac066: Lower `String.prototype.repeat(n)` to the template-language adapters (#1448 Tier B).

  `value.repeat(3)` now compiles to both template adapters (the receiver concatenated `n` times).

  - Parser: new `array-method` variant `repeat`, dropped from `UNSUPPORTED_METHODS`. Full JS arity: the no-argument form is `repeat(0)` → `""` (JS coerces the missing count to 0, not a `RangeError`), and a second+ argument is ignored.
  - Go: new `bf_repeat` runtime helper (`strings.Repeat`).
  - Mojo: new `bf->repeat` helper (Perl's `x` operator).

  JS throws `RangeError` for a negative count; both adapters instead clamp a count `<= 0` to the empty string so SSR templates degrade rather than crash the render, and truncate a fractional count toward zero (matching JS's `ToIntegerOrInfinity`). Go and Perl stay byte-equal.

- f6ab725: Lower the string-pattern form of `String.prototype.replace(pattern, replacement)` to the template-language adapters (#1448 Tier B).

  `value.replace('o', '0')` now compiles to both template adapters, replacing the **first** occurrence (JS string-pattern semantics — not `.replaceAll`).

  Full JS arity: a third+ argument is ignored (the adapter reads only the pattern + replacement). The one- and zero-argument forms are refused — JS coerces the missing replacement (and pattern) to the literal string `"undefined"`, a degenerate result (mirrors the `.includes()` / `.startsWith()` zero-arg refusal).

  - Parser: new `array-method` variant `replace`, dropped from `UNSUPPORTED_METHODS`. **Regex-pattern** `.replace(/…/, …)` stays refused with BF101 (the Perl `s///` vs Go `regexp.ReplaceAllString` flavour gap is the open design question), and `.replaceAll` stays refused entirely.
  - Go: new `bf_replace` runtime helper (`strings.Replace` with n=1).
  - Mojo: new `bf->replace` helper that splices via `index`/`substr` (not `s///`) so both the pattern and the replacement are literal.

  Known divergence (documented in `bf.go`, `BarefootJS.pm`): the replacement string is treated **literally** on both template adapters — special replacement patterns (`$&`, `$1`, …) are not interpreted. Go and Perl agree (byte-equal SSR output); this differs from the Hono/CSR JS path only for replacement strings containing `$`-patterns, which are rare in template position.

- a2c1810: Lower `String.prototype.split(sep)` to the template-language adapters (#1448 Tier B).

  `value.split(',')` now compiles to both template adapters instead of refusing with BF101. It's the first string method whose result is an _array_, so it composes with the existing array-method surface — `value.split(',').join('|')`, `value.split(',').map(...)`, `value.split(',').length`.

  - Parser: new `array-method` variant `split`; `split` drops out of `UNSUPPORTED_METHODS`.
  - Go: new `bf_split` runtime helper (wraps `strings.Split`, normalised to `[]any`).
  - Mojo: new `bf->split` helper that quotemetas the separator (literal-string match, not regex) and passes Perl's `split` a `-1` limit so trailing empty fields survive — keeping output byte-equal with Go and JS.

  Full JS arity: `.split()` (no separator) returns the whole string as a single element, `.split(sep)` splits on the literal separator, and `.split(sep, limit)` caps the number of pieces (matching JS — `limit` 0 → empty, negative / `>=` length → all); a third+ argument is ignored. The regex-separator form stays refused (a regex-literal argument parses as `unsupported` and propagates to BF101 — the per-adapter regex-flavour decision is tracked for `.replace`). Verified byte-equal across Hono/CSR, Go, and Mojo.

- 9cf0a27: Lower `String.prototype.startsWith(prefix)` / `endsWith(suffix)` to the template-language adapters (#1448 Tier B).

  `value.startsWith('a')` / `value.endsWith('z')` now compile to both template adapters instead of refusing with BF101. Both return a boolean, so they slot naturally into condition position (`value.startsWith(p) ? … : …`).

  Full JS arity: the optional `position` (`startsWith`) / `endPosition` (`endsWith`) second argument re-anchors the test, clamped to `[0, length]` so it never crashes — `"hello world".startsWith("world", 6)` and `"hello world".endsWith("hello", 5)` both lower. A third+ argument is ignored. The zero-arg form (`.startsWith()`) is refused: JS coerces the missing search to the literal string `"undefined"`, a degenerate result (mirrors the `.includes()` zero-arg refusal). Verified byte-equal across Hono/CSR, Go, and Mojo.

  - Parser: two new `array-method` variants `startsWith` / `endsWith`, dropped from `UNSUPPORTED_METHODS`.
  - Go: new `bf_starts_with` / `bf_ends_with` runtime helpers (`strings.HasPrefix` / `strings.HasSuffix`, with the optional clamped position).
  - Mojo: new `bf->starts_with` / `bf->ends_with` helpers doing a `substr`-anchored literal comparison (no regex metachar surprises), with the optional clamped position and empty-prefix/suffix + undef-receiver handling matching JS and Go.
  - @barefootjs/shared@0.6.0

## 0.5.3

### Patch Changes

- b7ffce1: Implement `dangerouslySetInnerHTML={{ __html }}` on the client. Previously the client codegen treated it as a generic reactive attribute, emitting a bogus `dangerouslySetInnerHTML="[object Object]"` and never setting `innerHTML`, so a `"use client"` component rendered nothing on the client (a silent SSR/CSR mismatch). The client now mirrors the SSR adapters: the `{ __html }` object is suppressed as an attribute, its value is emitted as the element's raw (unescaped) content in the template, and a reactive value also drives an `innerHTML` assignment in init. This is the intentional raw-HTML escape hatch — values are NOT escaped, by design.
- 2c1f3ad: Client-render templates now HTML-escape interpolated attribute values (via a new `escapeAttr` runtime helper) to match the SSR adapters' attribute escaping (`& " ' < >`). Previously a dynamic attribute value containing `"`, `<`, `>`, or `&` — e.g. UnoCSS arbitrary variants like `[class*="size-"]` or `has-[>svg]` — was concatenated raw into the client template string, which corrupts attribute parsing when the template is inserted via `innerHTML` and diverges from the server-rendered bytes. Escaping at interpolation time is the only correct layer (a post-assembly pass can't tell a delimiter `"` from a value `"`).
- 5231cc8: Client-render templates now HTML-escape interpolated **text content** (the `<!--bf:sN-->${expr}<!--/-->` slots) via a new `escapeText` runtime helper — the parallel of the #1692 attribute-value fix. A string child containing `<` / `&` (e.g. `{user.name}`) was previously concatenated raw into the template string, which diverges from the SSR-escaped bytes and is a markup-injection vector when the template is inserted via `innerHTML`. Only the text-marker slots are escaped; bare `${children}` passthrough and `renderChild(...)` output are pre-rendered HTML and are left untouched. Hono escapes text with the same set as attribute values (`& " ' < >`), so `escapeText` delegates to the same operation for byte-parity with the conformance layer.
- 0f0d880: Fix a loop wrapped in a transparent fragment losing its parent container's preceding siblings when computing the `children[idx]` hydration offset (#1699, follow-up to #1688/#1693). A fragment (`<>…</>`) renders no DOM element wrapper, so a `.map()` inside it is a direct sibling of the fragment's siblings in the nearest ancestor element — but `computeLoopSiblingOffsets` treated the fragment as its own container boundary and reset the preceding-sibling run, so elements before the fragment were dropped from the offset and the mapped items resolved against the wrong `children[idx]` (their nested child components stayed inert after hydration). The offset pre-pass now flattens transparent containers (fragment / provider / async) into the enclosing run, so `<Box><hr/><hr/><>{xs.map(...)}</></Box>` correctly offsets the items past both `<hr/>`s while fragment-internal siblings keep counting too.
- 72fdbe2: `bf build` no longer mangles string-literal contents when inlining a local module into a client component's chunk. The combine and specifier-normalisation passes are now AST-aware, so `import …` lines and `@barefootjs/client` text that merely appear _inside a string value_ (e.g. an inlined data module exporting a code snippet) are left untouched. This fixes a hydration break (`ReferenceError: hydrate is not defined`, where the component's real runtime import was relocated into the literal) and a string-corruption bug (`@barefootjs/client` rewritten to `./barefoot.js` inside snippet text).
- d32c45d: Fix mapped items in the second and later `static + .map()` groups staying inert after hydration inside a self-portaling container (#1693, follow-up to #1688). The `children[idx]` offset for a loop's nested child components only counted statically-sized preceding siblings, so siblings whose rendered element count is only known at runtime shifted the items and left them resolving against the wrong element (unhydrated):

  - a preceding `.map()` contributes `array.length` children — the original report's two-group shadcn `Select`;
  - a preceding `{cond && <el/>}` / `{cond ? <el/> : null}` conditional contributes 0 elements when its branch is absent (it renders only comment anchors), but was over-counted as a static `1`.

  The offset is now computed from the actual element count of each preceding sibling — a folded integer for statically-sized nodes, plus a runtime term (`(arr).length`, `(cond ? 1 : 0)`) for dynamic ones. Non-element siblings (bare text / expressions) correctly contribute 0 since `container.children` is element-only.

- Updated dependencies [d87144d]
  - @barefootjs/shared@0.5.3

## 0.5.2

### Patch Changes

- ad11fb8: Fix a nested child component being dropped during hydration when a static sibling element precedes a `.map()` inside a component (or fragment / provider / async) container (#1688). `computeLoopSiblingOffsets` only counted preceding DOM siblings under element parents, so a loop nested directly inside such a container got a silently-zero `siblingOffset`. The generated `container.children[__idx]` lookup for each item's nested child was then off by one, resolving the first item's child against the static sibling and dropping it. Sibling counting now runs for every container whose children render as a contiguous run of DOM siblings.
- 562d343: Bake typed and scalar signal array-literal initial values into the generated `NewXxxProps` SSR data context, so Go server-renders the initial loop items instead of an empty list (#1672). Untyped object arrays and non-literal initialisers continue to default to `nil`.

  `TypeDefinition` now carries structured `properties` (`PropertyInfo[]`) for object/interface types, so adapters can consume a type's field set without re-parsing its source text. The go-template adapter uses this to derive struct fields and bake object literals against the real field set.

- dff7704: Raise BF101 at build time for unsupported `String.prototype` methods on the template-language adapters (#1448 follow-up).

  Methods that have no SSR lowering — `split`, `startsWith`, `endsWith`, `replace`, `replaceAll`, `repeat`, `padStart`, `padEnd`, `charAt`, `charCodeAt`, `codePointAt`, `normalize`, `substring`, `substr`, `match`, `matchAll`, `search` — were previously absent from the `UNSUPPORTED_METHODS` gate, so `isSupported` reported them supported and the Go / Mojolicious adapters emitted an invalid raw method call (`{{.Name.StartsWith "a"}}` / `$name->{startsWith}('a')`) that produced no build diagnostic and only crashed at template-render time.

  They now surface BF101 with an actionable `/* @client */` suggestion (parity with the unsupported array methods), and the adapter degrades to a safe empty slot instead of emitting template that fails at render. The Mojo adapter routes these through the AST path so the shared `isSupported` gate fires rather than the regex pipeline mangling them. The `/* @client */` escape hatch continues to work for any of these expressions.

  - @barefootjs/shared@0.5.2

## 0.5.1

### Patch Changes

- 8742059: Fix two follow-up issues from the #1663 dynamic-dispatch work.

  `__bfText` could render both a stale element and fresh text in a conditional slot: that path re-resolves the anchor via `$t()` each run, which inserts a new text node before an element left by a previous Node-valued run. Writing a primitive now clears any remaining siblings up to the end marker, so switching JSX → text leaves only the text.

  The no-arg props default (`= {}`) is now asserted to the param's annotated type (`= {} as T`) in both the test and Hono adapters. `hasRequiredProps` treats a prop with a destructuring default as non-required, but the declared props type may still mark that field required, so a bare `= {}` failed `tsc` ("Property 'x' is missing in type '{}'..."). The destructuring defaults still supply the values at runtime.

- 9dcffdf: Compile JSX used as an object-literal arrow value and render dynamic dispatch (#1663).

  A `Record<K, () => JSX>` lookup map (`{ piconic: () => <BrandLogo/> }`) was never lowered: a module-level map had its const dropped from the emitted module (`ReferenceError` at SSR), and a function-local map leaked raw `<...>` into the client bundle (`SyntaxError: Unexpected token '<'`). The preprocessor now hoists arrow values in object-literal property assignments into synthesized components, the same lowering already applied to arrows in JSX-attribute position, so the lookup map survives as component references.

  Dynamic dispatch of such a map in child position (`<div>{themeLogo(props.id)}</div>`) now renders on the client: the dynamic-text effect routes through a new `__bfText` runtime helper that splices the live component element into the slot by identity instead of stringifying it to `"[object HTMLElement]"`. Adapters and `createComponent` default missing props to `{}` so a bare no-arg shim call (`LOGOS[id]()`) no longer crashes destructuring `undefined`.

- 5d49015: Per-item attribute reading an outer signal by index now becomes reactive inside `.map()` (#1673).

  A per-item attribute/style expression inside a keyed `.map()` only got a `createEffect` when it read the loop item accessor (`it.w`) or a directly-named signal/memo/prop. If it instead read the source array signal through a helper indexed by position — e.g. `style={`width:${widthAt(i)}%`}` where `const widthAt = (i) => items()[i].w` — the compiler emitted no reactive effect and the value froze at its server-rendered value after hydration. The identical binding on a top-level element updated correctly.

  `collectLoopChildReactiveAttrs` now applies the same Solid-style wrap-by-default AST-flag fallback (`callsReactiveGetters` / `hasFunctionCalls`) that the top-level attribute path (`decideWrapForAttr`, #940) already used. An opaque function call inside a per-item attribute is wrapped in a per-item `createEffect`, so it tracks whatever signals it reads at runtime and reflects current state after hydration — matching the equivalent top-level binding. The emitted effect resolves the loop index reference to the renderItem index variable, so the closure stays valid.

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

- 5cf7272: Emit `barefoot-importmap.html` for template-string adapters (#1644).

  Follow-up to #1639/#1641. The externals system writes `barefoot-externals.json`
  for every adapter, but the Go html/template and Mojolicious adapters had no
  equivalent of Hono's `BfImportMap` component, so a project configuring
  `externals` there had nowhere to inject the importmap + preloads.

  - `bf build` now emits a ready-to-include `barefoot-importmap.html` snippet
    (generated from the same manifest) alongside `barefoot-externals.json` for
    template-string adapters. Include it via `{{ template "barefoot-importmap.html" . }}`
    (Go) or `%= include 'barefoot-importmap'` (Mojolicious).
  - Add `TemplateAdapter.importMapInjection` (`'component' | 'html-snippet'`) so an
    adapter declares how it exposes the importmap. Hono is `'component'` (no
    snippet emitted); Go/Mojo are `'html-snippet'`.
  - New `renderImportMapHtml` + `ExternalsManifest` exports from `@barefootjs/jsx`
    (and a zero-dependency `@barefootjs/jsx/import-map` subpath) are the single
    source of truth for the snippet HTML. Hono's `BfImportMap` now delegates to it
    so the component and snippet paths cannot drift — the snippet inherits Hono's
    `crossorigin` modulepreload fix (#1648) and the `<`-escaped importmap JSON.
  - New cross-adapter `assertImportMapInjectionContract` in `@barefootjs/adapter-tests`
    fails if a new adapter ships without an importmap injection point, and now also
    asserts parity: the external must resolve _through_ the importmap and every
    `modulepreload` hint must carry `crossorigin`.

- cbed3cc: Fix duplicate `__compEl` declaration when a nested `.map()` returns multiple child components (#1664).

  An outer `.map()` whose callback returns a wrapping element containing a nested `.map()` that emits more than one child component compiled all of them into a single shared inner `forEach` body. The emitter declared `const __compEl` once per component in that scope, producing a duplicate `const` declaration that threw `SyntaxError: Identifier '__compEl' has already been declared` at hydration. Each binding is now uniquely suffixed (`__compEl0`, `__compEl1`, …) when multiple components share the inner-loop scope; the single-component case keeps the plain `__compEl` name.

- 909b17a: Make `tokenContainsIdent` regex-literal aware (#1370).

  `scanForIdentifiers` (behind `tokenContainsIdent`) was the last hand-rolled
  char-by-char string-state machine outside the shared `ts.createScanner`
  lexer. It tracked quotes, template literals, and comments by hand but was
  blind to regex literals, so a lone quote inside a regex (`/it's/`) flipped it
  into string state and swallowed real identifier references, and an identifier
  inside a regex body (`/className/`) was wrongly counted as a reference.

  It now delegates to the shared `iterateJsTokens` lexer, which recognises
  regex literals, nested template literals, and comments in one place. Prop
  dependency detection on synthesised expression strings is now correct for
  expressions containing regex literals. No change to adapter output for
  existing fixtures.

- d13dc5c: Widen `.sort()` / `.toSorted()` comparator lowering with multi-key, relational-ternary, and block-body shapes (#1448 Tier B follow-up).

  The comparator parser now builds a structured `SortComparator` as a `keys: SortKey[]` list and accepts three previously-refused shapes (each lowering to both template-language adapters + the Hono/CSR JS path):

  - **Multi-key (`||`-chain)** — `(a, b) => a.x - b.x || a.y.localeCompare(b.y)` splits into one comparison key per `||` operand, applied in priority order as tie-breaks. Emits one 4-string `bf_sort` group (Go) / one `keys` hash (Mojo) per key.
  - **Relational ternary** — `(a, b) => a.f > b.f ? 1 : -1`, the 3-way `a.f < b.f ? -1 : a.f > b.f ? 1 : 0`, and the leading-tie `a.f === b.f ? 0 : …` forms lower to a new `auto` compare type: numeric when both keys parse as numbers, else lexical. Both template runtimes share this rule so their output stays byte-equal (diverges from JS `<`/`>` only for numeric strings).
  - **Single-`return` block bodies** — `(a, b) => { return a.f - b.f }` (arrow form; the function-expression form already worked) unwrap to the returned comparator.

  Runtime: Go `bf_sort` is now variadic over 4-string key groups with an `auto` branch; Mojo `bf->sort` takes an ordered `keys` list with the same `auto` rule. Function-reference comparators (`sort(myCmp)`), multi-statement block bodies, and `localeCompare(b, locale, opts)` stay refused (BF021) — deferred follow-ups.

- 6326d07: Unify the importmap manifest type across the component and snippet paths.

  Both importmap injection paths now describe `barefoot-externals.json` with one
  type. `@barefootjs/jsx` exports a shared `ImportMapManifest` (the optional-field
  subset the renderer needs); `renderImportMapHtml` takes it, and the strict build
  output `ExternalsManifest` remains its all-required superset.

  **Breaking (`@barefootjs/hono`):** the `BarefootExternalsManifest` type export is
  removed. Type a `BfImportMap` `externals` prop with `ImportMapManifest` from
  `@barefootjs/jsx` instead (the runtime prop shape is unchanged, so importing the
  parsed `barefoot-externals.json` and passing it through still works).

  - @barefootjs/shared@0.5.0

## 0.4.0

### Patch Changes

- 2d817a0: Fix the client `hydrate` template lambda mishandling auto-deferred conditionals that read per-instance `createForm` state (`{field.error() && …}`). The module-scope template can't reproduce `createForm`, so it emitted `undefined.field(...)` (throws) or re-inlined a throwaway `createForm({...})`. It now emits empty `bf-cond-start`/`bf-cond-end` markers like SSR and lets `init`'s `insert()` populate the branch, fixing client-render (`createComponent`) of `@barefootjs/form` components.
  - @barefootjs/shared@0.4.0

## 0.3.0

### Minor Changes

- 0111b70: Add source locations/JSX previews to DOM bindings, `bf debug loops`, `bf debug why-update`, `bf debug summary` commands, and improved `bf debug fallbacks` output
- 210563a: Resolve event handler setters transitively through helper-function call chains. BREAKING: SetterRef.via and WhyUpdateSource.via are now string[] (the call chain) instead of string.

### Patch Changes

- 52a511d: Resolve event handler setters through arrow-function consts (not just function declarations) in setter analysis
- ea37bfc: Auto-defer reactive brand-package bindings (e.g. `@barefootjs/form` field accessors) referenced from template positions instead of raising BF061. `value={field.value()}`, `disabled={form.isSubmitting()}`, and `{field.error() && …}` now compile without a manual `/* @client */` on each binding.
- d64f94b: Add EventHandler wiring to TestNode: onClick, onInput, onChange, onSubmit shorthands and on() fallback
  - @barefootjs/shared@0.3.0

## 0.2.0

### Minor Changes

- 4e4d31a: Add `bf debug events` command for tracing event handler -> setter -> signal -> DOM update paths
- 89a6ad5: Add .entries()/.keys()/.values() iteration shapes (#1448 Tier B)

### Patch Changes

- bac95e6: Extract classifyDOMProp as single source of truth for DOM attribute vs JSX prop classification
- bff7df6: Fix reactive expressions inside conditional branches not updating when dependencies change
- 31ce089: Fix prop name substitution corrupting string literals in client JS (e.g. `"size-9"` → `"(_p.size ?? 'default')-9"`)
- Updated dependencies [2313724]
- Updated dependencies [bac95e6]
  - @barefootjs/shared@0.2.0
  - @barefootjs/client@0.2.0

## 0.1.3

### Patch Changes

- 91523ba: Add .findLast(p) / .findLastIndex(p) higher-order method lowering (#1448 Tier B). Go template adapter lowers via bf_find_last / bf_find_last_index runtime helpers (equality predicates) and range-based template blocks (complex predicates). Mojo adapter refuses with BF101 (matching existing find/findIndex gap).
- a5a466c: Compile props.X.map() to mapArray for reactive DOM reconciliation instead of static forEach (#1586). Direct prop array references in .map() expressions are now treated as potentially reactive, consistent with the compiler's existing "props are always reactive" design.
- a57e113: Unify inner-loop reactive-attribute emit through the centralised emitAttrUpdate helper (#1368). Fixes boolean-attr handling in nested loops (now uses DOM property assignment) and adds missing className/value special-case handling.
  - @barefootjs/client@0.1.3
  - @barefootjs/shared@0.1.3

## 0.1.2

### Patch Changes

- @barefootjs/client@0.1.2
- @barefootjs/shared@0.1.2

## 0.1.1

### Patch Changes

- c896b8b: Fix published packages: resolve workspace:\* and point exports to dist/
- Updated dependencies [c896b8b]
  - @barefootjs/client@0.1.1
  - @barefootjs/shared@0.1.1
