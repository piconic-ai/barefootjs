---
"@barefootjs/client": patch
"@barefootjs/jsx": patch
---

Fix #2649: a third level of stateless composition (grandchild) used to reuse its parent's `bf-s` scope id instead of deriving its own, silently colliding with the parent's scope on CSR (`test_s0` reused instead of `test_s0_s0`, diverging from the SSR reference — #2444 had already fixed the sibling case). `renderChild` now pushes `_parentScopeId` to a child's own derived scope while that child's template evaluates, so a grandchild's scope is derived from the child, not the grandparent.

That push alone reopens a different bug for a `comment: true` synthesized wrapper (e.g. `<Flow renderNode={(n) => <Body id={n.id} />}>`, #1211): the wrapper's element IS its single real child's element, and its init used to resolve that child through `$c(scope, 's0')`'s self-match fallback — once the child's own first grandchild also derives a `bf-s` ending in the same slot suffix, the precise `$c` search matches the grandchild instead of falling through to self-match, silently misrouting `initChild` onto the wrong element (an early attempt at this fix broke `site/ui`'s xyflow Highlight-Depth demo). Fixed at its source: a `comment: true` component's own root-level child needs no `$c` lookup at all — it already IS `__scope`, and the client-JS codegen (`ClientJsContext.commentScopeRootSlotId`) now references `__scope` directly instead of re-deriving it through `$c`.

`grandchild-composition` graduates out of the CSR conformance skip set.
