---
"@barefootjs/cli": patch
---

Remove the internal `resolve-imports.ts` inliner (and its tests). Its only
remaining callers were `site/ui/build.ts` and `site/core/build.ts`, which
now build through `@barefootjs/vite` — Rollup owns import resolution,
bundling, and dedup for client JS, so the CLI-side inliner is dead code.
No published CLI surface changes.
