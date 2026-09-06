---
"@barefootjs/jsx": patch
---

Fix #2828: `collectAstPropRefs` now discovers a destructured prop referenced only via object-literal shorthand (`{ page }`), not just an explicit `key: value` pair. Previously the shorthand form was skipped entirely during discovery, so `rewriteBarePropRefs` found zero prop references and never rewrote the expression — e.g. a reactive `queryHref(base, { tag, page })` attribute spliced the bare shorthand names into the hydrate template lambda's module scope, a `ReferenceError` at hydrate time.
