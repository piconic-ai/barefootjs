/**
 * Build script for the BarefootJS site (landing page + documentation).
 *
 * Generates:
 * - dist/content.json (bundled markdown from docs/core/)
 * - dist/components/{Component}.tsx (Marked Template)
 * - dist/components/{Component}-{hash}.js (Client JS)
 * - dist/components/barefoot.js (Runtime)
 * - dist/components/manifest.json
 * - dist/uno.css (UnoCSS output)
 * - dist/static/globals.css (tokens.css + globals.css + landing.css concatenated)
 * - dist/static/uno.css
 * - dist/static/components/ (client JS for browser)
 * - dist/static/logos/ (framework logos for LP)
 * - dist/static/snippets/ (code snippet files for LP)
 */

import { compileJSX, combineParentChildClientJs } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { mkdir, readdir } from 'node:fs/promises'
import { dirname, resolve, join, relative } from 'node:path'
import { loadContentFromDisk } from './lib/content-loader'
import {
  hasUseClientDirective,
  discoverComponentFiles,
  generateHash,
  resolveRelativeImports,
} from '../../packages/cli/src/lib/build'
import { addScriptCollection } from '../../packages/hono/src/build'

const ROOT_DIR = dirname(import.meta.path)
const CONTENT_DIR = resolve(ROOT_DIR, '../../docs/core')
const DIST_DIR = resolve(ROOT_DIR, 'dist')
const DIST_COMPONENTS_DIR = resolve(DIST_DIR, 'components')
const DIST_STATIC_DIR = resolve(DIST_DIR, 'static')
const DOM_PKG_DIR = resolve(ROOT_DIR, '../../packages/client')
const SHARED_DIR = resolve(ROOT_DIR, '../shared')
const COMPONENTS_DIR = resolve(ROOT_DIR, 'components')
const LANDING_COMPONENTS_DIR = resolve(ROOT_DIR, 'landing/components')

import { scanCoreDocs } from '../../packages/cli/src/lib/docs-loader'
import { generateCoreLlmsTxt } from '../../packages/cli/src/lib/llms-txt-generator'

console.log('Building BarefootJS site...\n')

await mkdir(DIST_COMPONENTS_DIR, { recursive: true })
await mkdir(DIST_STATIC_DIR, { recursive: true })

// ── 1. Bundle markdown content ────────────────────────────────
const { pages, content } = await loadContentFromDisk(CONTENT_DIR)
await Bun.write(resolve(DIST_DIR, 'content.json'), JSON.stringify(content))
console.log(`Bundled: ${pages.length} pages → dist/content.json`)

// ── 2. Build and copy barefoot.js runtime ─────────────────────
// Use the standalone runtime (reactive primitives inlined) so the
// browser can load the file directly. The sibling `./runtime` entry
// keeps reactive external for bundler-side deduplication.
const barefootFileName = 'barefoot.js'
const domDistFile = resolve(DOM_PKG_DIR, 'dist/runtime/standalone.js')

if (!await Bun.file(domDistFile).exists()) {
  console.log('Building @barefootjs/client...')
  const proc = Bun.spawn(['bun', 'run', 'build'], { cwd: DOM_PKG_DIR })
  await proc.exited
}

await Bun.write(
  resolve(DIST_COMPONENTS_DIR, barefootFileName),
  Bun.file(domDistFile)
)
console.log(`Generated: dist/components/${barefootFileName}`)

// ── 3. Compile "use client" components ────────────────────────

// Manifest
const manifest: Record<string, { clientJs?: string; markedTemplate: string }> = {
  '__barefoot__': { markedTemplate: '', clientJs: `components/${barefootFileName}` }
}

const adapter = new HonoAdapter()

// Discover components from local, shared, and landing dirs
const localComponentFiles = await discoverComponentFiles(COMPONENTS_DIR)
const sharedComponentFiles = await discoverComponentFiles(resolve(SHARED_DIR, 'components'))
const landingComponentFiles = await discoverComponentFiles(LANDING_COMPONENTS_DIR)
const componentFiles = [...localComponentFiles, ...sharedComponentFiles, ...landingComponentFiles]

for (const entryPath of componentFiles) {
  const sourceContent = await Bun.file(entryPath).text()
  if (!hasUseClientDirective(sourceContent)) continue

  const result = await compileJSX(entryPath, async (path) => {
    return await Bun.file(path).text()
  }, { adapter })

  const errors = result.errors.filter(e => e.severity === 'error')
  const warnings = result.errors.filter(e => e.severity === 'warning')

  if (warnings.length > 0) {
    console.warn(`Warnings compiling ${entryPath}:`)
    for (const warning of warnings) console.warn(`  ${warning.message}`)
  }

  if (errors.length > 0) {
    console.error(`Errors compiling ${entryPath}:`)
    for (const error of errors) console.error(`  ${error.message}`)
    continue
  }

  // Determine rootDir based on source location
  const isSharedComponent = entryPath.startsWith(resolve(SHARED_DIR, 'components'))
  const isLandingComponent = entryPath.startsWith(LANDING_COMPONENTS_DIR)
  const rootDir = isSharedComponent
    ? resolve(SHARED_DIR, 'components')
    : isLandingComponent
    ? LANDING_COMPONENTS_DIR
    : COMPONENTS_DIR

  const relativePath = relative(rootDir, entryPath)
  const dirPath = dirname(relativePath)
  const baseFileName = relativePath.split('/').pop()!
  const baseNameNoExt = baseFileName.replace('.tsx', '')

  const outputDir = dirPath === '.' ? DIST_COMPONENTS_DIR : resolve(DIST_COMPONENTS_DIR, dirPath)
  await mkdir(outputDir, { recursive: true })

  let markedJsxContent = ''
  let clientJsContent = ''

  for (const file of result.files) {
    if (file.type === 'markedTemplate') markedJsxContent = file.content
    else if (file.type === 'clientJs') clientJsContent = file.content
  }

  if (!markedJsxContent && !clientJsContent) {
    let transformedSource = sourceContent.replace(/^['"]use client['"];?\s*/m, '')
    await Bun.write(resolve(outputDir, baseFileName), transformedSource)
    console.log(`Generated: dist/components/${relativePath}`)
    manifest[baseNameNoExt] = { markedTemplate: `components/${relativePath}` }
    continue
  }

  if (markedJsxContent && !clientJsContent) {
    await Bun.write(resolve(outputDir, baseFileName), markedJsxContent)
    console.log(`Generated: dist/components/${relativePath}`)
    manifest[baseNameNoExt] = { markedTemplate: `components/${relativePath}` }
    continue
  }

  const hasClientJs = clientJsContent.length > 0
  const hash = generateHash(clientJsContent || markedJsxContent)
  const clientJsFilename = `${baseNameNoExt}-${hash}.js`

  if (hasClientJs) {
    await Bun.write(resolve(outputDir, clientJsFilename), clientJsContent)
    const clientJsRelativePath = dirPath === '.' ? clientJsFilename : `${dirPath}/${clientJsFilename}`
    console.log(`Generated: dist/components/${clientJsRelativePath}`)
  }

  if (markedJsxContent && hasClientJs) {
    const clientJsRelPath = dirPath === '.' ? clientJsFilename : `${dirPath}/${clientJsFilename}`
    const wrappedContent = addScriptCollection(markedJsxContent, baseNameNoExt, clientJsRelPath)
    await Bun.write(resolve(outputDir, baseFileName), wrappedContent)
    console.log(`Generated: dist/components/${relativePath}`)
  } else if (markedJsxContent) {
    await Bun.write(resolve(outputDir, baseFileName), markedJsxContent)
    console.log(`Generated: dist/components/${relativePath}`)
  }

  const componentName = baseNameNoExt
  const markedJsxPath = `components/${relativePath}`
  const clientJsPath = hasClientJs
    ? `components/${dirPath === '.' ? clientJsFilename : `${dirPath}/${clientJsFilename}`}`
    : undefined

  manifest[componentName] = {
    markedTemplate: markedJsxPath,
    clientJs: clientJsPath,
  }
}

// Output manifest
await Bun.write(resolve(DIST_COMPONENTS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log('Generated: dist/components/manifest.json')

// Combine parent-child client JS
const clientJsFiles = new Map<string, string>()
for (const [name, entry] of Object.entries(manifest)) {
  if (!entry.clientJs) continue
  const filePath = resolve(DIST_DIR, entry.clientJs)
  try { clientJsFiles.set(name, await Bun.file(filePath).text()) } catch {}
}
if (clientJsFiles.size > 0) {
  const combined = combineParentChildClientJs(clientJsFiles)
  for (const [name, content] of combined) {
    const entry = manifest[name]
    if (entry?.clientJs) {
      await Bun.write(resolve(DIST_DIR, entry.clientJs), content)
      console.log(`Combined: ${entry.clientJs}`)
    }
  }
}

// Resolve relative imports
await resolveRelativeImports({
  distDir: DIST_DIR,
  manifest,
  sourceDirs: [COMPONENTS_DIR, resolve(SHARED_DIR, 'components'), LANDING_COMPONENTS_DIR],
})

// Generate index.ts for re-exporting all compiled components
async function collectExports(dir: string, prefix: string = ''): Promise<string[]> {
  const exports: string[] = []
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      exports.push(...await collectExports(fullPath, `${prefix}${entry.name}/`))
    } else if (entry.name.endsWith('.tsx')) {
      const baseName = entry.name.replace('.tsx', '')
      const content = await Bun.file(fullPath).text()
      const exportMatches = content.matchAll(/export\s+(?:function|const)\s+(\w+)/g)
      for (const match of exportMatches) {
        exports.push(`export { ${match[1]} } from './${prefix}${baseName}'`)
      }
    }
  }
  return exports
}

const componentExports = await collectExports(DIST_COMPONENTS_DIR)
if (componentExports.length > 0) {
  await Bun.write(resolve(DIST_COMPONENTS_DIR, 'index.ts'), componentExports.join('\n') + '\n')
  console.log('Generated: dist/components/index.ts')
}

// ── 4. CSS: Generate tokens from JSON + globals.css + landing.css ─
const { loadTokens, generateCSS } = await import('../shared/tokens/index')
const baseTokens = await loadTokens(resolve(SHARED_DIR, 'tokens/tokens.json'))
const tokensCSS = generateCSS(baseTokens)
const globalsCSS = await Bun.file(resolve(ROOT_DIR, 'styles/globals.css')).text()
const landingCSS = await Bun.file(resolve(ROOT_DIR, 'styles/landing.css')).text()
const combinedCSS = tokensCSS + '\n' + globalsCSS + '\n' + landingCSS
await Bun.write(resolve(DIST_DIR, 'globals.css'), combinedCSS)
await Bun.write(resolve(DIST_STATIC_DIR, 'globals.css'), combinedCSS)
console.log('Generated: dist/static/globals.css (tokens + globals + landing)')

// ── 5. Generate UnoCSS ───────────────────────────────────────
console.log('\nGenerating UnoCSS...')
const unoProc = Bun.spawn(
  ['bunx', 'unocss', './renderer.tsx', './landing/**/*.tsx', './components/**/*.tsx', './dist/**/*.tsx', '../shared/components/**/*.tsx', '-o', 'dist/uno.css'],
  { cwd: ROOT_DIR, stdout: 'inherit', stderr: 'inherit' }
)
await unoProc.exited
await Bun.write(resolve(DIST_STATIC_DIR, 'uno.css'), Bun.file(resolve(DIST_DIR, 'uno.css')))
console.log('Generated: dist/static/uno.css')

// ── 6. Copy icon files ───────────────────────────────────────
const IMAGES_DIR = resolve(ROOT_DIR, '../../images/logo')
const icon32 = resolve(IMAGES_DIR, 'icon-32.png')
const icon64 = resolve(IMAGES_DIR, 'icon-64.png')

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

for (const name of ['logo.svg', 'logo-for-dark.svg', 'logo-for-light.svg']) {
  const src = resolve(IMAGES_DIR, name)
  if (await Bun.file(src).exists()) {
    await Bun.write(resolve(DIST_DIR, name), Bun.file(src))
    await Bun.write(resolve(DIST_STATIC_DIR, name), Bun.file(src))
    console.log(`Copied: dist/${name}, dist/static/${name}`)
  }
}

// ── 7. Copy .ts modules from landing/components (non-component modules) ──
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

// ── 8. Copy components/ to static/components/ ────────────────
async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await Bun.write(destPath, Bun.file(srcPath))
    }
  }
}
await copyDir(DIST_COMPONENTS_DIR, resolve(DIST_STATIC_DIR, 'components'))
console.log('Copied: dist/static/components/')

// ── 9. Copy LP assets (snippets + logos) ──────────────────────
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
  if (file.endsWith('.svg')) {
    await Bun.write(resolve(DIST_LOGOS_DIR, file), Bun.file(resolve(LOGOS_SRC, file)))
    await Bun.write(resolve(DIST_STATIC_LOGOS_DIR, file), Bun.file(resolve(LOGOS_SRC, file)))
  }
}
if (logoFiles.length > 0) {
  console.log(`Copied: dist/logos/, dist/static/logos/ (${logoFiles.length} files)`)
}

// ── 9b. Build playground worker + page script ─────────────────
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

// Ensure @barefootjs/client has its .d.ts built (step 2 builds the runtime
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
  'file:///node_modules/@barefootjs/hono/jsx/jsx-runtime/index.d.ts':
    await Bun.file(resolve(PKG_DIR, 'hono/src/jsx/jsx-runtime/index.d.ts')).text(),
  'file:///node_modules/@barefootjs/jsx/jsx-runtime/index.d.ts':
    await Bun.file(resolve(PKG_DIR, 'jsx/src/jsx-runtime/index.d.ts')).text(),
  'file:///node_modules/@barefootjs/jsx/html-types.d.ts':
    await Bun.file(resolve(PKG_DIR, 'jsx/src/html-types.ts')).text(),
  'file:///node_modules/@barefootjs/client/index.d.ts':
    await Bun.file(clientDtsFile).text(),
  'file:///node_modules/hono/jsx/index.d.ts': HONO_JSX_SHIM,
  'file:///node_modules/hono/jsx/jsx-runtime/index.d.ts': HONO_JSX_RUNTIME_SHIM,
}
await writePlaygroundAsset('types-bundle.json', new Blob([JSON.stringify(typeBundle)]))
console.log('Generated: dist/playground/types-bundle.json (+ static copy)')

// ── 9c. Write _headers for Cloudflare Workers static assets ──────
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

// ── 10. Generate llms.txt ──────────────────────────────────────
const coreDocs = scanCoreDocs(CONTENT_DIR)
const coreLlmsTxt = generateCoreLlmsTxt(coreDocs, 'https://barefootjs.dev/docs')
await Bun.write(resolve(DIST_DIR, 'llms.txt'), coreLlmsTxt)
console.log('Generated: dist/llms.txt')

console.log('\nBuild complete!')
