---
"@barefootjs/cli": patch
---

Ignore `public/.dev/` in the Hono scaffold's generated `.gitignore`. The `--watch` dev-reload sentinel (`public/.dev/build-id`, written by `bf build --watch` after every successful rebuild) is build output, not source. Every other adapter ignores its `dist/` outDir wholesale, so their `.dev/` is already covered; Hono's outDir *is* the committed `public/`, so it names generated children (`public/components/`, `public/.buildcache.json`, `public/.bfemit.json`) explicitly and was missing the sentinel — leaving new scaffolds staging `public/.dev/build-id` on their first `git add`.
