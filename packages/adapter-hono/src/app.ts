/**
 * BarefootJS Hono integration
 *
 * Runtime-agnostic by design — no `node:fs`, no `process.env`, no
 * implicit conventions about URL paths or the dev-reload gate. The
 * caller hands every component / middleware its configuration
 * explicitly so the same module works under Node, Bun, Workers, and
 * Deno without surprises.
 *
 * Two pieces:
 *
 *   - **JSX components** (`<BfImportMap />`, `<BfScripts />`,
 *     `<BfDevReload />`) — return raw HTML the caller composes inside
 *     the Layout passed to Hono's `jsxRenderer`. All URL/data inputs
 *     are required props.
 *
 *   - **Middleware** (`barefootDevReload`) — registers the SSE endpoint
 *     paired with `<BfDevReload />`. Both `endpoint` and `enabled` are
 *     required so the runtime gate happens in the caller's code, not
 *     here.
 *
 * Components are defined as plain functions returning
 * `HtmlEscapedString` (via `html`/`raw` from `hono/html`) so this file
 * stays `.ts` — `tsx`'s per-file `@jsxImportSource` pragma doesn't
 * always propagate when transpiling `.tsx` from `node_modules` and
 * would otherwise crash with `ReferenceError: React is not defined`.
 */

import type { MiddlewareHandler } from 'hono'
import { html, raw } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'
import { useRequestContext } from 'hono/jsx-renderer'
import { createDevReloader } from './dev-worker'

const DEV_RELOAD_ENDPOINT_KEY = 'bfDevReloadEndpoint'

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Build manifest shape produced by `barefoot build`. Each compiled
 * component is keyed by its manifest name; `__barefoot__` is the
 * runtime entry. `clientJs` is a path under `dist/`, e.g.
 * `"components/Counter.client.js"`.
 */
export interface BarefootBuildManifest {
  __barefoot__?: { clientJs?: string }
  [componentName: string]: { clientJs?: string } | undefined
}

/**
 * Turn a build manifest into the ordered list of script URLs the page
 * should load — runtime first, then each component. Pure: same input
 * gives same output, no I/O.
 */
export function manifestToScriptUrls(
  manifest: BarefootBuildManifest,
  base: string,
): string[] {
  const out: string[] = []
  const prefix = `${base.replace(/\/$/, '')}/`
  if (manifest.__barefoot__?.clientJs) {
    out.push(prefix + relPathFromComponentsBase(manifest.__barefoot__.clientJs))
  }
  for (const [name, entry] of Object.entries(manifest)) {
    if (name === '__barefoot__') continue
    if (entry?.clientJs) out.push(prefix + relPathFromComponentsBase(entry.clientJs))
  }
  return out
}

function relPathFromComponentsBase(p: string): string {
  return p.startsWith('components/') ? p.slice('components/'.length) : p
}

// ── JSX components ─────────────────────────────────────────────────────────

export interface BfImportMapProps {
  /** Base URL where the runtime + component bundles are served. */
  base: string
}

/**
 * Emits the `<script type="importmap">` that maps the bare
 * `@barefootjs/client` / `@barefootjs/client/runtime` specifiers to
 * the runtime bundle. Place in `<head>`.
 */
export function BfImportMap(props: BfImportMapProps): HtmlEscapedString | Promise<HtmlEscapedString> {
  const base = props.base.replace(/\/$/, '')
  const json = JSON.stringify({
    imports: {
      '@barefootjs/client': `${base}/barefoot.js`,
      '@barefootjs/client/runtime': `${base}/barefoot.js`,
    },
  })
  return html`<script type="importmap">${raw(json)}</script>`
}

export interface BfScriptsProps {
  /** Base URL where the runtime + component bundles are served. */
  base: string
  /** Build manifest (from `dist/components/manifest.json`). */
  manifest: BarefootBuildManifest
}

// Emit the empty-manifest warning at most once per server process so
// repeated requests don't spam the console. Reset by reloading the
// process (which is what tsx watch does whenever the manifest is
// regenerated, so a real build clears the warning naturally).
let __bfEmptyManifestWarned = false

/**
 * Emits one `<script type="module" src=...>` per entry in the build
 * manifest, runtime first. Place at the end of `<body>`.
 *
 * Logs a one-time warning when the manifest is empty — a strong
 * signal the user is running the server before `barefoot build` has
 * produced anything, which would otherwise present as a silent
 * "page renders but nothing is interactive."
 */
export function BfScripts(props: BfScriptsProps): HtmlEscapedString | Promise<HtmlEscapedString> {
  const urls = manifestToScriptUrls(props.manifest, props.base)
  if (urls.length === 0 && !__bfEmptyManifestWarned) {
    __bfEmptyManifestWarned = true
    console.warn(
      '[barefootjs] BfScripts: manifest is empty — no <script> tags emitted. ' +
        'Run `barefoot build` to compile components and rebuild the manifest.',
    )
  }
  const tags = urls
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join('')
  return html`${raw(tags)}`
}

export interface BfDevReloadProps {
  /**
   * Override the SSE endpoint published by `barefootDevReload`. Almost
   * always omitted: the middleware sets the endpoint on the request
   * context and `<BfDevReload />` reads it. Setting this prop forces
   * the snippet to point at the given endpoint regardless of whether
   * the middleware is mounted.
   */
  endpoint?: string
}

/**
 * Emits the inline EventSource snippet that connects to the SSE
 * endpoint served by `barefootDevReload`. Renders nothing when the
 * middleware isn't mounted (or is mounted with `enabled: false`),
 * so the dev-reload script never lands on production pages — no
 * "two gates to keep in sync" problem in the renderer.
 */
export function BfDevReload(props: BfDevReloadProps = {}): HtmlEscapedString | null {
  let endpoint = props.endpoint
  if (!endpoint) {
    try {
      endpoint = useRequestContext().get(DEV_RELOAD_ENDPOINT_KEY) as string | undefined
    } catch {
      // No request context (e.g. static rendering) and no explicit prop.
    }
  }
  if (!endpoint) return null
  const ep = JSON.stringify(endpoint)
  const snippet = `(()=>{if(window.__bfDevReload)return;window.__bfDevReload=1;try{var s=sessionStorage.getItem('__bf_devreload_scroll');if(s){sessionStorage.removeItem('__bf_devreload_scroll');var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}var es=new EventSource(${ep});es.addEventListener('reload',function(){try{sessionStorage.setItem('__bf_devreload_scroll',String(window.scrollY))}catch(e){}location.reload()});es.addEventListener('error',function(){})})();`
  // Tagged-template return type is a union with Promise; the `script`
  // tag has no async children so the actual value is sync.
  return html`<script>${raw(snippet)}</script>` as HtmlEscapedString
}

// ── middleware ─────────────────────────────────────────────────────────────

export interface BarefootDevReloadOptions {
  /** SSE endpoint path. */
  endpoint: string
  /**
   * Whether to wire the endpoint up. When `false` the middleware is a
   * complete no-op — no SSE handler, no context publishing — and
   * `<BfDevReload />` (which reads the endpoint off the context) also
   * renders nothing. The runtime gate (e.g. `NODE_ENV !== 'production'`)
   * lives in the caller.
   */
  enabled: boolean
}

/**
 * Hono middleware that serves the dev-reload SSE stream and publishes
 * its endpoint on the request context so `<BfDevReload />` knows
 * whether and where to wire up. Mount at the root; place
 * `<BfDevReload />` somewhere in `<body>`. There's no separate
 * "render the snippet?" gate to keep in sync — toggling `enabled`
 * controls both.
 */
export function barefootDevReload(opts: BarefootDevReloadOptions): MiddlewareHandler {
  if (!opts.enabled) {
    return async (_c, next) => next()
  }
  const reloader = createDevReloader()
  const endpoint = opts.endpoint
  return async (c, next) => {
    c.set(DEV_RELOAD_ENDPOINT_KEY, endpoint)
    if (c.req.method === 'GET' && c.req.path === endpoint) {
      return reloader(c as never)
    }
    await next()
  }
}
