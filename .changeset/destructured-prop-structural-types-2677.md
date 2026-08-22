---
"@barefootjs/jsx": patch
"@barefootjs/go-template": patch
---

Analyzer resolves structural (array/object) types for destructured-parameter props, closing a `unknown`-degradation asymmetry with the `props`-object form (#2677)

`collectMemberTypes` (`packages/jsx/src/analyzer.ts`) gated every destructured-parameter member's `TypeInfo` through a primitives-plus-catalogued-rich-types-only predicate — anything else, including a perfectly well-formed inline array or object type, degraded to `kind: 'unknown'`. That gate was `#2150`'s fix for a real problem (a non-primitive `TypeInfo` used to mean a typed adapter would emit an unchecked scalar assertion that panics for a shape the template layer had no representation for), but the reasoning went stale for structural types once `#2674`/`#2676` taught go-template's `emitSynthPropStructs` to synthesize a real, json-tagged Go struct for any anonymous object type reachable through `ir.metadata.propsParams[].type` — array-element positions included. The gate itself was never widened to match, so the exact same declared type resolved differently depending on parameter syntax:

```tsx
function TagList(props: { items: { id: string; tags: string[] }[] }) { ... }        // resolved fully
function TagList({ items }: { items: { id: string; tags: string[] }[] }) { ... }    // degraded to unknown
```

The gate (renamed `isResolvableMemberType`, still living in `analyzer.ts`) now also admits `kind: 'array'` (with a resolvable element type) and `kind: 'object'` (with every property resolvable), recursively — matching the full recursive shape `typeNodeToTypeInfo` already builds. It still declines a union, a function, and an un-catalogued named type (`Map`, `Set`, a local type alias) reached ANYWHERE inside the structure — declining the WHOLE member, not just the offending leaf, since this is an all-or-nothing gate and per-field graceful degradation (`interface{}` for what a typed adapter can't represent) is `typeInfoToGo`'s job downstream, not this gate's.

**go-template**: the widened `propsParams[].type` is exactly the input `emitSynthPropStructs`'s "walk root 2" (every props param's own `TypeInfo` tree) already consumes — no adapter code changed. A destructured array-of-object or plain-object prop now synthesizes the same named, json-tagged struct the `props`-object form already got, replacing the historical `interface{}` / PascalCase-keyed `map[string]interface{}` fallback. Fixes the silent `bf-p` hydration-payload casing divergence measured in `#2677` (destructured `{ users }: { users: { name: string }[] }` shipped `{"users":[{"Name":"Ada"}]}` instead of the reference `{"users":[{"name":"Ada"}]}`) for `array-map-value-field`, `array-flatmap-tuple`, and `flatmap-expression-body`, plus every other destructured-parameter fixture with an array/object-typed prop across the corpus (`array-flat`, `array-flat-depth`, `array-flat-infinity`, `array-flatmap-self`, `array-flat-dynamic-depth`, and more) — those previously fell to `interface{}`-backed `[]any`/`map[string]interface{}` and now bake through the typed struct/slice path instead.

Also fixes a latent test-harness-only bug the widening surfaced: `test-render.ts`'s `buildGoPropsInit` convenience literal-builder (used only to seed the Go conformance harness's `main.go`, not shipped as part of the adapter) didn't recurse into a doubly-nested array VALUE when baking a typed slice literal, so a newly-concrete `[][]int` field (`{ rows }: { rows: number[][] }`, previously `interface{}`) received an untyped `[]any{…}` inner literal and failed to compile. `goTypedSliceLiteralFromArray` now recurses with the inner element type for a nested-array value, matching what the production adapter's own `typeInfoToGo` already did correctly.

Every other adapter (Hono, ERB, Jinja, Twig, Xslate, Blade, Mojolicious, Rust/minijinja) was verified to emit byte-identical output for every fixture in the corpus — none of them key adapter behavior off a destructured prop's `TypeInfo` kind beyond primitive-vs-not, so the widened structural cases pass through unchanged.

New conformance fixture `destructured-object-prop-nested` covers the shapes `#2676`'s three array-of-object fixtures didn't: a destructured prop that is itself a plain (non-array-wrapped) object type, with a nested array-of-primitives property and a nested object property, both newly resolvable.
