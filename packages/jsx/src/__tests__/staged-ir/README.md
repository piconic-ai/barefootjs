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

Each file documents the stage transition it pins, so a future regression can be
diagnosed as "transition X → Y broken" rather than "issue #NNNN regressed".

## Current state (post P3 (3/N))

```
68 pass / 0 fail   (run: bun test src/__tests__/staged-ir/)
```

The 4 stage violations pinned by P0 are all fixed:

1. `05/relative import used in init body survives compile` — when an
   init-local is inlined into template, the import the inlined call
   needs is dropped because import-collection runs against the (now
   empty) init body.
2. `05/multiple imports from same source are bundled` — same shape.
3. `06/init-locals do NOT leak into template body` — `useYjs(...)`
   call is inlined into template body alongside the dropped import.
4. `06/createMemo getter is referenced, body NOT inlined` — memo body
   is recursively inlined; the closure deps it captured (`items()`)
   end up as their initial values (`[]`) in template scope, losing
   reactivity.

All four were the same root: rewrite passes and the import pass each
held a private model of "which scope does this name belong to". The
fix landed in P3 (3/N) via three small surgical changes:

1. `buildCsrInlinableConstants` rejects values that reference props in
   any form (`props` OR `props.X`), not just bare `props`. Stops
   `useYjs(props.x)` and similar from re-inflating into template scope
   after the analyzer marked the const unsafe.
2. `needsClientJs` returns true when any local constant's value calls
   into a non-declared name (i.e. depends on a module import). Such
   components need a real init body so the const declaration survives
   and `collectExternalImports` can pick up the dependency.
3. `generateTemplateOnlyMount` now also calls `collectExternalImports`,
   matching what `generateInitFunction` already did. Catches user
   imports referenced from inlined template bodies.

The recursive-visibility approach the design originally proposed is
not needed at this layer — the simpler per-pass corrections close the
4 cases without changing IR shape. Larger relocate()-driven refactors
remain available for P4–P6.
