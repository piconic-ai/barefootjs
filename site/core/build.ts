/**
 * Build script for the BarefootJS site (landing page + documentation).
 *
 * Component compilation is owned by `@barefootjs/vite` (see
 * vite.config.ts): `vite build` emits compiled SSR templates into
 * dist/components/ (+ manifest.json) and bundled, content-hashed client
 * JS into dist/static/components/. This script runs that build first,
 * then assembles everything else the site serves out of dist/:
 *
 * - dist/content.json (bundled markdown from docs/core/)
 * - dist/static/components/barefoot.js (standalone runtime for the
 *   playground iframe — the only consumer left that imports the runtime
 *   by fixed URL instead of through a bundled chunk)
 * - dist/uno.css + dist/static/globals.css (tokens + globals + landing)
 * - dist/static/logos/, dist/static/snippets/, icons
 * - dist/playground/ (worker + page script + Monaco type bundle)
 * - dist/_headers, dist/llms.txt
 */

import { mkdir, readdir } from 'node:fs/promises'
import { dirname, resolve, join, relative } from 'node:path'
import { loadContentFromDisk } from './lib/content-loader'

const ROOT_DIR = dirname(import.meta.path)
const CONTENT_DIR = resolve(ROOT_DIR, '../../docs/core')
const DIST_DIR = resolve(ROOT_DIR, 'dist')
const DIST_COMPONENTS_DIR = resolve(DIST_DIR, 'components')
const DIST_STATIC_DIR = resolve(DIST_DIR, 'static')
const DIST_STATIC_COMPONENTS_DIR = resolve(DIST_STATIC_DIR, 'components')
const DOM_PKG_DIR = resolve(ROOT_DIR, '../../packages/client')
const SHARED_DIR = resolve(ROOT_DIR, '../shared')
const LANDING_COMPONENTS_DIR = resolve(ROOT_DIR, 'landing/components')

import { scanCoreDocs } from '../../packages/cli/src/lib/docs-loader'
import { generateCoreLlmsTxt } from '../../packages/cli/src/lib/llms-txt-generator'

console.log('Building BarefootJS site...\n')

await mkdir(DIST_COMPONENTS_DIR, { recursive: true })
await mkdir(DIST_STATIC_DIR, { recursive: true })

// ── 1. Bundle markdown content ────────────────────────────────
const { pages, content, mdx } = await loadContentFromDisk(CONTENT_DIR)
await Bun.write(resolve(DIST_DIR, 'content.json'), JSON.stringify({ content, mdx }))
console.log(`Bundled: ${pages.length} md pages + ${Object.keys(mdx).length} mdx pages → dist/content.json`)

// ── 2. Compile components + bundle client JS via @barefootjs/vite ──
// Emits dist/components/*.tsx (+ manifest.json) and content-hashed
// client chunks under dist/static/components/ (emptyOutDir wipes only
// that directory — see vite.config.ts).
console.log('Building components with vite...')
const viteProc = Bun.spawn(['bunx', 'vite', 'build'], {
  cwd: ROOT_DIR,
  stdout: 'inherit',
  stderr: 'inherit',
})
if ((await viteProc.exited) !== 0) {
  throw new Error('vite build failed')
}

// ── 3. Build and copy barefoot.js runtime ─────────────────────
// Compiled components load the runtime as an ordinary bundled chunk; the
// one remaining fixed-URL consumer is the playground's sandboxed iframe,
// whose import map resolves `@barefootjs/client` to
// /static/components/barefoot.js (see playground/page-script.ts). Written
// AFTER the vite build so emptyOutDir can't delete it.
const barefootFileName = 'barefoot.js'
const domDistFile = resolve(DOM_PKG_DIR, 'dist/runtime/standalone.js')

if (!await Bun.file(domDistFile).exists()) {
  console.log('Building @barefootjs/client...')
  const proc = Bun.spawn(['bun', 'run', 'build'], { cwd: DOM_PKG_DIR })
  await proc.exited
}

// Fully minify the runtime at copy time (identifier mangling included —
// only the runtime's ESM export names must survive, and Bun.build
// preserves those). The runtime is the largest single script the site
// serves, and the LP's runtime-size claim (hero.tsx, "min+gzip") is
// measured on this minified build — re-measure and update hero.tsx when
// runtime changes move it.
const runtimeBuild = await Bun.build({
  entrypoints: [domDistFile],
  target: 'browser',
  format: 'esm',
  minify: true,
})
if (!runtimeBuild.success || runtimeBuild.outputs.length === 0) {
  for (const log of runtimeBuild.logs) console.error(log)
  throw new Error('Failed to minify barefoot.js runtime')
}
await Bun.write(resolve(DIST_STATIC_COMPONENTS_DIR, barefootFileName), runtimeBuild.outputs[0])
console.log(`Generated: dist/static/components/${barefootFileName} (minified)`)

// ── 4. Copy .ts modules from landing/components ───────────────
// Non-component modules (landing/components/shared/*.ts) that emitted
// templates import relatively — the compiler re-anchors `./shared/...`
// imports to dist/components/shared/..., so the files must exist there.
async function copyTsModules(srcDir: string, destDir: string): Promise<void> {
  const entries = await readdir(srcDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name)
    const destPath = join(destDir, entry.name)
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true })
      await copyTsModules(srcPath, destPath)
    } else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.js')) && !entry.name.endsWith('.d.ts')) {
      await Bun.write(destPath, Bun.file(srcPath))
      console.log(`Copied: dist/components/${relative(DIST_COMPONENTS_DIR, destPath)}`)
    }
  }
}
await copyTsModules(LANDING_COMPONENTS_DIR, DIST_COMPONENTS_DIR)

// ── 5. CSS: Generate tokens from JSON + globals.css + landing.css ─
const { loadTokens, generateCSS } = await import('../shared/tokens/index')
const baseTokens = await loadTokens(resolve(SHARED_DIR, 'tokens/tokens.json'))
const tokensCSS = generateCSS(baseTokens)
const globalsCSS = await Bun.file(resolve(ROOT_DIR, 'styles/globals.css')).text()
const landingCSS = await Bun.file(resolve(ROOT_DIR, 'styles/landing.css')).text()
const combinedCSS = tokensCSS + '\n' + globalsCSS + '\n' + landingCSS
await Bun.write(resolve(DIST_DIR, 'globals.css'), combinedCSS)
await Bun.write(resolve(DIST_STATIC_DIR, 'globals.css'), combinedCSS)
console.log('Generated: dist/static/globals.css (tokens + globals + landing)')

// ── 6. Generate UnoCSS ───────────────────────────────────────
// Scan globs come from uno.config.ts (content.filesystem) so the config is
// the single source of truth — a page dir added there is picked up here too.
// The CLI doesn't read content.filesystem itself, so pass them as arguments.
console.log('\nGenerating UnoCSS...')
const { default: unoConfig } = await import('./uno.config')
const unoGlobs = unoConfig.content?.filesystem
if (!unoGlobs?.length) throw new Error('uno.config.ts must define content.filesystem globs')
const unoProc = Bun.spawn(
  ['bunx', 'unocss', ...unoGlobs, '-o', 'dist/uno.css'],
  { cwd: ROOT_DIR, stdout: 'inherit', stderr: 'inherit' }
)
await unoProc.exited
await Bun.write(resolve(DIST_STATIC_DIR, 'uno.css'), Bun.file(resolve(DIST_DIR, 'uno.css')))
console.log('Generated: dist/static/uno.css')

// ── 7. Copy icon files ───────────────────────────────────────
const IMAGES_DIR = resolve(ROOT_DIR, '../../images/logo')
const icon32 = resolve(IMAGES_DIR, 'icon-32.png')
const icon64 = resolve(IMAGES_DIR, 'icon-64.png')
const icon192 = resolve(IMAGES_DIR, 'icon-192.png')

if (await Bun.file(icon32).exists()) {
  await Bun.write(resolve(DIST_DIR, 'icon-32.png'), Bun.file(icon32))
  await Bun.write(resolve(DIST_STATIC_DIR, 'icon-32.png'), Bun.file(icon32))
  await Bun.write(resolve(DIST_DIR, 'favicon.ico'), Bun.file(icon32))
  console.log('Copied: dist/icon-32.png, dist/static/icon-32.png, dist/favicon.ico')
}
if (await Bun.file(icon64).exists()) {
  await Bun.write(resolve(DIST_DIR, 'icon-64.png'), Bun.file(icon64))
  await Bun.write(resolve(DIST_STATIC_DIR, 'icon-64.png'), Bun.file(icon64))
  console.log('Copied: dist/icon-64.png, dist/static/icon-64.png')
}
if (await Bun.file(icon192).exists()) {
  await Bun.write(resolve(DIST_DIR, 'icon-192.png'), Bun.file(icon192))
  await Bun.write(resolve(DIST_STATIC_DIR, 'icon-192.png'), Bun.file(icon192))
  console.log('Copied: dist/icon-192.png, dist/static/icon-192.png')
}
const faviconSvg = resolve(IMAGES_DIR, 'favicon.svg')
if (await Bun.file(faviconSvg).exists()) {
  await Bun.write(resolve(DIST_DIR, 'favicon.svg'), Bun.file(faviconSvg))
  await Bun.write(resolve(DIST_STATIC_DIR, 'favicon.svg'), Bun.file(faviconSvg))
  console.log('Copied: dist/favicon.svg, dist/static/favicon.svg')
}

for (const name of ['logo.svg', 'logo-for-dark.svg', 'logo-for-light.svg', 'text.svg', 'icon.svg']) {
  // text.svg / icon.svg are referenced from the landing hero diagram.
  // They must be served over /static/ so the LP can load them in dev + prod.
  const aliasMap: Record<string, string> = {
    'text.svg': 'logo-text.svg',
    'icon.svg': 'logo-icon.svg',
  }
  const destName = aliasMap[name] || name
  const src = resolve(IMAGES_DIR, name)
  if (await Bun.file(src).exists()) {
    await Bun.write(resolve(DIST_DIR, destName), Bun.file(src))
    await Bun.write(resolve(DIST_STATIC_DIR, destName), Bun.file(src))
    console.log(`Copied: dist/${destName}, dist/static/${destName}`)
  }
}

// ── 8. Copy LP assets (snippets + logos) ──────────────────────
const SNIPPETS_SRC = resolve(ROOT_DIR, 'public/static/snippets')
const SNIPPETS_DEST = resolve(DIST_STATIC_DIR, 'snippets')
await mkdir(SNIPPETS_DEST, { recursive: true })
const snippetFiles = await readdir(SNIPPETS_SRC).catch(() => [] as string[])
for (const file of snippetFiles) {
  await Bun.write(resolve(SNIPPETS_DEST, file), Bun.file(resolve(SNIPPETS_SRC, file)))
}
if (snippetFiles.length > 0) {
  console.log(`Copied: dist/static/snippets/ (${snippetFiles.length} files)`)
}

const LOGOS_SRC = resolve(ROOT_DIR, 'assets/logos')
const DIST_LOGOS_DIR = resolve(DIST_DIR, 'logos')
const DIST_STATIC_LOGOS_DIR = resolve(DIST_STATIC_DIR, 'logos')
await mkdir(DIST_LOGOS_DIR, { recursive: true })
await mkdir(DIST_STATIC_LOGOS_DIR, { recursive: true })
const logoFiles = await readdir(LOGOS_SRC).catch(() => [] as string[])
for (const file of logoFiles) {
  if (file.endsWith('.svg') || file.endsWith('.png')) {
    await Bun.write(resolve(DIST_LOGOS_DIR, file), Bun.file(resolve(LOGOS_SRC, file)))
    await Bun.write(resolve(DIST_STATIC_LOGOS_DIR, file), Bun.file(resolve(LOGOS_SRC, file)))
  }
}
if (logoFiles.length > 0) {
  console.log(`Copied: dist/logos/, dist/static/logos/ (${logoFiles.length} files)`)
}

// ── 8b. Build playground worker + page script ─────────────────
const PLAYGROUND_SRC_DIR = resolve(ROOT_DIR, 'playground')
const PLAYGROUND_DIST_DIR = resolve(DIST_DIR, 'playground')
const PLAYGROUND_STATIC_DIR = resolve(DIST_STATIC_DIR, 'playground')
await mkdir(PLAYGROUND_DIST_DIR, { recursive: true })
await mkdir(PLAYGROUND_STATIC_DIR, { recursive: true })

async function writePlaygroundAsset(name: string, output: Blob) {
  // Write to both dist/playground/ (dev serveStatic strips /static) and
  // dist/static/playground/ (Cloudflare Workers assets preserve the prefix).
  await Bun.write(resolve(PLAYGROUND_DIST_DIR, name), output)
  await Bun.write(resolve(PLAYGROUND_STATIC_DIR, name), Bun.file(resolve(PLAYGROUND_DIST_DIR, name)))
}

// Worker: bundles @barefootjs/jsx + typescript inline so the playground can
// compile JSX entirely in the browser.
const playgroundWorker = await Bun.build({
  entrypoints: [resolve(PLAYGROUND_SRC_DIR, 'worker.ts')],
  target: 'browser',
  format: 'esm',
  minify: true,
})
if (!playgroundWorker.success) {
  console.error('Playground worker build failed')
  for (const log of playgroundWorker.logs) console.error(log)
  throw new Error('Playground worker bundle failed to build')
}
for (const output of playgroundWorker.outputs) {
  await writePlaygroundAsset('worker.js', output)
}
console.log('Generated: dist/playground/worker.js (+ static copy)')

// Page script: Monaco glue + worker orchestration.
const playgroundPage = await Bun.build({
  entrypoints: [resolve(PLAYGROUND_SRC_DIR, 'page-script.ts')],
  target: 'browser',
  format: 'esm',
  minify: true,
})
if (!playgroundPage.success) {
  console.error('Playground page script build failed')
  for (const log of playgroundPage.logs) console.error(log)
  throw new Error('Playground page bundle failed to build')
}
for (const output of playgroundPage.outputs) {
  await writePlaygroundAsset('page.js', output)
}
console.log('Generated: dist/playground/page.js (+ static copy)')

// Type bundle for Monaco — gives the editor real autocomplete + accurate
// error reporting against @barefootjs/hono/jsx (used as the JSX source) and
// @barefootjs/client (signals API).
const PKG_DIR = resolve(ROOT_DIR, '../../packages')

// Ensure @barefootjs/client has its .d.ts built (step 3 builds the runtime
// JS if missing, but we also need the declarations here).
const clientDtsFile = resolve(PKG_DIR, 'client/dist/index.d.ts')
if (!(await Bun.file(clientDtsFile).exists())) {
  console.log('Building @barefootjs/client declarations for playground types…')
  const proc = Bun.spawn(['bun', 'run', 'build:types'], {
    cwd: resolve(PKG_DIR, 'client'),
  })
  await proc.exited
  if (!(await Bun.file(clientDtsFile).exists())) {
    throw new Error(
      'Failed to build @barefootjs/client declarations (dist/index.d.ts missing)',
    )
  }
}

// Minimal shims for the \`hono/jsx\` + \`hono/jsx/jsx-runtime\` modules the
// @barefootjs/hono declarations reference. Without these Monaco would emit
// "Cannot find module 'hono/jsx…'" diagnostics once semantic validation is
// on. We only need the shapes used by the JSX namespace surface.
const HONO_JSX_SHIM = `declare module 'hono/jsx' {
  export namespace JSX {
    type Element = unknown
  }
}
`
const HONO_JSX_RUNTIME_SHIM = `declare module 'hono/jsx/jsx-runtime' {
  type Props = Record<string, unknown>
  export function jsx(tag: string | Function, props: Props, key?: string): unknown
  export const jsxs: typeof jsx
  export function Fragment(props: { children?: unknown }): unknown
  export function jsxAttr(name: string, value: unknown): string
  export function jsxEscape(value: unknown): string
  export function jsxTemplate(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): unknown
}
`

const typeBundle: Record<string, string> = {
  // Source of truth for @barefootjs/hono JSX types is `index.ts` (ambient
  // declarations via `export declare namespace`); a sibling `.d.ts` no
  // longer exists. Monaco parses the file based on the virtual `.d.ts`
  // key, and the source's syntax is valid as a `.d.ts` body.
  'file:///node_modules/@barefootjs/hono/jsx/jsx-runtime/index.d.ts':
    await Bun.file(resolve(PKG_DIR, 'adapter-hono/src/jsx/jsx-runtime/index.ts')).text(),
  'file:///node_modules/@barefootjs/jsx/jsx-runtime/index.d.ts':
    await Bun.file(resolve(PKG_DIR, 'jsx/src/jsx-runtime/index.ts')).text(),
  'file:///node_modules/@barefootjs/jsx/html-types.d.ts':
    await Bun.file(resolve(PKG_DIR, 'jsx/src/html-types.ts')).text(),
  'file:///node_modules/@barefootjs/client/index.d.ts':
    await Bun.file(clientDtsFile).text(),
  'file:///node_modules/hono/jsx/index.d.ts': HONO_JSX_SHIM,
  'file:///node_modules/hono/jsx/jsx-runtime/index.d.ts': HONO_JSX_RUNTIME_SHIM,
}
await writePlaygroundAsset('types-bundle.json', new Blob([JSON.stringify(typeBundle)]))
console.log('Generated: dist/playground/types-bundle.json (+ static copy)')

// ── 8c. Write _headers for Cloudflare Workers static assets ──────
// The playground iframe runs as `sandbox="allow-scripts"` (no
// allow-same-origin), so its origin is opaque ("null"). When it imports
// /static/components/barefoot.js the request is cross-origin and module
// loading needs CORS. `Access-Control-Allow-Origin: *` makes the runtime
// loadable without giving the iframe access to this site's origin.
const headersContent = `/static/components/*
  Access-Control-Allow-Origin: *
`
await Bun.write(resolve(DIST_DIR, '_headers'), headersContent)
console.log('Generated: dist/_headers')

// ── 9. Generate llms.txt ──────────────────────────────────────
const coreDocs = scanCoreDocs(CONTENT_DIR)
const coreLlmsTxt = generateCoreLlmsTxt(coreDocs, 'https://barefootjs.dev/docs')
await Bun.write(resolve(DIST_DIR, 'llms.txt'), coreLlmsTxt)
console.log('Generated: dist/llms.txt')

console.log('\nBuild complete!')
