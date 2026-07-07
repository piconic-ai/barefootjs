/** @jsxImportSource @barefootjs/hono/jsx */
//
// HTML page shell, written as a plain hono/jsx component. Nothing here is
// h3-aware: it's the same layout any host framework would compose, then
// hand to `renderToHtml`. `<BfImportMap>` and `<BfScripts>` come from
// `@barefootjs/hono/app` and are framework-agnostic — `BfScripts` emits
// one `<script type="module">` per manifest entry (no request context
// needed), which is exactly what lets h3 host BarefootJS without Hono's
// `jsxRenderer`.

import { BfImportMap, BfScripts } from '@barefootjs/hono/app'
import type { BarefootBuildManifest } from '@barefootjs/hono/app'

// Shared site header — same markup/classes as the hono, echo and
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
          <span className="bf-header-current" aria-current="page">h3</span>
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
   * standalone server; `/integrations/h3` behind the dev proxy. The compiled
   * bundles and shared styles are served relative to it.
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
        <title>{title ?? 'BarefootJS + h3'}</title>
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
