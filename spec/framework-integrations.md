# Framework Integrations (TypeScript hosts)

How BarefootJS runs under multiple TypeScript HTTP frameworks (Hono, h3,
Elysia, …) while reusing a single render runtime — and the architecture
that keeps that reuse honest.

## Two layers: render runtime vs HTTP host

BarefootJS already separates these two concerns for the Go stack, and the
TypeScript stack mirrors it:

| Layer | Responsibility | Go example | TS example |
|---|---|---|---|
| **Render runtime** (adapter output + its runtime) | Turn a compiled component into HTML + collect the hydration `<script>`s | `go-template` adapter ships the framework-agnostic `bf` Go module (`Renderer`, `ScriptCollector`, `RenderContext`) | `@barefootjs/hono` ships the `hono/jsx` engine + `renderToHtml` + manifest-based `BfScripts` |
| **HTTP host** (integration) | Routing, static files, sessions, streaming transport | `integrations/echo` (imports `bf` + `labstack/echo`) | `integrations/h3`, `integrations/hono`, … |

The key invariant, proven by the Go side: **the render runtime has no
dependency on any web framework.** `packages/adapter-go-template/runtime/go.mod`
declares *zero* dependencies; `github.com/labstack/echo/v4` appears only in
`integrations/echo/go.mod`. Echo plugs in via a ~12-line `EchoRenderer`
shim that adapts `bf.Renderer` to Echo's `Renderer` interface. You could
write a `gin` or `net/http` integration against the same `bf` runtime —
Echo is not privileged.

The TypeScript target of that symmetry: a host framework imports
`@barefootjs/hono` (the `hono/jsx` render runtime) the same way Echo
imports `bf`, adds its own HTTP glue, and is done.

## Why the render runtime is `hono/jsx`

Components compiled with the Hono adapter are plain `hono/jsx`
components. `hono/jsx` is a standalone JSX runtime: a node stringifies via
`.toString()` (or streams via `renderToReadableStream`) **without a Hono
`app`, router, or `hono/jsx-renderer` request context.** That capability
is exposed framework-agnostically at `@barefootjs/hono/render`:

```ts
import { renderToHtml, renderToStream } from '@barefootjs/hono/render'

const html = await renderToHtml(<Layout>…<Counter initial={0} /></Layout>)
```

Custom hydration attributes (`bf-s`, `bf-r`, `bf-p`, text markers) survive
stringification, so the output is byte-identical to what the Hono
integration produces. Any WinterCG-compatible host (h3, Elysia, Workers,
Node, Bun, Deno) can return that string.

## Script + import-map wiring without a request context

Hydration needs two things in the page: an import map mapping
`@barefootjs/client` → the runtime bundle, and one `<script type="module">`
per component bundle. Both are available framework-agnostically from
`@barefootjs/hono/app`:

- `BfImportMap({ base })` — emits the `<script type="importmap">`.
- `BfScripts({ base, manifest })` — emits the script tags **straight from
  the build manifest** (`manifestToScriptUrls`). No `useRequestContext`,
  no per-render collection.

This manifest-driven path is what makes a non-Hono host trivial. Its only
tradeoff: it ships *every* manifest entry on *every* page, rather than
only the components a page actually rendered. Acceptable for v1; precise
per-page collection is the v2 work below.

## Current coupling to Hono's request context

The *precise* script collector (`@barefootjs/hono/scripts`'s `BfScripts`,
the per-component collector injected by `addScriptCollection`), the portal
collectors (`@barefootjs/hono/portals`, `/portal`), and `BfDevReload`'s
endpoint lookup all read/write `hono/jsx-renderer`'s `useRequestContext()`.
There are five such sites. They are the reason a host can't yet get
*precise* collection or portals without Hono's `jsxRenderer`.

## Roadmap

### v1 — host `hono/jsx` (no compiler/runtime changes) — DONE for h3

`integrations/h3` renders via `renderToHtml` and wires scripts via the
manifest-based `BfScripts`/`BfImportMap`. h3 owns routing + static
serving. No ALS, no changes to the compiler or the shared collectors.
Elysia follows the same shape next.

### v2 — framework-agnostic render store (the symmetric end state)

Replace the five `useRequestContext()` sites with a single
`getRenderStore()` backed by `AsyncLocalStorage`, falling back to the Hono
request context when no ALS store is active:

- **Hono / Cloudflare Workers** keep using the Hono request context (no
  ALS activated) → zero behavior change, no regression risk.
- **h3 / Elysia** establish an ALS store around the render → precise
  per-page script collection and portals work outside Hono.

This makes the TS side fully symmetric with Go's `bf`: a `RenderContext`
value (`{ html, scripts, portals }`) produced by the runtime and assembled
by a host-supplied layout, with each host writing only a thin shim.

### Deferred — `kitajs` adapter

A second concrete adapter keyed to the `@kitajs/html` runtime (string-JSX,
classic `Html.createElement`) would let Elysia render with its native
idiom and serve h3 too. It needs its own SSR context mechanism (kitajs has
none — the same ALS render store), lazy provider children (string-JSX is
eager, so `<Provider>{children}</Provider>` evaluates children before the
provider runs), and conformance fixtures against the Hono adapter's
output. Tracked separately; not required for the `hono/jsx`-hosted path.
