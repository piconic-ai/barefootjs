---
"@barefootjs/router": minor
---

Module-aware swap: load a navigated-to island's JS before hydrating it. The router now collects the `<script type="module" src>` tags from a navigation response (BfScripts) and imports the ones not already loaded (deduped across navigations) before re-hydrating the outlet — so an island whose module wasn't on the first page actually comes alive after navigation instead of staying inert. A `loadModule` option overrides the default `(src) => import(src)`.
