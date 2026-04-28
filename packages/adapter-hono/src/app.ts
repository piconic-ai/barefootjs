/**
 * BarefootJS Hono middleware
 *
 * Three composable middlewares modelled on `hono/jsx-renderer`. They
 * communicate via Hono's per-request context (`c.set` / `c.get`) so each
 * one is independently mountable / replaceable / removable:
 *
 *   - `barefootRenderer(opts)` — sets `c.setRenderer` so `c.render(jsx)`
 *     wraps the user's JSX in a document shell. The renderer knows
 *     **nothing** about component URLs or dev-reload paths; it just
 *     splices in whatever the other middleware have pushed onto the
 *     `bfHeadHtml` / `bfBodyHtml` context lists.
 *
 *   - `barefootComponents(opts)` — owns the `/static/components/*` URL
 *     space end-to-end: serves the compiled client JS bundles produced
 *     by `barefoot build`, and pushes the matching `<script type="module">`
 *     tags + import map JSON onto the renderer's body/head lists. Change
 *     `base` once and every reference moves with it.
 *
 *   - `barefootDevReload(opts)` — owns `/_bf/reload`: serves the SSE
 *     endpoint and pushes the EventSource client snippet onto the body
 *     list. Skip the middleware (or set `enabled: false`) and **nothing**
 *     dev-reload-related ends up on the page.
 *
 * For ordinary `public/` files use Hono's own `serveStatic` from
 * `@hono/node-server/serve-static` directly — `@barefootjs/hono` doesn't
 * reinvent that.
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

// ── context keys ───────────────────────────────────────────────────────────

/**
 * Each middleware appends raw HTML strings to one of these per-request
 * lists. The renderer concatenates them into the document shell. Lists
 * (not single strings) so multiple middleware can contribute without
 * stomping on each other.
 */
const HEAD_KEY = 'bfHeadHtml'
const BODY_KEY = 'bfBodyHtml'

function appendHead(c: Context, html: string): void {
  const list = (c.get(HEAD_KEY) as string[] | undefined) ?? []
  list.push(html)
  c.set(HEAD_KEY, list)
}

function appendBody(c: Context, html: string): void {
  const list = (c.get(BODY_KEY) as string[] | undefined) ?? []
  list.push(html)
  c.set(BODY_KEY, list)
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Read the build manifest produced by `barefoot build` and return the
 * list of `<script type="module" src=...>` URLs the page should include
 * — the runtime first, then each compiled component. Useful for callers
 * writing their own renderer instead of using `barefootRenderer`.
 */
export function readComponentScripts(
  distDir: string = resolve(process.cwd(), 'dist'),
  baseUrl: string = '/static/components',
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
    // manifest.clientJs entries are relative to dist/, e.g. "components/barefoot.js"
    out.push(prefix + relPathFromComponentsBase(manifest.__barefoot__.clientJs))
  }
  for (const [name, entry] of Object.entries(manifest)) {
    if (name === '__barefoot__') continue
    if (entry.clientJs) out.push(prefix + relPathFromComponentsBase(entry.clientJs))
  }
  return out
}

/** "components/foo.client.js" → "foo.client.js"; passthrough otherwise. */
function relPathFromComponentsBase(p: string): string {
  return p.startsWith('components/') ? p.slice('components/'.length) : p
}

// ── 1. barefootRenderer ────────────────────────────────────────────────────

export interface BarefootRendererOptions {
  /** Document <title>. Default: "BarefootJS app". */
  title?: string
  /** Stylesheet URL or list of URLs. Default: ["/static/styles.css"]. */
  stylesheet?: string | string[]
  /**
   * Extra raw HTML to inject at the very end of `<head>`, after any
   * content other middleware push via `bfHeadHtml`. For one-off needs;
   * prefer authoring a middleware that pushes onto `bfHeadHtml` if the
   * content is reusable across routes.
   */
  headHtml?: string
}

/**
 * Hono middleware that calls `c.setRenderer` so subsequent
 * `c.render(jsx)` calls return the BarefootJS document shell with the
 * user's JSX as the body.
 *
 * The renderer itself only knows about title + stylesheets. Anything
 * URL-specific (component script tags, import maps, dev-reload snippet)
 * is contributed by other middleware via `c.set('bfHeadHtml' | 'bfBodyHtml')`
 * — so removing or relocating those middleware automatically removes or
 * relocates their HTML, with no string changes here.
 */
export function barefootRenderer(
  opts: BarefootRendererOptions = {},
): MiddlewareHandler {
  const title = opts.title ?? 'BarefootJS app'
  const stylesheets = ([] as string[]).concat(opts.stylesheet ?? '/static/styles.css')
  const extraHead = opts.headHtml ?? ''

  return async (c, next) => {
    c.setRenderer((children: unknown) => {
      const linkTags = stylesheets
        .map((href) => `<link rel="stylesheet" href="${href}" />`)
        .join('')
      const headFromMiddleware = ((c.get(HEAD_KEY) as string[] | undefined) ?? []).join('')
      const bodyFromMiddleware = ((c.get(BODY_KEY) as string[] | undefined) ?? []).join('')
      const body = html`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title>${raw(linkTags)}${raw(headFromMiddleware)}${raw(extraHead)}</head><body>${children as any}${raw(bodyFromMiddleware)}</body></html>`
      return c.html(body)
    })
    await next()
  }
}

// ── 2. barefootComponents ──────────────────────────────────────────────────

export interface BarefootComponentsOptions {
  /** Absolute path to the build's dist/ directory. Default: `<cwd>/dist`. */
  distDir?: string
  /** Mount path; component bundles are served below this prefix. Default: "/static/components". */
  base?: string
  /**
   * Override the import map JSON. Default: maps `@barefootjs/client` and
   * `@barefootjs/client/runtime` to `<base>/barefoot.js` so the runtime
   * imports inside compiled client JS resolve.
   */
  importMap?: string
}

/**
 * Self-contained owner of the BarefootJS component URL space:
 *
 *   - serves files under `<base>/*` from `<distDir>/components/`
 *   - pushes a `<script type="importmap">` onto the page <head>
 *   - pushes one `<script type="module">` per manifest entry onto <body>
 *
 * Both halves use the same `base`, so changing it relocates everything
 * consistently — the renderer never sees the URL.
 */
export function barefootComponents(
  opts: BarefootComponentsOptions = {},
): MiddlewareHandler {
  const distDir = opts.distDir ?? resolve(process.cwd(), 'dist')
  const base = (opts.base ?? '/static/components').replace(/\/$/, '')
  const componentsRoot = resolve(distDir, 'components')
  const importMap =
    opts.importMap ??
    JSON.stringify({
      imports: {
        '@barefootjs/client': `${base}/barefoot.js`,
        '@barefootjs/client/runtime': `${base}/barefoot.js`,
      },
    })

  return async (c, next) => {
    // 1. Contribute to the document on every request (cheap).
    appendHead(c, `<script type="importmap">${importMap}</script>`)
    for (const src of readComponentScripts(distDir, base)) {
      appendBody(c, `<script type="module" src="${src}"></script>`)
    }

    // 2. If this request is for one of our static files, serve it.
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
          // fall through to next handler
        }
      }
    }
    await next()
  }
}

// ── 3. barefootDevReload ───────────────────────────────────────────────────

export interface BarefootDevReloadOptions {
  /** Override the dev gate. Default: `process.env.NODE_ENV !== 'production'`. */
  enabled?: boolean
  /** SSE endpoint path. Default: "/_bf/reload". */
  endpoint?: string
}

/**
 * Self-contained owner of the dev-reload URL space:
 *
 *   - serves the SSE endpoint at `<endpoint>` (default `/_bf/reload`)
 *   - pushes an inline EventSource client `<script>` onto <body> that
 *     connects to that same endpoint
 *
 * Disable, replace, or relocate by tweaking `endpoint` / `enabled`. The
 * renderer is unaware that any of this is happening.
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
  const snippet = buildDevReloadSnippet(endpoint)

  return async (c, next) => {
    appendBody(c, `<script>${snippet}</script>`)
    if (c.req.method === 'GET' && c.req.path === endpoint) {
      return reloader(c as never)
    }
    await next()
  }
}

function buildDevReloadSnippet(endpoint: string): string {
  // Compact IIFE: idempotent across duplicate mounts, preserves scrollY
  // across reload, logs nothing on transient SSE errors (the EventSource
  // auto-reconnects).
  const ep = JSON.stringify(endpoint)
  return `(()=>{if(window.__bfDevReload)return;window.__bfDevReload=1;try{var s=sessionStorage.getItem('__bf_devreload_scroll');if(s){sessionStorage.removeItem('__bf_devreload_scroll');var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}var es=new EventSource(${ep});es.addEventListener('reload',function(){try{sessionStorage.setItem('__bf_devreload_scroll',String(window.scrollY))}catch(e){}location.reload()});es.addEventListener('error',function(){})})();`
}
