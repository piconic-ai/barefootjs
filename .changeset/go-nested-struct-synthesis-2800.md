---
"@barefootjs/go-template": patch
---

Fix #2800: a signal seeded from an untyped array-of-objects literal only synthesized a Go struct when every property was scalar (`synthesizeStructFromSignal`) — a property that was itself an array of object literals (`children: [{ id: 10, label: 'Alpha-child' }]`) made the whole synthesis bail, so the signal baked to `nil` and the nested loop over it (`row.children.map(...)`) read a Go zero value on real Go instead of the seeded rows.

`synthesizeStructFromSignal` is now a thin validation wrapper around a new recursive `synthesizeStructsFromElements`, which classifies each property across all rows as scalar or nested-array-of-objects, recurses on the flat concatenation of a nested-array property's elements to synthesize that level's struct first, and returns the full nested-first list of structs (each pushed through the same `registerSynthStruct` door #2674 uses for anonymous-object synthesis) — so `structPropertyType` (`parsed-literal-to-go.ts`) can resolve a nested array field's declared element type and `parsedLiteralToGo` bakes it as a properly-typed nested slice literal instead of deferring. Recursion has no depth limit; a shape inconsistency at any level (mixed scalar/nested-array across rows, a differing key set, an empty array) still bails the WHOLE synthesis to `nil`, same as before — partial synthesis buys nothing since `parsedLiteralToGo`'s array branch already defers the entire array on any one element's failure.

Graduates the `nested-loop-ref-const` render-divergence pin.
