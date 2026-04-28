/**
 * `createApp()` — opinionated Hono entrypoint for BarefootJS starter apps.
 *
 * Bundles the boilerplate that every BarefootJS-on-Hono server otherwise has
 * to wire up by hand:
 *
 *   - Document `<html>` shell with the import map and stylesheet
 *   - `<script type="module">` tags for `barefoot.js` plus every component
 *     emitted by `barefoot build` (read once at server boot from the build
 *     manifest produced in the project's `dist/components/manifest.json`)
 *   - Static-file routes for compiled client JS (`/static/components/*`) and
 *     anything dropped under `public/` (`/static/*`)
 *   - Dev-only browser auto-reload (`/_bf/reload` SSE + an inline EventSource
 *     snippet on each rendered page) — wired up automatically when
 *     `NODE_ENV !== 'production'`
 *
 * The user's `server.tsx` only has to declare app routes, not infrastructure.
 *
 * Implementation note: this file is intentionally `.ts` (no JSX) so the
 * starter can `import { createApp } from '@barefootjs/hono/app'` under
 * `tsx` / Node, where per-file `@jsxImportSource` pragmas on .tsx files
 * inside node_modules don't always propagate and would crash with
 * `ReferenceError: React is not defined`. The layout HTML is built via
 * `html` tagged template strings instead.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { html, raw } from 'hono/html'
import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { createDevReloader } from './dev-worker'

const DEV_RELOAD_SNIPPET = `(()=>{if(window.__bfDevReload)return;window.__bfDevReload=1;try{var s=sessionStorage.getItem('__bf_devreload_scroll');if(s){sessionStorage.removeItem('__bf_devreload_scroll');var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}var es=new EventSource('/_bf/reload');es.addEventListener('reload',function(){try{sessionStorage.setItem('__bf_devreload_scroll',String(window.scrollY))}catch(e){}location.reload()});es.addEventListener('error',function(){})})();`

export interface CreateAppOptions {
  /** Document <title>. Default: "BarefootJS app". */
  title?: string
  /** Path under `static/` for the page stylesheet. Default: "/static/styles.css". */
  stylesheet?: string
  /** Absolute path to the build's dist/ directory. Default: `<cwd>/dist`. */
  distDir?: string
  /** Absolute path to the public/ directory served at /static/*. Default: `<cwd>/public`. */
  publicDir?: string
  /**
   * Whether to wire up the SSE auto-reload endpoint and inject the client
   * snippet. Default: `process.env.NODE_ENV !== 'production'`.
   */
  devReload?: boolean
  /** Extra HTML to inject before `</head>`. Use for additional stylesheets, meta tags, etc. */
  headHtml?: string
}

function mimeFor(ext: string): string {
  switch (ext) {
    case '.css': return 'text/css; charset=utf-8'
    case '.js': return 'application/javascript; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.html': return 'text/html; charset=utf-8'
    case '.ico': return 'image/x-icon'
    default: return 'application/octet-stream'
  }
}

function readScriptUrls(distDir: string): string[] {
  const manifestPath = join(distDir, 'components', 'manifest.json')
  if (!existsSync(manifestPath)) return []
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, { clientJs?: string }>
  const out: string[] = []
  // barefoot.js is the runtime that every component's hydration code calls
  // into; load it first so component scripts can register their templates.
  if (manifest.__barefoot__?.clientJs) out.push('/static/' + manifest.__barefoot__.clientJs)
  for (const [name, entry] of Object.entries(manifest)) {
    if (name === '__barefoot__') continue
    if (entry.clientJs) out.push('/static/' + entry.clientJs)
  }
  return out
}

const IMPORT_MAP_JSON = JSON.stringify({
  imports: {
    '@barefootjs/client': '/static/components/barefoot.js',
    '@barefootjs/client/runtime': '/static/components/barefoot.js',
  },
})

export function createApp(opts: CreateAppOptions = {}): Hono {
  const title = opts.title ?? 'BarefootJS app'
  const stylesheet = opts.stylesheet ?? '/static/styles.css'
  const distDir = opts.distDir ?? resolve(process.cwd(), 'dist')
  const publicDir = opts.publicDir ?? resolve(process.cwd(), 'public')
  const devReload = opts.devReload ?? (process.env.NODE_ENV !== 'production')
  const extraHead = opts.headHtml ?? ''

  const app = new Hono()

  // Layout middleware: replaces hono's `jsxRenderer` for the starter case so
  // we don't depend on a JSX runtime at all in this file. `c.render(jsx)`
  // evaluates the user's JSX in the project's tsconfig context, then we
  // splice the resulting HTML string into the document shell built via
  // `html` tagged template literals.
  app.use('*', async (c, next) => {
    c.setRenderer((children: unknown) => {
      const scripts = readScriptUrls(distDir)
        .map((src) => `<script type="module" src="${src}"></script>`)
        .join('')
      const devSnippet = devReload
        ? `<script>${DEV_RELOAD_SNIPPET}</script>`
        : ''
      const body = html`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${title}</title><link rel="stylesheet" href="${stylesheet}" /><script type="importmap">${raw(IMPORT_MAP_JSON)}</script>${raw(extraHead)}</head><body>${children as any}${raw(scripts)}${raw(devSnippet)}</body></html>`
      return c.html(body)
    })
    await next()
  })

  // Compiled client JS lives under dist/components/. Serve it at
  // /static/components/* so the runtime's import map can resolve.
  app.get('/static/components/*', async (c: Context) => {
    const rel = c.req.path.replace('/static/components/', '')
    const target = normalize(join(distDir, 'components', rel))
    if (!target.startsWith(distDir)) return c.notFound()
    try {
      const body = await readFile(target)
      return new Response(body, {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      })
    } catch {
      return c.notFound()
    }
  })

  // Anything else dropped under public/ is served verbatim from /static/*.
  app.get('/static/*', async (c: Context) => {
    const rel = c.req.path.replace('/static/', '')
    const target = normalize(join(publicDir, rel))
    if (!target.startsWith(publicDir)) return c.notFound()
    try {
      const body = await readFile(target)
      return new Response(body, {
        headers: { 'Content-Type': mimeFor(extname(target)) },
      })
    } catch {
      return c.notFound()
    }
  })

  if (devReload) {
    app.get('/_bf/reload', createDevReloader())
  }

  return app
}
