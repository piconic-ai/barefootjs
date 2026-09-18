---
"@barefootjs/jsx": patch
---

A keyed leaf inside a complex `.flatMap()` body (statements before the `return`) now renders its reconciliation attribute on the server too: the branded SSR body rewrites each leaf's `key={…}` to `data-key={String(…)}`, and the client string templates (hydrate template, CSR descriptor, module-scope template) render the same attribute, escaped like any other. Previously a JSX runtime dropped `key` from the SSR HTML while `mapArray` stamped `data-key` on every row it adopted, so hydration changed the DOM on exactly the attribute reconciliation keys on (the `tag-cloud` browser-oracle divergence).
