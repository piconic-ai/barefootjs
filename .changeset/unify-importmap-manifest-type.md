---
"@barefootjs/jsx": patch
"@barefootjs/hono": minor
---

Unify the importmap manifest type across the component and snippet paths.

Both importmap injection paths now describe `barefoot-externals.json` with one
type. `@barefootjs/jsx` exports a shared `ImportMapManifest` (the optional-field
subset the renderer needs); `renderImportMapHtml` takes it, and the strict build
output `ExternalsManifest` remains its all-required superset.

**Breaking (`@barefootjs/hono`):** the `BarefootExternalsManifest` type export is
removed. Type a `BfImportMap` `externals` prop with `ImportMapManifest` from
`@barefootjs/jsx` instead (the runtime prop shape is unchanged, so importing the
parsed `barefoot-externals.json` and passing it through still works).
