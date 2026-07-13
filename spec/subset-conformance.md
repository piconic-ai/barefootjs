# Subset Specification & Oracle Conformance

Target architecture for making the BarefootJS-supported JSX/expression subset
an explicit, machine-enforced specification — so that "the compiler emits the
expected marked template" implies "it works on every adapter" by verified
contract rather than by whack-a-mole.

> Status: **agreed target, not yet landed.** This records the design decisions
> and the roadmap; it is adjusted as the work completes (same convention as
> `spec/adapter-architecture.md`). Testing-layer boundaries live in
> `spec/testing.md`; this document adds the conformance *contract* those
> layers enforce.

## Motivation

Adapter inconsistencies today surface reactively: a construct compiles
silently, renders correctly on the fixture's data, and breaks on other data or
another adapter (see "Prior art" below for why enumeration alone never fixes
this). The goal is a WinterTC-shaped setup: a normative subset (what the
compiler accepts), a canonical reference implementation (what output means),
and a shared conformance suite every adapter runs, with per-adapter gaps
declared, not discovered.

## Two principles

1. **The contract is extensional.** Correctness is defined as *behavioral
   equality of rendered marked HTML* against the JS reference render, plus
   post-hydration DOM equality (CSR conformance). Adapter-emitted template
   text and client JS text are **not** part of the contract:
   - Per-adapter template-text baselines are rejected — they pin emit details,
     churn on internal refactors, and contradict the thin-adapter direction of
     `spec/adapter-architecture.md`. (Byte-identical verification remains a
     *refactor discipline* for stacked adapter PRs, not a permanent contract.)
   - Client JS is a single adapter-independent artifact of the shared layer;
     its behavior is already asserted by CSR conformance. Its text is not
     pinned per adapter.
2. **The subset is loud at its boundary and growing-only.** Everything outside
   the subset is a diagnostic (BF021/BF101 with `/* @client */` as the escape
   hatch), never a silent passthrough. Widening the subset adds vectors and
   never removes previously-accepted shapes.

A marked template is a *function* from data to HTML; a single rendered
comparison observes one point of that function. Extensional conformance
therefore multiplies **evaluation points**, not artifacts: assertion density
comes from `fixtures × data points × adapters`, all compared against one
neutral observable.

## The data domain

What may cross the host-language boundary as props:

| Category | Status | Mechanism |
|----------|--------|-----------|
| JSON values (string/number/boolean/null, arrays, plain objects) | in contract | passed natively per adapter |
| Catalogued rich types (`Date` first) | in contract, per catalogue | lowering-plugin registry; native type per adapter (`time.Time`, Ruby `Time`, …) |
| Statically-known functions (subset-expressible arrow bodies) | in contract | **compiled, not transported** — lowered as `ParsedExpr` into the target template |
| Event handlers | in contract | client-JS-only; never rendered by SSR |
| `NaN`, `Infinity`, `undefined` inside arrays, JS `Invalid Date` | out of contract | not representable across backends |
| Arbitrary runtime function values | out of contract | impossible to transport; BF101 → `/* @client */` |

"How much of Date / function props is supported" is thus a mechanical
question: the current extent of the catalogue and of the evaluator subset,
not an aspiration.

## Oracle conformance (data points)

Extends the existing per-adapter conformance
(`packages/adapter-tests/src/run-adapter-conformance.ts` — single mandatory
entry point, typed per-suite skips) with multiplied evaluation points.

### Fixture schema

```ts
createFixture({
  id: 'user-card',
  source: `...`,
  props: { user: { name: 'Alice' } },   // primary data point (unchanged)
  expectedHtml: `...`,                   // hand-written; kept deliberately
  dataPoints: [                          // NEW: additional evaluation points
    { name: 'empty-name', props: { user: { name: '' } } },
    { name: 'null-user',  props: { user: null } },
  ],
})
```

### Rules

- **Gate ordering.** The primary `expectedHtml` assertion runs first as the
  smoke test and human-readable documentation of intended output. `dataPoints`
  run only when the primary point is green — if the basic shape is broken,
  adversarial values prove nothing.
- **Live oracle.** Expected output for each data point is computed at test
  time by the JS reference render (the canonical reference implementation) —
  never stored. Hand-written expectations exist only at the primary point,
  which doubles as the human pin against oracle-and-adapter agreeing on the
  same bug.
- **Comparison** is byte equality after the existing `normalizeHTML`
  canonicalization — not DOM-tree equality. Escaping divergence
  (`&#34;` vs `&quot;` class) is precisely a difference we want to catch.
- **Skips** follow the established discipline: a typed
  ``skipDataPoints: ReadonlySet<`${fixtureId}:${pointName}`>`` per
  adapter, each entry commented with the follow-up issue
  (`known-limitation`).
- **Cost tiering.** Full matrix (fixtures × points × adapters, real backend
  execution) runs nightly; PR runs cover primary points. Adapters batch all
  points of a fixture through one backend process.

### Rollout is two-staged

1. **Hand-written `dataPoints`** — schema extension only; authors learn which
   values bite.
2. **Type-derived value catalogue** — a single shared map from prop `TypeInfo`
   (already carried by the IR) to adversarial value sets: `string →
   ['', '<b>&"', '日本語', …]`, `number → [0, -0, 1e21, 0.1+0.2]`,
   `T | undefined → [+null]`, `T[] → [[], [x], many]`, `Date → [epoch 0,
   pre-1970, leap day, DST boundary, year 9999]`. Generated points are
   sampled per axis, not as a full cross-product. Stage-1 learnings feed the
   catalogue.

Rich-type values are written natively in fixtures (`new Date(...)`); the
harness serializes them across the language boundary with a tagged envelope
(ISO 8601 for dates). Fixture authors never see the envelope.

## Coverage bookkeeping

Existence of a per-kind fixture is a **ledger floor, not behavioral
coverage** — a `ParsedExpr` kind hides axes (e.g. `member`:
`computed × optional × hop count`), compositions, and value semantics that a
single fixture cannot witness.

- **Fixtures declare what they exercise** (test262's `esid` pattern):
  frontmatter naming the `ParsedExpr` kinds, axes, and lowering context
  (text / attribute / condition / loop) a fixture covers. Coverage maps are
  then aggregation, not inference, and also drive data-point filtering
  (only run adversarial values against fixtures exercising the relevant
  kinds).
- **Change-time coupling** (TC39 stage-4 rule): a subset extension — new
  `ParsedExpr` kind or field, catalogue entry, builtin — does not merge
  without fixtures in the same PR. Axes derive mechanically from variant
  fields, so adding a field widens required coverage automatically.
- **Generated support matrix**: `kind × axis × adapter` pass/skip table
  generated from the suite + skip declarations (the `known-limitation` label
  stays the per-issue source of truth; the matrix links to it). The
  `@barefootjs/compat` component×adapter matrix is the seed for this.

## Date: first catalogued rich type

Current state (verified 2026-07): `Date` props are a **silent passthrough** —
no diagnostic; the prop lowers to `interface{}` (Go), and method calls are
transliterated mechanically (`createdAt.toISOString()` →
`{{.CreatedAt.ToISOString}}`), which fails at Go render time while CSR renders
correctly. This violates principle 2 (loud boundary) and is the motivating
specimen for this document.

Target design:

- **Close the passthrough first**: a method call on a prop whose type has no
  known lowering becomes a diagnostic (BF021 class; may stage through a
  warning if the accidental "mirror-method host type" contract turns out to
  have users).
- **Catalogue via the lowering-plugin registry**
  (`packages/jsx/src/lowering-registry.ts`) as a default-applied builtin —
  backend-neutral `LoweringNode` per catalogued method, rendered natively by
  each adapter. No per-adapter recognition branches.
- **Initial scope, deliberately narrow** (growing-only makes narrow cheap):
  UTC accessors (`getUTCFullYear`, …) and `toISOString`. Local-timezone
  accessors, locale formatting (`toLocaleDateString` — ICU-dependent), and
  `Invalid Date` are out of contract and diagnose accordingly.

## Current state

Much of the machinery already exists; the design above is a re-declaration
and extension of it, not a new system. Per component (same live-record
convention as `spec/adapter-architecture.md`):

| Component | Landed | Gap |
|-----------|--------|-----|
| Normative subset | `ParsedExpr` union + exhaustive adapter switches (drift-defence); array-method / sort-comparator catalogues; builtin lowering registry; BF021/BF101 loud-refusal policy + growing-only rule (`spec/compiler.md`); `/* @client */` escape | Pieces are scattered across spec/types/catalogues with no single normative declaration; `ParsedExpr` lacks `object-literal` (adapter-architecture Roadmap A); the boundary is not fully loud — the Date silent passthrough proves unknown-type method calls pass undiagnosed; the data-domain axiom exists only in this document |
| Canonical reference (JS render) | Hono/JS render is the *de facto* reference: snapshot generation renders expectations through it; `referenceAdapter`/`referenceRender` HTML-diff suite exists; determinism landed (#1494) | No *declaration* of canonical status (`referenceAdapter` is optional — the reference is still positioned as one adapter among eleven); oracle comparison runs at one evaluation point per fixture, not live × multiple data points |
| Shared conformance | `run-adapter-conformance.ts` single mandatory entry point ("forgot to wire the suite" is impossible); 182 fixtures + marker conformance + template primitives + render contract; real-backend execution with `normalizeHTML`; `props` injection; **the `dataPoints` oracle suite (roadmap 1)** — gate-ordered, live-oracle, JSON-domain-validated, piloted on `nullish-coalescing-text` (found #2248 — since fixed via nillable lowering + `bf_nullish` — and a Go harness string-escaping bug on its first run) | No type-derived adversarial value catalogue; no PR-vs-nightly tiering; adversarial points exist on one pilot fixture only |
| Declared skips | Typed skip sets (`skipJsx`, `skipTemplatePrimitives`, `skipMarkerConformance`, `expectedDiagnostics`, and now `skipDataPoints` — its first entries pinned #2248 on the Go adapter until the fix landed and removed them, completing one full ledger round-trip) with issue-link discipline; `known-limitation` label; `@barefootjs/compat` component×adapter compile matrix (`compat.lock.json`) | No generated `kind × axis × adapter` support matrix; no fixture frontmatter declaring exercised kinds/axes (so a coverage map has no denominator) |

Cross-cutting gap: the change-time coupling rule (subset extensions merge
only with fixtures in the same PR) is not yet written into any contribution
convention.

## Roadmap

1. **Schema + gate + live oracle** — `dataPoints` on `createFixture`, the
   gate-ordered suite in `run-adapter-conformance.ts`, JSON-domain values
   only. **Landed.** The pilot's first run validated the design: it
   surfaced a genuine `??` zero-value divergence on Go (#2248 — pinned via
   `skipDataPoints`, then fixed by the nillable `interface{}` lowering +
   `bf_nullish`, which removed the pins) and a Go render-harness
   string-escaping bug (fixed), while ERB / Jinja / Rust passed all points
   on real backends.
2. **Hand-written adversarial points** across existing fixtures, prioritized
   by the frontmatter/axis map as it lands.
3. **Type-derived value catalogue** from `TypeInfo`.
4. **Date**: passthrough closure, then the catalogue plugin (UTC + ISO
   scope), envelope transport in the harness.

Open questions:

- **IR baseline** (serialize `ParsedExpr`/IR per fixture as the one
  intensional pin, to separate Phase-1 regressions from Phase-2): deferred —
  value unproven until oracle conformance is in place.
- Passthrough closure severity (error vs staged warning): decide on evidence
  of in-the-wild reliance.

## Prior art

The design transplants, deliberately: test262's spec-anchored test metadata
and TC39's tests-before-stage-4 process; WinterTC's "spec = curated subset +
shared suite + per-runtime matrix" shape; TypeScript's lesson that a prose
spec drifts and dies while executable expectations survive; and the QuickJS
lesson (bugs test262 missed were found by differential testing) that an
enumerated suite's complement is only ever covered by an oracle.
