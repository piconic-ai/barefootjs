// Hono adapter starter (Node, JSX SSR + hydration).

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

const HONO_SERVER_TSX = `import { serve } from '@hono/node-server'
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

const HONO_FACTORY_TS = `import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { barefootDevReload } from '@barefootjs/hono/app'
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

  // \`<BfDevReload />\` in renderer.tsx reads the endpoint off the
  // context this middleware publishes — when \`enabled: false\`, no
  // context is set and the component renders nothing.
  app.use(
    '*',
    barefootDevReload({
      endpoint: '/_bf/reload',
      enabled: !isProd,
    }),
  )

  return app
}
`

const HONO_RENDERER_TSX = `import { jsxRenderer } from 'hono/jsx-renderer'
import { BfImportMap, BfScripts, BfDevReload } from '@barefootjs/hono/app'
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
        <BfImportMap base={componentsBase} />
      </head>
      <body>
        {children}
        <BfScripts base={componentsBase} manifest={manifest} />
        <BfDevReload />
      </body>
    </html>
  ))
}
`

const HONO_BAREFOOT_CONFIG_TS = `import { createConfig } from '@barefootjs/hono/build'

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

const HONO_TSCONFIG = `{
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

export const HONO_ADAPTER: AdapterTemplate = {
  label: 'Hono (Node, JSX SSR + hydration)',
  port: 3000,
  files: {
    'server.tsx': HONO_SERVER_TSX,
    'factory.ts': HONO_FACTORY_TS,
    'renderer.tsx': HONO_RENDERER_TSX,
    'barefoot.config.ts': HONO_BAREFOOT_CONFIG_TS,
    'tsconfig.json': HONO_TSCONFIG,
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
    // Build everything once, then run barefoot's watch-build, UnoCSS's
    // class scanner, and the server side-by-side. `concurrently -k`
    // makes Ctrl-C kill all three.
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
