// Hono adapter starter (Cloudflare Workers, JSX SSR + hydration).
//
// The generated app boots on `wrangler dev` (local workerd) and ships
// with `wrangler deploy`. `@barefootjs/hono`'s core (`app.ts`) is
// runtime-agnostic — no `node:fs`, no `process.env` — so the same
// adapter code runs on Node-shaped hosts as well, but the scaffold
// commits to Workers as the default target to deliver an
// "instantly deployable" first impression.

import type { AdapterTemplate } from '../templates'
import {
  buildGitignore,
  COMPONENTS_MANIFEST_SEED,
  CSS_LINKS_BEGIN,
  CSS_LINKS_END,
  FAVICON_SVG,
  faviconLinkTag,
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
import manifest from './public/components/manifest.json' with { type: 'json' }

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
      ${faviconLinkTag('/favicon.svg')}
      ${CSS_LINKS_BEGIN}
      {/* Link all three sheets so the browser fetches them in
          parallel — chaining via styles.css @import would defer
          tokens/uno to a second round-trip and flash unstyled DOM.
          tokens.css first so CSS variables are defined before any
          rule references them. */}
      <link rel="stylesheet" href="/tokens.css" />
      <link rel="stylesheet" href="/styles.css" />
      <link rel="stylesheet" href="/uno.css" />
      ${CSS_LINKS_END}
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
    // \`@cloudflare/workers-types\` covers the deployed Worker;
    // \`node\` is needed so test files (\`renderToTest\` reads via
    // \`fs\`) type-check without an extra install step.
    "types": ["@cloudflare/workers-types", "node"{{__PM_TYPES_ENTRY__}}],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      // Build output first so wrangler resolves the compiled SSR
      // template (with hydration markers + script collection).
      // Source is the fallback for files not yet built.
      "@/components/*": ["./public/components/*", "./components/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "public/components"]
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
    'public/favicon.svg': FAVICON_SVG,
    'public/components/manifest.json': COMPONENTS_MANIFEST_SEED,
    '.gitignore': HONO_GITIGNORE,
  },
  scripts: {
    // `wrangler` is a devDependency below, so package.json scripts
    // resolve it straight from `node_modules/.bin` — no `npx`/`bunx`/
    // `pnpm dlx` wrapper needed (and no unpinned download on first
    // `<pm> run dev`, since the version is pinned in devDependencies).
    dev: 'concurrently -k -n build,uno,server -c blue,magenta,green "bf build --watch" "unocss --watch" "wrangler dev --live-reload"',
    // `--minify` here (not on `dev`/`watch`): the site's landing-page
    // runtime-size claim ("~14 kB min+gzip", site/core/build.ts) is
    // measured on a minified build, and the dev pipeline intentionally
    // serves the unminified runtime for readable stack traces.
    build: 'bf build --minify && unocss',
    deploy: 'bf build --minify && unocss && wrangler deploy',
  },
  deploy: {
    target: 'Cloudflare Workers',
    script: 'deploy',
  },
  dependencies: {
    '@barefootjs/client': 'latest',
    '@barefootjs/hono': 'latest',
    '@barefootjs/jsx': 'latest',
    '@barefootjs/shared': 'latest',
    hono: '^4.6.0',
  },
  devDependencies: {
    ...UNOCSS_DEV_DEPENDENCIES,
    '@barefootjs/cli': 'latest',
    // Must track wrangler's `peerOptional @cloudflare/workers-types`
    // (bun tolerates a mismatch; npm does not — CI's smoke-publish
    // gate catches it). wrangler 4.108.0 briefly moved this to
    // `^5.20260706.1`, but upstream deprecated that release the same
    // day ("causing deployment failures in CI ... downgrade to
    // 4.107.1") — npm's resolver skips a deprecated version when
    // satisfying a range, so `wrangler: '^4.0.0'` (below) resolves
    // back to 4.107.1, which still peers on
    // `^4.20260702.1`. Track whichever wrangler actually resolves,
    // not whichever last shipped upstream.
    '@cloudflare/workers-types': '^4.20260702.1',
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
    // Pinned so `<pm> run dev` / `<pm> run deploy` resolve a known
    // `wrangler` from `node_modules/.bin` instead of pausing on an
    // unpinned download the first time they run (see the `scripts`
    // comment above — this is what makes the bare invocation safe).
    wrangler: '^4.0.0',
  },
  prereqWarnings: () => [],
}
