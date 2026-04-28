// Adapter templates for `barefoot init`.
//
// Each adapter contributes a set of files (relative path → contents) plus
// the package.json fragment (deps + scripts) needed to run them. Templates
// are inlined as TypeScript string literals so the CLI bundle stays
// self-contained — no runtime file lookups against the source repo.

export interface AdapterTemplate {
  /** Human-readable name shown in CLI output. */
  label: string
  /** Default port the generated dev server listens on. */
  port: number
  /** Files (relative path → contents) the adapter contributes. */
  files: Record<string, string>
  /** package.json scripts the adapter contributes. */
  scripts: Record<string, string>
  /** package.json runtime dependencies. */
  dependencies: Record<string, string>
  /** package.json dev dependencies. */
  devDependencies: Record<string, string>
  /**
   * Prerequisite warnings to surface to the user before scaffolding.
   * Returning a non-empty array signals "this adapter needs tools that
   * may not be installed" — init prints them but does not abort.
   */
  prereqWarnings: () => string[]
}

const SHARED_COUNTER_TSX = `'use client'

import { createSignal, createMemo } from '@barefootjs/client'

interface CounterProps {
  initial?: number
}

export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div class="counter">
      <p class="counter-value">count: {count()}</p>
      <p class="counter-doubled">doubled: {doubled()}</p>
      <div class="counter-buttons">
        <button onClick={() => setCount(n => n + 1)}>+1</button>
        <button onClick={() => setCount(n => n - 1)}>-1</button>
        <button onClick={() => setCount(0)}>Reset</button>
      </div>
    </div>
  )
}

export default Counter
`

const SHARED_COUNTER_CSS = `:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  padding: 2rem;
  display: grid;
  place-items: center;
  min-height: 100vh;
  background: Canvas;
  color: CanvasText;
}

main {
  max-width: 32rem;
  text-align: center;
}

.counter {
  padding: 1.5rem;
  border: 1px solid color-mix(in oklab, CanvasText 20%, transparent);
  border-radius: 0.75rem;
}

.counter-value {
  font-size: 2rem;
  font-weight: 600;
  margin: 0;
}

.counter-doubled {
  margin: 0.25rem 0 1rem;
  opacity: 0.7;
}

.counter-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.counter-buttons button {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in oklab, CanvasText 25%, transparent);
  background: color-mix(in oklab, CanvasText 4%, Canvas);
  color: CanvasText;
  font: inherit;
  cursor: pointer;
}

.counter-buttons button:hover {
  background: color-mix(in oklab, CanvasText 8%, Canvas);
}

.next-steps {
  margin-top: 2rem;
  text-align: left;
  font-size: 0.95rem;
  opacity: 0.85;
}

code {
  background: color-mix(in oklab, CanvasText 10%, Canvas);
  padding: 0.1rem 0.35rem;
  border-radius: 0.25rem;
}
`

const HONO_SERVER_TSX = `import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '@barefootjs/hono/scripts'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import Counter from '@/components/Counter'

const PORT = Number(process.env.PORT ?? 3000)
const DIST_DIR = resolve(process.cwd(), 'dist')
const PUBLIC_DIR = resolve(process.cwd(), 'public')

const importMap = JSON.stringify({
  imports: {
    '@barefootjs/client': '/static/components/barefoot.js',
    '@barefootjs/client/runtime': '/static/components/barefoot.js',
  },
})

const app = new Hono()

app.use('*', jsxRenderer(({ children }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>BarefootJS app</title>
      <link rel="stylesheet" href="/static/styles.css" />
      <script type="importmap" dangerouslySetInnerHTML={{ __html: importMap }} />
    </head>
    <body>
      {children}
      <BfScripts />
    </body>
  </html>
)))

app.get('/', (c) => c.render(
  <main>
    <h1>It works.</h1>
    <Counter />
    <section class="next-steps">
      <h2>Next steps</h2>
      <ul>
        <li>Edit <code>components/Counter.tsx</code> — the page rebuilds and reloads.</li>
        <li>Find more components: <code>npx barefoot search button</code></li>
        <li>Add a component: <code>npx barefoot add button</code></li>
      </ul>
    </section>
  </main>
))

// Serve compiled client JS from dist/components/ at /static/components/*
app.get('/static/components/*', async (c) => {
  const rel = c.req.path.replace('/static/components/', '')
  const target = normalize(join(DIST_DIR, 'components', rel))
  if (!target.startsWith(DIST_DIR)) return c.notFound()
  try {
    const body = await readFile(target)
    return new Response(body, {
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    })
  } catch {
    return c.notFound()
  }
})

// Serve other static files from public/ at /static/*
app.get('/static/*', async (c) => {
  const rel = c.req.path.replace('/static/', '')
  const target = normalize(join(PUBLIC_DIR, rel))
  if (!target.startsWith(PUBLIC_DIR)) return c.notFound()
  try {
    const body = await readFile(target)
    const ct = mimeFor(extname(target))
    return new Response(body, { headers: { 'Content-Type': ct } })
  } catch {
    return c.notFound()
  }
})

function mimeFor(ext: string): string {
  switch (ext) {
    case '.css': return 'text/css; charset=utf-8'
    case '.js': return 'application/javascript; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.html': return 'text/html; charset=utf-8'
    default: return 'application/octet-stream'
  }
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(\`  ➜ http://localhost:\${info.port}\`)
})

export default app
`

const HONO_BAREFOOT_CONFIG_TS = `import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
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
      "@/components/*": ["./dist/components/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "dist/components/**/*.tsx"],
  "exclude": ["node_modules"]
}
`

export const ADAPTERS: Record<string, AdapterTemplate> = {
  hono: {
    label: 'Hono (Node, JSX SSR + hydration)',
    port: 3000,
    files: {
      'server.tsx': HONO_SERVER_TSX,
      'barefoot.config.ts': HONO_BAREFOOT_CONFIG_TS,
      'tsconfig.json': HONO_TSCONFIG,
      'components/Counter.tsx': SHARED_COUNTER_TSX,
      'public/styles.css': SHARED_COUNTER_CSS,
    },
    scripts: {
      // Build once, then run watch-build and the server in parallel.
      // `concurrently -k` makes Ctrl-C kill both.
      dev: 'barefoot build && concurrently -k -n build,server -c blue,green "barefoot build --watch" "tsx watch server.tsx"',
      build: 'barefoot build',
      start: 'tsx server.tsx',
    },
    dependencies: {
      '@barefootjs/cli': 'latest',
      '@barefootjs/client': 'latest',
      '@barefootjs/hono': 'latest',
      '@hono/node-server': '^1.13.0',
      hono: '^4.6.0',
    },
    devDependencies: {
      concurrently: '^9.0.0',
      tsx: '^4.19.0',
      typescript: '^5.6.0',
    },
    prereqWarnings: () => [],
  },
}

export const DEFAULT_ADAPTER = 'hono'
