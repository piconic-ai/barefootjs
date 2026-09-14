---
"@barefootjs/go-template": patch
---

Fixes #2984: a client component importing both a child component and the child's own object-shaped prop type — then using that imported type as `createSignal<T>`'s type argument and passing the called getter to the child — compiled clean, but the generated parent lost the signal's Go type: `Data interface{}` seeded to `nil`, and the nested child was constructed with `Data: nil`, crashing on any field access (`nil pointer evaluating interface {}.Items`).

Root cause: `typeInfoToGo`'s named-type ('interface') case only resolves a type name against `state.localStructFields`/`localTypeAliases`, which `buildLocalTypeTables` populates from `ir.metadata.typeDefinitions` — the CONSUMER file's own type declarations. A type the consumer only imports (never declares), like a child component's own exported prop-shape type, was never in that list and fell to the `interface{}`/`nil` external-reference fallback regardless of how many other components' shapes had already registered against the adapter (`registerChildComponentShape`).

`GoTemplateAdapter` now keeps a small cross-file type registry (`crossFileTypeAliases` / `crossFileStructFields` / `crossFileTypeDefinitions`), populated as a side effect of `buildLocalTypeTables` for every component compiled so far in the build. When a consumer's own type table can't resolve a name locally, `buildLocalTypeTables` now also checks whether a RELATIVE import brought in a type another already-compiled component (most often a child component module, compiled first per the existing `registerChildComponentShape` ordering) registered under that name, and if so resolves the field to the real backed Go type instead of the external-reference fallback.
