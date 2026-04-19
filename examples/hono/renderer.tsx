/**
 * BarefootJS Renderer for Hono/JSX
 *
 * Uses hono/jsx-renderer with streaming support.
 * BfScripts component renders collected script tags at body end.
 */

import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '../../packages/hono/src/scripts'
import { BfDevReload } from '../../packages/hono/src/dev-reload'

const BASE_PATH = process.env.BASE_PATH ?? '/examples/hono'

// Import map for resolving @barefootjs/client in client JS
const importMapScript = JSON.stringify({
  imports: {
    '@barefootjs/client': `${BASE_PATH}/static/components/barefoot.js`,
    '@barefootjs/client/runtime': `${BASE_PATH}/static/components/barefoot.js`,
  },
})

function SiteHeader() {
  return (
    <header className="bf-header">
      <div className="bf-header-inner">
        <a href="https://barefootjs.dev" className="bf-header-logo" aria-label="Barefoot.js">
          <span className="bf-header-logo-img" role="img" aria-hidden="true" />
        </a>
        <div className="bf-header-sep" />
        <a href="/examples" className="bf-header-link">Examples</a>
      </div>
    </header>
  )
}

export const renderer = jsxRenderer(
  ({ children }) => {
    return (
      <html lang="en" className="dark">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>BarefootJS + Hono/JSX</title>
          <script type="importmap" dangerouslySetInnerHTML={{ __html: importMapScript }} />
          <link rel="stylesheet" href={`${BASE_PATH}/shared/styles/tokens.css`} />
          <link rel="stylesheet" href={`${BASE_PATH}/shared/styles/layout.css`} />
          <link rel="stylesheet" href={`${BASE_PATH}/shared/styles/components.css`} />
          <link rel="stylesheet" href={`${BASE_PATH}/shared/styles/todo-app.css`} />
          <link rel="stylesheet" href={`${BASE_PATH}/shared/styles/ai-chat.css`} />
        </head>
        <body>
          <SiteHeader />
          {children}
          <BfScripts />
          <BfDevReload endpoint={`${BASE_PATH}/_bf/reload`} />
        </body>
      </html>
    )
  },
  { stream: true }
)
