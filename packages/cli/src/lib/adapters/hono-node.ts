// Hono adapter starter (Node, JSX SSR + hydration).
//
// The Node target runs the Hono app via `@hono/node-server`'s
// `serve()`. Auto-reload is wired through `barefootDevReload`
// middleware from `@barefootjs/hono/app`, which mounts the SSE
// endpoint and publishes its URL on the request context so
// `<BfDevReload />` in renderer.tsx renders the matching browser-
// side subscriber. The two pieces share a single endpoint string
// owned by factory.ts, so re-routing is a 1-line edit.

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
import { barefootDevReload } from '@barefootjs/hono/app'
import { createRenderer } from './renderer'
import { isProd } from './env'

// Single source of truth for the SSE endpoint. \`barefootDevReload\`
// mounts the route here and publishes the URL on the request context;
// \`<BfDevReload />\` in renderer.tsx reads it back. Change the path
// in one place and both pieces stay in sync.
const DEV_RELOAD_ENDPOINT = '/_bf/reload'

export function createApp(): Hono {
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

  // Dev-reload SSE + browser snippet. The middleware uses a
  // per-process boot id and the standard SSE \`Last-Event-ID\`
  // reconnection protocol, so the browser only fires a refresh
  // once the new server process is actually accepting connections
  // — no \"reload into the dying old server\" race.
  app.use('*', barefootDevReload({ endpoint: DEV_RELOAD_ENDPOINT, enabled: !isProd }))

  return app
}
`

const HONO_NODE_RENDERER_TSX = `import { jsxRenderer } from 'hono/jsx-renderer'
import { BfImportMap, BfDevReload } from '@barefootjs/hono/app'
import { BfScripts } from '@barefootjs/hono/scripts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import staticManifest from './dist/components/manifest.json'
import { isDev } from './env'

declare module 'hono' {
  interface ContextRenderer {
    (children: unknown, props?: { title?: string }): Response
  }
}

export interface CreateRendererOptions {
  componentsBase: string
}

const manifestPath = resolve('./dist/components/manifest.json')

// In production we trust the static import — manifest.json was final
// at build time. In dev we re-read on every request so a
// \`bf build --watch\` rebuild surfaces in the very next refresh,
// not the one after that (\`tsx watch\` doesn't reliably bounce the
// server for JSON-only changes, which left the renderer holding a
// stale manifest one edit behind).
function readLiveManifest() {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    return staticManifest
  }
}

export function createRenderer({ componentsBase }: CreateRendererOptions) {
  return jsxRenderer(({ children, title }) => {
    const manifest = isDev ? readLiveManifest() : staticManifest
    return (
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{title ?? 'BarefootJS app'}</title>
          {/* Link all three sheets so the browser fetches them in
              parallel — chaining via styles.css @import would defer
              tokens/uno to a second round-trip and flash unstyled
              DOM. tokens.css first so CSS variables are defined
              before any rule references them. */}
          <link rel="stylesheet" href="/static/tokens.css" />
          <link rel="stylesheet" href="/static/styles.css" />
          <link rel="stylesheet" href="/static/uno.css" />
          <BfImportMap base={componentsBase} />
        </head>
        <body>
          {children}
          <BfScripts base={componentsBase} manifest={manifest} />
          <BfDevReload />
        </body>
      </html>
    )
  })
}
`

// Centralised dev/prod flag. Read once at module load — changing
// NODE_ENV mid-process is unusual and would require an explicit
// restart anyway. Keeping these in one file means future "dev gate"
// logic (debug headers, verbose error pages, etc.) doesn't grow a
// second `process.env.NODE_ENV` reference somewhere else.
const HONO_NODE_ENV_TS = `export const isProd = process.env.NODE_ENV === 'production'
export const isDev = !isProd
`

const HONO_NODE_BAREFOOT_CONFIG_TS = `import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  // Project layout — read by \`bf add\`, \`search\`, \`meta:extract\`, etc.
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
    "types": ["node"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      // Server components (no 'use client') aren't emitted to dist by
      // \`bf build\`, so the path map falls back to the source so
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
    'env.ts': HONO_NODE_ENV_TS,
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
    dev: 'bf build && unocss && concurrently -k -n build,uno,server -c blue,magenta,green "bf build --watch" "unocss --watch" "tsx watch server.tsx"',
    build: 'bf build && unocss',
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
    '@barefootjs/test': 'latest',
    '@types/node': '^22.0.0',
    concurrently: '^9.0.0',
    tsx: '^4.19.0',
    typescript: '^5.6.0',
  },
  prereqWarnings: () => [],
}
