---
"@barefootjs/jsx": patch
---

Fix #2741: `rewriteDestructuredPropsInExpr` (the reactive `createEffect` update path's destructured-prop rewrite) ran a bare `\b<prop>\b` regex over the whole expression text, so an object literal whose property KEY happened to share a destructured prop's name (`queryHref(base, { tag: tag, page: page ? page : '' })`) had the KEY rewritten too (`{ _p.tag: _p.tag, ... }`) — not valid JS, so the whole client module failed to parse. No diagnostic was raised; the invalid module was written out silently.

`rewriteDestructuredPropsInExpr` now delegates to `rewriteBarePropRefs` (`prop-rewrite.ts`) — the same AST walk the hydrate template lambda already used, which distinguishes a value reference from an object-literal key, a property-access name, a shorthand property, or a name shadowed by an inner binding (`items.map((tag) => tag.a)`). `applyScopedPropRefRewrite` and `applyRegexPropRefRewrite` (its unparseable-text fallback) gained an optional `replacementFor` override so the effect path's `(_p.x ?? <default>)` destructure-default wrapping stays call-site-specific without a second copy of the walk.

Graduates the `query-href` CSR-conformance skip entry (`packages/adapter-tests/src/csr-skip-set.ts`); the CSR test harness also gained a `queryHref` runtime mirror (`csr-render.ts`), a second, previously-masked gap the syntax error had hidden (the harness strips real imports and stubs each runtime helper a fixture's generated code calls, and `queryHref` had no stub yet).
