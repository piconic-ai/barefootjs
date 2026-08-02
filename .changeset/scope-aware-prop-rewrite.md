---
"@barefootjs/jsx": patch
---

Close two loop/callback scope holes found by the #2482 name-resolution audit: `rewriteBarePropRefs` is now scope-aware (a nested callback parameter sharing a prop's name no longer produces the syntactically invalid `.map((_p.x) => …)` in the client bundle — discovery and application both carry a binding stack, so mixed expressions rewrite exactly the genuine outer references), and `tryResolveTemplateSpanFromConst` no longer folds a module/component const into a `${IDENT}` / `${IDENT[KEY]}` template span when the identifier is bound by an enclosing `.map()` callback (every row used to render from the frozen outer const).
