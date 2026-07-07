/** @jsxImportSource @barefootjs/hono/jsx */
//
// HTML page shell, written as a plain hono/jsx component — identical in
// spirit to the h3 integration's renderer. Nothing here is Elysia-aware:
// the layout is composed and handed to `renderToHtml`. `<BfImportMap>` and
// `<BfScripts>` (from `@barefootjs/hono/app`) are framework-agnostic and
// emit the import map + one `<script type="module">` per manifest entry,
// which is what lets Elysia host BarefootJS without Hono's `jsxRenderer`.

import { BfImportMap, BfScripts } from '@barefootjs/hono/app'
import type { BarefootBuildManifest } from '@barefootjs/hono/app'

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
  manifest: BarefootBuildManifest
  /**
   * URL prefix everything is mounted under (the BASE_PATH). Empty for the
   * standalone server; `/integrations/elysia` behind the dev proxy.
   */
  base?: string
  /** Extra stylesheet hrefs to link (e.g. todo-app.css, ai-chat.css). */
  styles?: string[]
  children?: unknown
}

export function Layout({ title, manifest, base = '', styles, children }: LayoutProps) {
  const componentsBase = `${base}/static/components`
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
        <BfImportMap base={componentsBase} />
      </head>
      <body>
        <SiteHeader />
        {children}
        <BfScripts base={componentsBase} manifest={manifest} />
      </body>
    </html>
  )
}
