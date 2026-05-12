// Hono adapter starter (Node, JSX SSR + hydration).
//
// The Node target runs the same Hono app via `@hono/node-server`'s
// `serve()`. Auto-reload uses the SSE-based `createDevReloader` from
// `@barefootjs/hono/dev` (filesystem-watch on the build sentinel),
// which is the historical Node-friendly setup.

import type { AdapterTemplate } from '../templates'
import {
  COMPONENTS_MANIFEST_SEED,
  SHARED_COUNTER_TSX,
  STYLES_CSS,
  TOKENS_CSS,
  UNOCSS_DEV_DEPENDENCIES,
  UNO_CSS_PLACEHOLDER,
  unoConfigTs,
} from './shared'

const HONO_NODE_SERVER_TSX = `import { serve } from '@hono/node-server'
import { createApp } from './factory'
import { Counter } from '@/components/Counter'

const app = createApp()

app.get('/', (c) =>
  c.render(
    <main>
      <Counter />
    </main>,
    { title: 'BarefootJS app' },
  ),
)

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(\`  ➜ http://localhost:\${info.port}\`)
})

export default app
`

const HONO_NODE_FACTORY_TS = `import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { createDevReloader } from '@barefootjs/hono/dev'
import { createRenderer } from './renderer'

export function createApp(): Hono {
  const isProd = process.env.NODE_ENV === 'production'

  // Compiled component bundles: served from \`componentsBase\` URL,
  // sourced from \`componentsDistDir\` on disk.
  const componentsBase = '/static/components'
  const componentsDistDir = './dist/components'

  // Everything else under public/: served from \`publicBase\` URL,
  // sourced from \`publicDir\` on disk.
  const publicBase = '/static'
  const publicDir = './public'

  const renderer = createRenderer({ componentsBase })

  const app = new Hono()

  app.use('*', renderer)

  app.use(
    \`\${componentsBase}/*\`,
    serveStatic({
      root: componentsDistDir,
      rewriteRequestPath: (path) => path.replace(componentsBase, ''),
    }),
  )

  app.use(
    \`\${publicBase}/*\`,
    serveStatic({
      root: publicDir,
      rewriteRequestPath: (path) => path.replace(publicBase, ''),
    }),
  )

  // SSE endpoint that <BfDevReload /> in renderer.tsx subscribes to.
  // \`createDevReloader\` watches \`dist/.dev/build-id\` (written by
  // \`barefoot build --watch\` after each successful build) and streams
  // \`event: reload\` so the browser refreshes automatically.
  if (!isProd) {
    app.get('/_bf/reload', createDevReloader({ distDir: './dist' }))
  }

  return app
}
`

const HONO_NODE_RENDERER_TSX = `import { jsxRenderer } from 'hono/jsx-renderer'
import { BfImportMap, BfScripts } from '@barefootjs/hono/app'
import { DevReload } from './dev-reload'
import manifest from './dist/components/manifest.json'

declare module 'hono' {
  interface ContextRenderer {
    (children: unknown, props?: { title?: string }): Response
  }
}

export interface CreateRendererOptions {
  componentsBase: string
}

export function createRenderer({ componentsBase }: CreateRendererOptions) {
  return jsxRenderer(({ children, title }) => (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'BarefootJS app'}</title>
        <link rel="stylesheet" href="/static/styles.css" />
        <link rel="stylesheet" href="/static/uno.css" />
        <BfImportMap base={componentsBase} />
      </head>
      <body>
        {children}
        <BfScripts base={componentsBase} manifest={manifest} />
        <DevReload />
      </body>
    </html>
  ))
}
`

// Dev-only browser snippet that subscribes to the SSE endpoint
// published by Hono's createDevReloader (see factory.ts) and reloads
// the page when \`barefoot build --watch\` finishes a build. Lives in
// the project — not in a library — so the SSE endpoint URL is a
// 1-line edit away if you re-route it in factory.ts.
const HONO_NODE_DEV_RELOAD_TSX = `// Browser-side dev-reload subscriber.
//
// Mirrors the SSE endpoint registered by \`createDevReloader\` in
// factory.ts and refreshes the page on each successful rebuild,
// preserving the scroll position across the reload. Renders nothing
// in production.
//
// If you re-route the SSE endpoint in factory.ts, update the URL in
// the IIFE below to match.

const snippet = "(()=>{if(window.__bfDevReload)return;window.__bfDevReload=1;try{var s=sessionStorage.getItem('__bf_devreload_scroll');if(s){sessionStorage.removeItem('__bf_devreload_scroll');var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}var es=new EventSource('/_bf/reload');es.addEventListener('reload',function(){try{sessionStorage.setItem('__bf_devreload_scroll',String(window.scrollY))}catch(e){}es.close();location.reload()});es.addEventListener('error',function(){})})();"

export function DevReload() {
  if (process.env.NODE_ENV === 'production') return null
  return <script dangerouslySetInnerHTML={{ __html: snippet }} />
}
`

const HONO_NODE_BAREFOOT_CONFIG_TS = `import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  // Project layout — read by \`barefoot add\`, \`search\`, \`meta:extract\`, etc.
  paths: {
    components: 'components/ui',
    tokens: 'tokens',
    meta: 'meta',
  },
  // Build inputs and output
  components: ['components'],
  outDir: 'dist',
  scriptBasePath: '/static/components/',
  adapterOptions: {
    clientJsBasePath: '/static/components/',
    barefootJsPath: '/static/components/barefoot.js',
  },
})
`

const HONO_NODE_TSCONFIG = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@barefootjs/hono/jsx",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      // Server components (no 'use client') aren't emitted to dist by
      // \`barefoot build\`, so the path map falls back to the source so
      // imports of those components still resolve.
      "@/components/*": ["./dist/components/*", "./components/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "dist/components/**/*.tsx"],
  "exclude": ["node_modules"]
}
`

export const HONO_NODE_ADAPTER: AdapterTemplate = {
  label: 'Hono (Node, JSX SSR + hydration)',
  shortLabel: 'Hono / Node',
  port: 3000,
  files: {
    'server.tsx': HONO_NODE_SERVER_TSX,
    'factory.ts': HONO_NODE_FACTORY_TS,
    'renderer.tsx': HONO_NODE_RENDERER_TSX,
    'dev-reload.tsx': HONO_NODE_DEV_RELOAD_TSX,
    'barefoot.config.ts': HONO_NODE_BAREFOOT_CONFIG_TS,
    'tsconfig.json': HONO_NODE_TSCONFIG,
    'uno.config.ts': unoConfigTs([
      'components/**/*.tsx',
      'dist/components/**/*.tsx',
      'server.tsx',
      'renderer.tsx',
    ]),
    'components/Counter.tsx': SHARED_COUNTER_TSX,
    'public/styles.css': STYLES_CSS,
    'public/tokens.css': TOKENS_CSS,
    'public/uno.css': UNO_CSS_PLACEHOLDER,
    'dist/components/manifest.json': COMPONENTS_MANIFEST_SEED,
  },
  scripts: {
    // Run barefoot's watch-build, UnoCSS's class scanner, and the
    // Node server side-by-side. `concurrently -k` makes Ctrl-C kill
    // all three. The server reloads itself via `tsx watch`; the
    // browser auto-reloads via the SSE endpoint wired up in factory.ts.
    dev: 'barefoot build && unocss && concurrently -k -n build,uno,server -c blue,magenta,green "barefoot build --watch" "unocss --watch" "tsx watch server.tsx"',
    build: 'barefoot build && unocss',
    start: 'tsx server.tsx',
  },
  dependencies: {
    '@barefootjs/cli': 'latest',
    '@barefootjs/client': 'latest',
    '@barefootjs/hono': 'latest',
    // Required transitively by @barefootjs/hono via the registry button.
    '@barefootjs/jsx': 'latest',
    '@barefootjs/shared': 'latest',
    '@hono/node-server': '^1.13.0',
    hono: '^4.6.0',
  },
  devDependencies: {
    ...UNOCSS_DEV_DEPENDENCIES,
    concurrently: '^9.0.0',
    tsx: '^4.19.0',
    typescript: '^5.6.0',
  },
  prereqWarnings: () => [],
}
