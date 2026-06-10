---
"@barefootjs/cli": minor
"create-barefootjs": minor
---

Add a `--css none` (bring your own CSS) option to `bf init` / `create-barefootjs`. Selecting it (via the interactive prompt or `--css none`) opts out of the UnoCSS + UI-registry layer across every adapter: no registry probe/fetch, no `uno.config.ts` or stylesheets, no `unocss` in the package.json scripts/devDeps, and a dependency-free starter `Counter` built from native `<button>` elements. The default `unocss` path is unchanged.
