/**
 * build-registry.ts — pre-compile the ui.barefootjs.dev registry components
 * ONCE at build time into a Worker-Loader module set the host merges into every
 * session (like the vendor bundle).
 *
 * Why pre-compile (not compile at runtime like the user's own components):
 * the registry is FIXED. It never changes between sessions, so compiling it in
 * the browser on every Run would be pure waste. Mirroring `build-vendor.ts`, we
 * compile it offline here and emit `generated/registry-bundle.ts`.
 *
 * Source of truth: the LIVE published registry at https://ui.barefootjs.dev/r/
 * — the exact endpoint `bf add` fetches from. Each component's `.tsx` is pulled
 * from its registry item (shadcn `registry-item` format) at build time, so the
 * playground genuinely consumes the published registry rather than the
 * monorepo's local copies. See `fetchRegistrySource` below.
 *
 * They are shadcn-style barefoot components using CSS-variable theming
 * (bg-primary, text-muted-foreground, border-input, …). The AI's generated app
 * imports them as `import { Button } from '@/components/ui/button'` and uses
 * `<Button variant="default">Save</Button>`.
 *
 * Module-key / import convention (the load-bearing part):
 *   - Each registry component's compiled SSR template is keyed at the ROOT as
 *     `ui_<name>.js` (e.g. `ui_button.js`), provided to the Worker Loader in
 *     plain-string form. Root-keying is LOAD-BEARING: the Worker Loader resolves
 *     a BARE specifier (e.g. `hono/jsx/jsx-runtime`, which the template imports)
 *     RELATIVE to the importing module's key-as-path. A module keyed under a
 *     `@/components/ui/` "directory" would resolve `hono/...` to
 *     `@/components/ui/hono/...` — which does not exist. So registry templates
 *     must sit at the root next to the vendor object-form modules, exactly like
 *     the user's own components (see compile-app-core.ts's header).
 *   - The user's compiled `import { Button } from '@/components/ui/button'` is
 *     rewritten by compile-app-core to `./ui_button.js` (alongside its existing
 *     `./src/<Name>` → `./<Name>.js` rewrite), resolving to the root-keyed
 *     module.
 *   - A registry component that imports a sibling (Button/Badge → `../slot`) has
 *     that relative specifier rewritten at compile time to `./ui_slot.js` (see
 *     `rewriteRelativeImport`), resolving against the root module map.
 *   - Bare `hono/*` + `@barefootjs/hono/*` imports inside the templates resolve
 *     via the existing vendor object-form modules (single shared hono instance),
 *     because the template module is keyed at the root.
 *   - Type-only imports (`@barefootjs/jsx` types, the `Child` type from
 *     `../../../types`) are erased by the esbuild transpile, so the `Child`
 *     rewrite target never needs a real module.
 *
 * Client JS: registry components ARE compiled to hydration client JS (Button
 * registers `hydrate('Button', …)` etc.). Parent→child client JS is COMBINED
 * (Button/Badge inline Slot) via `combineParentChildClientJs`, exactly as the
 * site UI build does, so each served `<name>.client.js` is self-contained. The
 * client JS is served by the HOST at `${STATIC_BASE}<name>.client.js`; the SSR
 * template emits the matching `<script>` tag via `addScriptCollection`. A user
 * component that places a registry child therefore does NOT need to bundle the
 * child's client JS — it loads via its own script-collection tag, and the user
 * client JS's `@bf-child:` placeholder import is stripped (see compile-app-core).
 *
 * Run: `bun run site/playground/build/build-registry.ts`
 * Bun.build is NOT used here (only compileJSX + esbuild transform, like the
 * runtime path); the output is embedded as generated/registry-bundle.ts.
 */

import { writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from 'esbuild'
import { combineParentChildClientJs } from '@barefootjs/jsx'
import { addScriptCollection } from '@barefootjs/hono/build'
import { STATIC_BASE, buildComponentToMemory } from './build-to-memory'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLAYGROUND = join(HERE, '..')
const REPO_ROOT = join(PLAYGROUND, '..', '..')
const GENERATED = join(PLAYGROUND, 'generated')

/**
 * The CURATED initial registry set. Start small: only components whose full
 * runtime dependency graph we can satisfy with no heavy/native deps.
 *   - slot      — runtime dep of button + badge (the `asChild` polymorphism).
 *   - button, badge, card, input, label, separator — basic shadcn primitives.
 * All are non-stateful (`bf docs <name>` → "Stateful: no") so they only ship
 * tiny attribute-binding hydration JS, no signals.
 *
 * Each entry is the on-disk folder name under ui/components/ui/<name>/index.tsx.
 * `slot` is compiled (it is a real runtime dep) but the AI is NOT told about it
 * (it is internal to button/badge's asChild). `expose: false` keeps it out of
 * the AI-facing summary.
 *
 * DROPPED from the initial set and why (see report):
 *   - Anything importing a lucide Icon, a portal/overlay, or `embla` (carousel,
 *     dialog, select, dropdown-menu, tooltip, …): heavier dep graphs / client
 *     runtimes not yet wired into the playground vendor bundle.
 */
interface RegistryEntry {
  /** Folder name under ui/components/ui/ and the `@/components/ui/<name>` key. */
  name: string
  /** Whether to advertise this component to the AI (slot is internal). */
  expose: boolean
}

const REGISTRY: RegistryEntry[] = [
  { name: 'slot', expose: false },
  { name: 'button', expose: true },
  { name: 'badge', expose: true },
  { name: 'card', expose: true },
  { name: 'input', expose: true },
  { name: 'label', expose: true },
  { name: 'separator', expose: true },
]

/**
 * The ROOT module key for a registry component (`button` → `ui_button.js`).
 * Shared with compile-app-core via the registry bundle's import-rewrite so the
 * user's `@/components/ui/button` import resolves here. The `ui_` prefix keeps
 * registry modules from colliding with a user component file named e.g.
 * `Button.tsx` (keyed `Button.js`).
 */
function rootKey(name: string): string {
  return `ui_${name}.js`
}

/**
 * Rewrite a registry component's relative import to its sibling's ROOT key
 * (`../slot` → `./ui_slot.js`). Handles `../slot`, `../../slot`, etc. Type-only
 * imports (e.g. `../../../types`) are erased by transpile, so their rewrite
 * target is never resolved — harmless.
 */
function rewriteRelativeImport(importPath: string): string {
  const m = importPath.match(/(?:\.\.\/)+([a-z][a-z0-9-]*)$/i)
  if (m) return `./${rootKey(m[1])}`
  return importPath
}

/** Native esbuild transform (Bun-only), matching the runtime path's options. */
async function nativeTransform(code: string): Promise<string> {
  const out = await transform(code, {
    loader: 'tsx',
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
    legalComments: 'none',
  })
  return out.code
}

interface CompiledRegistryComponent {
  name: string
  /** SSR template (post-script-collection, pre-transpile). */
  ssrTemplate: string
  /** Raw client JS (pre-combine). Empty string if the component ships none. */
  clientJs: string
  /** The PascalCase component names this module exports (for the AI summary). */
  exports: string[]
  /** Original .tsx source, retained as a UnoCSS scan input (see below). */
  source: string
}

// The LIVE BarefootJS component registry — the exact endpoint `bf add` pulls
// from (DEFAULT_REGISTRY_URL in @barefootjs/cli). Each item is a shadcn-format
// registry item ({ files: [{ path, content }] }) that BUNDLES the component plus
// its deps (e.g. button bundles slot + the shared types). Sourcing from here —
// rather than reading the monorepo's local copies — means the playground truly
// uses the published ui.barefootjs.dev registry (the same one any project gets
// via `bf add`). Build-time network access is required (like `bf add`).
const REGISTRY_URL = 'https://ui.barefootjs.dev/r/'

interface RegistryItemFile {
  path: string
  content: string
}
interface RegistryItem {
  files?: RegistryItemFile[]
}

/**
 * Fetch a component's source from the live registry: GET <REGISTRY_URL><name>.json,
 * then return the content of its `components/ui/<name>/index.tsx` file. The item
 * also bundles its deps (slot, the shared types), but we compile each registry
 * entry independently (slot is its own REGISTRY entry), so we only need this
 * component's own file here.
 */
async function fetchRegistrySource(name: string): Promise<string> {
  const url = `${REGISTRY_URL}${name}.json`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Registry fetch failed for "${name}": ${res.status} (${url})`)
  }
  const item = (await res.json()) as RegistryItem
  const wanted = `components/ui/${name}/index.tsx`
  const file = item.files?.find((f) => f.path === wanted)
  if (!file) {
    throw new Error(
      `Registry item "${name}" has no file ${wanted} (got: ${item.files?.map((f) => f.path).join(', ')})`,
    )
  }
  return file.content
}

async function compileRegistryComponent(
  entry: RegistryEntry,
): Promise<CompiledRegistryComponent> {
  // Virtual path identifier (the registry's own path) for compileJSX diagnostics.
  const filePath = `components/ui/${entry.name}/index.tsx`
  const source = await fetchRegistrySource(entry.name)

  // Compile to in-memory artifacts. `rewriteRelativeImport` maps a sibling
  // import (`../slot` → `./ui_slot.js`) onto the root module map. The `@bf-child:`
  // placeholders are KEPT (stripChildPlaceholders defaults off): the registry
  // build runs `combineParentChildClientJs` over the raw client JS itself.
  const { names, ssrTemplate, clientJs } = buildComponentToMemory(
    source,
    filePath,
    {
      scriptBaseName: entry.name,
      rewriteRelativeImport,
    },
  )

  return {
    name: entry.name,
    ssrTemplate,
    clientJs,
    exports: names,
    source,
  }
}

async function main() {
  // 1. Compile every curated component (compileJSX + HonoAdapter), collecting
  //    SSR templates + raw client JS.
  const compiled: CompiledRegistryComponent[] = []
  for (const entry of REGISTRY) {
    compiled.push(await compileRegistryComponent(entry))
  }

  // 2. Combine parent→child client JS (Button/Badge inline Slot), exactly as the
  //    site UI build does, so every served `<name>.client.js` is self-contained.
  const clientFiles = new Map<string, string>()
  for (const c of compiled) {
    if (c.clientJs) clientFiles.set(c.name, c.clientJs)
  }
  const combined = combineParentChildClientJs(clientFiles)
  for (const [name, content] of combined) {
    clientFiles.set(name, content)
  }

  // 3. Wrap each SSR template with the Hono script-collection so a rendered
  //    registry component emits its barefoot.js + `<name>.client.js` hydration
  //    tags (deduped per request). Then transpile to ESM.
  const registryModules: Record<string, string> = {}
  const registryClientJs: Record<string, string> = {}
  for (const c of compiled) {
    const hasClient = clientFiles.has(c.name)
    const wrapped = hasClient
      ? addScriptCollection(
          c.ssrTemplate,
          c.name,
          `${c.name}.client.js`,
          STATIC_BASE,
        )
      : c.ssrTemplate
    registryModules[rootKey(c.name)] = await nativeTransform(wrapped)
    if (hasClient) {
      registryClientJs[c.name] = clientFiles.get(c.name)!
    }
  }

  // Public import specifier (`@/components/ui/<name>`) → root module key
  // (`ui_<name>.js`). compile-app-core uses this to rewrite the user's app
  // imports onto the root-keyed registry modules.
  const importMap: Record<string, string> = {}
  for (const c of compiled) {
    importMap[`@/components/ui/${c.name}`] = `./${rootKey(c.name)}`
  }

  // 4. AI-facing summary: name → exported component identifiers, exposed only.
  const exposed = REGISTRY.filter((e) => e.expose)
  const summary = exposed.map((e) => {
    const c = compiled.find((x) => x.name === e.name)!
    return { name: e.name, key: `@/components/ui/${e.name}`, exports: c.exports }
  })

  // 5. UnoCSS scan input. The registry's class tokens are FIXED, but the
  //    runtime UnoCSS pass (compile-app-core) only scans the USER's sources — it
  //    cannot read the registry .tsx files (no fs in the browser worker). So we
  //    embed the registry sources + compiled templates here and feed them to the
  //    generator as an extra input, ensuring bg-primary / border-input / … land
  //    in the served uno.css.
  const unoSource = compiled
    .map((c) => `${c.source}\n${c.ssrTemplate}`)
    .join('\n')

  await mkdir(GENERATED, { recursive: true })
  const module = `// Generated by build/build-registry.ts — do not edit by hand.
// Pre-compiled ui.barefootjs.dev registry components for the playground.
//
// REGISTRY_MODULES are Worker-Loader OBJECT-form modules keyed by the public
// import specifier (\`@/components/ui/<name>\`) the AI's generated app imports;
// the host merges them into every session's module map (alongside vendor + the
// session's own user modules). REGISTRY_CLIENT_JS are the combined hydration
// bundles the host serves at \`\${STATIC_BASE}<name>.client.js\`. REGISTRY_SUMMARY
// is the AI-facing list of available components (name, import key, exports).
export const REGISTRY_MODULES: Record<string, string> = ${JSON.stringify(registryModules, null, 2)}
// Public import specifier (\`@/components/ui/<name>\`) → root module key
// (\`./ui_<name>.js\`). compile-app-core rewrites the user's app imports with this.
export const REGISTRY_IMPORT_MAP: Record<string, string> = ${JSON.stringify(importMap, null, 2)}
export const REGISTRY_CLIENT_JS: Record<string, string> = ${JSON.stringify(registryClientJs, null, 2)}
export interface RegistryComponentSummary {
  name: string
  key: string
  exports: string[]
}
export const REGISTRY_SUMMARY: RegistryComponentSummary[] = ${JSON.stringify(summary, null, 2)}
// Concatenated registry sources + compiled templates, used ONLY as a UnoCSS
// scan input by compile-app-core so the registry's fixed utility classes
// (bg-primary, border-input, …) are emitted into the served uno.css.
export const REGISTRY_UNO_SOURCE: string = ${JSON.stringify(unoSource)}
`
  await writeFile(join(GENERATED, 'registry-bundle.ts'), module)
  console.log(
    `Wrote generated/registry-bundle.ts: ${Object.keys(registryModules).length} modules, ` +
      `${Object.keys(registryClientJs).length} client bundles, ` +
      `${summary.length} exposed components`,
  )

  // 6. Tokens stylesheet (CSS variables: --primary, --background, --border, …).
  //    The registry's semantic utilities reference these vars, so the host must
  //    serve this BEFORE uno.css (vars defined before utilities use them).
  //    Generated from site/shared/tokens + site/ui/tokens.json exactly as
  //    site/ui/build.ts does (light theme; the token set has no dark block, so
  //    nothing more is needed for the playground's light canvas).
  const { loadTokens, mergeTokenSets, generateCSS } = await import(
    join(REPO_ROOT, 'site', 'shared', 'tokens', 'index.ts')
  )
  const baseTokens = await loadTokens(
    join(REPO_ROOT, 'site', 'shared', 'tokens', 'tokens.json'),
  )
  const uiTokens = await loadTokens(
    join(REPO_ROOT, 'site', 'ui', 'tokens.json'),
  )
  const tokensCss = generateCSS(mergeTokenSets(baseTokens, uiTokens))
  const tokensModule = `// Generated by build/build-registry.ts — do not edit by hand.
// Design-token CSS variables (--primary, --background, --border, …) the registry
// components' semantic utilities reference. Served by the host at
// \`/__rt-static/tokens.css\` and linked BEFORE uno.css so the variables are
// defined before any utility uses them.
export const TOKENS_CSS: string = ${JSON.stringify(tokensCss)}
`
  await writeFile(join(GENERATED, 'tokens-bundle.ts'), tokensModule)
  console.log(`Wrote generated/tokens-bundle.ts (${tokensCss.length} bytes)`)
}

await main()
