/**
 * BarefootJS Renderer for Hono/JSX
 *
 * Uses hono/jsx-renderer with streaming support.
 * BfScripts component renders collected script tags at body end.
 */

import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '../../packages/hono/src/scripts'

// Import map for resolving @barefootjs/client-runtime in client JS
const importMapScript = JSON.stringify({
  imports: {
    '@barefootjs/client': '/static/components/barefoot.js',
    '@barefootjs/client-runtime': '/static/components/barefoot.js',
  },
})

export const renderer = jsxRenderer(
  ({ children }) => {
    return (
      <html lang="ja">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>BarefootJS + Hono/JSX</title>
          <script type="importmap" dangerouslySetInnerHTML={{ __html: importMapScript }} />
          <link rel="stylesheet" href="/shared/styles/components.css" />
          <link rel="stylesheet" href="/shared/styles/todo-app.css" />
          <link rel="stylesheet" href="/shared/styles/ai-chat.css" />
          <style>{`
            body:not(:has(.todoapp)) {
              font-family: system-ui, sans-serif;
              max-width: 600px;
              margin: 2rem auto;
              padding: 0 1rem;
            }
            body:not(:has(.todoapp)) h1 { color: #333; }
            nav ul { list-style: none; padding: 0; }
            nav li { margin: 0.5rem 0; }
            nav a { font-size: 1.2rem; }
            button:not(.destroy):not(.clear-completed) {
              font-size: 1.2rem;
              padding: 0.5rem 1rem;
              margin: 0.25rem;
              cursor: pointer;
            }
            .loading { color: #666; font-style: italic; }
          `}</style>
        </head>
        <body>
          {children}
          <BfScripts />
        </body>
      </html>
    )
  },
  { stream: true }
)
