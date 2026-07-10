---
"@barefootjs/go-template": patch
---

Fix `nested-loop-triple-depth`'s render divergence — but the root cause was in the Go adapter's TEST HARNESS, not the adapter's actual codegen.

The divergence's own description ("Go loop-scope binding only reaches two levels deep") was incorrect. The Go template adapter's real loop-scope binding (`loopParamStack` in `go-template-adapter.ts`, and the corresponding `{{range $_, $var := .Field}}` nesting it emits) is a plain unbounded stack with no depth limit, and generates fully correct Go template code at any nesting depth — verified directly.

The actual bug lived in `packages/adapter-go-template/src/test-render.ts`, the conformance-test harness that bakes a fixture's runtime `props` into Go source for `go run`. `goMapLiteralFromObject`'s key capitalization used a naive first-letter-uppercase (`k.charAt(0).toUpperCase() + k.slice(1)`) instead of the Go-initialism-aware `capitalizeFieldName` the real adapter codegen uses everywhere else (`id` → `ID`, not `Id`). Since Go's `html/template` does a case-sensitive map/field lookup, a fixture keyed on `id` (as this one is: `tree.id`, `branch.id`, `leaf.id`) baked a literal keyed `"Id"` that the template's `{{.ID}}` lookup could never match — rendering every level's key AND text content empty, at ANY nesting depth (not specifically the third), which a from-scratch repro confirmed. It happened to surface first on this fixture, and happened to look depth-related, only because the sibling 2-level fixture's key field (`name`) isn't a Go initialism and so was capitalized identically either way.

Fixed the harness's naive capitalizer at all three call sites that had it (`goMapLiteralFromObject`'s nested-object-key path, `buildGoPropsInit`'s top-level prop-field path, and the rest-bag field-name path) to use `capitalizeFieldName`, already imported in the file and already used correctly by the neighboring `goStructLiteral`.

**No real end-user Go output is affected by this fix** — the actual `@barefootjs/go-template` compiler codegen (what a real project's `bf build` emits) was never wrong; only this package's own test-render harness's ad hoc runtime-prop injection mis-modeled the adapter's actual field-naming convention. `nested-loop-triple-depth` graduates from a render divergence to a passing render.
