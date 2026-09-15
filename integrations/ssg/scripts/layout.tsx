/** @jsxImportSource hono/jsx */
import type { FC, PropsWithChildren } from 'hono/jsx'
import { raw } from 'hono/html'

type LayoutProps = PropsWithChildren<{
  title: string
  basePath: string
  /** Absolute paths of extra stylesheets to load alongside components.css. */
  extraStyles?: string[]
}>

// Same breadcrumb pattern as integrations/hono's renderer.tsx SiteHeader, using
// the same name ("SSG + CSR") shown for this entry on the public /integrations
// catalog (site/core/integrations/routes.tsx).
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
          <span className="bf-header-current" aria-current="page">SSG + CSR</span>
        </nav>
      </div>
    </header>
  )
}

/** Shared HTML shell for every page — consolidates the <head> that integrations/csr's pages/*.html each duplicate. */
export const Layout: FC<LayoutProps> = ({ title, basePath, extraStyles = [], children }) => (
  <>
    {raw('<!doctype html>')}
    <html lang="en" className="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        {/* components.css consumes custom properties defined in tokens.css and
            layout.css, so both must load first (same order as integrations/hono's
            renderer.tsx) or the shared styles silently fall back to unset values. */}
        <link rel="stylesheet" href={`${basePath}/shared/styles/tokens.css`} />
        <link rel="stylesheet" href={`${basePath}/shared/styles/layout.css`} />
        <link rel="stylesheet" href={`${basePath}/shared/styles/components.css`} />
        {extraStyles.map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
      </head>
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  </>
)
