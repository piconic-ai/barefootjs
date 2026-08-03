/** @jsxImportSource @barefootjs/hono/jsx */
//
// HTML page shell, written as a plain hono/jsx component — identical in
// spirit to the h3 integration's renderer. Nothing here is Elysia-aware:
// the layout is composed and handed to `renderToHtml`.
//
// No import map: under the Vite build, `@barefootjs/client` is an ordinary
// bundled ESM specifier every island's compiled entry imports — Rollup
// folds it into one shared chunk, and the browser follows that import on
// its own with no specifier redirection needed (same conclusion gin/hono
// already proved). `<ComponentScripts>` below emits one `<script
// type="module">` per entry in the generated `Assets` map (`dist/bf-
// assets.ts`, from `vite.config.ts`'s `assets` option) — Elysia has no
// per-request script collector (unlike `integrations/hono`'s Hono
// `jsxRenderer`), so every discovered client component's script loads
// unconditionally on every page, matching the pre-Vite `manifest.json` +
// `BfScripts` behavior this replaces.

import { Assets } from './dist/bf-assets'

/** Emits one `<script type="module">` per compiled client component's
 * resolved URL (see `vite.config.ts`'s `assets` option) — every entry
 * except `RouterEntry`, which callers place explicitly where the router
 * bootstrap belongs. */
export function ComponentScripts() {
  return (
    <>
      {Object.entries(Assets)
        .filter(([name]) => name !== 'RouterEntry')
        .map(([, src]) => (
          <script type="module" src={src} />
        ))}
    </>
  )
}

// Shared site header — same markup/classes as the hono, h3, echo and
// mojolicious integrations (styled by shared/styles/layout.css) so every
// adapter demo looks identical. The `/integrations` link points at the
// catalog at the site root, not under this adapter's base path.
function SiteHeader() {
  return (
    <header className="bf-header">
      <div className="bf-header-inner">
        <a href="https://barefootjs.dev" className="bf-header-logo" aria-label="BarefootJS">
          <span className="bf-header-logo-img" role="img" aria-hidden="true" />
        </a>
        <div className="bf-header-sep" />
        <nav className="bf-header-crumbs" aria-label="Breadcrumb">
          <a href="/integrations" className="bf-header-link">Integrations</a>
          <span className="bf-header-crumb-sep" aria-hidden="true">/</span>
          <span className="bf-header-current" aria-current="page">Elysia</span>
        </nav>
      </div>
    </header>
  )
}

export interface LayoutProps {
  title?: string
  /**
   * URL prefix everything is mounted under (the BASE_PATH). Empty for the
   * standalone server; `/integrations/elysia` behind the dev proxy.
   */
  base?: string
  /** Extra stylesheet hrefs to link (e.g. todo-app.css, ai-chat.css). */
  styles?: string[]
  children?: unknown
}

export function Layout({ title, base = '', styles, children }: LayoutProps) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'BarefootJS + Elysia'}</title>
        <link rel="stylesheet" href={`${base}/shared/styles/tokens.css`} />
        <link rel="stylesheet" href={`${base}/shared/styles/layout.css`} />
        <link rel="stylesheet" href={`${base}/shared/styles/components.css`} />
        {(styles ?? []).map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
      </head>
      <body>
        <SiteHeader />
        {children}
        <ComponentScripts />
      </body>
    </html>
  )
}
