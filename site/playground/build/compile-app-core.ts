/**
 * compileAppCore — the isomorphic heart of the playground build pipeline.
 *
 * Compiles a MULTI-ROUTE user app into a Worker-Loader module set, with NO
 * bf-CLI subprocess and NO whole-app bundler. It is environment-agnostic:
 *
 *   - It does NOT touch `node:fs`. The fixed barefoot.js DOM runtime is passed
 *     IN (`opts.barefootRuntime`).
 *   - The JSX→ESM transpile is pluggable (`opts.transform`). The Bun build
 *     scripts inject esbuild's native `transform`; the browser compile worker
 *     injects `esbuild-wasm`'s `transform`. Both produce identical single-file
 *     ESM output (no bundling).
 *
 * App shape (the contract the AI + the template both follow):
 *
 *   - `server.tsx`        — an AI-authored Hono app. Declares page routes via
 *                           `c.render(<Page/>)`, imports page components as
 *                           `import { Counter } from './src/Counter'`, uses the
 *                           fixed `renderer`. It MUST NOT serve `/static/*`
 *                           assets — the host serves those (see worker.ts).
 *   - `src/<Name>.tsx`    — N barefoot `'use client'` components (one per page).
 *   - `renderer.tsx`      — the fixed jsxRenderer shell (import map + uno.css +
 *                           <BfScripts/>). Generated here so all asset URLs use
 *                           the rt-static base; an AI-supplied renderer.tsx is
 *                           ignored in favour of the canonical one.
 *
 * For EACH `src/*.tsx` the existing barefoot compile runs (compileJSX →
 * SSR template + client JS). The host serves each component's client JS at
 * `${STATIC_BASE}<Name>.client.js` plus the shared `barefoot.js` + `uno.css`.
 *
 * Module resolution convention (the key risk — see the header of compile-app.ts
 * for the empirically-proven Worker Loader facts):
 *   - Component SSR templates are keyed at the ROOT as `<Name>.js`, NOT under
 *     `src/`. This is load-bearing: the Worker Loader resolves a BARE specifier
 *     (e.g. `hono/jsx/jsx-runtime`, which the transpiled template imports)
 *     relative to the importing module's DIRECTORY. A module keyed `src/X.js`
 *     would resolve `hono/...` to `src/hono/...` — which does not exist — so the
 *     templates must sit at the root next to the vendor object-form modules.
 *   - server.tsx is `index.js`; the AI imports components as `./src/<Name>`.
 *     esbuild leaves the specifier verbatim, so we rewrite it: `./src/<Name>` →
 *     `./<Name>.js` (drop the `src/` segment, add `.js`), and `./renderer` →
 *     `./renderer.js`. The loader then resolves `./<Name>.js` (relative to the
 *     root `index.js`) to the root-keyed component module.
 *   - Each compiled SSR template imports bare `@barefootjs/hono/*` + `hono/*`,
 *     which resolve via the vendor object-form modules (single shared hono
 *     instance) because the template module is keyed at the root.
 *
 * It returns ONLY the user-specific modules (`userModules`). The FIXED vendor
 * modules + the barefoot.js runtime are merged in by the host (worker.ts) /
 * the Bun wrapper (compile-app.ts).
 *
 * See compile-app.ts (Bun wrapper) and client/compile-worker.ts (browser entry).
 */

// Import createGenerator from @unocss/core directly (its actual source) rather
// than the `unocss` meta-package. The meta-package's `export *` also re-exports
// @unocss/transformer-attributify-jsx, which pulls in oxc-parser's wasm32-wasi
// binding — unresolvable in a `bun build --target=browser` bundle. We only need
// the generator + preset, so the narrower imports keep the browser worker
// buildable. `unocss/preset-wind4` is a standalone subpath export (NOT the
// meta-package `export *`), so it does not drag in the attributify transformer.
import { createGenerator, type UserConfig } from '@unocss/core'
import { presetWind4 } from 'unocss/preset-wind4'
import {
  compileJSX,
  listComponentFunctions,
  type FileOutput,
} from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono'
import { addScriptCollection } from '@barefootjs/hono/build'
import {
  REGISTRY_UNO_SOURCE,
  REGISTRY_IMPORT_MAP,
} from '../generated/registry-bundle'

// Distinct static base so the runtime-compiled app's asset routes never collide
// with the prebuilt app path. The host serves assets under this base; the
// renderer references it (import map + uno.css link).
export const STATIC_BASE = '/__rt-static/components/'
export const UNO_CSS_PATH = '/__rt-static/uno.css'
// Design-token CSS variables (--primary, --background, …). Served by the host
// and linked BEFORE uno.css so the variables exist before utilities use them.
export const TOKENS_CSS_PATH = '/__rt-static/tokens.css'

/** Transpile a JSX/TSX module to plain ESM JS (no bundle). Injected per env. */
export type TransformFn = (
  code: string,
  loader: 'tsx',
) => Promise<{ code: string }>

export interface CompileAppCoreOptions {
  /** The fixed barefoot.js DOM runtime source (served as a browser asset). */
  barefootRuntime: string
  /** JSX/TSX → ESM transpile (esbuild native on Bun, esbuild-wasm in browser). */
  transform: TransformFn
  /**
   * Fallback app files, used when `files` is missing a server.tsx or any
   * `src/*.tsx`. The Bun wrapper reads them from template/; the browser always
   * passes explicit files so it never needs these.
   */
  defaultFiles?: Record<string, string>
}

/** One compiled barefoot component: SSR template module + its client JS asset. */
export interface CompiledComponent {
  /** The component name (PascalCase), used for the client-JS asset path. */
  name: string
  /** The root-level `<Name>.js` module key the server imports resolve to. */
  moduleKey: string
  /** The compiled SSR template (post-script-collection), pre-transpile. */
  ssrTemplate: string
  /** The hydration client JS the host serves at `${STATIC_BASE}<Name>.client.js`. */
  clientJs: string
}

export interface CompileAppCoreResult {
  /**
   * The USER-specific modules only (plain-string ESM, keys end in `.js`):
   *   index.js (server), renderer.js, src/<Name>.js (one per component).
   * Does NOT include the vendor object-form modules or the barefoot runtime
   * — the host merges those in. Asset bodies travel in `assets`, not as
   * modules (the host serves them over HTTP).
   */
  userModules: Record<string, string>
  mainModule: string
  /** The bare-import name + URL path the host should mount the runtime under. */
  runtime: {
    /** Specifier the renderer's import map / asset route serves it at. */
    assetPath: string
    source: string
  }
  /**
   * Browser assets the HOST serves over HTTP. `clientJs` is keyed by component
   * name (served at `${STATIC_BASE}<Name>.client.js`); `barefootJs` + `unoCss`
   * are shared across the whole app.
   */
  assets: {
    barefootJs: string
    unoCss: string
    clientJs: Record<string, string>
  }
}

/**
 * The UnoCSS config the playground generates CSS with. It MUST match
 * `site/ui/uno.config.ts` so the pre-compiled registry components (Button, Card,
 * …) render with their shadcn theming: presetWind4 + a semantic `theme.colors`
 * map (each color → `var(--…)`, resolved by the tokens stylesheet served before
 * uno.css), the border-color preflight (preset-wind4's reset sets border-color
 * to currentColor; this re-applies `var(--border)`), and the safelist for
 * dynamic-context classes the scanner can't see in source. Plain wind4 utilities
 * (slate/indigo, used by the hand-styled default template) keep working — only
 * the semantic var(--…) tokens are added on top.
 */
function makeUnoConfig(): UserConfig {
  return {
    presets: [presetWind4()],
    // Re-apply border-color after preset-wind4's reset (same @layer base, later
    // source order) so var(--border) wins over the reset's currentColor.
    preflights: [
      {
        getCSS: () => '*, ::before, ::after { border-color: var(--border); }',
        layer: 'base',
      },
    ],
    safelist: [
      'border-input',
      'border-destructive',
      'ring-destructive/20',
    ],
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
        success: { DEFAULT: 'var(--success)', foreground: 'var(--success-foreground)' },
        warning: { DEFAULT: 'var(--warning)', foreground: 'var(--warning-foreground)' },
        info: { DEFAULT: 'var(--info)', foreground: 'var(--info-foreground)' },
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
      },
      radius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  }
}

function makeAdapter(): HonoAdapter {
  return new HonoAdapter({
    clientJsBasePath: STATIC_BASE,
    barefootJsPath: `${STATIC_BASE}barefoot.js`,
  })
}

/**
 * Compile a single user component .tsx → { ssrTemplate, clientJs } using the
 * exact in-process path `bf build` uses (compileJSX + HonoAdapter).
 */
function compileComponent(
  source: string,
  filePath: string,
  baseNameNoExt: string,
): { ssrTemplate: string; clientJs: string; componentName: string } {
  const names = listComponentFunctions(source, filePath)
  if (names.length === 0) {
    throw new Error(`No component function found in ${filePath}`)
  }
  const componentName = names[names.length - 1]

  const result = compileJSX(source, filePath, {
    adapter: makeAdapter(),
    scriptBaseName: baseNameNoExt,
    siblingTemplatesRegistered: true,
    // The AI's app imports registry components as `@/components/ui/<name>`.
    // Declaring `@/` a local-import prefix lets the compiler treat those as
    // CHILD components (emit a `<Button>` SSR template call + `initChild` /
    // `renderChild` on the client) rather than unknown opaque imports.
    localImportPrefixes: ['@/'],
  })

  const errors = result.errors.filter((e) => e.severity === 'error')
  if (errors.length > 0) {
    throw new Error(
      `compileJSX errors for ${filePath}:\n` +
        errors.map((e) => `[${e.code ?? '?'}] ${e.message}`).join('\n'),
    )
  }

  const files: FileOutput[] = result.files
  const tpl = files.find((f) => f.type === 'markedTemplate')
  const cjs = files.find((f) => f.type === 'clientJs')
  if (!tpl) throw new Error(`No SSR template emitted for ${filePath}`)
  return {
    ssrTemplate: tpl.content,
    // A user component that places a registry child (e.g. <Button>) emits a
    // `import '/* @bf-child:Button */'` placeholder. In the site UI build the
    // child's client JS is INLINED there; in the playground the registry is
    // pre-compiled separately and its client JS arrives via its OWN
    // script-collection `<script>` tag (emitted by the registry SSR template).
    // So the placeholder must be stripped — left in, it is an `import` of a
    // bogus comment-string specifier that the browser ESM loader rejects.
    // `initChild('Button', …)` then finds the registry-registered init (or
    // queues until the registry script loads — see runtime registry.ts).
    clientJs: stripChildPlaceholders(cjs?.content ?? ''),
    componentName,
  }
}

/**
 * Remove `@bf-child:` placeholder imports from compiled client JS. These mark
 * child-component dependencies for the site build's inliner; in the playground
 * the registry children are pre-compiled and self-register via their own
 * served client JS, so the placeholder import (a non-resolvable comment-string
 * specifier) must be dropped before the module reaches the browser loader.
 */
function stripChildPlaceholders(clientJs: string): string {
  return clientJs.replace(/import\s+'\/\* @bf-child:\w+ \*\/'\n?/g, '')
}

/**
 * Rewrite the AI's UI-registry imports (`@/components/ui/<name>`) onto the
 * ROOT-keyed pre-compiled registry modules (`./ui_<name>.js`). The registry is
 * keyed at the root (so its templates' bare `hono/*` imports resolve — see
 * build-registry.ts), and the user's compiled SSR template imports the registry
 * by its public specifier, so we map each specifier to its root key.
 */
function rewriteRegistryImports(code: string): string {
  return code.replace(
    /(from\s*|import\s*)(['"])(@\/components\/ui\/[^'"]+)\2/g,
    (full, kw: string, quote: string, spec: string) => {
      const target = REGISTRY_IMPORT_MAP[spec]
      return target ? `${kw}${quote}${target}${quote}` : full
    },
  )
}

/**
 * Normalise the relative import specifiers in the transpiled server (index.js)
 * so they resolve against the ROOT-keyed module set.
 *
 * The AI writes `import { Counter } from './src/Counter'` and
 * `import { renderer } from './renderer'`; esbuild's transform leaves those
 * verbatim. Components are keyed at the root as `<Name>.js` (see the file
 * header for why they must NOT live under `src/`), so we:
 *   - drop a leading `./src/` (or `src/`) segment → `./<Name>`, and
 *   - append `.js` to any relative specifier lacking an extension.
 * Bare specifiers (no leading `.`/`/`) and already-extensioned paths are left
 * untouched (vendor object-form modules resolve bare ones).
 */
export function rewriteRelativeImportExtensions(code: string): string {
  // Match `from '...'` / `from "..."` and bare `import '...'` side-effect forms.
  return code.replace(
    /(from\s*|import\s*)(['"])(\.\.?\/[^'"]+)\2/g,
    (_full, kw: string, quote: string, spec: string) => {
      // Flatten `./src/Name` (and `../src/Name`) to a root-relative `./Name`.
      let s = spec.replace(/^(\.\.?\/)+src\//, './')
      // Append `.js` unless the specifier already carries an extension.
      if (!/\.[a-zA-Z0-9]+$/.test(s)) s = `${s}.js`
      return `${kw}${quote}${s}${quote}`
    },
  )
}

/** The fixed renderer shell, generated so its URLs use the computed bases. */
function rendererSource(): string {
  return `
import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '@barefootjs/hono/scripts'

const importMapScript = JSON.stringify({
  imports: {
    '@barefootjs/client': '${STATIC_BASE}barefoot.js',
    '@barefootjs/client/runtime': '${STATIC_BASE}barefoot.js',
    '@barefootjs/client-runtime': '${STATIC_BASE}barefoot.js',
  },
})

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>BarefootJS Playground (runtime-compiled)</title>
        <script type="importmap" dangerouslySetInnerHTML={{ __html: importMapScript }} />
        {/* tokens.css defines the --primary/--background/… variables the registry
            components' semantic utilities reference; it MUST come before uno.css. */}
        <link rel="stylesheet" href="${TOKENS_CSS_PATH}" />
        <link rel="stylesheet" href="${UNO_CSS_PATH}" />
      </head>
      <body class="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans">
        <div class="mx-auto max-w-2xl px-4 py-10 sm:py-16">
          {children}
        </div>
        <BfScripts />
      </body>
    </html>
  )
})
`
}

/**
 * Build the user-specific loadable module set for a MULTI-ROUTE app. Inputs:
 *   - `server.tsx`   (required) — the AI-authored Hono app (the main module).
 *   - `src/*.tsx`    (>=1)      — barefoot page components.
 *   - `renderer.tsx` is IGNORED — the canonical renderer is generated here.
 */
export async function compileAppCore(
  files: Record<string, string>,
  opts: CompileAppCoreOptions,
): Promise<CompileAppCoreResult> {
  const { barefootRuntime, transform } = opts

  // Merge defaults underneath the supplied files (the Bun build passes the
  // template as defaults; the browser always passes a complete set).
  const merged: Record<string, string> = { ...(opts.defaultFiles ?? {}), ...files }

  const serverSource = merged['server.tsx']
  if (serverSource == null) {
    throw new Error('No server.tsx supplied (and no default available)')
  }

  // 1. Compile EVERY src/*.tsx component (in source order for determinism).
  const componentPaths = Object.keys(merged)
    .filter((p) => /^src\/.+\.tsx$/.test(p))
    .sort()
  if (componentPaths.length === 0) {
    throw new Error('No src/*.tsx component files supplied')
  }

  const components: CompiledComponent[] = []
  const unoSources: string[] = []
  for (const path of componentPaths) {
    const source = merged[path]
    const baseNameNoExt = path.replace(/^.*\//, '').replace(/\.tsx?$/, '')
    // Component modules are keyed at the root, so a base name colliding with a
    // fixed module would shadow it. Reject early with a clear message.
    if (baseNameNoExt === 'index' || baseNameNoExt === 'renderer') {
      throw new Error(
        `Component file ${path} would collide with the reserved root module ` +
          `"${baseNameNoExt}.js" — rename the component file.`,
      )
    }
    const { ssrTemplate: rawSsrTemplate, clientJs, componentName } =
      compileComponent(source, path, baseNameNoExt)

    // Inject the Hono script-collection wrapper so the rendered component emits
    // its barefoot.js + <Name>.client.js hydration tags (deduped per request).
    const ssrTemplate = addScriptCollection(
      rawSsrTemplate,
      baseNameNoExt,
      `${baseNameNoExt}.client.js`,
      STATIC_BASE,
    )

    components.push({
      name: componentName,
      // Keyed at the ROOT by the on-disk base name (the AI imports
      // `./src/<base>`, which the server-import rewrite flattens to `./<base>`).
      // Root-keyed so the template's bare `hono/*` imports resolve (see header).
      moduleKey: `${baseNameNoExt}.js`,
      ssrTemplate,
      clientJs,
    })
    unoSources.push(source, ssrTemplate)
  }

  // 2. The fixed renderer shell.
  const renderer = rendererSource()
  unoSources.push(renderer)

  // 3. UnoCSS over ALL component sources + compiled templates + server.tsx
  //    (server may add wrapper classes on its page markup) + the FIXED registry
  //    sources (so a user component using <Button> / <Card> still gets the
  //    registry's bg-primary / border-input / … utilities emitted — the runtime
  //    scanner can't read the registry .tsx files itself).
  const generator = await createGenerator(makeUnoConfig())
  const { css: unoCss } = await generator.generate(
    [...unoSources, serverSource, REGISTRY_UNO_SOURCE].join('\n'),
  )

  // 4. Transpile server.tsx + renderer + every component SSR template to ESM,
  //    then rewrite relative import specifiers so module keys resolve.
  const [serverOut, rendererOut] = await Promise.all([
    transform(serverSource, 'tsx'),
    transform(renderer, 'tsx'),
  ])
  const componentOuts = await Promise.all(
    components.map((c) => transform(c.ssrTemplate, 'tsx')),
  )

  // Rewrite relative specifiers onto root module keys, then map any UI-registry
  // import (`@/components/ui/<name>`) onto its pre-compiled root module.
  const finalize = (code: string): string =>
    rewriteRegistryImports(rewriteRelativeImportExtensions(code))

  const userModules: Record<string, string> = {
    'index.js': finalize(serverOut.code),
    'renderer.js': finalize(rendererOut.code),
  }
  components.forEach((c, i) => {
    userModules[c.moduleKey] = finalize(componentOuts[i].code)
  })

  const clientJs: Record<string, string> = {}
  for (const c of components) clientJs[c.name] = c.clientJs

  return {
    userModules,
    mainModule: 'index.js',
    runtime: { assetPath: `${STATIC_BASE}barefoot.js`, source: barefootRuntime },
    assets: { barefootJs: barefootRuntime, unoCss, clientJs },
  }
}
