# Slot unification (proposal — not yet implemented)

Status: **draft for review, revision 2**. Root-cure design prompted by the
#2389/#2393 review. Revision 2 replaces the scan-based `updateSlot` door
from revision 1 with a claim-once model, informed by how SolidJS resolves
dynamic positions — and identifies where BarefootJS's own constraints
(multi-backend SSR, byte parity) suggest different choices than Solid's.
No code change ships with this document.

## 1. Current state — the inventory

Reactive content-update mechanisms, by addressing scheme:

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

Facts that shape the design:

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
references and paths are never consulted again. BarefootJS already has
this shape in embryo: the hoisted `tAfter(__p[i])` path (#2143).

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

## 5. Migration — two steps, stacked semantic PRs

Compatibility with the current emitted grammar is explicitly NOT a goal
(pre-1.0; fixtures and snapshots regenerate wholesale). What survives is
not compatibility but **verifiability**: Step A keeps SSR bytes unchanged
so the new client is validated against known-good SSR output — the
existing byte-parity corpus is the debugging baseline. The old five-stage
coexistence plan (mechanisms folded one at a time) is retired.

**Step A — claim infrastructure, wholesale (SSR bytes unchanged).**
Replace all four content mechanisms (`$t`-effect text slots, `__bfText`,
`patchSlotRange`, `updateClientMarker`) in one series of stacked PRs; old
mechanisms are deleted, not shimmed:

- **A1 (this revision)**: spec.
- **A2 — runtime**: claim-plan interpreter + claimed-slot primitives in
  `@barefootjs/client/runtime` (claim a row/scope from a compile-time
  plan; held-ref writes for `'text'`/`'markup'`/`Node`; row-level lazy
  claim with the row-pristine invariant; eager-claim escape for the
  streaming/portal paths enumerated below). Unit-tested standalone; no
  compiler change yet.
- **A3 — compiler switch**: emit claim plans (data) for every content
  slot; all four old emission forms and their runtime exports removed;
  snapshots and CSR/fixture goldens regenerate once. `bf-client:` markers
  stop being emitted (its SSR comment was claim-input only; removing it
  is the one SSR byte change allowed in Step A, since nothing adopts it).
- **A4 — cleanup**: remove dead exports (`reconcileElements`,
  `reconcileList`); re-run the SSR bench and record real (non-ceiling)
  numbers here.

**Step B — marker elision.** Drop markers outside (i)–(iii) from both SSR
and CSR templates through the single doors (nine adapters + goldens in
one PR), and land claim-plan verification (d) with it: conformance
mechanically checks every adapter's output against the plans. Justified
by node count/memory (§5a), not transfer size.

## 6. Constraints and risks

- **Byte parity**: Step A leaves SSR bytes unchanged (except the dead
  `bf-client:` comment); Step B changes them through the single doors
  with a one-shot fixture regeneration.
- **Hydration adoption**: `'text'` keeps create-if-absent; `'markup'`
  keeps trust-first-run (claim records, never patches on first run).
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
