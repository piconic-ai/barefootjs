# Slot unification

Status: **implemented (Steps A+B, PRs #2396–#2400; revision history in
git)**. Root-cure design prompted by the #2389/#2393 review. Revision 2
replaced the scan-based `updateSlot` door from revision 1 with a
claim-once model, informed by how SolidJS resolves dynamic positions — and
identified where BarefootJS's own constraints (multi-backend SSR, byte
parity) suggested different choices than Solid's. Deferred follow-up work
is tracked in §8.

## 1. Pre-unification inventory

The mechanisms below are what existed before Steps A+B. Rows #1–#4 and #9
were replaced by the claim-plan model (§4) and no longer exist in the
codebase; rows #5–#8 were kept as-is (§7 non-goals) and remain current.
Reactive content-update mechanisms, by addressing scheme, as they stood at
the time this design was proposed:

| # | Mechanism | Marker / anchor | Value | Update discipline |
|---|-----------|-----------------|-------|-------------------|
| 1 | `$t` + `.textContent` | `<!--bf:sN-->…<!--/-->` pair | text | Text node held from mount, `nodeValue` write |
| 2 | `__bfText` (dynamic text/JSX slot) | same pair | text \| live `Node` | region clear + splice; caller tracks current node |
| 3 | `patchSlotRange` (preamble regions, #2389) | same pair | HTML string | range replace, re-scan per patch |
| 4 | `updateClientMarker` (`@client` exprs) | `<!--bf-client:sN-->` unpaired + zero-width-space Text | text | full rescan on EVERY update |
| 5 | `patchLeaf` (flatMap descriptor leaves) | element identity (mapArray scope map) | HTML string | attrs diffed, children wholesale |
| 6 | `insert()` (conditional swap) | `bf-c` attr or `<!--bf-cond-start/end-->` | HTML string + node side channel | replace on branch change only |
| 7 | `mapArray` / `mapArrayAnchored` | `<!--bf-loop*-->` grammar | keyed list | keyed reconcile, per-item signals |
| 8 | attr effects | `bf="sN"` attr | string/bool | setAttribute/property |
| 9 | `reconcileElements` / `reconcileList` | loop pair + `data-key` | elements | **dead — no compiler emission site** |

Facts that shaped the design:

- Rows #1–#3 share one marker format with three different lookups and
  three ownership rules.
- `insert()` consumes HTML strings only (nodes ride a `__bfSlot` side
  channel) — content flows as compiler-rendered HTML strings everywhere.
  The divergence is addressing grammar and per-kind discipline, not a
  string-world/node-world split.
- The fault: mechanisms accreted one per compiler feature, instead of one
  slot concept with an identity contract.

## 2. Reference point — how SolidJS resolves positions

Solid never reads a marker at update time. Positions are compile-time
`firstChild.nextSibling…` paths, dereferenced **once** when the template
is cloned (CSR) or claimed (hydration); updates write through held
references. Its SSR markers (`<!--#-->`) and hydration keys (`data-hk`
attributes) exist only to align that one-time claim.

Adopting the claim-once shape — resolve once, hold references, never scan
on update — is the core of this proposal. A path is only required to be
valid at the moment of claim, and at mount the row DOM is always in its
pristine template shape on both SSR and CSR, so later variable-length
changes cannot invalidate anything: the claim captures boundary/text
references and paths are never consulted again. BarefootJS already had
this shape in embryo: the hoisted `tAfter(__p[i])` path (#2143), later
generalized by the claim-plan mechanism (§4) that superseded it.

## 3. Where BarefootJS's constraints suggest different choices

These are not claims of superiority — they are places where our
architecture (compile-to-any-backend, SSR/CSR byte parity as an enforced
invariant, string-template rows) points at design adjustments Solid has no
reason to make:

**(a) Claim plans as compile-time data, not render re-execution.** Solid
hydrates by re-running the component and walking the DOM in lockstep. Our
hydrate already adopts without re-render (trust-first-run). If the claim
plan is emitted as data (per-slot child paths), claim need not happen at
hydration at all: **row-level lazy claim** — the first write to any slot
in a row claims the whole row (still pristine at that moment), later
writes hit held refs. A row that never updates never pays. Requires the
row-pristine-until-first-write invariant: claims are batched per row, so
one slot's patch can never shift a sibling slot's un-claimed path.

**(b) Markers become claim-only, then mostly disappear.** With path-based
claiming, markers are structurally required only where paths cannot
address: (i) adjacent text slots (the HTML parser merges adjacent text),
(ii) positions that can be empty (a zero-length region needs a physical
anchor), (iii) conditional/loop range boundaries. Every other slot's
marker can be dropped from SSR output — and unlike Solid we need no
`data-hk`-style per-element keys either, because byte parity guarantees
the shape the paths were compiled against. Benchmarks currently show our
HTML document at 318.6KB vs solid's 235.9KB; marker overhead is a
measurable share of that gap.

**(c) Row-granularity effects.** The compiler statically knows which slots
a row has and what each reads. That permits one effect per row driving a
compiled slot table, instead of one closure per binding — a memory-shape
lever (1k-rows memory currently 1755KB vs solid 1480KB) that a runtime-
composed framework cannot pull.

**(d) The claim plan doubles as a cross-backend contract.** A claim plan
asserts "SSR output has this shape". Conformance can mechanically verify
every adapter's output against the plans — turning the existing byte-
parity invariant into a per-slot, per-backend checked guarantee. This axis
only exists because we have nine SSR backends.

All four were hypotheses; Stage 0 measured them (see §5a). The essence of
(a)+(c) is **pay-per-use**: the reactive graph (per-item signal, per-slot
effect closures, subscription entries, held DOM wrappers) is built only
for rows that are actually written to, instead of being paid up front for
every row at hydration. In a write-heavy app the saving converges toward
the constant-factor gains (one effect per row instead of N; no
subscriptions or wrappers for static slots); on static-heavy SSR pages —
the common case — most of the per-row graph is simply never built.

## 4. Target architecture

- **One slot concept**: a claimed position with an identity contract —
  `'text'` (held Text node, `nodeValue` writes), `'markup'` (held boundary
  refs, range replace), `Node` (identity splice).
- **One claim mechanism**: compile-time child paths, generalizing
  `tAfter`; markers consulted only by the claim, only where (i)–(iii)
  require them; one ownership rule (nested `bf-s` scopes are opaque).
- **Row-level lazy claim** per (a).
- `patchLeaf` stays (element identity + attrs-sync is a different
  contract). `insert`/`mapArray` stay (subtree lifecycle, not content).

## 5a. Stage 0 results (measured 2026-07-26, spike PR #2395)

A fourth SSR-bench app prototyped the claim-once model: marker-stripped
real barefoot SSR output + a hand-written client doing one delegated
listener at hydration and row-level lazy claim on first write. Same
interactivity gate, same fencing; two agent runs plus an independent
re-run, all consistent (CI reproduced the direction independently).

| Metric | solid | barefoot | claim prototype |
|---|---|---|---|
| Hydration (median, n=10) | 20–26ms | 28–32ms | **22–30ms** |
| HTML (raw / gzip) | 235.9 / 18.6KB | 318.6 / 19.5KB | **263.9 / 18.9KB** |
| Post-hydration heap (n=3, stdev ≤4KB) | 2586KB | 2729KB | **1169KB** |

Readings that bind the plan:

- **Memory is the headline** (−57% vs current, ceiling): the per-row
  reactive graph costs ~1.6KB/row up front today; lazy claim defers it to
  first write. The prototype ships no runtime, so the real number lands
  between the columns — but the headroom is real and perfectly
  reproducible.
- **Hydration**: mechanism proven (zero per-row work) but only ~10% at 1k
  rows — navigation/parse dominates. Not the primary justification.
- **(b) corrected**: raw −54.7KB matched the marker census byte-for-byte,
  but gzip saved only 0.6KB — markers compress too well for a transfer
  win. (b)'s value routes through **DOM node count** (4,000 comments +
  2,001 attrs per 1k rows) into memory and parse, not the wire.

### Step A measured results (measured 2026-07-26, A4 cleanup)

Real numbers from the shipped Step A pipeline (A2 runtime + A3 compiler
switch + A4 dead-export removal), not the hand-written Stage 0 prototype
above. `bun run --filter '@barefootjs/client' build`, then
`bun benchmarks/ssr/apps/barefoot/build.ts`, then
`bench-ssr.ts` (hydration/bytes) and the adapted `bench-ssr-memory.ts`
(heap; the Stage 0 spike's fourth `barefoot-claim` column doesn't exist in
this tree — A2/A3 already put the real claim-plan interpreter into
`barefoot` itself), each run twice, all in the foreground.
react/solid/barefoot only.

| Metric | react (run1 / run2) | solid (run1 / run2) | barefoot (run1 / run2) |
|---|---|---|---|
| Server render (median, n=20) | 26.05 / 26.19ms | 0.54 / 0.38ms | 11.83 / 8.82ms |
| Hydration (median, n=10) | 51.45 / 48.40ms | 30.45 / 29.60ms | 39.80 / 38.95ms |
| HTML (raw / gzip) | 220.0 / 14.9KB (both runs) | 235.9 / 18.6KB (both runs) | 318.6 / 19.5KB (both runs) |
| Post-hydration heap (n=3, median, stdev ≤7KB) | 3475.7 / 3476.5KB | 2589.3 / 2578.4KB | 3244.9 / 3244.9KB |

Honest read, against this doc's own pre-A baseline (hydration 28–32ms,
heap 2729KB) quoted in §5a above:

- **These numbers are not directly comparable to the pre-A baseline** —
  that baseline and this measurement ran in different sandbox
  environments (different hardware/Chromium build), and the *absolute*
  hydration and heap numbers moved for react and solid too (react's heap
  is ~3475KB here, and solid's hydration varies 30.45→29.60ms between
  this run's own two trials). The same-environment, same-run
  react/solid/barefoot comparison above is the reliable signal; the
  cross-environment comparison to §5a's baseline is not.
- **No memory win yet, and that is expected.** A3's compiler switch
  replaced the *emission mechanism* (claim plans instead of
  `$t`/`__bfText`/`patchSlotRange`/`updateClientMarker`) but explicitly
  kept the per-row reactive graph — row-level lazy claim (the Stage 0
  prototype's memory story, §5a's −57% ceiling) is deferred past Step A
  (§6 "Row-pristine invariant"; §5's Step A description). Step A's own
  goal was verifiability (SSR bytes unchanged) while swapping the update
  door, not the memory win — so barefoot's heap sitting essentially flat
  across both runs (3244.9KB, stdev <1KB) and above solid's is the
  expected outcome of *this* step, not a regression to chase. Step B
  (marker elision) and a future lazy-claim step are where the Stage 0
  ceiling gets tested against a real implementation.
- **HTML bytes are pinned and unchanged from pre-A**, as designed: Step
  A's only allowed SSR byte change was dropping the dead `bf-client:`
  marker, and 318.6KB raw / 19.5KB gzip — identical across both runs —
  matches §5a's barefoot column exactly.
- **Hydration and server-render times are within normal run-to-run
  jitter** at 1k rows in this sandbox (e.g. solid's own hydration moves
  30.45→29.60ms and barefoot's server render moves 11.83→8.82ms between
  otherwise-identical runs); no claim of improvement or regression over
  the pre-A baseline is supportable from this data — the claim-plan
  switch's proven win (per §5a) is architectural (zero per-row
  reconciliation work once lazy claim lands), not yet visible as a wall-
  clock delta while the per-row effect graph is still built eagerly.

### Step B measured (measured 2026-07-26)

Step B shipped a deliberately NARROW slice of §3(b)'s elision rule, not
the general case, and the SSR-bench numbers below reflect exactly that
scope — reported honestly rather than alongside a benchmark result the
implementation doesn't actually move.

**What shipped**: `client-only-elision.ts` elides the marker pair for
`/* @client */` text expressions ONLY — the one 'text'-kind slot whose
rendered width is deterministically zero at claim time on every request
(SSR can never evaluate client-only JS), which is what makes computing a
real, reusable, hydration-safe compile-time path sound without also
solving the general problem below. Scope, precisely: not inside any loop
or conditional branch, not adjacent to loose text/another slot (case (i)),
and capped at one elided slot per static subtree (the "freeze after
first" rule in that module's docstring). `todo-app`'s `<strong>{/* @client
*/ count}</strong>` is the corpus's one hit; its marker pair
(`<!--bf:s6--><!--/-->`) is gone from both SSR and CSR output, and the
claim plan carries a real `path`/`markerless: true` instead.

**Why the general case (ordinary reactive text in loop rows — the
1k-row bench's actual hot path) is NOT in this PR, deferred loudly**: an
ordinary `{item.name}`-style slot's rendered width is DATA-DEPENDENT
(empty or not, per request), so a later sibling's absolute child-index
path is only valid for the specific width THIS request happened to
produce — not for every request the compiled function ever serves.
Working around that (only elide the FIRST width-uncertain slot per
static subtree, exactly `client-only-elision.ts`'s "freeze" rule, minus
the `clientOnly` restriction) is the identified path forward, but it
requires the elision decision to be made where loop-row 'text'-kind
classification already happens (`collect-elements.ts` /
`ir-to-client-js/control-flow/plan/loop.ts`, deep inside
`generateClientJs`) rather than in a standalone pre-pass run before
`adapter.generate` — `compiler.ts` currently calls `adapter.generate`
BEFORE `generateClientJs`, and reordering those (verified safe for THIS
PR's `client-only-elision.ts`, which needs no ir-to-client-js state) has
not been re-verified against the loop-row planner's own invariants. Real
follow-up work, not a rounding error.

**Bench result — HTML size is UNCHANGED from A4** (318.6KB / 19.5KB,
identical to A4's own numbers above), because `benchmarks/ssr/apps/
barefoot`'s 1,000-row table contains no `/* @client */` expression at all
— every row's dynamic text is ordinary reactive text, exactly the
general case deferred above. This PR's elision is real (see `todo-app`)
but the bench app doesn't exercise it, so the memory/node-count case
`spec/slot-unification.md` §5a argues for remains a projection, not yet
a measurement, pending the general-case follow-up.

| Metric | react | solid | barefoot |
|---|---|---|---|
| Server render (median, n=20) | 20.70ms | 0.68ms | 8.20ms |
| Hydration (median, n=10) | 76.85ms | 54.45ms | 67.65ms |
| Client JS (raw / gzip) | 182.3 / 58.1KB | 17.0 / 6.6KB | 21.8 / 7.9KB |
| HTML (raw / gzip) | 220.0 / 14.9KB | 235.9 / 18.6KB | 318.6 / 19.5KB |

(Single run, not the two-run A4 protocol — since the HTML/bytes numbers
are the load-bearing claim here and they're deterministic build outputs,
not timing-sensitive; hydration/server-render numbers above are
consistent with A4's jitter range and are not this note's point.)

### Row-granularity effects (A3b) — regression confirmed and fixed (measured 2026-07-27)

A3's compiler switch (above) kept per-slot effect emission — one
`createEffect` per reactive attr, per reactive text, and per preamble
region — stacked on top of the NEW per-row claim-plan allocations (a
`lazySlots` writer closure, its plan-literal array, and the `Map` +
per-slot refs the first write allocates). CI's quick-mode DOM benchmark
(`benchmarks/runner/bench-dom.ts`, `benchmarks/apps/barefoot`) caught the
result as a real regression, confirmed on identical sandbox hardware
against the pre-migration merge commit (`011126f8`):

| Metric | pre-migration (011126f8) | post-A3 (regressed) | post-A3b (this fix) |
|---|---|---|---|
| memory (1k rows) | 1756.9KB | 2046.4KB (+16.5%) | ~1767KB (-13.6% vs regressed) |
| update10th | 12.00ms (1.00x vanilla) | 12.6-12.7ms (1.09-1.24x, noisy) | 14.1-16.0ms (1.04-1.17x) |
| shipped JS (raw/gzip) | 23.8 / 8.7KB | 26.0 / 9.3KB | 26.0 / 9.3KB (unchanged — the win is runtime object count, not source bytes) |

Per-row inventory at the regressed commit (`bf build`'s emitted
`renderItem` for the bench table row — one reactive `class` attr, two
reactive texts, no preamble region): 3 separate `createEffect` calls
(unchanged from pre-migration's own 3), PLUS a NEW `lazySlots` call whose
plan literal (2 `SlotSpec` objects + an array) is allocated fresh every
row regardless of whether the row ever updates, and whose first write
(fired synchronously by `createEffect`'s initial run — not deferred in
practice for a freshly-created row) allocates a `Map` + one
`ClaimedTextSlot` ref per text slot. The regression's dominant cost was
this claim-mechanism allocation, not the effect count — §3(c)'s own
"remove N-1 effect objects" framing undersold the fix's actual ceiling,
noted honestly here rather than silently.

**The fix** (§3(c), row-granularity effects, implemented): for the plain
loop-row shape (top-level `mapArray` rows, `stringify/loop.ts`'s
`stringifyPlainLoop`, and the structurally-identical branch-scoped rows in
`stringify/branch-loop.ts`'s `emitPlain`) every reactive attr, outer text,
and preamble region for a row now shares ONE `createEffect` and (for the
texts/regions) ONE `lazySlots` writer over a mixed `'text'`/`'markup'`
claim plan — cutting the bench row's 3 effects to 1. Composite loops,
component loops, the anchored (whole-item-conditional) shape, and static
(`forEach`) loops are untouched (they never carry preamble regions, and
this pass only mechanically verified the plain-row shape). Profile mode
keeps the old per-slot/per-attr emission so `<Component>#binding:<slotId>`
ids still attribute a re-run to its own binding.

**Result**: memory recovered to within ~0.6% of the pre-migration
same-hardware baseline (three consistent measurements: two quick-mode runs
at 1767.3-1769.4KB, one full 3-iteration run at 1767.4KB) — a real,
reproducible ~279KB/13.6% win over the regressed state, though not
strictly BELOW the pre-migration number. The residual ~10KB gap is
mechanically attributable to the claim-mechanism's own allocations (the
writer closure + `Map` + refs the per-row inventory above describes),
which the effect-count consolidation does not touch and which was out of
this pass's explicit scope (design agreed for §3(c) was "one effect per
row", not "rework claim-plan allocation shape") — a candidate for a future
pass (e.g. hoisting the plan literal's static `id`/`kind` fields once per
loop instead of re-allocating them every row), not a shortfall in what
this fix set out to do.

## 5. Migration — what shipped, two steps of stacked semantic PRs

Compatibility with the pre-unification emitted grammar was explicitly NOT
a goal (pre-1.0; fixtures and snapshots regenerated wholesale). What
survived was not compatibility but **verifiability**: Step A kept SSR
bytes unchanged so the new client was validated against known-good SSR
output — the existing byte-parity corpus was the debugging baseline. The
old five-stage coexistence plan (mechanisms folded one at a time) was
retired in favor of this two-step plan.

**Step A — claim infrastructure, wholesale (SSR bytes unchanged).**
Replaced all four content mechanisms (`$t`-effect text slots, `__bfText`,
`patchSlotRange`, `updateClientMarker`) in one series of stacked PRs; old
mechanisms were deleted, not shimmed:

- **A1** (#2396): spec (this document, revision 3).
- **A2 — runtime** (#2397): claim-plan interpreter + claimed-slot
  primitives in `@barefootjs/client/runtime` (claim a row/scope from a
  compile-time plan; held-ref writes for `'text'`/`'markup'`/`Node`;
  row-level lazy claim with the row-pristine invariant; eager-claim escape
  for the streaming/portal paths enumerated in §6). Unit-tested
  standalone; no compiler change yet.
- **A3 — compiler switch** (#2398): emit claim plans (data) for every
  content slot; all four old emission forms and their runtime exports
  removed; snapshots and CSR/fixture goldens regenerated once. `bf-client:`
  markers stopped being emitted (its SSR comment was claim-input only;
  removing it was the one SSR byte change Step A allowed, since nothing
  adopted it). A follow-up fix (§6) removed trust-first-run for 'markup'
  slots.
- **A4 — cleanup** (#2399): removed dead exports (`reconcileElements`,
  `reconcileList`); re-ran the SSR bench and recorded real (non-ceiling)
  numbers in §5a.

**Step B — marker elision** (#2400): dropped markers outside (i)–(iii)
from both SSR and CSR templates through the single doors, for the
narrow slice described in §5a's "Step B measured" section (`/* @client */`
text slots outside any loop/conditional, one elided slot per static
subtree), and landed claim-plan verification (d) alongside it:
conformance mechanically checks every adapter's output against the plans.
Justified by node count/memory (§5a), not transfer size. The general case
(ordinary reactive text in loop rows) was deferred — see §8.

## 6. Constraints and risks

- **Byte parity**: Step A leaves SSR bytes unchanged (except the dead
  `bf-client:` comment); Step B changes them through the single doors
  with a one-shot fixture regeneration.
- **Hydration adoption**: `'text'` keeps create-if-absent. `'markup'` was
  originally specified to keep trust-first-run (claim records, never
  patches on first run) — implemented in A3, then REMOVED as an A3
  follow-up fix: trust-first-run is sound only for the narrow loop-row-reuse
  case it was lifted from (`patchSlotRange`'s preamble-region reuse, where
  the row's SSR content and its mount-time recomputation are both derived
  from the same source data and so cannot disagree), not for the general
  'markup' slot. A slot whose value comes from client-only state the server
  can't see (`createSignal(readFromLocalStorage())`; a client-side region
  swap adopting HTML the server rendered from a different default) can
  genuinely diverge from the DOM on its first write, and trust-first-run
  silently discarded that first real value. `'markup'` now patches
  unconditionally on every write, including the first; only the
  unchanged-value dedup (§5-A3) survives. See `claim-slots.ts`'s module
  docstring.
- **Effect-held references**: emission sites that capture nodes in
  closures are the audit checklist when their mechanism migrates.
- **Shape drift**: path claiming makes SSR/CSR shape agreement a harder
  invariant. It is already an enforced invariant (conformance byte
  parity); (d) strengthens the enforcement rather than adding a new
  assumption.
- **Row-pristine invariant** for lazy claim: claims batch per row; any
  code path that mutates row content before claim (streaming swaps,
  portals) must either claim eagerly or be excluded — enumerated in A2.

## 7. Non-goals

- Rewriting row rendering off HTML-string templates.
- Merging structural reconcilers (`insert`, `mapArray`) into the content
  door.
- Matching SolidJS feature-for-feature; it is a reference point, not a
  target.

## 8. Follow-ups

Work this proposal identified but did not ship, tracked here so it isn't
re-discovered from scratch:

- **Row-granularity effects (§3(c)) — effect-count consolidation DONE;
  lazy effect-graph construction remains.** Plain loop rows (top-level
  `mapArray` and the structurally-identical branch-scoped shape) emit ONE
  `createEffect` per row covering every reactive attr, outer text, and
  preamble region, sharing one mixed-kind `lazySlots` writer for the
  texts/regions. Fixed the A3-introduced CSR memory/update regression
  (§5a's "Row-granularity effects (A3b)" measurement) back to within
  ~0.6% of the pre-migration baseline. Composite loops, component loops,
  the anchored (whole-item-conditional) shape, and static (`forEach`)
  loops were left untouched — out of this pass's mechanically-verified
  scope (they never carry preamble regions, the shape that made the
  three-way merge possible). Profile mode keeps the old per-slot/per-attr
  emission so per-binding profiler ids survive. What did NOT ship is the
  row-level lazy EFFECT-GRAPH construction that §5a's −57% memory ceiling
  assumes: every row's reactive graph (signals, subscriptions, the one
  effect closure) is still built eagerly at hydration regardless of
  whether that row is ever written to. That deferral is now designed and
  spike-measured in §9 (lazy row graph) and is being implemented as its
  own stacked PR series.
- **General-case marker elision (element-path vocabulary beyond `'text'`
  slots).** Step B's `client-only-elision.ts` only elides `/* @client */`
  text slots outside any loop/conditional (§5a "Step B measured" explains
  why: their SSR-rendered width is the one case that's deterministically
  zero on every request). Ordinary reactive text in loop rows — the actual
  1k-row benchmark hot path — stays marker-owned because a later sibling's
  absolute child-index path is only valid for the specific width THIS
  request produced. The identified path forward (freeze-after-first,
  minus the `clientOnly` restriction, decided where loop-row `'text'`-kind
  classification already happens in `collect-elements.ts` /
  `ir-to-client-js/control-flow/plan/loop.ts`) needs the elision decision
  moved inside `generateClientJs` instead of running as a pre-pass before
  `adapter.generate` — re-verifying that reordering against the loop-row
  planner's own invariants is real, unstarted work.
- **Claim-mechanism allocation shape**: §5a's row-granularity measurement
  section notes a residual ~10KB/1k-rows gap between this fix's result and
  the pre-migration baseline, attributable to the `lazySlots` writer
  closure + claim `Map` + per-slot refs every row still allocates (even a
  row that never updates, since `createEffect`'s synchronous initial run
  triggers the first write in practice for a freshly-created row). Not
  addressed here — the design agreed for this pass was effect-count
  consolidation, not a rework of claim-plan allocation — but a real,
  mechanically-identified candidate for a future pass (e.g. hoisting each
  slot's static `id`/`kind` once per loop and only threading a per-row
  `path`, instead of re-allocating full `SlotSpec` objects every row).
- **`getComponentProps`/`getPropsUpdateFn` dead-export removal.** Flagged
  consumer-less in A4's report after `reconcileList` (their only reader)
  was deleted. Removed in the post-migration cleanup that added this
  section, along with the now-dead `propsMap`/`propsUpdateMap` bookkeeping
  those two functions existed to expose (`packages/client/src/runtime/
  component.ts`).

## 9. Lazy row graph — §3(c) completion (designed 2026-07-27, spike-measured)

Status: **shipped for eligible plain loops** (L1–L4; measured results
in §9.5b, remaining limits in §9.5c). Measurement
spike: branch `claude/lazy-effect-spike` (commit 59d1bef7), full report at
`benchmarks/results/lazy-effect-spike.md` on that branch.

### 9.1 The observation that makes rows non-reactive

A plain loop row's update paths are exactly two, and both are already
known without per-row reactivity:

1. **Item-driven changes.** The keyed reconciler (`mapArray`'s diff)
   detects them itself — `!Object.is(oldItem, newItem)` per key. The
   per-item signal + per-row effect exist only to RE-DELIVER that
   knowledge back to the row; the reconciler can call the row's update
   function directly instead.
2. **Outer-signal reads** (`class={selected() === row.id ? … : …}`).
   When an outer signal changes, every row's effect re-runs anyway
   (they all subscribe to it). ONE loop-level effect iterating all
   entries does the same total work with per-entry dedup — without N
   effect objects and N subscription entries.

Event handlers need nothing per row either: delegation to the loop
container already shipped. So for the plain shape, the per-row reactive
graph (createRoot + per-item signal + effect + subscriptions) carries no
information the loop doesn't already have — it can be deleted, not
deferred.

### 9.2 The model

Per eligible loop, the compiler emits a **row plan** (functions + data,
no per-row closures at hydration) consumed by a new runtime entry point
(`mapArrayLazy`, working name):

- **Hydration first run**: partition SSR rows (same marker walk as
  `mapArray`), build plain entries `{ key, startMarker, primaryEl,
  extras, item, refs: null, last: null }`. `key` comes from the
  SSR-rendered `data-key` attribute (read, never written). NO root, NO
  signal, NO effect, NO query, NO claim, NO DOM write per row.
- **Item-driven updates**: on `!Object.is` the reconciler directly calls
  the plan's `applyItem(entry)` — claims the row's slot refs lazily on
  that row's first update (scan inside that one row; cached on
  `entry.refs`; CSR-created rows record refs from known clone paths with
  no scan), then writes each item-driven binding through per-binding
  last-value dedup stored on the entry.
- **Outer-involving bindings** (any binding whose dependency set includes
  a signal from outside the row — including mixed item+outer bindings
  like the selected-class): the compiler emits ONE loop-level
  `createEffect` that reads the outer signals and applies those bindings
  to every entry with the same per-binding dedup. Emitted only when such
  bindings exist. Mixed bindings are also included in `applyItem` (an
  item change can flip them); dedup makes the overlap idempotent.
- **CSR creation / removal / reorder**: template clone + direct writes
  for new rows; disposal is trivial (entries hold no reactive
  resources); the LIS minimal-move reorder is carried over from
  `mapArray` unchanged.

### 9.3 Soundness — two layers, no trust-first-run regression

The A3 follow-up removed trust-first-run for `'markup'` slots because a
first write can carry client-only state the server never saw (§6). The
lazy row graph must not reintroduce that hole. Two distinct consistency
questions get two distinct answers:

1. **Outer-involving bindings** (first run of the loop-level effect):
   **read-compare-write seeding.** The first run computes each entry's
   value and READS the current DOM (`getAttribute` / `nodeValue`) to
   seed the dedup state, writing only where computed ≠ DOM. Sound
   unconditionally — client-only outer state (a `createSignal(
   readFromLocalStorage())` feeding the binding) diverges from SSR and
   gets patched on that first run, exactly like today. Cost: O(rows)
   attribute/text reads at hydration, no writes on the consistent path.
   (The spike used skip-first-run seeding instead; the production choice
   is read-compare-write — same asymptotics, unconditionally sound.)
2. **Item-driven bindings**: their first evaluation is deferred until
   the reconciler sees an item CHANGE — so hydration-time consistency
   between the SSR rows and the first client `items()` read is TRUSTED,
   not verified. That trust is sound only when both derive from the
   same data. This is a **compile-time eligibility gate** (below), not
   a runtime check: when the loop's data source is provably
   hydration-consistent (derived from props / server-serialized values
   — the `bf-p` protocol makes props identical by construction), lazy
   adoption is sound; when it is not provable, the loop falls back to
   the current eager emission. Sound-or-loud: eligibility is a
   mechanical decision with a defined fallback, never a silent
   divergence.

### 9.4 Eligibility v1 (fallback = current eager emission)

A loop is lazy-eligible when ALL hold; otherwise it keeps today's
A3b-consolidated eager emission:

- Plain loop-row shape — the same boundary A3b drew:
  `stringifyPlainLoop` and the branch-scoped `emitPlain`. Composite,
  component, anchored, and static shapes are untouched.
- Single-root rows. (Multi-root rows need `startMarker` bookkeeping the
  spike deliberately dropped; widen later.)
- The loop source passes the hydration-consistency gate (§9.3(2)):
  its dependency chain reaches only props, literals, and derivations
  thereof — no client-only environment reads (storage, `Date`-lowered
  formatting with client timezone, etc.).
- No row-local reactive declarations (a preamble that creates per-row
  signals/memos needs per-row reactivity by definition).
- Keyed with SSR-rendered `data-key` (already emitted by the SSR
  templates for keyed loops; claim-plan conformance can assert it).
- Profile mode (`profileComponentName`) is NOT lazy — it keeps the
  granular eager emission so `#binding:<slotId>` attribution and
  turn-boundary accounting stay truthful, same policy as A3b.

### 9.5 Spike results (2026-07-27, sandbox; independently re-verified)

| Measurement | eager barefoot | lazy prototype | solid |
|---|---|---|---|
| SSR post-hydration heap (forced GC, n=3, stdev ≤ 1KB) | 2718KB | **1580KB (−42%)** | 2578–2589KB |
| DOM-suite memory (1k rows created CSR) | 1766KB | **481KB (−73%)** | 1484KB |
| Hydration median (n=10, two runs) | 49.1 / 55.8ms | 46.9 / 50.0ms | 38.3 / 41.6ms |
| update10th / select / swap / clear | — | neutral or better in both runs | — |

The memory numbers are the honest framework-shaped bound (full real
runtime + hydration walker + keyed reconciler attached), unlike Stage
0's runtime-less 1169KB stunt floor. Hydration time improves only a few
ms at 1k rows: per-row work is no longer the dominant term —
navigation/parse and the fixed non-row costs (module eval, `bf-p` JSON
parse, document scope walk) are, and those are a separate follow-up
axis. Correctness gates (select A→B→A transitions, update10th
spot-checks, swap/remove/clear/10k/append/replace) all pass in real
Chromium; the gate scripts are committed with the spike.

### 9.5b Shipped results (measured 2026-07-27, L3 on the real pipeline)

The numbers above are the hand-written prototype's. These are the
SHIPPED compiler emission's, same sandbox, two runs each,
independently re-measured after L3:

| Metric | eager (pre-L3) | **shipped lazy (L3)** | solid |
|---|---|---|---|
| SSR post-hydration heap (n=3, forced GC) | 2718.6KB | **1807.6 / 1812.7KB (−33%)** | 2577.9 / 2586.7KB |
| Hydration median (n=10) | 49.1 / 55.8ms | **31.5 / 30.1ms** | 28.9 / 28.4ms |
| Hydration ratio vs solid | 1.28–1.34x | **1.06–1.09x** | 1.00x |
| Client JS (raw / gzip) | 21.6 / 7.8KB | 21.4 / 7.8KB | 17.0 / 6.6KB |
| Interactivity gate | PASS | PASS | PASS |

Heap lands 30% BELOW solid, and the hydration gap against solid closed
from ~1.3x to ~1.07x — a larger hydration win than §9.5 projected,
because the prototype still paid the eager bundle's unused code paths
while the shipped emission replaces them. No bundle-size regression
(marginally smaller: the row plan costs less than the renderItem
closure + consolidated effect it replaces).

**Where the shipped result differs from the prototype's −42% heap.** The
prototype claimed nothing at hydration; the shipped emission's
`applyOuter` seed pass materializes each row's ref tuple (the attr
element handle plus the row's `lazySlots` writer closure and its plan
array) so it can read-compare-write the outer-involving class binding.
That is ~230KB/1k rows of the gap and is a known, mechanically
identified follow-up: a row whose outer-involving bindings are all
ATTRS needs only the element handle at seed, never the content-slot
writer. Splitting the ref tuple by what the seed pass actually reads
recovers most of the difference without touching the model.

**DOM-suite memory is unchanged (1768KB) by L3** — not a measurement
failure but the eligibility gate working as designed: the krausest
bench component uses `const isSelected = createSelector(selected)`, and
an opaque local whose CALL is the reactive read cannot be primed by the
emitter (see the limits below), so that loop keeps the eager emission.
The prototype's −73% DOM figure therefore remains unrealized in
shipped code until the gate widens.

### 9.5c Shipped limits (L3) — both sound-or-loud refusals

Neither is a silent divergence: each makes the loop ineligible, and the
loop keeps today's eager emission with an explicit `reason`.

1. **Outer-involving TEXT bindings refuse the loop.** `lazySlots` is a
   write-only door, so §9.3(1)'s read-compare-write seeding has no DOM
   read-back for content slots. Writing unconditionally at seed would
   reintroduce exactly the per-row hydration write this design removes,
   and skipping the write is the unsound trust-first-run §6 deleted.
   Widening requires a runtime READ door on claimed slots (a contract
   addition, hence its own slice). Outer-involving ATTR bindings are
   supported today because `getAttribute` is the read-back.
2. **Opaque outer reads refuse the loop.** A local like
   `const isSelected = createSelector(selected)` is an ordinary const
   whose call is the reactive read. The `applyOuter` effect must
   subscribe on its FIRST run, and when the entry list is empty at that
   moment the per-entry reads never execute — so the effect subscribes
   to nothing and never re-runs, while rows added later (correct at
   creation via `createRow`) go stale on the next outer change. The
   emitter cannot synthesize a priming call for an opaque callee, so it
   refuses. Two ways out, either of which widens the gate materially:
   emit a priming read where the callee's signal dependencies ARE
   statically known, or give the runtime a re-subscribe seam (re-run
   `applyOuter` when the entry list transitions empty → non-empty),
   which removes the priming obligation from the compiler entirely.

### 9.6 Migration — stacked semantic PRs

- **L1 — spec** (this section).
- **L2 — runtime**: `mapArrayLazy` + entry/row-plan contract in
  `@barefootjs/client/runtime`, unit-tested standalone (adoption,
  direct-call updates, lazy ref claim, read-compare-write seeding
  helper, LIS reuse, dispose-on-remove). No compiler change.
- **L3 — compiler switch**: eligibility analysis + row-plan emission for
  eligible plain loops; ineligible loops and profile mode keep the A3b
  emission; snapshots/CSR goldens regenerated once; a CSR-conformance
  fixture exercising an eligible loop and an ineligible fallback loop
  lands in the same PR.
- **L4 — measure + record** (this): re-ran the DOM/SSR benches on the
  real implementation; results in §9.5b, shipped limits in §9.5c.
