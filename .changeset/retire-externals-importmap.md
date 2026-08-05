---
"@barefootjs/jsx": minor
"@barefootjs/router": minor
"@barefootjs/hono": minor
"@barefootjs/blade": minor
"@barefootjs/erb": minor
"@barefootjs/go-template": minor
"@barefootjs/jinja": minor
"@barefootjs/mojolicious": minor
"@barefootjs/rust": minor
"@barefootjs/twig": minor
"@barefootjs/xslate": minor
---

Remove the externals-importmap subsystem — `renderImportMapHtml`, `BfImportMap`, `TemplateAdapter.importMapInjection`

`BfImportMap`'s built-in default mapped `@barefootjs/client` to
`<base>/barefoot.js`. After the Vite migration no `barefoot.js` exists in
any build output — the runtime is a content-hashed shared ESM chunk — so
the component's default output pointed at a URL that never existed. It had
zero production callers, and `renderImportMapHtml` had exactly one caller
(`BfImportMap`) besides its own contract test. Every importmap the repo
actually emits (`site/core/renderer.tsx`, `site/ui/renderer.tsx`, the CSR
and xyflow docs examples) is, and always was, hand-written — this subsystem
was dead weight pointing at broken output.

This is a **breaking** change, bumped as a MINOR, not a major: BarefootJS is
pre-1.0 (0.31.x), where a minor is the breaking-change slot under semver's
§4, and 1.0 is a stability commitment this release does not make.

## Removed

- **`@barefootjs/jsx`**: `renderImportMapHtml`, `ImportMapManifest`,
  `ExternalsManifest`, and the `./import-map` export subpath.
  `TemplateAdapter.importMapInjection`.
- **`@barefootjs/hono`**: `BfImportMap` and `BfImportMapProps` from
  `@barefootjs/hono/app`. `BfScripts` and `BfDevReload` are unaffected.
- **`importMapInjection` declarations** on every adapter that had one:
  blade, erb, go-template, hono, jinja, mojolicious, rust, twig, xslate.
  None of them read the field — only the adapter-tests contract test
  (also removed) did.

## Corrected alongside it

`@barefootjs/router`'s `defaultRehydrate` / `defaultDispose` keep
`'@barefootjs/client/runtime'` in a *variable* so bundlers cannot resolve it —
that is what keeps the client runtime an optional peer for a static-shell
site. The comment there said the browser resolves it "through the page's
import map", and the error message told users to make sure the runtime was
"mapped in the page's import map". Neither is actionable: nothing emits such
a map, and `BfImportMap` would have mapped that specifier to
`<base>/barefoot.js`, which does not exist. The fallback is unreachable in a
correctly-wired app anyway — `setupStreaming()` installs the
`__bf_hydrate_within` / `__bf_dispose_within` seams the code checks first.
The message now names that call instead.

## What to do instead

An app that deliberately externalizes a dependency
(`build.rollupOptions.external`) and loads it from a CDN hand-writes its
own `<script type="importmap">`, the same way every importmap this repo
actually ships already does. See `docs/core/advanced/xyflow-browser-bundle.md`
for a worked example, including the two correctness rules that used to live
only in the deleted `renderImportMapHtml` (escaping `<` inside the importmap
JSON; `crossorigin` on a cross-origin `modulepreload`) — both now documented
there, where the hand-written pattern is actually taught.
