---
"@barefootjs/hono": minor
---

`@barefootjs/hono/vite`, and `HonoAdapter` accepts `AdapterGenerateOptions.scriptAssets`

Hono was the one adapter PR01's `scriptAssets` rollout skipped: its
`generate()` ignores every script-related `AdapterGenerateOptions` field
outright, because script URLs are resolved at REQUEST time, not codegen
time — `build.ts`'s `addScriptCollection` post-processes the whole
compiled file with a regex/paren-counting rewrite to inject a
request-context script collector (`useRequestContext().set('bfCollectedScripts', …)`),
and the runtime `BfScripts` component renders the collected tags at body
end (necessary for Suspense/streaming — a script tag emitted inline at a
component's own position would ship before that component's siblings
finish streaming).

That collector pattern turns out to be exactly what `GoTemplateAdapter`
already does with `scriptAssets` — `.Scripts.Register "…"` calls, collected
into a request/render-scoped set and flushed together — just expressed as
Go template directives instead of TS statements. So `scriptAssets` fits
Hono after all, expressed as CODEGEN instead of a post-hoc file rewrite:

- `HonoAdapter.generate()` now bakes `registerComponentScripts([...urls])`
  as the first statement of a resolved component's function body when
  `options.scriptAssets` is non-empty, and wraps every `return (...)` the
  function can reach (including both branches of an if-statement early
  return) with `wrapWithInlineScripts(..., __bfInlineScripts)` — two new
  exports from `@barefootjs/hono/scripts` that replace `addScriptCollection`'s
  injected `__bfWrap` helper and try/catch block with one shared,
  non-duplicated function pair. `undefined` (the legacy `bf build` +
  `transformMarkedTemplate` path) and `[]` (resolved, but nothing to
  register) both emit no scriptAssets-driven codegen at all — purely
  additive, existing `createConfig`/`addScriptCollection` callers keep
  byte-identical output.
- Under Vite, `scriptAssets` never includes a separate `barefoot.js`
  runtime registration: the `@barefootjs/client` runtime arrives as a
  shared ESM chunk the resolved entry already imports, which the browser
  follows on its own.

## `@barefootjs/hono/vite`

A new subpath exporting `barefoot` (named AND default, matching core's own
`packages/vite/src/index.ts` and `@barefootjs/go-template/vite`'s shape):

```ts
import { barefoot } from '@barefootjs/hono/vite'

export default defineConfig({
  base: '/static/components/',
  build: { outDir: 'dist/static/components' },
  plugins: barefoot({
    components: ['src/components'],
    templates: 'dist/components',
  }),
})
```

No `adapter` option — this constructs `HonoAdapter` itself. Unlike
`@barefootjs/go-template/vite`, this needs no `afterEmit`-driven
combination step: Hono's SSR marked template is already a complete,
self-contained `.tsx` file (its own imports, types inlined) that
wrangler/bun's own bundler compiles directly, with nothing across files to
stitch together the way Go's `components.go` needs.

It DOES need the same `assets` (+ `assetsOutputFile`, default
`dist/bf-assets.ts`) option as `@barefootjs/go-template/vite`, for the same
reason: a hand-written, non-component script entry (`integrations/hono`'s
`client/router-entry.ts`, booting `@barefootjs/router`) isn't a `.tsx`
component, so core's discovery/`scriptAssets` machinery never sees it, but
a plain `.tsx` SSR file still needs its bundled URL. Generates a small TS
module (`export const Assets: Record<string, string> = {...}`) the SSR
file `import`s — the TypeScript analogue of `@barefootjs/go-template/vite`'s
generated `bf_assets.go`.

## `integrations/hono` migrated to Vite (first JS-backed proof)

The first JS-backed BarefootJS app on `@barefootjs/vite` — gin (previous
PR) proved the design against a non-JS backend; this is the opposite case,
where the SSR runtime and the client runtime are the SAME language and
COULD share a module instance by accident if the design's "single ESM
import graph" claim were wrong.

Two hand-rolled workarounds this migration set out to verify are deletable
turned out to split one-for-one and one-for-none:

- **The `@barefootjs/client*` → `barefoot.js` import map** (`renderer.tsx`
  AND `blog.tsx` each had their own copy) is DELETED, matching gin's
  `blog.go` result: Rollup folds every bundled entry's `@barefootjs/client*`
  import into one shared chunk, so the browser needs no specifier
  redirection to get a single reactive runtime instance. Proven the same
  way gin's was — by deleting it and keeping the E2E suite green.
- **`BfDevReload` / the `/_bf/reload` SSE endpoint is KEPT, not deleted.**
  It does not overlap with Vite's own dev websocket: `vite dev` and
  `wrangler dev` are two independent processes. Vite's socket only signals
  "a CLIENT bundle changed" (the URLs baked into a page via
  `registerComponentScripts`); it has no visibility into wrangler
  restarting the Worker isolate for a SERVER-side `.tsx` edit. The SSE
  boot-id reconnection protocol is what detects THAT half, which nothing
  in this design replaces.

`vite.config.ts` replaces the `build`/`build:watch` scripts (matching
`integrations/gin`, `barefoot.config.ts` itself stays, unused, until PR07
removes the legacy CLI). `scripts/assemble-public.ts` (Cloudflare Workers
Assets) is updated for the new split layout: `templates: 'dist/components'`
(unchanged — `tsconfig.json`'s `@/components/*` alias still points there)
versus `build.outDir: 'dist/static/components'` (Vite's hashed client
output, now copied recursively since Vite nests output under its own
`assets/` subdirectory, unlike the legacy CLI's flat layout).
`integrations/hono`'s Playwright E2E suite passes end-to-end against the
migrated build.
