/**
 * Minimal BarefootJS renderer for the playground app.
 *
 * Wraps every page in a full HTML document, declares an importmap that maps
 * the bare `@barefootjs/client` specifiers to the inline-served runtime
 * bundle, links the generated UnoCSS, and emits collected hydration scripts
 * via <BfScripts /> at the end of <body>.
 */

import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '@barefootjs/hono/scripts'

const STATIC_BASE = '/static/components'

// Maps bare specifiers to the inline-served runtime. The minified client JS
// already imports `./barefoot.js` relatively, but the importmap keeps
// hand-written / non-minified imports working too.
const importMapScript = JSON.stringify({
  imports: {
    '@barefootjs/client': `${STATIC_BASE}/barefoot.js`,
    '@barefootjs/client/runtime': `${STATIC_BASE}/barefoot.js`,
    '@barefootjs/client-runtime': `${STATIC_BASE}/barefoot.js`,
  },
})

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>BarefootJS Playground</title>
        <script type="importmap" dangerouslySetInnerHTML={{ __html: importMapScript }} />
        <link rel="stylesheet" href="/static/uno.css" />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
          {children}
        </div>
        <BfScripts />
      </body>
    </html>
  )
})
