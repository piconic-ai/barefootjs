/**
 * BarefootJS Hono integration
 *
 * Two pieces, both modelled directly on Hono's own primitives:
 *
 *   - **Two URL-space middleware** (`barefootComponents`, `barefootDevReload`)
 *     own their respective routes end-to-end and publish their config
 *     onto Hono's per-request context. The user mounts them at any prefix
 *     and the matching JSX components below pick that prefix up
 *     automatically.
 *
 *   - **Three JSX components** (`BfImportMap`, `BfScripts`, `BfDevReload`)
 *     return raw HTML the user composes inside their own Layout passed
 *     to Hono's `jsxRenderer`. The Layout is fully user-authored — title,
 *     stylesheets, head/body structure, etc. are all decisions the user
 *     makes in their `server.tsx`, and any custom props passed via
 *     `c.render(jsx, props)` flow through the standard `jsxRenderer`
 *     channel (no `extraHead` shim).
 *
 * Implementation note: components are defined as plain functions
 * returning `HtmlEscapedString` (via `html`/`raw` from `hono/html`)
 * rather than `.tsx` JSX. This keeps the package free of the per-file
 * `@jsxImportSource` pragma that `tsx` (the runner) doesn't always
 * propagate when transpiling `.tsx` from `node_modules`. Calling
 * `<BfScripts />` from the user's own `.tsx` Layout works because Hono
 * treats a function returning `HtmlEscapedString` as a valid JSX child.
 */

import type { Context, MiddlewareHandler } from 'hono'
import { html, raw } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'
import { useRequestContext } from 'hono/jsx-renderer'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, normalize, resolve } from 'node:path'
import { createDevReloader } from './dev-worker'

// ── context keys ───────────────────────────────────────────────────────────

const COMPONENTS_BASE_KEY = 'bfComponentsBase'
const COMPONENTS_DIST_DIR_KEY = 'bfComponentsDistDir'
const DEV_RELOAD_ENDPOINT_KEY = 'bfDevReloadEndpoint'

const DEFAULT_COMPONENTS_BASE = '/static/components'
const DEFAULT_DEV_RELOAD_ENDPOINT = '/_bf/reload'

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Read the build manifest produced by `barefoot build` and return the
 * list of `<script type="module" src=...>` URLs the page should include
 * — the runtime first, then each compiled component. Exposed for callers
 * who want to skip the JSX components and emit script tags themselves.
 */
export function readComponentScripts(
  distDir: string = resolve(process.cwd(), 'dist'),
  baseUrl: string = DEFAULT_COMPONENTS_BASE,
): string[] {
  const manifestPath = join(distDir, 'components', 'manifest.json')
  if (!existsSync(manifestPath)) return []
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
    string,
    { clientJs?: string }
  >
  const out: string[] = []
  const prefix = `${baseUrl.replace(/\/$/, '')}/`
  if (manifest.__barefoot__?.clientJs) {
    out.push(prefix + relPathFromComponentsBase(manifest.__barefoot__.clientJs))
  }
  for (const [name, entry] of Object.entries(manifest)) {
    if (name === '__barefoot__') continue
    if (entry.clientJs) out.push(prefix + relPathFromComponentsBase(entry.clientJs))
  }
  return out
}

function relPathFromComponentsBase(p: string): string {
  return p.startsWith('components/') ? p.slice('components/'.length) : p
}

// ── 1. barefootComponents ──────────────────────────────────────────────────

export interface BarefootComponentsOptions {
  /** Absolute path to the build's dist/ directory. Default: `<cwd>/dist`. */
  distDir?: string
  /** Mount path for compiled component bundles. Default: "/static/components". */
  base?: string
}

/**
 * Owns the BarefootJS component URL space:
 *
 *   - serves files under `<base>/*` from `<distDir>/components/`
 *   - publishes `base` and `distDir` on the request context so
 *     `<BfImportMap />` and `<BfScripts />` emit URLs that match
 *
 * Mount with default options or customise — every consumer follows the
 * same `base` automatically, with no string duplication elsewhere.
 */
export function barefootComponents(
  opts: BarefootComponentsOptions = {},
): MiddlewareHandler {
  const distDir = opts.distDir ?? resolve(process.cwd(), 'dist')
  const base = (opts.base ?? DEFAULT_COMPONENTS_BASE).replace(/\/$/, '')
  const componentsRoot = resolve(distDir, 'components')

  return async (c: Context, next) => {
    c.set(COMPONENTS_BASE_KEY, base)
    c.set(COMPONENTS_DIST_DIR_KEY, distDir)

    const path = c.req.path
    if (path.startsWith(base + '/')) {
      const rel = path.slice(base.length + 1)
      const target = normalize(join(componentsRoot, rel))
      if (target.startsWith(componentsRoot)) {
        try {
          const body = await readFile(target)
          return new Response(body, {
            headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
          })
        } catch {
          // fall through
        }
      }
    }
    await next()
  }
}

// ── 2. barefootDevReload ───────────────────────────────────────────────────

export interface BarefootDevReloadOptions {
  /** Override the dev gate. Default: `process.env.NODE_ENV !== 'production'`. */
  enabled?: boolean
  /** SSE endpoint path. Default: "/_bf/reload". */
  endpoint?: string
}

/**
 * Owns the dev-reload URL space:
 *
 *   - serves the SSE stream at `<endpoint>` (default `/_bf/reload`)
 *   - publishes `endpoint` and an "enabled" flag on the request context
 *     so `<BfDevReload />` emits a client snippet pointing at the same
 *     endpoint, or renders nothing when disabled
 *
 * Default-disabled in production. Drop the middleware entirely (or set
 * `enabled: false`) and `<BfDevReload />` becomes a no-op without any
 * coupling to the renderer.
 */
export function barefootDevReload(
  opts: BarefootDevReloadOptions = {},
): MiddlewareHandler {
  const enabled = opts.enabled ?? (process.env.NODE_ENV !== 'production')
  const endpoint = opts.endpoint ?? DEFAULT_DEV_RELOAD_ENDPOINT
  if (!enabled) {
    return async (_c, next) => next()
  }
  const reloader = createDevReloader()

  return async (c, next) => {
    c.set(DEV_RELOAD_ENDPOINT_KEY, endpoint)
    if (c.req.method === 'GET' && c.req.path === endpoint) {
      return reloader(c as never)
    }
    await next()
  }
}

// ── JSX components ─────────────────────────────────────────────────────────

export interface BfImportMapProps {
  /** Override the components base URL (defaults to value set by `barefootComponents`). */
  base?: string
}

/**
 * Emits the `<script type="importmap">` that maps the bare
 * `@barefootjs/client` / `@barefootjs/client/runtime` specifiers to the
 * runtime bundle served by `barefootComponents`. Place it in `<head>`.
 */
export function BfImportMap(props: BfImportMapProps = {}): HtmlEscapedString | Promise<HtmlEscapedString> {
  let base = props.base
  try {
    const c = useRequestContext()
    base = base ?? (c.get(COMPONENTS_BASE_KEY) as string | undefined)
  } catch {
    // No request context — caller is composing outside a request scope
    // (e.g. static HTML generation). Fall through to the default below.
  }
  const resolved = (base ?? DEFAULT_COMPONENTS_BASE).replace(/\/$/, '')
  const json = JSON.stringify({
    imports: {
      '@barefootjs/client': `${resolved}/barefoot.js`,
      '@barefootjs/client/runtime': `${resolved}/barefoot.js`,
    },
  })
  return html`<script type="importmap">${raw(json)}</script>`
}

export interface BfScriptsProps {
  /** Override the components base URL. */
  base?: string
  /** Override the dist/ directory for manifest lookup. */
  distDir?: string
}

/**
 * Emits one `<script type="module" src=...>` per component in the
 * build manifest, runtime first. Place it at the end of `<body>` so
 * the document is parsed before hydration registers run.
 */
export function BfScripts(props: BfScriptsProps = {}): HtmlEscapedString | Promise<HtmlEscapedString> {
  let base = props.base
  let distDir = props.distDir
  try {
    const c = useRequestContext()
    base = base ?? (c.get(COMPONENTS_BASE_KEY) as string | undefined)
    distDir = distDir ?? (c.get(COMPONENTS_DIST_DIR_KEY) as string | undefined)
  } catch {
    // No request context; fall through to the defaults.
  }
  const resolvedBase = (base ?? DEFAULT_COMPONENTS_BASE).replace(/\/$/, '')
  const resolvedDist = distDir ?? resolve(process.cwd(), 'dist')
  const tags = readComponentScripts(resolvedDist, resolvedBase)
    .map((src) => `<script type="module" src="${src}"></script>`)
    .join('')
  return html`${raw(tags)}`
}

export interface BfDevReloadProps {
  /** Override the SSE endpoint. */
  endpoint?: string
}

/**
 * Emits the inline EventSource snippet that connects to the SSE
 * endpoint served by `barefootDevReload`. Renders nothing if the
 * middleware isn't mounted (or is disabled). Place anywhere in
 * `<body>`; conventionally last.
 */
export function BfDevReload(
  props: BfDevReloadProps = {},
): HtmlEscapedString | Promise<HtmlEscapedString> | null {
  let endpoint = props.endpoint
  try {
    const c = useRequestContext()
    // If the dev-reload middleware isn't mounted, the key is undefined
    // and we render nothing — keeps composition with the JSX layout
    // honest (no orphan client snippet pointing at a missing endpoint).
    endpoint = endpoint ?? (c.get(DEV_RELOAD_ENDPOINT_KEY) as string | undefined)
  } catch {
    // No request context. Without a middleware-published endpoint we
    // also render nothing in this branch.
    if (!endpoint) return null
  }
  if (!endpoint) return null
  const snippet = buildDevReloadSnippet(endpoint)
  return html`<script>${raw(snippet)}</script>`
}

function buildDevReloadSnippet(endpoint: string): string {
  const ep = JSON.stringify(endpoint)
  return `(()=>{if(window.__bfDevReload)return;window.__bfDevReload=1;try{var s=sessionStorage.getItem('__bf_devreload_scroll');if(s){sessionStorage.removeItem('__bf_devreload_scroll');var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}var es=new EventSource(${ep});es.addEventListener('reload',function(){try{sessionStorage.setItem('__bf_devreload_scroll',String(window.scrollY))}catch(e){}location.reload()});es.addEventListener('error',function(){})})();`
}
