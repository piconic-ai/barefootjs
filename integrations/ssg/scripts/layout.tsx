/** @jsxImportSource hono/jsx */
import type { FC, PropsWithChildren } from 'hono/jsx'
import { raw } from 'hono/html'

type LayoutProps = PropsWithChildren<{
  title: string
  basePath: string
  /** Absolute paths of extra stylesheets to load alongside components.css. */
  extraStyles?: string[]
}>

/** Shared HTML shell for every page — consolidates the <head> that integrations/csr's pages/*.html each duplicate. */
export const Layout: FC<LayoutProps> = ({ title, basePath, extraStyles = [], children }) => (
  <>
    {raw('<!doctype html>')}
    <html>
      <head>
        <meta charset="utf-8" />
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
      <body>{children}</body>
    </html>
  </>
)
