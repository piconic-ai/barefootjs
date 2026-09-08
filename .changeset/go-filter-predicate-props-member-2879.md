---
"@barefootjs/go-template": patch
---

Fix #2879: a `.filter()`/`.find()`/etc. predicate reading a bare-props-form prop DIRECTLY as a member access (`props.hiddenId`, no local destructure) compiled to a Go template that panicked at render time (`can't evaluate field Props in type ...`) instead of rendering. `renderFilterExprNode`'s `member` arm had no `propsObjectName` branch — unlike its sibling `renderConditionExpr`, which already flattens `props.x` onto the correct root-scope field — so `props.hiddenId` fell through to the generic "nested member access" recursion, which rendered `props` itself as an ordinary root-scope identifier (`$.Props`) and appended `.HiddenId`, reaching for a field the flattened Props struct never has (the real field is `$.HiddenId`).

Fixed by mirroring `renderConditionExpr`'s `propsObjectName` branch in `renderFilterExprNode`'s `member` arm. Also extracted a shared `filterRootFieldRef` helper (the unconditional-`$.`-prefix + alias-resolution pattern already duplicated three times in this method for the `identifier`/signal/`call` cases, #2857) so the new branch reuses it rather than adding a fourth copy.

The same gap exists in every other DSL adapter's filter `member()` emitter (mojolicious, erb, jinja, twig, blade, xslate, rust) — tracked separately as #2886 and pinned per-adapter in each `render-divergences.ts` against the new shared `filter-predicate-props-member` conformance fixture.
