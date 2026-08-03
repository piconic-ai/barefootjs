---
"@barefootjs/vite": patch
---

Fix `rewriteRelativeImport` re-anchoring for a `components` dir outside the Vite root

`plugin.ts`'s `rewriterFor` guessed a compiled component's on-disk output
path using a ROOT-relative path (`toPosixRelative(resolvedConfig.root,
absPath)`), but `planEmits` (the code that actually decides where a
template lands) mirrors it relative to WHICHEVER configured `components`
dir contains it (`relativeUnderComponentDir`) — the same helper
`safeRollupEntryName` already uses for the analogous Rollup-entry-naming
problem. The two guesses coincide only when every configured `components`
dir IS the Vite root; this repo's real layouts commonly configure a
`components` dir that's a SIBLING of root instead (e.g.
`integrations/hono`'s `../shared/blog`), where `planEmits` flattens the
file directly under `templatesDir` with no extra path segment preserved.

The root-relative guess computed a phantom nested output path for such a
file, corrupting the relative-import rewrite for any file it shares a
directory with: a source-correct `import { Sidekick } from './Sidekick'`
came out re-anchored to a broken `../shared/blog/Sidekick`-shaped
specifier that doesn't resolve once both files land flat under
`templatesDir`.

Only exercised by an adapter whose templates carry real `import` syntax
(Hono-shaped JS-runtime adapters — Go/Mojo/etc. templates have no import
syntax and never call this at all), which is why it went uncaught through
PR01-04: none of those PRs' fixtures had a JS-runtime adapter's client
component importing a same-directory sibling from a non-root `components`
dir. First caught building `integrations/hono`'s real Vite migration
(`PageShell.tsx` → `./ReaderToolbar` in `../shared/blog`).
