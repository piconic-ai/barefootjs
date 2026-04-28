/**
 * BarefootJS Hono middleware
 *
 * Three composable middlewares + a small helper, modeled after Hono's own
 * `jsxRenderer` / `serveStatic` pattern. Use them à la carte from your
 * `server.tsx` instead of taking a single opinionated factory.
 *
 *   - `barefootRenderer(opts)` — sets `c.setRenderer` so `c.render(jsx)`
 *     wraps the user's JSX in the BarefootJS document shell (import map,
 *     stylesheet links, component script tags, dev-reload snippet).
 *
 *   - `barefootComponents(opts)` — serves the compiled client JS bundles
 *     under `/static/components/*` directly from the build's `dist/`.
 *     Plain static handler, nothing more.
 *
 *   - `barefootDevReload(opts)` — registers the `/_bf/reload` SSE
 *     endpoint that the renderer's inline script connects to. No-op when
 *     `NODE_ENV === 'production'`.
 *
 * Plus:
 *
 *   - `readComponentScripts(distDir)` — reads `dist/components/manifest.json`
 *     and returns the ordered list of script URLs the page should load.
 *     Exposed so callers writing their own renderer can build the script
 *     tags themselves.
 *
 * Implementation note: this file is intentionally `.ts` (no JSX) because
 * tsx's per-file `@jsxImportSource` pragma doesn't always propagate when
 * importing `.tsx` from `node_modules`, which would crash with
 * `ReferenceError: React is not defined`. Layout HTML is built via
 * `html` tagged template literals from `hono/html`.
 */

import type { Context, MiddlewareHandler } from 'hono'
import { html, raw } from 'hono/html'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, normalize, resolve } from 'node:path'
import { createDevReloader } from './dev-worker'

const DEV_RELOAD_SNIPPET = `(()=>{if(window.__bfDevReload)return;window.__bfDevReload=1;try{var s=sessionStorage.getItem('__bf_devreload_scroll');if(s){sessionStorage.removeItem('__bf_devreload_scroll');var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}var es=new EventSource('/_bf/reload');es.addEventListener('reload',function(){try{sessionStorage.setItem('__bf_devreload_scroll',String(window.scrollY))}catch(e){}location.reload()});es.addEventListener('error',function(){})})();`

const DEFAULT_IMPORT_MAP = JSON.stringify({
  imports: {
    '@barefootjs/client': '/static/components/barefoot.js',
    '@barefootjs/client/runtime': '/static/components/barefoot.js',
  },
})

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Read the build manifest produced by `barefoot build` and return the
 * list of `<script type="module" src=...>` URLs the page should include
 * — the runtime first, then each compiled component.
 */
export function readComponentScripts(
  distDir: string = resolve(process.cwd(), 'dist'),
): string[] {
  const manifestPath = join(distDir, 'components', 'manifest.json')
  if (!existsSync(manifestPath)) return []
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
    string,
    { clientJs?: string }
  >
  const out: string[] = []
  if (manifest.__barefoot__?.clientJs) {
    out.push('/static/' + manifest.__barefoot__.clientJs)
  }
  for (const [name, entry] of Object.entries(manifest)) {
    if (name === '__barefoot__') continue
    if (entry.clientJs) out.push('/static/' + entry.clientJs)
  }
  return out
}

// ── 1. barefootRenderer ────────────────────────────────────────────────────

export interface BarefootRendererOptions {
  /** Document <title>. Default: "BarefootJS app". */
  title?: string
  /** Stylesheet URL or list of URLs. Default: ["/static/styles.css"]. */
  stylesheet?: string | string[]
  /** Absolute path to the build's dist/ directory. Default: `<cwd>/dist`. */
  distDir?: string
  /**
   * Inline `<script>` import map JSON. Defaults to mapping
   * `@barefootjs/client` and `@barefootjs/client/runtime` to
   * `/static/components/barefoot.js`. Pass your own JSON string to
   * customise (or empty string to omit).
   */
  importMap?: string
  /**
   * Inject the inline EventSource snippet so the page reloads on
   * `/_bf/reload` mismatches. Default: `process.env.NODE_ENV !== 'production'`.
   */
  devReload?: boolean
  /** Extra HTML to inject before `</head>`. */
  headHtml?: string
}

/**
 * Hono middleware that calls `c.setRenderer` so any subsequent
 * `c.render(jsx)` wraps the JSX in the BarefootJS document shell.
 *
 * Pair with your route handlers:
 *
 * ```ts
 * app.use('*', barefootRenderer({ title: 'My App' }))
 * app.get('/', (c) => c.render(<main><Counter /></main>))
 * ```
 */
export function barefootRenderer(
  opts: BarefootRendererOptions = {},
): MiddlewareHandler {
  const title = opts.title ?? 'BarefootJS app'
  const stylesheets = ([] as string[]).concat(opts.stylesheet ?? '/static/styles.css')
  const distDir = opts.distDir ?? resolve(process.cwd(), 'dist')
  const importMap = opts.importMap ?? DEFAULT_IMPORT_MAP
  const devReload = opts.devReload ?? (process.env.NODE_ENV !== 'production')
  const extraHead = opts.headHtml ?? ''

  return async (c, next) => {
    c.setRenderer((children: unknown) => {
      const linkTags = stylesheets
        .map((href) => `<link rel="stylesheet" href="${href}" />`)
        .join('')
      const scriptTags = readComponentScripts(distDir)
        .map((src) => `<script type="module" src="${src}"></script>`)
        .join('')
      const devSnippet = devReload ? `<script>${DEV_RELOAD_SNIPPET}</script>` : ''
      const importMapTag = importMap
        ? `<script type="importmap">${importMap}</script>`
        : ''
      const body = html`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title>${raw(linkTags)}${raw(importMapTag)}${raw(extraHead)}</head><body>${children as any}${raw(scriptTags)}${raw(devSnippet)}</body></html>`
      return c.html(body)
    })
    await next()
  }
}

// ── 2. barefootComponents ──────────────────────────────────────────────────

export interface BarefootComponentsOptions {
  /** Absolute path to the build's dist/ directory. Default: `<cwd>/dist`. */
  distDir?: string
  /** Mount path; files are served below this prefix. Default: "/static/components". */
  base?: string
}

/**
 * Hono middleware that serves the compiled client JS bundles produced by
 * `barefoot build`. The renderer's import map points at this same base
 * URL, so any `<script type="module">` the renderer emits resolves here.
 *
 * For the rest of `public/`, use Hono's `serveStatic` directly:
 *
 * ```ts
 * import { serveStatic } from '@hono/node-server/serve-static'
 * app.get('/static/*', serveStatic({ root: './public', rewriteRequestPath: (p) => p.replace('/static', '') }))
 * ```
 */
export function barefootComponents(
  opts: BarefootComponentsOptions = {},
): MiddlewareHandler {
  const distDir = opts.distDir ?? resolve(process.cwd(), 'dist')
  const base = (opts.base ?? '/static/components').replace(/\/$/, '')
  const componentsRoot = resolve(distDir, 'components')

  return async (c: Context, next) => {
    const path = c.req.path
    if (!path.startsWith(base + '/')) return next()
    const rel = path.slice(base.length + 1)
    const target = normalize(join(componentsRoot, rel))
    if (!target.startsWith(componentsRoot)) return next()
    try {
      const body = await readFile(target)
      return new Response(body, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      })
    } catch {
      return next()
    }
  }
}

// ── 3. barefootDevReload ───────────────────────────────────────────────────

export interface BarefootDevReloadOptions {
  /** Override the dev gate. Default: `process.env.NODE_ENV !== 'production'`. */
  enabled?: boolean
  /** SSE endpoint path. Default: "/_bf/reload" (matches the renderer's snippet). */
  endpoint?: string
}

/**
 * Hono middleware that registers the SSE endpoint paired with the
 * EventSource client snippet emitted by `barefootRenderer({ devReload })`.
 * No-op in production. Mount it once at the root:
 *
 * ```ts
 * app.use('*', barefootDevReload())
 * ```
 */
export function barefootDevReload(
  opts: BarefootDevReloadOptions = {},
): MiddlewareHandler {
  const enabled = opts.enabled ?? (process.env.NODE_ENV !== 'production')
  const endpoint = opts.endpoint ?? '/_bf/reload'
  if (!enabled) {
    return async (_c, next) => next()
  }
  const reloader = createDevReloader()
  return async (c, next) => {
    if (c.req.method === 'GET' && c.req.path === endpoint) {
      return reloader(c as never)
    }
    return next()
  }
}
