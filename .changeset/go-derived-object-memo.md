---
"@barefootjs/go-template": minor
---

Compute object-returning `searchParams()` memos for SSR instead of emitting a nil map (PostList derived-state blocker, #1897 follow-up — Capability A).

A block-body memo of the shape `() => { const sp = searchParams(); return { sort: asSortKey(sp.get('sort')), tag: sp.get('tag') ?? '' } }` previously fell through every memo pattern and was initialized to `nil` in `NewXxxProps`, so the template's `.Params.Sort` / `.Params.Tag` accesses read a nil map. The adapter now lowers the object's values to Go in the constructor context and emits a computed `map[string]interface{}` with capitalized keys (matching the template's field access). The lowerer supports the narrow surface these memos use: `<sp>.get('k')` → `in.SearchParams.Get("k")`, `<arr>.includes(<x>)` → `bf.Includes([]string{…}, <x>)`, module arrow-helper inlining (e.g. `asSortKey`), `<expr> ?? ''`, and string ternaries. Unsupported shapes still fall back to `nil`, so nothing regresses.
