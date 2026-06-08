# Reactive Performance Profiler — Design (`bf debug profile`)

> Tracking issue: [#1690](https://github.com/piconic-ai/barefootjs/issues/1690).
> Parent: #1244 (Performance / scale). Related: #1374 (batching), #1373 (deep-tree).
>
> **Status:** design. v1 substrate is being scaffolded incrementally; the
> static half (SR5 budget, SR6 compile-diff) lands first because it needs no
> run. The dynamic half (SR1–SR4) is specified here and stubbed in code.

## 1. Goal

Help a developer or AI agent **find and fix the reactive performance problems in
their app** — wasted re-runs, redundant subscriber work in one interaction,
expensive fan-out, deep/hot memo chains, list churn. Success is the user's: less
wasted reactive work, and a fix that was easy and safe to apply. Everything in
this document, the IR integration included, is a **means** to that end.

A **good finding**:

1. names the costliest reactive work on a *real scenario* (measured, ranked),
2. says **why** and **where** (source-mapped to the IR),
3. proposes a **concrete fix**, and
4. flags whether the fix is **safe** (statically checkable).

A finding that can't be attributed back to a source location is a *gap to close*,
not a finding.

## 2. Why build it on the IR

The measurement half — counting and timing reactions on a real run — is
well-trodden (React DevTools, MobX `spy`/`trace`, Solid/Vue DevTools). What
BarefootJS adds, because it has a compile phase + IR, is a sharper loop:

| Makes tuning… | …because the IR provides |
|---|---|
| **precise** | exact source attribution from the graph the compiler already built (`buildComponentGraph`, `debug.ts`) |
| **predictive** | batch / fan-out / chain-depth opportunities visible *before* a run (SR5) |
| **safe** | "is this fix safe?" (e.g. post-write derived read) answerable statically (SR4 safety) |
| **regression-proof** | structural reactivity diff between two compiles, no run needed (SR6) |
| **actionable** | source-mapped fixes the compiler can re-verify |

The static half already exists: `analyzer.ts` builds the graph;
`bf debug graph/trace/events/why-update/summary` expose it. The profiler adds the
**dynamic half** (measured runs) and **joins** the two. The IR serves the tuning,
not the reverse — a runtime-only profiler would still help; the IR is what makes
the loop precise, predictive, safe, and actionable.

## 3. Where this sits in the existing toolchain

```
            STATIC (no run)                         DYNAMIC (scenario run)
  ┌───────────────────────────────┐      ┌──────────────────────────────────┐
  │ analyzer.ts → ComponentIR      │      │ instrumented runtime (SR1–SR3)   │
  │ debug.ts:                      │      │   reactive.ts choke points       │
  │   buildComponentGraph          │      │   compiler-emitted turn markers  │
  │   buildComponentAnalysis       │      │     ↓ raw event stream           │
  │   traceUpdatePath              │      └──────────────┬───────────────────┘
  │   buildEventSummary            │                     │
  └───────────────┬───────────────┘                     │
                  │            SR4 IR join (source loc, edges, DOM target)
                  └──────────────────┬──────────────────┘
                                     ▼
                         profiler.ts  →  ProfileReport
                                     ▼
                   bf debug profile  (human table │ --json)
```

`bf debug *` answers **"where to look"** (static). `bf debug profile` answers
**"what actually cost, and what to change"** (dynamic, joined to static). They
compose: a profiler finding cites the same source locations the static commands
already print.

### 3.1 Reusable static building blocks (already shipped)

All in `packages/jsx/src/debug.ts`, re-exported from `packages/jsx/src/index.ts`:

| Function | Returns | Profiler use |
|---|---|---|
| `buildComponentAnalysis(src, file, name)` | `{ graph, ir }` in one pass | base for SR5 budget + SR4 join |
| `buildComponentGraph(...)` | `ComponentGraph` (signals/memos/effects/domBindings with `loc`) | node inventory, source attribution |
| `traceUpdatePath(graph, name)` | `UpdatePath` (transitive `dependents` tree) | fan-out count + memo-chain depth |
| `buildEventSummary(...)` | `EventSummary` (handlers → setters → signals, with `via` chains) | turn → setter attribution; batch advisor |
| `graphToJSON(graph)` | plain object, `loc` simplified to `{file,line}` | `--json` precedent |

`ComponentGraph` node shapes carry the data the profiler needs (see
`debug.ts:35–111`):

- `SignalNode { name, setter, initialValue, consumers: string[], loc }`
- `MemoNode  { name, deps, consumers: string[], computation, loc }`
- `EffectNode { label, deps, body, loc }`
- `DomBinding { label, slotId, deps, type, classification, wrapReason, loc }`

`consumers` entries are tagged strings — `"memo:x"`, `"effect:y"`, `"dom:z"` —
which is exactly what `traceUpdatePath`/`buildUpdateEntry` (`debug.ts:962–1009`)
already walk to produce a transitive dependents tree. Fan-out = breadth of that
tree; chain depth = its maximum memo→memo depth.

## 4. Requirements

### 4.1 Measurement substrate (SR)

#### SR1 — Instrumentation hooks (dev-only)

Counters/timestamps at the reactive choke points in
`packages/client/src/reactive.ts`. The current runtime has **zero**
instrumentation and **no** id/loc on its internal `EffectContext`
(`reactive.ts:26–34`), so SR1 introduces a single dev-only sink the runtime
calls at each choke point.

Choke points (exact sites today):

| Event | Site (`reactive.ts`) | Payload |
|---|---|---|
| `signal:set` | `set`, line 67 — after the `Object.is` bail (line 72), before notify (78–87) | signal id, batched? |
| `subscribe:add` | `get`, lines 60–63 (`subscribers.add(Listener)`) | signal id, subscriber id |
| `subscribe:remove` | `runEffect` 140–143; `disposeSubtree` 182–185 | signal id, subscriber id |
| `effect:enter`/`exit` | `runEffect`, around `effect.fn()` 150–159 (wall time) | subscriber id, triggering signal, turn |
| `effect:create` | `createEffect` 105–124; `createDisposableEffect`; `createMemo` 401 | subscriber id, kind |
| `effect:dispose` | `disposeEffect`/`disposeSubtree` 168–208 | subscriber id |
| `batch:begin`/`flush` | `batch` 343–353; `flushEffects` 355–363 | depth, flushed count |
| `map:reconcile` | `runtime/map-array.ts` reconcile loop | key count, +added/−removed/moved |
| `mount`/`dispose` | `createRoot` 220–244 (per-item scope) | scope id |

**Memos are effects.** `createMemo` (`reactive.ts:401–410`) is a `createEffect`
writing a private `createSignal`. At runtime a memo therefore surfaces as an
*effect enter/exit* plus a *signal set*. SR1 must tag the memo's internal effect
and signal with the memo's identity so SR4 can collapse the pair back into one
`MemoNode`, otherwise every memo double-counts (one effect run + one signal set).

**Identity.** Runtime primitives carry no id today. SR1 adds an optional id
parameter, **emitted by the compiler** at each creation site (SR3-adjacent), so a
runtime event resolves to an IR node deterministically:

```ts
// dev build only — id is a stable compiler-assigned handle, e.g. "Cart#memo:total"
createMemo(fn, /* __bfId */ "Cart#memo:total")
createEffect(fn, /* __bfId */ "Cart#effect:55")
const [v, setV] = createSignal(0, /* __bfId */ "Cart#signal:coupon")
```

The id namespace matches the IR: `"<Component>#<kind>:<name|line>"`. Production
builds pass no id (the param is `undefined`) and the sink is absent (SR8).

#### SR2 — Event attributes

Each emitted event carries: `dur` (ms, effects only), `subscriber` (id), `signal`
(triggering id), `turn` (id), and `kind`. This is the minimum to answer
"hot subscriber" (sum `dur` by subscriber) and "wasted re-run" (effect ran but
produced identical DOM/output — see §4.2.2).

#### SR3 — Turn boundaries via compiler-emitted markers

A "turn" is one user interaction — one handler invocation and the synchronous
reactive work it triggers. Microtask sniffing is imprecise; instead the compiler,
which **knows every handler site**, emits `beginTurn(handlerId, loc)` /
`endTurn()` around the handler body in a dev build.

- **Measurement-only.** Must NOT change `set()`'s synchronous semantics
  (`reactive.ts:67–88`). `beginTurn`/`endTurn` only stamp a turn id onto events
  emitted between them.
- **Must cover all CSR emit paths** (#1244 risk-A). Handlers are codegen'd at
  several sites today:
  - top-level: `ir-to-client-js/phases/event-handlers.ts:15–33`
  - delegation (loops): `control-flow/stringify/event-delegation.ts`
  - conditional-branch arms: `control-flow/stringify/insert.ts`
  - loop-child arms: `control-flow/stringify/loop-child-arm.ts`
  - shared listener line: `control-flow/stringify/event-listener.ts`
- **Design:** a single `wrapHandlerForTurn(handlerId, loc, handlerExpr) → expr`
  helper, gated by the dev flag, consumed by **every** emit site — mirroring the
  #1244 §A refactor direction (one helper, no per-site omissions). The wrap is the
  existing `wrapHandlerInBlock` (`utils.ts:228`) extended to inject
  `beginTurn(...)`/`try { … } finally { endTurn() }`. A missing site = an
  unattributable turn = an SR4 gap; the conformance test for SR3 asserts every
  handler in a fixture is wrapped.

#### SR4 — IR join

Resolve each runtime event to its IR node — source location, dependency edges,
DOM target — by loading the static graph (`buildComponentAnalysis`) alongside the
run. This is what turns a raw measurement into an explained, fixable finding.

- **Join key:** the compiler-assigned id (SR1/SR3) `→` IR node. The profiler
  builds an id→node index from `buildComponentGraph` output (every node already
  has `loc`).
- **Safety oracle (the "is this fix safe?" half).** Some fixes are statically
  provable-safe; SR4 answers them from the IR without a run. The first oracle the
  batch advisor needs: **post-write derived read** — within a turn, after the last
  `set()`, does any code *read* a memo/signal that the batch would leave stale
  until flush? `buildEventSummary` already resolves a handler's setter calls and
  `via` chains (`debug.ts:414–642`); the oracle walks the handler body for a read
  of any signal/memo downstream of those setters *after* the last write. No such
  read ⇒ wrapping the body in `batch()` is safe.
- **Unattributable events** are surfaced as a coverage gap (SR4 invariant), never
  silently dropped.

#### SR5 — Static reactivity budget (no run required)

From the IR alone, a per-component profile — an extension of
`buildComponentSummary` (`debug.ts:1476`):

- effect/binding count (already in `ComponentSummary`),
- **memo-chain depth** — longest memo→memo dependency path (via `traceUpdatePath`
  over each signal/memo, max memo depth in the `dependents` tree),
- **subscription count** — Σ `consumers.length` over signals,
- **fan-out** — per signal, the transitive dependent count (breadth of
  `traceUpdatePath`), flagging signals whose fan-out exceeds a threshold.

SR5 is the **predictive** layer: it names likely hot spots *before* any run, and
gives `bf debug profile` a useful answer even with no scenario. It is the first
thing implemented (run-free, pure reuse of shipped static analysis).

#### SR6 — Compile-diff regression (no run required)

IR is deterministic from source, so two compiles of the same component compare
structurally. Flag reactivity regressions:

```
+12 effects; signal `count` fan-out 3→9; memo chain deepened 2→4
```

CI-able: `bf debug profile --diff <baseRef>` compiles the component at `baseRef`
and at working tree, diffs the SR5 budgets, exits non-zero past a threshold. No
runtime needed — it's two `buildStaticBudget` calls and a structural delta.

#### SR7 — Session + output

Record a scenario run → report. Human table + `--json`, consistent with the
`bf debug *` family (each command does `JSON.stringify(result, null, 2)`; the
profiler follows suit, see §6). A session is reproducible: same scenario + same
compile ⇒ same ranked findings (timings vary, ranks and structural findings do
not).

#### SR8 — Zero production overhead

Instrumentation is dev-only, gated, and stripped from prod builds:

- The runtime sink (SR1) is behind a build-time flag; the prod bundle contains no
  sink and no id params (dead-code-eliminated).
- `beginTurn`/`endTurn` and `__bfId` args are emitted **only** when the compiler
  runs in profile/dev mode; the default emit path is byte-for-byte unchanged.
- Conformance: a prod-mode compile of every fixture must equal its current output
  (golden test) — the profiler must not perturb the shipping bundle.

### 4.2 Analyses (the tuning insights)

Each analysis consumes the joined stream (SR4) and/or the static budget (SR5) and
emits ranked findings meeting the §1 "good finding" bar.

#### 4.2.1 Hot subscribers (v1)

Most runs / most total time, joined to IR source loc.

- **Input:** SR2 events grouped by `subscriber`.
- **Metric:** `runs`, `totalMs`, `runs/turn`.
- **Finding:** top-N by `totalMs`, each with `loc`, plus a "hot: N runs/turn" note
  when `runs/turn` exceeds a threshold.
- **Fix hint:** if the subscriber reads signals it doesn't gate on, suggest a
  finer signal/memo split (links to 4.2.2).

#### 4.2.2 Wasted re-runs (v1) — *implemented*

Effect re-ran but output/DOM identical ⇒ finer signal/memo split candidate.
`analyzeWastedReReruns` (`packages/jsx/src/profiler.ts`) over the SR2 stream's
`effectOutput` fingerprints, joined to IR loc via the SR4 id index.

- **Input:** SR2 `effectOutput` fingerprint events. The runtime emits one per
  fingerprintable run (`reactive.ts` → `__bfReportOutput`, aggregated and flushed
  at run exit, dev-only/SR8): memos compare the recomputed value via `Object.is`;
  text bindings compare the written string in `__bfText` (DOM identity). A run
  with no fingerprint emits no event and isn't counted. Attribute/class binding
  fingerprints reuse the same `__bfReportOutput` seam and are follow-up work.
- **Metric:** `wasted = runsWithIdenticalOutput / totalRuns`.
- **Finding:** effects with high `wasted`, e.g. `priceLabel: 150/180 produced
  identical DOM`; ranked by removable cost (absolute wasted runs), then ratio.
  `--wasted-pct <n>` sets the flag threshold (default 50%).
- **Fix hint:** name the unrelated signal in the effect's `deps`
  (`EffectNode.deps`) that triggered the no-op run; suggest splitting it out of
  the reactive read or memoizing the sub-expression.

#### 4.2.3 Batch advisor (v1)

BarefootJS chose **explicit** `batch()` (auto-batching is off — `set()` notifies
synchronously, `reactive.ts:78–87`; `batch()` defers via `PendingEffects`,
343–363). So unbatched multi-write turns are a real, common cost here that
auto-batching runtimes don't have (#1374).

- **Input (measured):** per turn, `totalRuns` (effect runs) and
  `distinctSubscribers` (unique effects).
- **Metric:** `savings = totalRuns − distinctSubscribers` (runs collapsed if the
  turn's writes were batched).
- **Gate (static, SR4):** only advise when the **post-write-derived-read** oracle
  proves batching is safe. An advisory that could change behavior is not emitted
  as "safe".
- **Finding:** `onSubmit: batch candidate 20→1, safe (Checkout.tsx:40–48)`.
- **Fix:** wrap the handler body in `batch()`; the compiler can re-verify the wrap
  preserves the no-stale-read property.

#### 4.2.4 Fan-out / chain depth (v2)

Predicted statically (SR5), confirmed at runtime (SR2). Static says "signal
`count` fans out to 9 subscribers, memo chain depth 4"; the run confirms how often
that fan-out actually fired and what it cost. Divergence (high static fan-out,
never exercised) is itself reported, pointing at the coverage caveat.

#### 4.2.5 Coverage (v2)

Exercised handlers/edges vs the full IR set (every handler in `buildEventSummary`,
every edge in the graph). Lists unmeasured candidates so a finding's scope is
honest:

```
⚠ coverage: 2/7 handlers exercised; unmeasured: onApplyCoupon (Cart.tsx:31)
```

#### 4.2.6 Later

List/reconcile churn (SR1 `map:reconcile`), mount/hydration cost, subscription
growth / leak (subscribe add−remove imbalance over a churn scenario).

### 4.3 Cross-cutting

- **CLI / JSON-first.** Suggestions are source-mapped and AI-actionable.
- **Scenario driving.** E2E harness / scripted / tests drive the instrumented
  build; the coverage caveat is always printed (§4.2.5).
- **Threshold config.** Flags (`--hot-ms`, `--wasted-pct`, `--fanout`) keep noise
  low; defaults are conservative.
- **Composition.** Static = "where to look"; profiler = "what cost, what to
  change". Findings cite the same `loc`s as `bf debug graph/why-update`.

## 5. Scope / phasing

| Phase | Substrate | Analyses |
|---|---|---|
| **v1** | SR1–SR5, SR7, SR8 | Hot subscribers · Wasted re-runs · Batch advisor |
| **v2** | SR6 (compile-diff) | Fan-out/chain · Coverage |
| **later** | — | Churn · Mount/hydration · Leak · optional profiler→compiler auto-fixes |

**Implementation order (front-loads the run-free value):**

1. **SR5 static budget** + `bf debug profile` (no `--scenario`) — pure reuse of
   shipped static analysis, immediately useful, zero runtime risk. *(scaffolded)*
2. **SR6 compile-diff** — two SR5 budgets + structural delta; CI-able. *(static)*
3. **SR1/SR3 substrate** — runtime sink + compiler turn markers behind the dev
   flag (SR8 golden test first, so prod output can't drift).
4. **SR2/SR4 join** + Hot subscribers / Wasted re-runs / Batch advisor.
5. v2 analyses, then later.

## 6. CLI & output

```
bf debug profile <component>                     # SR5 static budget (no run)
bf debug profile <component> --diff <ref>        # SR6 compile-diff regression
bf debug profile --scenario ./scenarios/x.ts     # full dynamic run (v1 analyses)
  [--json] [--hot-ms <n>] [--wasted-pct <n>] [--fanout <n>] [--top <n>]
```

Dispatch follows the existing `case 'debug'` chain in
`packages/cli/src/index.ts:144–174`; the command module mirrors
`commands/debug-summary.ts` (resolve source → build → human|`--json`).

### 6.1 Human output (dynamic run)

```
$ bf debug profile --scenario ./scenarios/checkout.ts
Subscriber / Handler     Loc               runs  total ms  note
recomputeTotals (effect) Checkout.tsx:71   180   42.0      hot: 60 runs/interaction
priceLabel (effect)      Cart.tsx:55       180   8.0       wasted: 150/180 produced identical DOM
onSubmit (handler)       Checkout.tsx:42   3     —         batch candidate: 20→1, safe

→ fixes:
   • split recomputeTotals so it doesn't re-run on unrelated `coupon` changes (Checkout.tsx:71)
   • wrap onSubmit body in batch() (Checkout.tsx:40–48) — collapses 20→1, safe
⚠ coverage: 2/7 handlers exercised; unmeasured: onApplyCoupon (Cart.tsx:31)
```

### 6.2 Human output (static budget, no run)

```
$ bf debug profile Checkout
Checkout — static reactivity budget
  signals: 6   memos: 4   effects: 9   loops: 1
  subscriptions: 21
  memo-chain depth: 4   (total → withTax → withShipping → grandTotal)
  fan-out (top):
    coupon       → 9 subscribers   ⚠ high
    cartItems    → 5 subscribers
  note: run with --scenario to measure actual cost; static budget is predictive only.
```

### 6.3 JSON schema (`--json`)

Consistent with `graphToJSON` (`loc` simplified to `{file,line}`):

```jsonc
// static budget
{
  "componentName": "Checkout",
  "sourceFile": "…/Checkout.tsx",
  "kind": "static-budget",
  "signals": 6, "memos": 4, "effects": 9, "loops": 1,
  "subscriptions": 21,
  "memoChainDepth": 4,
  "memoChainLongest": ["total","withTax","withShipping","grandTotal"],
  "fanOut": [ { "signal": "coupon", "subscribers": 9, "hot": true, "loc": {"file":"…","line":12} } ]
}
```

```jsonc
// dynamic report
{
  "kind": "profile",
  "scenario": "./scenarios/checkout.ts",
  "subscribers": [ { "id":"Checkout#effect:71", "label":"recomputeTotals", "kind":"effect",
                     "runs":180, "totalMs":42.0, "runsPerTurn":60, "loc":{"file":"…","line":71},
                     "notes":["hot"] } ],
  "findings": [ { "type":"batch-advisor", "handler":"onSubmit", "loc":{"file":"…","line":42},
                  "savings":19, "safe":true, "fix":"wrap body in batch()" } ],
  "coverage": { "handlers": {"exercised":2,"total":7}, "unmeasured":[ {"handler":"onApplyCoupon","loc":{…}} ] }
}
```

## 7. Definition of Done (per phase)

- Requirements agreed (#1690) before implementation. *(this doc)*
- Per phase: the SRs + analyses above, **dev-only**, with `--json`, docs, and
  tests, each finding meeting the §1 "good finding" bar (real cost, ranked,
  explained, safe fix where one exists).
- SR8 golden test guards prod output from the first runtime-touching change.

## 8. Open questions

- **Scenario format.** Reuse the Playwright E2E harness (`site/ui/e2e/`) as the
  default driver, or a lighter scripted `(page)=>…` form? Coverage caveat applies
  either way.
- **Cross-component runs.** v1 profiles one component's scenario; a multi-component
  page run needs an id namespace that's unique across components (the
  `"<Component>#…"` prefix is chosen to allow this later).
- **Wasted-run fingerprint cost.** DOM-mutation counting vs memo-value `Object.is`
  — the latter is free for memos, the former needs a MutationObserver scoped to
  the component root. *Resolved (v1):* memo-value identity ships free; text
  bindings fingerprint synchronously by comparing the written string in
  `__bfText` (no MutationObserver) — both feed `__bfReportOutput`. Attribute/class
  bindings extend the same seam as follow-up; a component-root MutationObserver is
  unnecessary given the synchronous per-write compare.
