---
"@barefootjs/vite": minor
---

Export `discoverComponents` (+ `DiscoveredComponent`), and migrate five more integrations onto the existing `/vite` packages

This PR answers the question the two `/vite` packages (`@barefootjs/go-
template/vite` from a prior PR, `@barefootjs/hono/vite` from the PR after
it) were left with: do they generalise to integrations they weren't built
against, or were they shaped around the one integration each already
migrated onto them? Five more integrations move onto those SAME two
packages, unmodified except for the one export below — `integrations/chi`,
`integrations/echo`, `integrations/nethttp` onto `@barefootjs/go-template/
vite`, and `integrations/h3`, `integrations/elysia` onto `@barefootjs/hono/
vite`.

## The three Go integrations generalised with zero surprises

`integrations/chi`, `integrations/echo`, `integrations/nethttp` are
structurally near-identical to `integrations/gin` (same shared components,
same hand-rolled `blogImportMap()` + hardcoded `.../static/client/router-
entry.js`, same `bundleEntries`/`clientJsBasePath` shape in
`barefoot.config.ts`). Each migration is the mechanical application of
gin's own migration: `vite.config.ts` replacing `barefoot.config.ts` for
`build`/`build:watch`, `assets: { RouterEntry: routerEntry }` resolving the
router bootstrap's hashed URL into a generated `bf_assets.go`, the import
map deleted outright (not updated) because the runtime is a shared ESM
chunk every island and the router bundle import normally. `echo`'s
`ParseGlob("dist/templates/*.tmpl")` (flat, not `chi`/`nethttp`'s recursive
`filepath.WalkDir`) needed no plugin change either — the plugin's per-
component-dir-relative output already lands templates flat for a
single-level `components` dir, which is what all three have. No per-
integration special case was needed anywhere in this half.

## h3 and Elysia needed one real generalisation: the `assets` map, scaled up

`integrations/hono`'s migration relies on `HonoAdapter.generate()` baking
`registerComponentScripts(...)` calls into each compiled component, which
read a per-request script collector off Hono's `jsxRenderer` request
context (`useRequestContext()`). h3 and Elysia host the SAME compiled hono/
jsx components but have NO Hono request context at all (`renderToHtml` is
a bare `.toString()` — see `@barefootjs/hono/render`'s docstring) —
`useRequestContext()` throws, the codegen'd calls swallow that and register
nothing, so that mechanism silently no-ops for both. Pre-Vite, both
integrations instead read a static `dist/components/manifest.json` and
emitted a `<script>` for EVERY entry in it, unconditionally, on every page
(`BfImportMap`/`BfScripts` from `@barefootjs/hono/app`) — there being no
per-request collector to be selective with in the first place.

Under Vite there is no such flat, unhashed manifest to read. The fix reuses
the exact `assets` option `@barefootjs/go-template/vite`/`@barefootjs/hono/
vite` already expose for a single hand-written entry (gin's/hono's own
`router-entry.ts`) — just fed the FULL set of discovered `'use client'`
components instead of one hand-picked path, keyed by component name. That
full set has to come from a real component scan, not a hand-maintained
list (missing an entry — e.g. `PostArticle`'s nested `LikeButton`/
`ReadingTimer` — would silently ship a page with a dead island). Core's own
`barefoot()` plugin already runs exactly that scan internally to seed
`build.rollupOptions.input`, but had no way to hand the result to a
composed plugin — so `discoverComponents` (`packages/vite/src/discover.ts`)
is now exported publicly, reused by each integration's own `vite.config.ts`
to build its `assets` map, rather than re-walking `components` dirs with
ad hoc logic (the same "reuse or port it, don't reinvent" rule this
module's own docstring already invokes for `resolveScriptAssets` et al.).
`renderer.tsx`/`blog.tsx` in both integrations replace `BfImportMap` +
`BfScripts(manifest, base)` with a small `<ComponentScripts>` that maps the
generated `Assets` record to `<script>` tags — same "every component,
unconditionally" behavior as before, now content-hashed and Vite-bundled.

No change to `@barefootjs/hono`'s adapter code was needed or made: this is
purely an app-level (`vite.config.ts` + `renderer.tsx`/`blog.tsx`) fix,
using `HonoAdapter.generate()`'s existing (and, for these two integrations,
inert) `scriptAssets` codegen exactly as-is.

## Also verified deletable, same as gin/hono

Both h3 and Elysia had their own copy of the `@barefootjs/client*` →
`barefoot.js` import map (`renderer.tsx` AND `blog.tsx` each carried one) —
deleted outright, not updated. Rollup folds every bundled entry's
`@barefootjs/client*` import into one shared chunk regardless of which of
the ~20 discovered components pulled it in first, so the browser needs no
specifier redirection for a single reactive runtime instance — the same
conclusion gin and Hono already proved, now confirmed a third and fourth
time on hosts with no Hono request context at all.

## Result

All five integrations' Playwright E2E suites pass end-to-end against their
migrated builds (chi/echo/nethttp: 104 tests each; h3/Elysia: 58 tests
each, including the `@barefootjs/router` blog suite exercising the new
`<ComponentScripts>` + `Assets.RouterEntry` path), each run twice for
stability. `barefoot.config.ts` stays, unused, in every integration until a
later PR removes the legacy CLI outright.
