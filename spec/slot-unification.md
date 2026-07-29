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

Identified but not shipped, tracked so it isn't re-discovered from scratch.

- **General-case marker elision** (§5a). The one open item on axis (b), and
  the only route to closing the HTML-size gap against solid.
- **Claim-mechanism allocation shape.** Two mechanically identified pieces:
  (1) every row re-allocates full `SlotSpec` objects even when it never
  updates — hoisting each slot's static `id`/`kind` once per loop and
  threading only a per-row `path` recovers ~10KB/1k rows; (2) `applyOuter`'s
  seed pass materializes each row's whole ref tuple (element handle plus the
  `lazySlots` writer closure and its plan array) even when the row's
  outer-involving bindings are all ATTRS and the seed only ever reads the
  element — splitting the tuple by what the seed actually reads recovers
  most of ~230KB/1k rows without touching the model.
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

A third is a **soundness fail-safe**: a binding whose identifier set is
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
| `row contains a reactive conditional` | Includes a BARE ternary in child position (`{cond ? a : b}`), which lowers to `insert()` and is refused as a conditional, not as a text binding. Read "outer-involving row text is lazy" with that caveat attached. Directly on the 1k-row hot path. |
| `index-keyed loop (no explicit key)` | Adoption pairs SSR rows to items by `data-key`, which index-keyed loops do not render. Common in real apps. |
| `row has a map-callback preamble` | The rule is "any preamble at all", not "a preamble declaring row-local reactivity" — over-broad by construction. |
| `multi-root (Fragment) row` | Needs the `startMarker`/`extras` bookkeeping the spike deliberately dropped. Not a design wall. |
| `row has imperative child refs`, `row body is a child component`, `row contains nested child components`, `row contains an inner loop` | Shapes where the row owns lifecycle. Genuinely-needs-per-row-reactivity and doesn't-need-it are mixed together here and need separating. |
| `flatMap descriptor loop`, `anchored whole-item-conditional loop`, `row has preamble-patched regions`, `destructured loop param without param bindings` | Outside the plain shape A3b drew; each wants its own bookkeeping. |

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
