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
        <link rel="stylesheet" href={`${basePath}/shared/styles/components.css`} />
        {extraStyles.map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
      </head>
      <body>{children}</body>
    </html>
  </>
)
