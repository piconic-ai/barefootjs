---
"@barefootjs/go-template": patch
---

Fix the record-member sibling of #2236's bare-identifier gap, found by the new `loop-param-shadows-record-const` conformance fixture: `resolveStaticRecordLiteralIndex` (the fast path resolving `IDENT['key']` / `IDENT.key` against a module-scope object-literal const, e.g. the icon registry's `strokePaths['chevron-down']`) had no loop-shadowing guard, so `rows.map((cfg) => cfg.x)` under a module `const cfg = { x: 'outer-lit' }` baked `outer-lit` into every iteration of the SSR template. The guard is the same scope-precise check the bare-identifier fast path got in #2236 (now factored into a shared `isLoopShadowedName`, including the `loopBindingStack` scan for destructured callbacks); the shadowed occurrence falls through to the generic lowering and resolves the member through the loop binding (`{{.X}}`). Non-shadowed module record lookups are unchanged.
