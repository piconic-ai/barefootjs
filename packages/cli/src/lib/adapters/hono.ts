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

// No import map: under the Vite build, \`@barefootjs/client\` is an
// ordinary bundled ESM specifier every island's compiled entry imports —
// Rollup folds it into one shared chunk, guaranteeing a single runtime
// instance, and the browser follows that import on its own with no
// specifier redirection needed. \`<BfScripts />\` needs no \`manifest\`/\`base\`
// props either — \`HonoAdapter.generate()\` bakes each component's
// Vite-resolved script URL(s) in at codegen time (see
// \`registerComponentScripts\` in \`@barefootjs/hono/scripts\`).
const HONO_RENDERER_TSX = `import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '@barefootjs/hono/scripts'

declare module 'hono' {
  interface ContextRenderer {
    (children: unknown, props?: { title?: string }): Response
  }
}

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
    </head>
    <body>
      {children}
      <BfScripts />
    </body>
  </html>
))
`

// Static assets (styles, tokens, generated client JS) live under
// \`./public/\` so Workers Assets serves them automatically per the
// binding in \`wrangler.jsonc\`. \`build.outDir: 'public/components'\`
// produces \`public/components/<hashed-file>.js\` — the URLs
// \`HonoAdapter.generate()\` bakes into every SSR template's
// \`<script src>\`. \`templates: 'dist/components'\` is a SEPARATE,
// non-web-exposed directory: the compiled SSR \`.tsx\` files wrangler's
// own bundler imports via \`server.tsx\`'s \`@/components/*\` path
// mapping, never served over HTTP.
const HONO_VITE_CONFIG_TS = `import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/hono/vite'

const HERE = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/components/',
  resolve: {
    // Mirrors tsconfig.json's \`@/components/*\` path mapping — Vite's
    // dev-server dependency pre-scan parses raw source directly (before
    // this plugin's own \`transform\` hook runs) and has no notion of
    // tsconfig \`paths\` without this. Points at the SOURCE tree (not
    // \`dist/components\`, the compiled SSR output tsconfig also maps):
    // Vite's client bundler only ever needs to resolve the starter
    // Counter's \`@/components/ui/button\` import to a real \`.tsx\` file
    // to bundle, which is always the source one.
    alias: {
      '@/components': resolve(HERE, 'components'),
    },
  },
  // \`build.outDir\` (\`public/components\`) is itself a subdirectory of
  // \`public/\` — Vite's own default \`publicDir\` behavior would copy
  // \`public/\`'s OTHER contents (styles.css, tokens.css, favicon.svg,
  // uno.css) into \`public/components\` too, which nothing reads (Workers
  // Assets already serves them straight from \`public/\` itself) and
  // which \`emptyOutDir\` would then immediately churn on the next build.
  publicDir: false,
  build: {
    outDir: 'public/components',
    emptyOutDir: true,
  },
  plugins: barefoot({
    components: ['components'],
    templates: 'dist/components',
  }),
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
      "@/components/*": ["./dist/components/*", "./components/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist/components"]
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
// are hand-written design tokens — so the vite-output section names only
// the generated children (hashed client JS under `public/components/`)
// and lets `public/uno.css` ride the shared base's uno entry. Compiled
// SSR templates land under `dist/components/` (never served over HTTP),
// covered by the same entry.
const HONO_GITIGNORE = buildGitignore([
  {
    heading: 'vite build outputs (regenerated by `vite build` / `vite dev`)',
    entries: [
      'public/components/',
      'dist/',
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
    'vite.config.ts': HONO_VITE_CONFIG_TS,
    'tsconfig.json': HONO_TSCONFIG,
    'wrangler.jsonc': HONO_WRANGLER_JSONC,
    'uno.config.ts': unoConfigTs([
      'components/**/*.tsx',
      'dist/components/**/*.tsx',
      'server.tsx',
      'renderer.tsx',
    ]),
    'components/Counter.tsx': SHARED_COUNTER_TSX,
    'components/Counter.test.tsx': SHARED_COUNTER_TEST_TSX,
    'public/styles.css': STYLES_CSS,
    'public/tokens.css': TOKENS_CSS,
    'public/uno.css': UNO_CSS_PLACEHOLDER,
    'public/favicon.svg': FAVICON_SVG,
    '.gitignore': HONO_GITIGNORE,
  },
  scripts: {
    // `wrangler` is a devDependency below, so package.json scripts
    // resolve it straight from `node_modules/.bin` — no `npx`/`bunx`/
    // `pnpm dlx` wrapper needed (and no unpinned download on first
    // `<pm> run dev`, since the version is pinned in devDependencies).
    // `vite build` runs once up front so `public/components` +
    // `dist/components` exist before `wrangler dev` starts; `vite dev`
    // then takes over the watch loop, re-emitting SSR templates with
    // dev-origin script URLs on every component edit — the same
    // dev-loop shape as `@barefootjs/hono`'s own Vite integration.
    dev: 'vite build && unocss && concurrently -k -n vite,uno,wrangler -c blue,magenta,green "vite dev" "unocss --watch" "wrangler dev --live-reload"',
    build: 'vite build && unocss',
    deploy: 'vite build && unocss && wrangler deploy',
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
    // Must satisfy wrangler's `peerOptional @cloudflare/workers-types`
    // (bun tolerates a mismatch; npm does not — CI's smoke-publish gate
    // catches it). Upstream keeps flip-flopping which major it peers on:
    // 4.107.1 peers `^4.20260702.1`; 4.108.0 moved to `^5.20260706.1` and
    // was deprecated same-day; 4.110.0 (which `^4.0.0` resolves to today)
    // peers `^5.20260708.1`. Rather than chase whichever version last
    // shipped, accept BOTH majors so npm installs whichever the resolved
    // wrangler actually peers on — v5 when it wants v5, v4 after a
    // deprecation falls back to a v4-peering wrangler. No ERESOLVE either way.
    '@cloudflare/workers-types': '^4.20260702.1 || ^5.20260708.1',
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
    // `@barefootjs/hono`'s composed `/vite` wrapper peer-depends on
    // both — real devDependencies here (not just a hoisted transitive
    // resolution) so `vite build` / `vite dev` resolve without an extra
    // install step, matching every Vite-based integration.
    '@barefootjs/vite': 'latest',
    vite: '^6.0.0',
    // Pinned so `<pm> run dev` / `<pm> run deploy` resolve a known
    // `wrangler` from `node_modules/.bin` instead of pausing on an
    // unpinned download the first time they run (see the `scripts`
    // comment above — this is what makes the bare invocation safe).
    wrangler: '^4.0.0',
  },
  // `wrangler` pulls in `miniflare`, which pins `undici` to an exact
  // (non-range) version rather than a caret range — so a vulnerable
  // `undici` release stays wired in even at the latest resolvable
  // `wrangler`/`miniflare`, and `npm audit fix` can't bump past it
  // (nothing to bump: the range is a single exact version). Overriding
  // `undici` directly is the only way to clear the advisory
  // (GHSA-8xcm-r25x-g524 and friends) without waiting on `miniflare` to
  // re-pin. Verified clean (`npm audit` → 0 vulnerabilities) against
  // wrangler@4.119.0 / miniflare@5.20260801.0-alpha, which pin
  // undici@7.28.0.
  overrides: {
    undici: '^7.29.0',
  },
  prereqWarnings: () => [],
}
