---
"@barefootjs/cli": patch
---

`bundleEntries` now keeps `@barefootjs/client`, `@barefootjs/client/runtime`, and `@barefootjs/client/reactive` external implicitly, so configs no longer have to repeat them per entry.

In a BarefootJS app these specifiers always resolve through the page's import map to the shared `barefoot.js` runtime that the compiled islands import — inlining them into a bundled entry would fork the reactive runtime (duplicate signals, #927). Previously these keys were only auto-applied when `externals` was non-empty; a `bundleEntries` entry in a project without vendor externals had to list them by hand or risk bundling a second runtime. They are now merged into every entry's external set (deduped with any configured `externals` and per-entry overrides). A `router-entry` bootstrap can be declared as simply `{ entry: 'client/router-entry.ts', outfile: 'router-entry.js' }`.
