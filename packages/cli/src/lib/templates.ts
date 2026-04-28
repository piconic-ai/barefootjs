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

// Starter Counter: uses the registry-fetched <Button> from
// `components/ui/button/`. `barefoot init` adds it via `addFromRegistry`
// during scaffolding, so the file is on disk before the user runs npm
// install — no manual `barefoot add button` step is required.
const SHARED_COUNTER_TSX = `'use client'

import { createSignal, createMemo } from '@barefootjs/client'
import { Button } from '@/components/ui/button'

interface CounterProps {
  initial?: number
}

export function Counter(props: CounterProps) {
  const [count, setCount] = createSignal(props.initial ?? 0)
  const doubled = createMemo(() => count() * 2)

  return (
    <div className="counter">
      <p className="counter-value">count: {count()}</p>
      <p className="counter-doubled">doubled: {doubled()}</p>
      <div className="counter-buttons">
        <Button onClick={() => setCount(n => n + 1)}>+1</Button>
        <Button onClick={() => setCount(n => n - 1)} variant="secondary">-1</Button>
        <Button onClick={() => setCount(0)} variant="ghost">Reset</Button>
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

.btn {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in oklab, CanvasText 25%, transparent);
  font: inherit;
  cursor: pointer;
  transition: background 120ms ease;
}

.btn-primary {
  background: color-mix(in oklab, CanvasText 90%, Canvas);
  color: Canvas;
}

.btn-primary:hover {
  background: color-mix(in oklab, CanvasText 75%, Canvas);
}

.btn-secondary {
  background: color-mix(in oklab, CanvasText 8%, Canvas);
  color: CanvasText;
}

.btn-secondary:hover {
  background: color-mix(in oklab, CanvasText 14%, Canvas);
}

.btn-ghost {
  background: transparent;
  border-color: transparent;
  color: CanvasText;
}

.btn-ghost:hover {
  background: color-mix(in oklab, CanvasText 6%, Canvas);
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
import { createApp } from '@barefootjs/hono/app'
import Counter from '@/components/Counter'

const app = createApp({ title: 'BarefootJS app' })

app.get('/', (c) =>
  c.render(
    <main>
      <h1>It works.</h1>
      <Counter />
    </main>
  )
)

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
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
      // Required transitively by @barefootjs/hono via the registry button.
      '@barefootjs/jsx': 'latest',
      '@barefootjs/shared': 'latest',
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
