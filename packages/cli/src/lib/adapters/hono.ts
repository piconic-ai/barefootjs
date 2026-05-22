// Hono adapter starter (Cloudflare Workers, JSX SSR + hydration).
//
// The generated app boots on `wrangler dev` (local workerd) and ships
// with `wrangler deploy`. `@barefootjs/hono`'s core (`app.ts`) is
// runtime-agnostic — no `node:fs`, no `process.env` — so the same
// adapter code runs on Node-shaped hosts as well, but the scaffold
// commits to Workers as the default target to deliver an
// "instantly deployable" first impression.

import type { AdapterTemplate } from '../templates'
import { commandsFor } from '../pm'
import {
  buildGitignore,
  COMPONENTS_MANIFEST_SEED,
  SHARED_COUNTER_TSX,
  SHARED_COUNTER_TEST_TSX,
  STYLES_CSS,
  TOKENS_CSS,
  UNOCSS_DEV_DEPENDENCIES,
  UNO_CSS_PLACEHOLDER,
  unoConfigTs,
} from './shared'

const HONO_SERVER_TSX = `import { Hono } from 'hono'
import { renderer } from './renderer'
import { Counter } from '@/components/Counter'

const app = new Hono()

app.use('*', renderer)

app.get('/', (c) =>
  c.render(
    <main>
      <Counter />
    </main>,
    { title: 'BarefootJS app' },
  ),
)

export default app
`

const HONO_RENDERER_TSX = `import { jsxRenderer } from 'hono/jsx-renderer'
import { BfImportMap } from '@barefootjs/hono/app'
import { BfScripts } from '@barefootjs/hono/scripts'
import manifest from './public/components/manifest.json'

declare module 'hono' {
  interface ContextRenderer {
    (children: unknown, props?: { title?: string }): Response
  }
}

const componentsBase = '/components'

export const renderer = jsxRenderer(({ children, title }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title ?? 'BarefootJS app'}</title>
      {/* Link all three sheets so the browser fetches them in
          parallel — chaining via styles.css @import would defer
          tokens/uno to a second round-trip and flash unstyled DOM.
          tokens.css first so CSS variables are defined before any
          rule references them. */}
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/styles.css" />
      <link rel="stylesheet" href="/uno.css" />
      <BfImportMap base={componentsBase} />
    </head>
    <body>
      {children}
      <BfScripts base={componentsBase} manifest={manifest} />
    </body>
  </html>
))
`

// Static assets (styles, tokens, generated client JS, manifest) live
// under \`./public/\` so Workers Assets serves them automatically per
// the binding in \`wrangler.jsonc\`. \`bf build\` mirrors the
// input directory layout under \`outDir\`, so \`outDir: 'public'\`
// produces \`public/components/<file>.client.js\` — the URLs the
// renderer references at \`/components/...\`.
const HONO_BAREFOOT_CONFIG_TS = `import { createConfig } from '@barefootjs/hono/build'

export default createConfig({
  // Project layout — read by \`bf add\`, \`search\`, \`meta:extract\`, etc.
  paths: {
    components: 'components/ui',
    tokens: 'tokens',
    meta: 'meta',
  },
  // Build inputs and output. barefoot mirrors the input dir under
  // \`outDir\`, so \`components/\` lands at \`public/components/\` —
  // exactly where Workers Assets serves it from.
  components: ['components'],
  outDir: 'public',
  scriptBasePath: '/components/',
  adapterOptions: {
    clientJsBasePath: '/components/',
    barefootJsPath: '/components/barefoot.js',
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
    // \`@cloudflare/workers-types\` covers the deployed Worker. The
    // trailing slot is a PM-specific extension point — init.ts swaps
    // \`{{__PM_TYPES_ENTRY__}}\` for any extra type packages the
    // user's detected package manager wants pulled in. Today only
    // bun contributes (\`, "bun-types"\` so \`bf gen test\`-emitted
    // \`import 'bun:test'\` lines type-check); npm / pnpm / yarn get
    // \`vitest\` as their test runner and import \`from 'vitest'\`,
    // which exposes types via its own package — no \`types\` array
    // entry needed, so the slot collapses to an empty string. The
    // bun-vs-vitest decision lives in \`testRunnerFor\` in
    // \`packages/cli/src/lib/pm.ts\`; future runners plug into the
    // same slot there rather than baking another placeholder in here.
    "types": ["@cloudflare/workers-types"{{__PM_TYPES_ENTRY__}}],
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
      "@/components/*": ["./public/components/*", "./components/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", "public/components/**/*.tsx"],
  "exclude": ["node_modules"]
}
`

// {{__PROJECT_NAME__}} is replaced by the chosen project folder name
// in scaffoldApp (init.ts), so the deployed Workers script ends up
// named after the user's app instead of a generic "my-app".
const HONO_WRANGLER_JSONC = `{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "{{__PROJECT_NAME__}}",
  "main": "server.tsx",
  "compatibility_date": "2025-01-01",
  // Static assets (CSS, generated client JS, manifest) are served
  // directly by Workers Assets. The Worker script handles everything
  // else — SSR, API routes, etc.
  "assets": {
    "directory": "./public"
  }
}
`

// Ignore patterns paired with the Hono scaffold's layout. `public/`
// itself is committed — `public/styles.css` and `public/tokens.css`
// are hand-written design tokens — so the bf-output section names only
// the generated children (compiled SSR templates, hashed client JS,
// the build cache, the emit ledger) and lets `public/uno.css` ride the
// shared base's uno entry.
const HONO_GITIGNORE = buildGitignore([
  {
    heading: 'bf build outputs (regenerated by `bf build` / `bf build --watch`)',
    entries: [
      'public/components/',
      'public/.buildcache.json',
      'public/.bfemit.json',
    ],
  },
  {
    heading: 'Wrangler local state (dev session, worker logs)',
    entries: ['.wrangler/'],
  },
])

export const HONO_ADAPTER: AdapterTemplate = {
  label: 'Hono (Cloudflare Workers, JSX SSR + hydration)',
  shortLabel: 'Hono / Cloudflare Workers',
  port: 8787,
  files: {
    'server.tsx': HONO_SERVER_TSX,
    'renderer.tsx': HONO_RENDERER_TSX,
    'barefoot.config.ts': HONO_BAREFOOT_CONFIG_TS,
    'tsconfig.json': HONO_TSCONFIG,
    'wrangler.jsonc': HONO_WRANGLER_JSONC,
    'uno.config.ts': unoConfigTs([
      'components/**/*.tsx',
      'public/components/**/*.tsx',
      'server.tsx',
      'renderer.tsx',
    ]),
    'components/Counter.tsx': SHARED_COUNTER_TSX,
    'components/Counter.test.tsx': SHARED_COUNTER_TEST_TSX,
    'public/styles.css': STYLES_CSS,
    'public/tokens.css': TOKENS_CSS,
    'public/uno.css': UNO_CSS_PLACEHOLDER,
    'public/components/manifest.json': COMPONENTS_MANIFEST_SEED,
    '.gitignore': HONO_GITIGNORE,
  },
  scripts: {
    // Run barefoot's component build, UnoCSS's class scanner, and the
    // local Workers dev server side-by-side. `concurrently -k` makes
    // Ctrl-C kill all three. `wrangler dev --live-reload` watches the
    // worker + asset files and reloads the browser when they change,
    // so we don't need a separate SSE-based reloader. `wrangler` lives
    // behind the PM's dlx so its (large) dependency tree never lands
    // in node_modules — the first run caches it via bunx / npx /
    // pnpm dlx / yarn dlx.
    dev: (pm) =>
      `concurrently -k -n build,uno,server -c blue,magenta,green "bf build --watch" "unocss --watch" "${commandsFor(pm).exec(
        'wrangler dev --live-reload',
      )}"`,
    build: 'bf build && unocss',
    deploy: (pm) => `bf build && unocss && ${commandsFor(pm).exec('wrangler deploy')}`,
  },
  deploy: {
    target: 'Cloudflare Workers',
    script: 'deploy',
  },
  dependencies: {
    '@barefootjs/cli': 'latest',
    '@barefootjs/client': 'latest',
    '@barefootjs/hono': 'latest',
    // Required transitively by @barefootjs/hono via the registry button.
    '@barefootjs/jsx': 'latest',
    '@barefootjs/shared': 'latest',
    hono: '^4.6.0',
  },
  devDependencies: {
    ...UNOCSS_DEV_DEPENDENCIES,
    '@cloudflare/workers-types': '^4.20250101.0',
    // `@barefootjs/test` powers `renderToTest()` — the canonical
    // millisecond IR test the docs (and `bf gen test`) point new users
    // at. Without it the scaffold's `test` script is a no-op and any
    // generated `index.test.tsx` fails with a module-not-found error.
    '@barefootjs/test': 'latest',
    // PM-specific test-runner deps (today: `@types/bun` for bun,
    // `vitest` for npm / pnpm / yarn) are added by init.ts via
    // `testRunnerFor(pm)`. Keeping them out of the static adapter map
    // means the registered surface stays PM-agnostic — a bun project
    // doesn't ship vitest, and an npm project doesn't ship a bun-only
    // type package.
    concurrently: '^9.0.0',
    typescript: '^5.6.0',
  },
  prereqWarnings: () => [],
}
