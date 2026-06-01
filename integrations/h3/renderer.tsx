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

// URL prefix the server serves compiled bundles from (barefoot.js +
// *.client.js). Must match the static route in server.tsx and the
// `scriptBasePath` in barefoot.config.ts.
const COMPONENTS_BASE = '/static/components'

export interface LayoutProps {
  title?: string
  manifest: BarefootBuildManifest
  children?: unknown
}

export function Layout({ title, manifest, children }: LayoutProps) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'BarefootJS + h3'}</title>
        <link rel="stylesheet" href="/shared/styles/tokens.css" />
        <link rel="stylesheet" href="/shared/styles/layout.css" />
        <link rel="stylesheet" href="/shared/styles/components.css" />
        <BfImportMap base={COMPONENTS_BASE} />
      </head>
      <body>
        {children}
        <BfScripts base={COMPONENTS_BASE} manifest={manifest} />
      </body>
    </html>
  )
}
