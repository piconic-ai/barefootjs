---
"@barefootjs/cli": patch
---

Scaffold reproducibility: `@barefootjs/*` dependencies in generated `package.json` are now pinned to `^<CLI version>` at scaffold time instead of `"latest"`, and the Hono scaffold adds `wrangler` as a pinned devDependency invoked directly from `node_modules/.bin` (no more unpinned `npx wrangler` download on first `npm run dev`).
