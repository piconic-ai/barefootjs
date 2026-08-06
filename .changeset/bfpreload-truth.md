---
"@barefootjs/hono": patch
"@barefootjs/vite": patch
---

Correct the documentation around `BfPreload` and the plugin manifest's `clientJs` omission

`@barefootjs/vite`'s manifest comment justified omitting `clientJs` with
"no backend reads it (grep the PHP/Python/Ruby runtimes: zero hits)" — a
grep scoped to native runtimes, when `@barefootjs/hono`'s `BfPreload` (not
a native runtime) does read `clientJs` from a caller-supplied manifest.
The omission stands; the justification now states its real scope and
points plugin-manifest consumers at the `preloadAssets` path.

`BfPreload`'s docs now say what silently failed before: `components`
entries must match manifest keys exactly (path-qualified like `ui/button`
for the legacy site build), a miss is skipped without error, and
`ManifestEntry.dependencies` has no current producer — the dependency
recursion only activates for hand-authored manifests.
