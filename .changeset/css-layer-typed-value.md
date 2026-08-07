---
"@barefootjs/jsx": patch
---

Fix `layer-:` CSS layer prefixing dropping classes from a referenced class
constant whose initializer carries TypeScript syntax (`as const`, a
`satisfies`/`Record<...>` annotation, …). `applyCssLayerPrefixToFile`
rewrote only `ConstantInfo.value`, but `preserveTypes` emitters (Hono)
prefer `ConstantInfo.typedValue ?? value` when emitting a module-scope
constant, so the type-carrying string it actually renders stayed
unprefixed. `typedValue` is now prefixed in lockstep with `value` wherever
a referenced constant is rewritten.
