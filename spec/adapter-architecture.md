# Adapter Architecture

Target architecture for BarefootJS SSR adapters, and the reference shape every
backend adapter (Go, Mojolicious, and future languages) should converge on.

> Status: **in progress.** This is the agreed target plus a live record of what
> has landed and what remains. It is adjusted as the work completes.

## Two principles

1. **The IR carries the semantics; adapters emit from it.** Element meaning,
   conditionals, loops, dependencies — and *parsed expressions* — are computed
   once in Phase 1 (the analyzer / `jsxToIR`) and stored in the IR. Adapters do
   **not** re-parse JS/TS strings or interpret them with regex at emit time.
2. **The adapter object holds state but minimal behaviour.** A backend adapter
   is a thin orchestrator that owns only per-compile state and implements the
   shared dispatcher interfaces. Real logic lives in pure free functions,
   extracted as far as possible.

These make a Go (or any) adapter a tractable reference implementation: a new
language adapter is "implement the dispatcher interfaces + a set of emit
functions," consuming the same IR.

## The two layers

```
┌─ Shared layer (@barefootjs/jsx) — Phase 1 ──────────────────────────────┐
│  analyzer → IR                                                          │
│   • element meaning, conditionals, loops, dependency/reactivity         │
│   • expressions parsed ONCE into ParsedExpr, stored on the IR           │
│   • dispatchers: emitParsedExpr / emitIRNode / emitAttrValue            │
└─────────────────────────────────────────────────────────────────────────┘
                          ↓ IR (with parsed trees)
┌─ Adapter layer (per backend) — Phase 2 ─────────────────────────────────┐
│  Adapter object = thin orchestrator                                      │
│   • implements ParsedExprEmitter / IRNodeEmitter / AttrValueEmitter      │
│     (the dispatcher contract — these MUST be methods on the object)      │
│   • holds CompileState (per-compile data) + options (config) only        │
│   • each method = dispatch + thin delegation                             │
│         ↓ delegates to                                                   │
│  Domain modules = pure free functions over an EmitContext                │
│   type-codegen / props-codegen / expr-lowering / memo-lowering /         │
│   value-lowering / node-rendering / analysis                            │
│         ↓                                                                │
│  lib/ = fully pure, stateless helpers                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

## The adapter object

| Layer | State | Behaviour |
|-------|-------|-----------|
| Object | per-compile `CompileState` + `options` only | minimal: dispatcher-interface impls + delegation |
| Domain modules | none (take `EmitContext`) | pure functions |
| `lib/` | none | pure functions |

**The `EmitContext` seam.** Extracted domain functions depend on a narrow
interface — the per-compile `state` plus the few recursive entry points they
need (`renderNode`, `convertExpressionToGo`, `convertConditionToGo`,
`parseLiteralExpression`, …) — **not** the concrete adapter class. The adapter
builds a private `emitCtx` over its own members and passes it down. So modules
are unit-testable against a stub, and the adapter's public type is unchanged.

The dispatcher-interface methods (`literal`, `member`, `arrayMethod`,
`emitElement`, `emitExpression`, …) stay on the object: the shared dispatchers
call them as `adapter.x(...)`. They should be thin — delegate to a domain
function.

## The rules (constitution)

1. **No expression parsing in adapters.** `parseExpression`,
   `ts.createSourceFile`, and regex-over-expression-strings are forbidden in
   adapter code. The IR supplies a `ParsedExpr`. (Extends the existing
   CLAUDE.md "never parse JS/TS with regex" rule.)
2. **Object methods are dispatch + thin delegation only.** Logic goes into a
   domain function that takes `EmitContext`.
3. **Per-compile mutable state lives in `CompileState`**, reset per
   `generate()`. Cross-compile registries are explicit; config is `options`.
4. **Domain modules depend on the `EmitContext` interface**, never the concrete
   adapter.
5. **Stateless helpers are pure functions in `lib/`.**
6. **Every change is byte-identical**, verified by the adapter unit suite and
   the adapter-tests conformance suite.

## Current state

Landed (Go adapter + shared layer):

- **State / helpers / seam** — `CompileState` consolidation; `lib/` pure
  helpers; the `EmitContext` seam (`emit-context.ts`) with the first clusters
  extracted (`analysis/component-tree`, `expr/helper-inline`, `expr/url-builder`).
- **IR carries parsed expressions** — the analyzer / `jsxToIR` attaches parsed
  trees, and the Go adapter reuses them instead of re-parsing:
  - `MemoInfo.parsed` — memo arrow bodies (replaced 9 regex shape-matches).
  - `IRExpression.parsed` — text interpolations.
  - `IRConditional.parsedCondition` / `IRIfStatement.parsedCondition`.
  - `ExpressionAttr.parsed` — intrinsic-element attribute expressions.

Go adapter, remaining toward the rules (snapshot):

| Metric | Now | Target |
|--------|-----|--------|
| `parseExpression` calls | 4 | 0 |
| `ts.createSourceFile` | 10 | 0 |
| regex `.match`/`.exec` | 17 | 0 |
| main file lines | ~7,600 | ~2,000 (orchestrator) |

## Remaining roadmap

**A. Finish IR-carries (drive parse/regex → 0).**
The remaining string fields are value-shaped (signal `initialValue`, local
`const` values), which are frequently **object/array literals**. `ParsedExpr`
models array literals but **not object literals** (its `kind` union has no
`object-literal`). So before signal/const values can be carried structurally:

1. **Extend `ParsedExpr` with an `object-literal` kind** (shared layer) — a
   cross-adapter change: every adapter's exhaustive `ParsedExpr` switch must
   handle it (the intended drift-defence). This unblocks:
2. `SignalInfo` parsed initial value → drop the signal-init value-lowering's
   `ts.createSourceFile` / regex.
3. `localConstants` parsed values → same.
4. Sweep the residual `ts.createSourceFile` / regex sites to 0.

**B. Finish the adapter decomposition (behaviour → pure functions).**
Mechanical, independent of A; each extraction goes through `EmitContext`:
`type-codegen`, `value-lowering`, `memo-lowering`, `spread-codegen`,
`props-codegen`, `array-lowering`. Node rendering (`renderElement` /
`renderLoop` / `renderComponent` / `renderAttributes`) stays as the
orchestrator core.

**C. Reference.** With A+B done, "a new language adapter" is: implement
`ParsedExprEmitter` / `IRNodeEmitter` / `AttrValueEmitter`, hold a
`CompileState`, and provide the emit functions. The Mojolicious adapter is the
first migration target (out of scope for the current effort).

## How to add a unit

Each unit is its own byte-identical, stacked PR:

1. Shared layer: attach the structured data to the IR in `jsxToIR`
   (best-effort, so a missed node falls back to adapter parsing — never a
   behavioural change). Parse from the **same** (type-stripped) string the
   adapter consumes, to avoid drift.
2. Adapter: thread the structured data in (e.g. an optional `preParsed` arg)
   and consume it where the string was parsed.
3. Verify byte-identical: adapter unit + adapter-tests conformance, plus
   `tsgo --noEmit` and `biome`.
