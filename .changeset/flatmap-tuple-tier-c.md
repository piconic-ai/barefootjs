---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
"@barefootjs/mojolicious": patch
---

Lower the array-literal (tuple) form of value-returning `Array.prototype.flatMap(fn)` to the template-language adapters (#1448 Tier C).

Building on the field-projection form (#1734), the array-literal projection now compiles:

- `arr.flatMap(i => [i.a, i.b])` — gather per-item fields into a flat list
- `arr.flatMap(i => [i, i.tags])` — mixed self / field leaves

Every array-literal element must be a `self` (`i`) or `field` (`i.field`) leaf. flatMap's one-level flatten removes only the array-literal wrapper, so each leaf is appended verbatim — an array-valued leaf is kept as a single element (not spread), matching JS `map(...).flat(1)`. A non-object element under a field leaf yields `undefined` / `nil`.

Richer callbacks — elements with arithmetic / computed or deep access / calls / literals, the spread (`[...xs]`) form, and the 2-arg `flatMap(fn, thisArg)` form — stay refused with BF101 and keep `/* @client */` as the escape hatch.

- Parser: `FlatMapOp.projection` gains a `tuple` variant (a list of `FlatMapLeaf`s); `extractFlatMapOpFromTS` classifies each array-literal element.
- Go: new `bf_flat_map_tuple` runtime helper (variadic `(kind, name)` leaf specs).
- Mojo: new `bf->flat_map_tuple` helper (one `[kind, key]` arrayref per leaf).

Conformance fixture `array-flatmap-tuple` pins byte-equal output across Hono/CSR, Go, and Mojo. This completes the `.flat` / `.flatMap` Tier C row.
