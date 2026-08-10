# Slot unification

Status: **implemented** — claim infrastructure (Steps A+B, PRs #2396–#2400)
and the lazy row graph (§9, PRs #2406–#2415) are shipped. Revision history
is in git.

> **This document is the normative rules, and only those.** It is not an
> introduction to the architecture — §2 through §4 state the invariants and
> assume you already know what a slot and a claim are. The three axes the
> design actually splits along (markers, claim, hydration) are easier to learn
> in that order than in this document's order.
>
> **Measurements live in CI, not here.** Every point-in-time benchmark table
> this document used to carry went stale within days. Current numbers come
> from the benchmark workflow's PR comment (`.github/workflows/
> benchmark.yml`). Only measurements that a design decision still rests on
> are quoted below, and each says what it is load-bearing for.

## 0. Target state — the four rules

Everything in this document derives from four rules. When a change is hard
to classify, classify it against these; when two sections seem to conflict,
the rules win. The Japanese companion overview is
[`slot-unification.ja.md`](./slot-unification.ja.md); this English document
is normative.

1. **Resolve a position once.** An element's address is decided at claim
   time and held as a reference. Updates never re-walk the DOM.
   (Enforced by the claim-once rule in §2 and the single `claimRefs` door
   in `claim-slots.ts`.)
2. **Separate assembly from initialization.** Finish building the string,
   then make DOM nodes, then connect, then run `init`. No DOM nodes are
   created mid-assembly. (The five-stage order in §4; stages 4–5 hold on
   all three row paths; stage 2 is a §7 non-goal.)
3. **Discriminate child positions at runtime.** A `Node` value is spliced
   by identity; a string is escaped. Escaping is the default; raw is
   explicit. (`__bfSlot` + structured IR; the write-side rule in
   CLAUDE.md.)
4. **Rows own no resources.** A loop row allocates no reactive resources;
   you pay only for the rows that update. (§9's lazy row graph; the
   eligibility gate in §9.4 falls back to eager emission, never to
   unsoundness.)

## 1. What this replaced

Before Steps A+B there were four separate reactive-content mechanisms over
one marker format, each with its own lookup and ownership rule: a `$t`
text-effect, `__bfText` (dynamic text/JSX), `patchSlotRange` (preamble
regions, #2389), and `updateClientMarker` (`@client` exprs, which rescanned
the DOM on EVERY update). All four are deleted; the claim-plan model (§4)
replaced them. Two dead reconcilers (`reconcileElements`, `reconcileList`)
went with them.

`patchLeaf` (element identity + attr sync), `insert` (conditional swap),
`mapArray` (keyed list), and attr effects (`bf="sN"`) were kept as-is — they
are subtree lifecycle or a different contract, not content addressing (§7).

The fault being cured: mechanisms accreted one per compiler feature, instead
of one slot concept with an identity contract.

## 2. Reference point — how SolidJS resolves positions

Solid never reads a marker at update time. Positions are compile-time
`firstChild.nextSibling…` paths, dereferenced **once** when the template is
cloned (CSR) or claimed (hydration); updates write through held references.
Its SSR markers (`<!--#-->`) and hydration keys (`data-hk`) exist only to
align that one-time claim.

**Claim-once is the core rule of this design**: resolve a position once,
hold references, never scan on update. A path only has to be valid at the
moment of claim, and at mount the row DOM is always in its pristine template
shape on both SSR and CSR — so later variable-length changes cannot
invalidate anything already claimed.

A corollary that has already caught one design: **a second position-
resolution path is a violation even when it looks cheaper.** A claim-free
"peek" (resolve the marker, read the node, discard the resolution) was
designed and rejected for exactly this — it re-scans on the next update. The
fix for whatever motivated the peek belongs at the cause, not beside it.

## 3. Where BarefootJS's constraints suggest different choices

Not claims of superiority — places where our architecture
(compile-to-any-backend, SSR/CSR byte parity as an enforced invariant,
string-template rows) points at adjustments Solid has no reason to make:

**(a) Claim plans as compile-time data, not render re-execution.** Solid
hydrates by re-running the component and walking the DOM in lockstep. Our
hydrate adopts without re-render, so claim need not happen at hydration at
all: **row-level lazy claim** — the first write to any slot in a row claims
the whole row (still pristine at that moment), later writes hit held refs. A
row that never updates never pays. Requires the **row-pristine invariant**:
claims batch per row, so one slot's patch can never shift a sibling slot's
un-claimed path.

**(b) Markers become claim-only, then mostly disappear.** With path-based
claiming, markers are structurally required only where paths cannot address:
(i) adjacent text slots (the HTML parser merges adjacent text), (ii)
positions that can be empty (a zero-length region needs a physical anchor),
(iii) conditional/loop range boundaries. Every other slot's marker can be
dropped from SSR output — and unlike Solid we need no `data-hk`-style
per-element keys either, because byte parity guarantees the shape the paths
were compiled against.

(b)'s value routes through **DOM node count** (4,000 comments + 2,001 attrs
per 1k rows), not the wire: Stage 0 measured raw −54.7KB but only −0.6KB
gzip. Markers compress too well for a transfer win. Argue (b) from memory
and parse, never from transfer size.

**(c) Row-granularity effects.** The compiler statically knows which slots a
row has and what each reads. That permits one effect per row driving a
compiled slot table instead of one closure per binding — and, per §9, for
plain rows it permits deleting the per-row reactive graph entirely.

**(d) The claim plan doubles as a cross-backend contract.** A claim plan
asserts "SSR output has this shape". Conformance mechanically verifies every
adapter's output against the plans, turning the byte-parity invariant into a
per-slot, per-backend checked guarantee. This axis only exists because we
have nine SSR backends. Shipped with Step B.

The essence of (a)+(c) is **pay-per-use**: the reactive graph (per-item
signal, per-slot effect closures, subscription entries, held DOM wrappers)
is built only for rows actually written to, instead of being paid up front
for every row at hydration.

## 4. Target architecture

- **One slot concept**: a claimed position with an identity contract —
  `'text'` (held Text node, `nodeValue` writes), `'markup'` (held boundary
  refs, range replace), `Node` (identity splice).
- **One claim mechanism**: compile-time child paths; markers consulted only
  by the claim, only where (i)–(iii) require them; one ownership rule
  (nested `bf-s` scopes are opaque).
- **Row-level lazy claim** per (a).
- `patchLeaf`, `insert`, `mapArray` stay (§7).

Three access doors sit on ONE claim (`claimRefs` in `claim-slots.ts`) —
`claimSlots` (eager, for callers that cannot honor row-pristine),
`lazySlots` (write-only, the default), `lazyClaimSlots` (read+write, only
where §9.3(1) seeding needs a DOM read-back). They are accessor bundles, not
three ways to resolve a position. The split exists because a door is
allocated per row: giving every claim a reader measured ~40KB/1k rows.

## 5. Migration — what shipped

Compatibility with the pre-unification emitted grammar was explicitly NOT a
goal (pre-1.0; fixtures and snapshots regenerated wholesale). What survived
was **verifiability**: Step A kept SSR bytes unchanged so the new client was
validated against known-good SSR output.

**Step A — claim infrastructure, wholesale (SSR bytes unchanged).** All four
content mechanisms replaced in one stacked series; old mechanisms deleted,
not shimmed.

- **A1** (#2396): spec.
- **A2 — runtime** (#2397): claim-plan interpreter + claimed-slot primitives
  in `@barefootjs/client/runtime`. Unit-tested standalone; no compiler
  change.
- **A3 — compiler switch** (#2398): claim plans emitted for every content
  slot; all four old emission forms and their runtime exports removed;
  snapshots and CSR/fixture goldens regenerated once. `bf-client:` markers
  stopped being emitted — the one SSR byte change Step A allowed, since
  nothing adopted it. Unchanged-value dedup for `'markup'` writes lands
  here; the trust-first-run that shipped alongside it was removed as a
  follow-up (§6).
- **A3b — row-granularity effects** (§3(c)): A3 stacked per-slot effects on
  top of new per-row claim allocations and CI's DOM benchmark caught a real
  +16.5% memory regression. Fixed by giving each plain loop row ONE
  `createEffect` and one mixed-kind `lazySlots` writer. The dominant cost
  turned out to be claim-mechanism allocation, not effect count — §3(c)'s
  "remove N-1 effect objects" framing undersold it.
- **A4 — cleanup** (#2399): dead exports removed.

**Step B — marker elision** (#2400): dropped markers outside (i)–(iii) from
SSR and CSR templates for a narrow slice (see §5a), and landed claim-plan
verification (d) alongside it. Justified by node count/memory, not transfer
size.

## 5a. Step B measured — why the general case is deferred

Load-bearing for §8's marker-elision follow-up; kept because a runtime
docstring points here for the reason.

**What shipped**: `client-only-elision.ts` elides the marker pair for
`/* @client */` text expressions ONLY — the one `'text'`-kind slot whose
rendered width is deterministically zero at claim time on every request
(SSR can never evaluate client-only JS). Scope: not inside any loop or
conditional branch, not adjacent to loose text or another slot (case (i)),
capped at one elided slot per static subtree ("freeze after first").

**Why ordinary reactive text in loop rows — the 1k-row bench's actual hot
path — is NOT elided**: an ordinary `{item.name}` slot's rendered width is
DATA-DEPENDENT, so a later sibling's absolute child-index path is only valid
for the specific width THIS request happened to produce, not for every
request the compiled function ever serves.

The identified path forward is `client-only-elision.ts`'s freeze rule minus
the `clientOnly` restriction, decided where loop-row `'text'`-kind
classification already happens (`collect-elements.ts` /
`ir-to-client-js/control-flow/plan/loop.ts`, inside `generateClientJs`)
rather than in a pre-pass before `adapter.generate`. `compiler.ts` currently
calls `adapter.generate` BEFORE `generateClientJs`; reordering those has not
been re-verified against the loop-row planner's invariants. Real follow-up
work.

**Investigated (issue #2483) — corrected: a SPLIT, not a swap, and the
runtime/adapter sides are already general enough.** The order-swap
experiment (`BF_INVESTIGATE_SWAP_GENERATE_ORDER=1`, `compiler.ts`) showed
`adapter.generate` and `generateClientJs` are not coupled through IR
mutation at all — grepping every `ir-to-client-js/**` module for a write to
an `IRNode`/`IRExpression` field found exactly one site,
`client-only-elision.ts`'s own `markerless`/`elidedPath` assignment; no
adapter (all nine, grepped) imports from `ir-to-client-js` or writes
`ir.metadata`/IR-node fields; `generateClientJs`'s `collectElements` copies
loop-node fields into its own ephemeral `ctx.loopElements` entries rather
than mutating the IR loop node. So the literal call-order swap is not
structurally blocked — but swapping alone buys nothing: the missing piece
was never "which function runs first", it's a pre-pass that generalizes
`decideClientOnlyElision` the same way it already ships, extended past the
`clientOnly` restriction and into loop-row bodies. Evidence this is close
to free on the runtime/adapter side:

- `claimMarkerlessText` (`packages/client/src/runtime/claim-slots.ts`)
  ALREADY implements general adopt-existing-or-create-at-index semantics,
  not just the "always empty" case `/* @client */` needs — its own
  docstring states both branches. No runtime change needed to generalize
  past `clientOnly`.
- `packages/adapter-tests/src/claim-plan-conformance.ts` already verifies
  ANY markerless slot's path resolves correctly in rendered HTML, not just
  client-only ones — no test-infra change needed for the top-level
  (non-loop) case.
- `computeSkeletonSlotPaths` (`html-template.ts`) — the function that would
  compute a loop row's elided paths — is already a pure function of
  `(IRNode, LoopSkeletonSafeSlots)`, decoupled from `ClientJsContext`, so
  it can be called from a pre-pass exactly like `decideClientOnlyElision`
  already is.
- The CSR emitter's `expression` case (`html-template.ts`'s
  `irToHtmlTemplate`) checks `node.markerless` UNCONDITIONALLY, ahead of
  the `slotId`-marker branch — already correct for a non-`clientOnly`
  markerless slot with no change needed.

The SSR side is NOT already fully general, though — every one of the nine
adapters' `renderExpression` nests its `if (expr.markerless) return ''`
check INSIDE `if (expr.clientOnly && expr.slotId) { … }` (verified in
`hono-adapter.ts`, `go-template-adapter.ts`, `erb-adapter.ts`; the other six
carry the identical shape per their matching "elidedPath alone is enough"
comment). The general `if (expr.slotId) { return marker-wrapped }` branch
below it never consults `markerless` at all. So a markerless flag on a
non-`clientOnly` expression would be silently ignored by all nine backends
today, still emitting the marker pair — a real, mechanical, but NOT free
coupling: hoisting that one check out of the `clientOnly` branch is
required in all nine adapters (a small, symmetric, low-risk change, not a
design blocker) before the CSR-side generalization above does anything
observable in SSR output.

The genuine hard case is adopted rows, confirmed unconditional today:
`control-flow/stringify/lazy-row.ts` states outright that "Adopted (SSR)
rows never use these [row-relative fresh-clone paths] — `__lzc_<mid>`
claims with `path: []`, the sanctioned marker-scan case." Removing the
marker removes the only thing that scan finds. Because `claimMarkerlessText`
is already general, this is not a missing runtime primitive; it is
`build-lazy-row.ts`/`stringify/lazy-row.ts`'s adopted-row claim-plan
construction hard-wiring `path: []` for every text slot regardless of
elision eligibility, and it needs real (understood, scoped) planner work to
accept a computed row-relative path for the elided subset instead. The
top-level (non-loop) generalization and the fresh-clone-row case do not
share this blocker — top-level paths are already root-relative
(`IRExpression.elidedPath`'s existing contract) and fresh-clone rows
already get row-relative paths via the hoisted-skeleton fast path
(`__lzp_<mid>`); only the *adopted* claim-plan shape needs to change.
See the issue for the full order-dependency map, breakage catalogue, and
the measured size prize (raw-byte win is real; wire/gzip win is negligible
— confirms this section's own "argue (b) from memory and parse, never
transfer size" framing empirically, not just by assertion).

## 6. Constraints and risks

- **Byte parity**: Step A left SSR bytes unchanged (except the dead
  `bf-client:` comment); Step B changes them through the single doors with a
  one-shot fixture regeneration.
- **Hydration adoption**: `'text'` keeps create-if-absent. `'markup'` was
  originally specified to keep trust-first-run (claim records, never patches
  on first run) — implemented in A3, then REMOVED. Trust-first-run is sound
  only for the narrow loop-row-reuse case it was lifted from, where the
  row's SSR content and its mount-time recomputation derive from the same
  source data and cannot disagree. A slot whose value comes from client-only
  state the server can't see (`createSignal(readFromLocalStorage())`; a
  region swap adopting HTML the server rendered from a different default)
  can genuinely diverge on its first write, and trust-first-run silently
  discarded that first real value. `'markup'` now patches unconditionally on
  every write; only the unchanged-value dedup survives.
- **Non-mutating text claim**: claiming a marked `'text'` slot must not
  touch the DOM. It adopts an existing Text node and otherwise holds the
  anchor Comment as the record of where the node must go, deferring creation
  to the first write. Without this, `lazyClaimSlots.read` would leave an
  empty Text node on every row it merely inspected.
- **A `'text'` slot may still receive a Node.** A child-position
  interpolation that calls something (`props.renderRow(item)` handed an
  inline-JSX arrow) can evaluate to a live element, and a Text node cannot
  host one — `String(node)` destroys it silently. Syntax cannot tell the two
  apart (`renderChild(...)` and `props.renderRow(...)` are both
  `CallExpression`), so the decision is made on the VALUE: `textOrNode` passes
  a Node through, and the claim **promotes** that slot to `'markup'` on the
  first Node write, reusing the anchor it already resolved (claim-once still
  holds) plus its matching `<!--/-->`. Strings keep the Text-node fast path.
  A slot that cannot host a Node — markerless, or missing its end marker —
  warns and skips rather than stringifying an element.

- **Shape drift**: path claiming makes SSR/CSR shape agreement a harder
  invariant. It is already enforced (conformance byte parity); (d)
  strengthens the enforcement rather than adding an assumption.
- **Row-pristine invariant** for lazy claim: any code path that mutates row
  content before claim (streaming swaps, portals) must claim eagerly or be
  excluded.

## 7. Non-goals

- Rewriting row rendering off HTML-string templates.
- Merging structural reconcilers (`insert`, `mapArray`) into the content
  door.
- Matching SolidJS feature-for-feature; it is a reference point, not a
  target.

## 8. Follow-ups

Identified here rather than re-discovered from scratch later. Entries stay
after they ship when the *estimate* is the reusable part — a number that was
wrong, and why, is worth as much as the change itself.

- **General-case marker elision** (§5a). The one open item on axis (b), and
  the only route to closing the HTML-size gap against solid. Tracked as
  issue #2483, which also fixes the required first step: an
  investigation-only generation-order swap behind a flag, cataloguing what
  breaks against the loop-row planner's invariants before any elision
  lands.
- **Claim-mechanism allocation shape — both pieces SHIPPED.** Kept here
  because the corrected estimates are the reusable part: the original numbers
  for both pieces were wrong in opposite directions, and each was measured on
  the wrong bench at first.

  **(1) Per-row `SlotSpec` re-allocation — SHIPPED.** Every row rebuilt the
  loop's whole `ClaimPlan` (the array, one `{ id, kind, path }` per text
  slot, and — in the adopted-row form — a fresh inner `path: []`), even
  though nothing in it varies across rows. The stringifier now hoists it per
  loop: `__lzs_<mid>` for the adopted-row context and `__lzsc_<mid>` for the
  fresh-clone one, the latter emitted only when the two forms differ. Sound
  because `ClaimPlan` is `readonly SlotSpec[]`, `claimRefs` only reads it,
  and each call builds its own `Map`.

  Two corrections to this entry's original estimate, both worth keeping:
  the plan could be hoisted **whole** rather than "static `id`/`kind` hoisted
  with a per-row `path` threaded through", because the path is itself a loop
  constant (`[]` for adopted rows, an index into the already-hoisted
  `__lzp_<mid>` for clones); and the recovery was **~8x the ~10KB/1k rows
  guessed here**. Measured on `benchmarks/apps/barefoot` (which emits a lazy
  loop) with `bench-dom.ts --quick --framework=barefoot`: post-create heap
  for 1k rows **1053.8KB -> 971.9KB / 970.5KB** across two after-runs, i.e.
  **~-82KB (-7.8%)**. `create1k` time did not move outside run-to-run
  overlap (75.4ms [74.9-87.9] before; 80.4ms [79.4-82.2] and 77.6ms
  [76.9-79.2] after). Emitted JS grows slightly — +29 bytes per lazy loop,
  +0.1KB gzip on the benchmark app — which is the trade: two extra const
  lines per loop buy 2 fewer allocations per row.

  **(2) `applyOuter`'s seed pass materialized each row's whole ref tuple**
  (element handle plus the `lazySlots` writer closure) even when the row's
  outer-involving bindings were all ATTRS and the seed only ever read the
  element. **Done**, in two steps.

  First the door: the adopted-row claim left its slot `null` and the first
  content write filled it (`doorAccess` in `stringify/lazy-row.ts`), measured
  at **1630.6KB -> 1573.2KB** post-hydration heap.

  Then the element refs. The whole-row claim closure (`__lzc_<mid>`) was still
  resolving EVERY reactive-attr slot in the row, so an `applyOuter` driving one
  attribute scanned for every other slot too — three scans per row to write one
  attribute on a three-slot row. Each binding now claims its own slot on first
  use (`elementAccess`), and the closure is gone. The cache test is `N in __r`
  rather than `??`, so a slot whose scan finds nothing is not re-scanned every
  tick. `createRow` is untouched on both counts: it resolves refs from known
  clone paths and writes every binding on the tick it clones the row.

  That second step is **counted, not timed** (`lazy-row-eligibility.test.ts`
  pins 3 scans in `applyItem`, 1 in `applyOuter`, 0 in `createRow`). The SSR
  heap bench does not move — 1573.1KB, unchanged — and cannot: its row has a
  single reactive-attr slot, so its `applyOuter` already claimed exactly what it
  wrote. No current bench app has a row whose outer bindings cover only some of
  several attr slots.

  The claim-once interaction turned out not to bind. §2's rule is about a
  single door resolving the whole plan on first access, and each door already
  enforces that internally (`lazySlots`/`lazyClaimSlots` call `claimRefs`
  once and cache); deferring the door's CONSTRUCTION changes when that one
  resolution happens, not how many there are. A loop with an outer-involving
  TEXT still claims every row at seed, because read-compare-write cannot
  compare what it has not resolved — the deferral is a no-op there by design,
  and the win is confined to attr-only-outer loops.

  Two corrections to this entry's original estimate. The **~230KB/1k rows**
  figure was too high: it was written before piece (1) removed the per-row
  plan objects, and `lazySlots` never scanned eagerly anyway
  (`claim-slots.ts:617` defers to the first write), so what remained was one
  closure per row, not a resolved slot map. And the right benchmark is not
  the DOM suite: that column creates its 1,000 rows client-side, which is the
  `createRow` path this change deliberately leaves alone. Measured instead on
  **SSR post-hydration heap** (`benchmarks/ssr/bench-ssr-memory.ts`, the
  1,000-row table with item texts plus an outer-signal class):
  **1630.6KB -> 1573.2KB / 1572.9KB** across two after-runs, i.e.
  **-57.4KB (-3.5%)**, against a per-run stdev of 0.1-0.6KB and with the
  react/solid columns unmoved as controls.

  Behavioural coverage is
  `packages/client/__tests__/runtime/lazy-row-adopted-door.test.ts`: real Hono
  SSR markup, hydrated, then an item changed. That sequence is the only one
  that executes the deferred branch — the emission tests read text, the
  `createComponent` tests take the eager path, and the conformance suites
  never run a post-hydration update. Verified to fail when the door is built
  against the wrong root.
- **Widening the lazy-row gate** — see §9.5's refusal table.

## 9. Lazy row graph — §3(c) completion

Status: **shipped for eligible plain loops.** Landed as a stacked series —
L1 spec, L2 runtime (`mapArrayLazy`), L3 compiler switch, L4 measure — which
is what docstrings mean when they cite "L2"/"L3".

### 9.1 The observation that makes rows non-reactive

A plain loop row's update paths are exactly two, and both are already known
without per-row reactivity:

1. **Item-driven changes.** The keyed reconciler detects them itself —
   `!Object.is(oldItem, newItem)` per key. The per-item signal + per-row
   effect exist only to RE-DELIVER that knowledge back to the row; the
   reconciler can call the row's update function directly.
2. **Outer-signal reads** (`class={selected() === row.id ? … : …}`). When an
   outer signal changes, every row's effect re-runs anyway (they all
   subscribe to it). ONE loop-level effect iterating all entries does the
   same total work with per-entry dedup — without N effect objects and N
   subscription entries.

Event handlers need nothing per row either: delegation to the loop container
already shipped. So for the plain shape the per-row reactive graph carries no
information the loop doesn't already have — it can be **deleted, not
deferred**.

### 9.2 The model

Per eligible loop the compiler emits a **row plan** (functions + data, no
per-row closures at hydration) consumed by `mapArrayLazy`:

- **Hydration first run**: partition SSR rows (same marker walk as
  `mapArray`), build plain entries `{ key, startMarker, primaryEl, extras,
  item, refs: null, last: null }`. `key` comes from the SSR-rendered
  `data-key` (read, never written). NO root, NO signal, NO effect, NO query,
  NO claim, NO DOM write per row.
- **Item-driven updates**: on `!Object.is` the reconciler calls
  `applyItem(entry)` directly — claims the row's slot refs lazily on that
  row's first update (scan inside that one row; cached on `entry.refs`; CSR-
  created rows record refs from known clone paths with no scan), then writes
  each binding through per-binding last-value dedup on the entry.
- **Outer-involving bindings** (dependency set includes a signal from
  outside the row, including mixed item+outer bindings): ONE loop-level
  `createEffect` reads the outer signals and applies those bindings to every
  entry with the same dedup. Emitted only when such bindings exist. Mixed
  bindings are also in `applyItem`; dedup makes the overlap idempotent.
- **CSR creation / removal / reorder**: template clone + direct writes for
  new rows; disposal is trivial (entries hold no reactive resources); the
  LIS minimal-move reorder carries over from `mapArray` unchanged.

### 9.3 Soundness — two layers, no trust-first-run regression

§6 removed trust-first-run for `'markup'` because a first write can carry
client-only state the server never saw. The lazy row graph must not
reintroduce that hole. Two distinct consistency questions, two distinct
answers:

1. **Outer-involving bindings** (first run of the loop-level effect):
   **read-compare-write seeding.** The first run computes each entry's value
   and READS the current DOM (`getAttribute` / `nodeValue`) to seed the dedup
   state, writing only where computed ≠ DOM. Sound unconditionally —
   client-only outer state diverges from SSR and gets patched on that first
   run, exactly like today. Cost: O(rows) reads at hydration, no writes on
   the consistent path.

   Presence-shaped attributes are part of this contract: an attribute SSR
   renders bare (`aria-expanded` with no value reads back as `""`) must not
   be seeded by presence alone, or the client writes `"true"` over it and
   changes meaning. Seed from the read VALUE.

2. **Item-driven bindings**: their first evaluation is deferred until the
   reconciler sees an item CHANGE — so hydration-time consistency between
   the SSR rows and the first client `items()` read is TRUSTED, not
   verified. That trust is sound only when both derive from the same data.
   This is a **compile-time eligibility gate** (§9.4), not a runtime check:
   when the loop's data source is provably hydration-consistent (props,
   literals, and derivations thereof — the `bf-p` protocol makes props
   identical by construction), lazy adoption is sound; otherwise the loop
   falls back to eager emission. Sound-or-loud: a mechanical decision with a
   defined fallback, never a silent divergence.

### 9.3a The re-subscribe seam

`createSelector` subscribes its CALLER **per key**. So `applyOuter` is
subscribed only to the keys present on its first run, and a reconcile can
strand that subscription set: add row C (written correctly by `createRow`,
under `untrack`, so C's key is never registered), then select C — only key C
flips, nobody is subscribed to it, and C's binding goes stale.

An "empty → non-empty" trigger never sees that sequence. The seam must
re-subscribe whenever the entry set changes membership. Implemented as one
loop-level generation signal bumped once per reconcile that created a row or
changed an item (removals do not bump); `applyOuter` reads it first, so its
subscription set is rebuilt against the current keys. Unconditional — not
something the compiler opts a loop into, and not something a user chooses.

This also removed the compiler's priming obligation for opaque outer reads.
Compiler priming was considered and rejected as a general answer:
`createSelector`'s dependency chain runs through an IMPORT, so provability
breaks unless framework primitives are catalogued.

### 9.4 Eligibility (fallback = eager emission)

The gate lives in `ir-to-client-js/control-flow/plan/lazy-row-eligibility.ts`
and is pure/unit-testable. Every refusal carries an explicit `reason`.

Two refusals are **deliberate policy, not backlog**:

- **Loop source not provably hydration-consistent** (§9.3(2)), and its
  sibling "free identifiers unavailable". Do not relax these.
- **Profile mode** keeps the granular eager emission so `#binding:<slotId>`
  attribution and turn-boundary accounting stay truthful.

A third is **unreachable, and must not be planned around**: `index-keyed loop
(no explicit key)`. A `.map()` whose row element carries no valid `key` is a
compile ERROR upstream (BF023 / BF024, `checkLoopKey`), so no program that
compiles cleanly reaches that branch. It stays as a fail-safe because the gate
must not depend on another pass having rejected its input. Note that `key={i}`
— what BF023's own suggestion tells users to write for static lists — is an
ordinary keyed loop and has always been eligible; "index-keyed" here means
*no key at all*, not *a key whose value is the index*. Both halves are pinned
in `lazy-row-eligibility.test.ts`.

A fourth is a **soundness fail-safe**: a binding whose identifier set is
`UNKNOWN_IDENTIFIERS` refuses, because with nothing to look at the
classifier reports `referencesIndex: false` as an ASSUMPTION — and emitting
`applyItem`/`applyOuter` that reference a non-existent index variable is a
silent bug. Distinct in kind from "name visible but unprimable", which the
seam (§9.3a) covers.

### 9.5 Current gate refusals — the widening backlog

Everything else in the gate is unshipped work, not a design limit. Highest
value first:

| Refusal | Why it refuses / what lifting it needs |
|---|---|
| `multi-root (Fragment) row` | Needs the `startMarker`/`extras` bookkeeping the spike deliberately dropped. Not a design wall. |
| `row has imperative child refs`, `row body is a child component`, `row contains nested child components`, `row contains an inner loop` | Shapes where the row owns lifecycle. Genuinely-needs-per-row-reactivity and doesn't-need-it are mixed together here and need separating. |
| `flatMap descriptor loop`, `anchored whole-item-conditional loop`, `row has preamble-patched regions`, `destructured loop param without param bindings` | Outside the plain shape A3b drew; each wants its own bookkeeping. |

A **wiring-free row conditional** was also refused once and is now lazy.
`analyzeLazyConditional` (`plan/lazy-conditional.ts`) accepts a conditional whose
BOTH arms are static elements owning nothing — no events, no child components,
no inner loop, no nested conditional, no reactive attr or text. For that case
everything `insert()` does per row collapses to replacing the `[bf-c]` element,
so the loop-level apply bodies drive it and the row keeps zero reactive
resources.

It needs **no runtime addition**. Both arms are compile-time constants, so each
is parsed once per LOOP into a hoisted `<template>` and cloned on a flip; what is
left per row is a boolean, a dedup slot and a `replaceWith`. Element-vs-fragment
is decided by reading `addCondAttrToTemplate`'s output (the same door the eager
path uses) rather than re-deciding, and a fragment arm refuses — it spans a
sibling range with no single node to replace. `createRow` writes no DOM at all:
the row it just cloned already rendered the correct arm, so only the dedup
boolean is recorded. `applyOuter` seeds by comparing
`content.firstElementChild.outerHTML` against the live element's, i.e. the
browser's own serialization on both sides, so a server-rendered arm that already
agrees costs no write.

Still refused, and each with its own reason: an arm that owns wiring, an arm
that interpolates the item (it could not be hoisted), a fragment conditional
(`{cond ? 'a' : 'b'}` and `{cond && …}` both land here), and a condition reading
the loop index.

**Not measured, and currently unexercised by the corpus.** No committed fixture
or snapshot changed when this landed — the conditionals in the corpus all own
wiring — and the benchmark row has no conditional at all. What exists is a
dedicated conformance fixture plus DOM tests on both row shapes, including the
adopted-row seed. Treat the spec's earlier "directly on the 1k-row hot path"
claim as aspirational rather than observed: it will be true of an app whose rows
carry a static badge, and is not true of anything measured here today.

A **value-only map-callback preamble** was also refused once and is now lazy.
The old rule was "any preamble at all"; `analyzeLazyPreamble`
(`plan/lazy-preamble.ts`) replaced it with a structural proof that
re-executing the statements is observationally free — a sequence of `const`
declarations whose initializers contain no call except a **zero-argument
signal/memo read** (`const cls = selected() === row.id ? …`, the krausest
shape). That read is sound in all three bodies because `mapArrayLazy` wraps
`createRow`/`applyItem` in `untrack()` and `applyOuter` IS the loop-level
effect. `createRow` always runs the preamble, before the clone whose template
literal may interpolate the local.

A binding that READS a declared local was refused at first, on the grounds
that a preamble local hides whatever the preamble read — so `applyOuter` would
prime the wrong thing, or nothing, and an unprimed loop-level effect never
subscribes. That refusal was written while the case was unreachable, and the
#2447 follow-up made it reachable by classifying an attribute reading such a
local as reactive (it used to freeze into the row template). Rather than let
that push the krausest shape back to the eager path, the substitution the
refusal stood in for is now real: `analyzeLazyPreamble` returns the preamble's
own free identifiers, `classifyLazyBinding` runs them through the same rules
as a binding's own names — so `selected` reaches the prime list and the
binding lands in whichever bodies its real dependencies imply — and
`applyItem` / `applyOuter` re-run the preamble only when a binding they own
reads one. A preamble no binding reads stays in `createRow` alone. A
child-position read is still a `preambleRegions` entry, which refuses on its
own separate grounds.

Outer-involving TEXT bindings were also refused once and are now lazy
(#2411/#2412). The obstacle was not the design but the mutating text claim
(§6) plus a write-only door; fixing the claim made the read door
(`lazyClaimSlots`) a straight addition, chosen per LOOP so loops without
outer-involving text pay nothing for the widening. Concatenations, template
literals, and explicit `String(cond ? a : b)` are lazy; the bare ternary is
the exception noted above.

**Where the gate is currently binding**: the krausest bench component uses
`const isSelected = createSelector(selected)`. Before the seam that made the
loop ineligible; it is eligible now, which is why DOM-suite memory moved.
Loops still refused are the ones in the table above.
