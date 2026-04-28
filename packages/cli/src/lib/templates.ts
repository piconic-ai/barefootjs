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
`

// Theme tokens (CSS variables) referenced by the registry components'
// utility classes (`bg-primary`, `text-foreground`, etc.). Mirrors
// integrations/shared/styles/tokens.css so registry components ship
// looking the same as the official examples.
const TOKENS_CSS = `:root {
  /* ── Typography ──────────────────────────────────────── */
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  --tracking-tighter: -0.05em;
  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.025em;
  --tracking-wider: 0.05em;

  /* ── Spacing & sizing ────────────────────────────────── */
  --spacing: 0.25rem;
  --header-height: 52px;

  /* ── Border radius ───────────────────────────────────── */
  --radius: 0.625rem;
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);

  /* ── Transitions ─────────────────────────────────────── */
  --duration-fast: 0.15s;
  --duration-normal: 0.25s;

  /* ── Colors (OKLCH, neutral theme) ─────────────── */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(0.96 0 0);
  --input: oklch(0.96 0 0);
  --ring: oklch(0.708 0 0);

  /* ── Shadows ─────────────────────────────────────────── */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --primary: oklch(0.35 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.985 0 0);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
}
`

// Entry stylesheet the page links to. Imports tokens.css for theme
// variables, then uno.css for the UnoCSS-generated utility classes
// (\`bg-primary\`, \`hover:bg-primary/90\`, etc.) used by the registry
// Button. \`uno.css\` is regenerated by the \`unocss\` CLI watcher started
// from the \`dev\` script.
const STYLES_CSS = `@import url('./tokens.css');
@import url('./uno.css');

html, body {
  margin: 0;
  padding: 0;
  font-family: var(--font-sans);
  background: var(--background);
  color: var(--foreground);
}

main {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
}

.counter {
  padding: 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--card);
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
`

// Empty placeholder so /static/uno.css resolves on the very first page
// load before \`unocss --watch\` has had a chance to write its first
// output. The watcher will overwrite this file on the first scan.
const UNO_CSS_PLACEHOLDER = `/* generated by unocss --watch */
`

const UNO_CONFIG_TS = `import { defineConfig, presetWind4 } from 'unocss'

// Mirrors site/ui/uno.config.ts — keeps the registry components looking
// the way they do in the docs site. Theme colors point at the CSS
// variables defined in tokens.css so a \`.dark\` class on <html> flips
// the whole palette without re-running UnoCSS.
export default defineConfig({
  presets: [presetWind4()],
  preflights: [{
    getCSS: () => '*, ::before, ::after { border-color: var(--border); }',
    layer: 'base',
  }],
  outputToCssLayers: true,
  layers: {
    preflights: -2,
    components: -1,
    default: 0,
  },
  theme: {
    colors: {
      background: 'var(--background)',
      foreground: 'var(--foreground)',
      card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
      popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
      primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
      secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
      muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
      accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
      destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
      border: 'var(--border)',
      input: 'var(--input)',
      ring: 'var(--ring)',
    },
    radius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
    shadow: {
      sm: 'var(--shadow-sm)',
      DEFAULT: 'var(--shadow)',
      md: 'var(--shadow-md)',
      lg: 'var(--shadow-lg)',
    },
    font: {
      sans: 'var(--font-sans)',
      mono: 'var(--font-mono)',
    },
  },
  content: {
    filesystem: [
      'components/**/*.tsx',
      'dist/components/**/*.tsx',
      'server.tsx',
    ],
  },
  // The unocss CLI doesn't read content.filesystem, so duplicate the
  // patterns here for \`unocss\` / \`unocss --watch\` invocations.
  cli: {
    entry: {
      patterns: ['components/**/*.tsx', 'dist/components/**/*.tsx', 'server.tsx', 'renderer.tsx'],
      outFile: 'public/uno.css',
    },
  },
})
`

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

  const devReloadEndpoint = '/_bf/reload'
  const devReloadEnabled = !isProd

  const renderer = createRenderer({
    componentsBase,
    devReloadEndpoint,
    devReloadEnabled,
  })

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

  app.use(
    '*',
    barefootDevReload({
      endpoint: devReloadEndpoint,
      enabled: devReloadEnabled,
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
  devReloadEndpoint: string
  devReloadEnabled: boolean
}

export function createRenderer({
  componentsBase,
  devReloadEndpoint,
  devReloadEnabled,
}: CreateRendererOptions) {
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
        {devReloadEnabled && <BfDevReload endpoint={devReloadEndpoint} />}
      </body>
    </html>
  ))
}
`

// Empty manifest seed so the static \`import manifest from
// './dist/components/manifest.json'\` in renderer.tsx resolves on the
// very first server boot, before \`barefoot build\` has run.
// \`barefoot build\` will overwrite this file with the real content.
const COMPONENTS_MANIFEST_SEED = '{}\n'


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
      'factory.ts': HONO_FACTORY_TS,
      'renderer.tsx': HONO_RENDERER_TSX,
      'barefoot.config.ts': HONO_BAREFOOT_CONFIG_TS,
      'tsconfig.json': HONO_TSCONFIG,
      'uno.config.ts': UNO_CONFIG_TS,
      'components/Counter.tsx': SHARED_COUNTER_TSX,
      'public/styles.css': STYLES_CSS,
      'public/tokens.css': TOKENS_CSS,
      // Empty placeholder so /static/uno.css resolves before unocss --watch
      // has emitted its first output. Overwritten on the first scan.
      'public/uno.css': UNO_CSS_PLACEHOLDER,
      // Empty manifest seed so renderer.tsx's static JSON import works
      // before `barefoot build` runs once.
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
      '@unocss/cli': '^66.0.0',
      '@unocss/preset-wind4': '^66.0.0',
      concurrently: '^9.0.0',
      tsx: '^4.19.0',
      typescript: '^5.6.0',
      unocss: '^66.0.0',
    },
    prereqWarnings: () => [],
  },
}

export const DEFAULT_ADAPTER = 'hono'
