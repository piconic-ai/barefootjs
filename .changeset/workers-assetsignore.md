---
"@barefootjs/cli": minor
---

`bf build` now maintains a `.assetsignore` in `outDir` for Cloudflare Workers projects so `wrangler deploy` no longer uploads server/build-only outputs (SSR `.tsx` templates, `manifest.json`, `barefoot-externals.json`, `.bfemit.json`, `.buildcache.json`, `.dev/`) as public assets. It's only written when a wrangler config is detected next to `barefoot.config.ts`, and barefoot only owns a marked block — user entries are preserved across rebuilds.
