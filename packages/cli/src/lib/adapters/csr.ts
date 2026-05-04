// Client-side rendering (CSR) adapter starter.
//
// Ships a static HTML page with an empty mount point and a tiny Bun
// server that serves the page + the compiled client bundles produced
// by `barefoot build` (with `clientOnly: true`). No SSR — everything
// renders in the browser via @barefootjs/client/runtime.

import { execSync } from 'node:child_process'
import type { AdapterTemplate } from '../templates'
import {
  SHARED_COUNTER_TSX,
  STYLES_CSS,
  TOKENS_CSS,
  UNOCSS_DEV_DEPENDENCIES,
  UNO_CSS_PLACEHOLDER,
  unoConfigTs,
} from './shared'

const CSR_BAREFOOT_CONFIG_TS = `import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  paths: {
    components: 'components/ui',
    tokens: 'tokens',
    meta: 'meta',
  },
  components: ['components'],
  outDir: 'dist',
  // CSR mode: skip the server-render path and only emit client bundles.
  // \`scriptCollection: false\` disables the collector (no SSR layout to
  // splice scripts into).
  clientOnly: true,
  scriptCollection: false,
  scriptBasePath: '/static/components/',
  adapterOptions: {
    clientJsBasePath: '/static/components/',
    barefootJsPath: '/static/components/barefoot.js',
  },
})
`

const CSR_SERVER_TS = `// Tiny Bun server for the CSR starter:
//   - HTML pages from \`./pages/<name>.html\` (\`/\` → index.html)
//   - Compiled component bundles from \`./dist/components/\` at /static/components/
//   - Other static assets from \`./public/\` at /static/
//
// No backend logic, no API. Replace with Hono / Express / Fastify / etc.
// when the app outgrows static-pages-plus-API.

import { dirname, resolve } from 'node:path'

const ROOT = dirname(import.meta.path)
const PAGES_DIR = resolve(ROOT, 'pages')
const DIST_DIR = resolve(ROOT, 'dist')
const PUBLIC_DIR = resolve(ROOT, 'public')

const port = Number(process.env.PORT ?? 3003)

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    if (path.startsWith('/static/components/')) {
      return serveFromDir(resolve(DIST_DIR, 'components'), path.slice('/static/components/'.length))
    }
    if (path.startsWith('/static/')) {
      return serveFromDir(PUBLIC_DIR, path.slice('/static/'.length))
    }

    const pageName = path === '/' ? 'index' : path.slice(1).replace(/\\/$/, '')
    return serveFromDir(PAGES_DIR, \`\${pageName}.html\`)
  },
})

async function serveFromDir(dir: string, rel: string): Promise<Response> {
  const target = resolve(dir, rel)
  // Defense-in-depth path traversal guard.
  if (!target.startsWith(dir + '/') && target !== dir) {
    return new Response('Forbidden', { status: 403 })
  }
  const file = Bun.file(target)
  if (!(await file.exists())) {
    return new Response('Not Found', { status: 404 })
  }
  return new Response(file, { headers: { 'Content-Type': contentTypeFor(target) } })
}

function contentTypeFor(path: string): string {
  const ext = path.split('.').pop() ?? ''
  switch (ext) {
    case 'html': return 'text/html; charset=utf-8'
    case 'js':   return 'application/javascript; charset=utf-8'
    case 'css':  return 'text/css; charset=utf-8'
    case 'json': return 'application/json; charset=utf-8'
    case 'svg':  return 'image/svg+xml'
    case 'png':  return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    default:     return 'application/octet-stream'
  }
}

console.log(\`  ➜ http://localhost:\${server.port}\`)
`

const CSR_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BarefootJS app</title>
  <script type="importmap">
    { "imports": { "@barefootjs/client/runtime": "/static/components/barefoot.js" } }
  </script>
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  <main>
    <div id="app"></div>
  </main>
  <script type="module">
    import { render } from '@barefootjs/client/runtime'
    await import('/static/components/Counter.client.js')
    render(document.getElementById('app'), 'Counter', { initial: 0 })
  </script>
</body>
</html>
`

const CSR_TSCONFIG = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "@barefootjs/jsx",
    "types": ["bun-types"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/components/*": ["./components/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
`

export const CSR_ADAPTER: AdapterTemplate = {
  label: 'CSR (Bun, client-side rendering only)',
  port: 3003,
  files: {
    'server.ts': CSR_SERVER_TS,
    'pages/index.html': CSR_INDEX_HTML,
    'barefoot.config.ts': CSR_BAREFOOT_CONFIG_TS,
    'tsconfig.json': CSR_TSCONFIG,
    'uno.config.ts': unoConfigTs([
      'components/**/*.tsx',
      'dist/components/**/*.tsx',
      'pages/**/*.html',
    ]),
    'components/Counter.tsx': SHARED_COUNTER_TSX,
    'public/styles.css': STYLES_CSS,
    'public/tokens.css': TOKENS_CSS,
    'public/uno.css': UNO_CSS_PLACEHOLDER,
  },
  scripts: {
    // Build everything once, then run barefoot's watch-build, UnoCSS's
    // class scanner, and `bun --watch server.ts` side-by-side.
    dev: 'barefoot build && unocss && concurrently -k -n build,uno,server -c blue,magenta,green "barefoot build --watch" "unocss --watch" "bun --watch server.ts"',
    build: 'barefoot build && unocss',
    start: 'bun server.ts',
  },
  dependencies: {
    '@barefootjs/cli': 'latest',
    '@barefootjs/client': 'latest',
    '@barefootjs/hono': 'latest',
    '@barefootjs/jsx': 'latest',
    '@barefootjs/shared': 'latest',
  },
  devDependencies: {
    ...UNOCSS_DEV_DEPENDENCIES,
    '@types/bun': '^1.1.0',
    concurrently: '^9.0.0',
    typescript: '^5.6.0',
  },
  prereqWarnings: () => bunPrereqs(),
}

function bunPrereqs(): string[] {
  try {
    execSync('bun --version', { stdio: 'ignore' })
    return []
  } catch {
    return [
      'Bun not found on PATH. The CSR starter\'s server uses `Bun.serve`. Install Bun (https://bun.sh) before `bun run dev`.',
    ]
  }
}
