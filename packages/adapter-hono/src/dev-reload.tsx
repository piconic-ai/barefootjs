/**
 * BarefootJS Dev Reload client snippet (Workers-safe).
 *
 * Standalone module for the `<BfDevReload />` component so environments that
 * can't load `node:fs` (Cloudflare Workers, Deno Deploy, edge runtimes) can
 * still emit the browser-side reload script without pulling the Bun-backed
 * server watcher from `./dev`.
 *
 * Pair with one of:
 *   - `createDevReloader` from `@barefootjs/hono/dev`        (Bun + local fs)
 *   - `createDevReloader` from `@barefootjs/hono/dev-worker` (Cloudflare Workers)
 */

/** @jsxImportSource hono/jsx */

const SCROLL_STORAGE_KEY = '__bf_devreload_scroll'

export interface BfDevReloadProps {
  /** Override the dev gate. Defaults to `process.env.NODE_ENV !== 'production'`. */
  enabled?: boolean
  /** SSE endpoint registered with `createDevReloader`. Defaults to `/_bf/reload`. */
  endpoint?: string
}

function isDevDefault(): boolean {
  return process.env.NODE_ENV !== 'production'
}

function clientSnippet(endpoint: string, storageKey: string): string {
  // Small IIFE: subscribes to SSE, preserves scrollY across reload, logs errors
  // only. Intentionally dependency-free and idempotent across duplicate mounts.
  return `(()=>{if(window.__bfDevReload)return;window.__bfDevReload=1;try{var s=sessionStorage.getItem(${JSON.stringify(
    storageKey,
  )});if(s){sessionStorage.removeItem(${JSON.stringify(
    storageKey,
  )});var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}var es=new EventSource(${JSON.stringify(
    endpoint,
  )});es.addEventListener('reload',function(){try{sessionStorage.setItem(${JSON.stringify(
    storageKey,
  )},String(window.scrollY))}catch(e){}location.reload()});es.addEventListener('error',function(){/* auto-reconnects */})})();`
}

/**
 * Inline `<script>` that opens an EventSource to the reloader endpoint,
 * reloads the page on `reload`, and preserves scrollY across reloads.
 * Renders nothing in production.
 */
export function BfDevReload(props: BfDevReloadProps = {}) {
  const { enabled = isDevDefault(), endpoint = '/_bf/reload' } = props
  if (!enabled) return null
  const snippet = clientSnippet(endpoint, SCROLL_STORAGE_KEY)
  return <script dangerouslySetInnerHTML={{ __html: snippet }} />
}
