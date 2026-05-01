# Staged-IR Test Fixtures

Ground-truth tests for the staged-IR refactor (issue #1138).

Tests are organized by **stage transition** rather than by source issue, so the
matrix of "what scope did this expression originate in × what scope is it
emitted into" is exhaustively covered.

## Stages

| Code | Name      | When                        | Visible bindings                          |
|------|-----------|-----------------------------|--------------------------------------------|
| S0   | Compile   | `bun build` time            | `ts.Node`, IR, types                       |
| S1   | SSR       | request time (server)       | props, server-side imports                 |
| S2   | Hydrate   | client first render         | `_p`, init-locals, module imports          |
| S3   | Tick      | signal change               | signal getters, `_p`, init-locals          |
| S4   | Event     | DOM event handler invoke    | event arg, signal setters, init-locals     |

`Template (_p) => \`...\`` runs at S2 entry **with only `_p` and module-level
names visible** — init-locals from S2's init function are NOT in scope yet.
This is the boundary that produced #1127 / #1128 / #1132 / #1137.

## Files

- `01-template-scope.test.ts` — Template scope CANNOT see init-locals (#1127, #1128, #1137)
- `02-shadow-guards.test.ts` — Bare names that shadow props must not be rewritten (#1132)
- `03-modifier-preservation.test.ts` — Modifiers (async, generator) survive declaration-form rewrites (#1130)
- `04-type-stripping.test.ts` — TS-only constructs stripped at every nesting depth (#1131)
- `05-import-preservation.test.ts` — Imports referenced by emitted code must be kept (#1133)
- `06-multi-stage-soak.test.ts` — DeskCanvas-shape: every transition exercised in one component
- `09-asi-hazard.test.ts` — leading-`;` preserved on statements that risk ASI fusion (#1138)

Each file documents the stage transition it pins, so a future regression can be
diagnosed as "transition X → Y broken" rather than "issue #NNNN regressed".

## Current state (post P3 (3/N))

```
68 pass / 0 fail   (run: bun test src/__tests__/staged-ir/)
```

The 4 stage violations pinned by P0 are all closed by routing the
inline-classification decision through `relocate()`'s
`isInlinableInTemplate`. The fix is one canonical predicate, not a
per-pass discriminator stack — the failure mode #1138 was filed
against (different rewrite passes carrying private models of "which
scope does this name belong to") is gone.

Concretely:

- `compute-inlinability.ts` now asks `isInlinableInTemplate(value,
  env)` for every constant. The function combines (a) bridge
  feasibility (relocate's `ok` flag) and (b) call-purity safety
  (`hasCallWithBridgedArg` AST walk + zero-arg-call rejection).
- `emit-registration.ts/buildCsrInlinableConstants` consults the
  same predicate for its CSR re-promotion path. The legacy
  hand-rolled regex gates (`\bprops\b(?!\.)`) are gone.
- `index.ts/needsClientJs` consults the predicate too — a constant
  that's not inlinable AT ALL needs init scope so the const
  declaration survives and `collectExternalImports` picks up its
  module dependencies (#1133).
- `index.ts/generateTemplateOnlyMount` calls `collectExternalImports`
  alongside the runtime helper detection. Independent bug fix
  preserved from the surgical attempt; relocate doesn't apply here.
