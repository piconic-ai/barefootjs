/**
 * BarefootJS UI build script
 *
 * Generates (file-based output):
 * - dist/components/{Component}.tsx (Marked Template)
 * - dist/components/{Component}-{hash}.js (Client JS)
 * - dist/components/barefoot.js (Runtime)
 * - dist/uno.css (UnoCSS output)
 * - dist/manifest.json
 *
 * Only components/* are compiled. Pages import compiled components via @/components.
 * The compiler handles "use client" filtering:
 * - Files with "use client" are included in output
 * - Files without "use client" are processed for dependency resolution only
 */

import { compileJSX, combineParentChildClientJs } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, resolve, join, relative } from 'node:path'
import {
  hasUseClientDirective,
  discoverComponentFiles as discoverFiles,
  generateHash,
  resolveRelativeImports,
} from '../../packages/cli/src/lib/build'
import { loadIndex } from '../../packages/cli/src/lib/meta-loader'
import { generateUiLlmsTxt } from '../../packages/cli/src/lib/llms-txt-generator'
import { addScriptCollection } from '../../packages/hono/src/build'

const ROOT_DIR = dirname(import.meta.path)

// File type helpers
function isTsOrTsxFile(filename: string): boolean {
  return filename.endsWith('.tsx') || filename.endsWith('.ts')
}

// Safety net: with path-qualified manifest keys a collision shouldn't happen,
// but surface it loudly if it ever does (e.g. identical relative paths across
// component roots). Silent overwrite was the root cause of #930/bug-3.
function assertNoManifestCollision(
  manifest: Record<string, unknown>,
  key: string,
  incomingRelPath: string,
): void {
  if (manifest[key] !== undefined) {
    throw new Error(
      `Manifest key collision: "${key}" would be overwritten by ${incomingRelPath}. ` +
      `Two component files resolve to the same manifest key — rename one or move it so its path differs.`
    )
  }
}

// Copy all TS/TSX files from a directory (non-recursive)
async function copyTsFiles(srcDir: string, destDir: string, prefix: string = ''): Promise<void> {
  await mkdir(destDir, { recursive: true })
  const files = await readdir(srcDir).catch(() => [])
  for (const file of files) {
    if (isTsOrTsxFile(file)) {
      await Bun.write(resolve(destDir, file), Bun.file(resolve(srcDir, file)))
      console.log(`Copied: ${prefix}${file}`)
    }
  }
}

const DOCS_COMPONENTS_DIR = resolve(ROOT_DIR, 'components')
const UI_COMPONENTS_DIR = resolve(ROOT_DIR, '../../ui/components')
const SHARED_COMPONENTS_DIR = resolve(ROOT_DIR, '../shared/components')
const DIST_DIR = resolve(ROOT_DIR, 'dist')
const DIST_COMPONENTS_DIR = resolve(DIST_DIR, 'components')
const DOM_PKG_DIR = resolve(ROOT_DIR, '../../packages/client')

// Check if a file is a test or preview (should be excluded from build)
function isTestOrPreview(filename: string): boolean {
  return filename.includes('.test.') || filename.includes('.preview.')
}

// Recursively discover all component files in ui/ and docs/ subdirectories
// Skip 'shared' directory which contains non-compilable utility modules
// Skip test and preview files
async function discoverComponentFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Skip shared directory - it contains utility modules, not components
      if (entry.name === 'shared') continue
      files.push(...await discoverComponentFiles(fullPath))
    } else if (entry.name.endsWith('.tsx') && !isTestOrPreview(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

// Discover all component files from UI, docs, and shared components
// The compiler handles "use client" filtering
const uiComponentFiles = await discoverComponentFiles(UI_COMPONENTS_DIR)
const docsComponentFiles = await discoverComponentFiles(DOCS_COMPONENTS_DIR)
const sharedComponentFiles = await discoverFiles(SHARED_COMPONENTS_DIR)
const componentFiles = [...uiComponentFiles, ...docsComponentFiles, ...sharedComponentFiles]

// Clean dist directory to remove stale artifacts from previous builds
await rm(DIST_DIR, { recursive: true, force: true })
await mkdir(DIST_COMPONENTS_DIR, { recursive: true })

// Build and copy barefoot.js from @barefootjs/client.
// Use the standalone runtime (reactive primitives inlined) so the browser
// can load the file directly. The sibling `./runtime` entry keeps reactive
// external for bundler-side deduplication.
const barefootFileName = 'barefoot.js'
const domDistFile = resolve(DOM_PKG_DIR, 'dist/runtime/standalone.js')

if (!await Bun.file(domDistFile).exists()) {
  console.log('Building @barefootjs/client...')
  const proc = Bun.spawn(['bun', 'run', 'build'], { cwd: DOM_PKG_DIR })
  await proc.exited
}

// Copy to dist/components/ for components inside rootDir (ui/components/)
await Bun.write(
  resolve(DIST_COMPONENTS_DIR, barefootFileName),
  Bun.file(domDistFile)
)
console.log(`Generated: dist/components/${barefootFileName}`)

// Build and copy barefoot-form.js from @barefootjs/form
// External @barefootjs/client so it resolves via import map
const FORM_PKG_DIR = resolve(ROOT_DIR, '../../packages/form')
const formEntryFile = resolve(FORM_PKG_DIR, 'src/index.ts')

console.log('Building @barefootjs/form for site...')
const formBuildResult = await Bun.build({
  entrypoints: [formEntryFile],
  format: 'esm',
  external: ['@barefootjs/client', '@barefootjs/client/runtime'],
})

if (formBuildResult.outputs.length > 0) {
  await Bun.write(
    resolve(DIST_COMPONENTS_DIR, 'barefoot-form.js'),
    formBuildResult.outputs[0]
  )
  console.log('Generated: dist/components/barefoot-form.js')
}

// Build and copy barefoot-chart.js from @barefootjs/chart
// External @barefootjs/client so it resolves via import map
const CHART_PKG_DIR = resolve(ROOT_DIR, '../../packages/chart')
const chartEntryFile = resolve(CHART_PKG_DIR, 'src/index.ts')

console.log('Building @barefootjs/chart for site...')
const chartBuildResult = await Bun.build({
  entrypoints: [chartEntryFile],
  format: 'esm',
  external: ['@barefootjs/client', '@barefootjs/client/runtime'],
})

if (chartBuildResult.outputs.length > 0) {
  await Bun.write(
    resolve(DIST_COMPONENTS_DIR, 'barefoot-chart.js'),
    chartBuildResult.outputs[0]
  )
  console.log('Generated: dist/components/barefoot-chart.js')
}

// Bundle zod for client-side use (needed by createForm demos)
// Use a wrapper to ensure named exports (z) are preserved in the ESM bundle,
// since the CJS entry only produces a default export when bundled directly.
console.log('Building zod for site...')
const zodWrapper = resolve(ROOT_DIR, '.zod-esm-wrapper.ts')
await Bun.write(zodWrapper, `export { z } from 'zod';\n`)
const zodBuildResult = await Bun.build({
  entrypoints: [zodWrapper],
  format: 'esm',
})
// Clean up temporary wrapper
await Bun.file(zodWrapper).exists() && await import('node:fs/promises').then(fs => fs.unlink(zodWrapper))
if (zodBuildResult.outputs.length > 0) {
  const zodDir = resolve(DIST_DIR, 'lib')
  await mkdir(zodDir, { recursive: true })
  await Bun.write(resolve(zodDir, 'zod.esm.js'), zodBuildResult.outputs[0])
  console.log('Generated: dist/lib/zod.esm.js')
}

// Manifest - simplified structure
const manifest: Record<string, { clientJs?: string; markedTemplate: string }> = {
  '__barefoot__': { markedTemplate: '', clientJs: `components/${barefootFileName}` }
}

// Create HonoAdapter (script collection is handled manually via addScriptCollection)
const adapter = new HonoAdapter()

// Compile each component
// All components are compiled. The compiler determines whether client JS is needed
// based on event handlers and reactive primitives, not just "use client" directive.
for (const entryPath of componentFiles) {
  const sourceContent = await Bun.file(entryPath).text()
  const hasDirective = hasUseClientDirective(sourceContent)

  // Determine rootDir based on whether the file is from UI, docs, or shared components
  const isUiComponent = entryPath.startsWith(UI_COMPONENTS_DIR)
  const isSharedComponent = entryPath.startsWith(SHARED_COMPONENTS_DIR)
  const rootDir = isUiComponent ? UI_COMPONENTS_DIR : isSharedComponent ? SHARED_COMPONENTS_DIR : DOCS_COMPONENTS_DIR

  const result = await compileJSX(entryPath, async (path) => {
    return await Bun.file(path).text()
  }, { adapter, cssLayerPrefix: isUiComponent ? 'components' : undefined, localImportPrefixes: ['@/', '@ui/'] })

  // Separate errors and warnings
  const errors = result.errors.filter(e => e.severity === 'error')
  const warnings = result.errors.filter(e => e.severity === 'warning')

  // Show warnings but continue
  if (warnings.length > 0) {
    console.warn(`Warnings compiling ${entryPath}:`)
    for (const warning of warnings) {
      console.warn(`  ${warning.message}`)
    }
  }

  // Only skip on actual errors
  if (errors.length > 0) {
    console.error(`Errors compiling ${entryPath}:`)
    for (const error of errors) {
      console.error(`  ${error.message}`)
    }
    continue
  }

  // Skip non-"use client" components that didn't produce client JS
  // These are pure server components — copyServerComponents() handles them
  const hasClientJsFile = result.files.some(f => f.type === 'clientJs')
  if (!hasDirective && !hasClientJsFile) {
    continue
  }

  // Calculate relative path from rootDir
  const relativePath = relative(rootDir, entryPath)
  const dirPath = dirname(relativePath)
  const baseFileName = relativePath.split('/').pop()!
  let baseNameNoExt = baseFileName.replace('.tsx', '')
  // For colocated index.tsx files, use parent directory as component name
  if (baseNameNoExt === 'index') {
    const parts = relativePath.split('/')
    baseNameNoExt = parts[parts.length - 2] || baseNameNoExt
  }
  // Path-qualified manifest key so two files with the same basename in
  // different directories don't collide. Colocated index.tsx uses its
  // parent directory's path. Top-level files keep the plain basename for
  // backwards compatibility with existing consumers that look up by name.
  //
  // e.g. `components/settings-demo.tsx`         -> "settings-demo"
  //      `components/gallery/admin/settings-demo.tsx` -> "gallery/admin/settings-demo"
  //      `components/ui/tabs/index.tsx`         -> "ui/tabs"
  const manifestKey: string = dirPath === '.'
    ? baseNameNoExt
    : baseFileName === 'index.tsx'
      ? dirPath
      : `${dirPath}/${baseNameNoExt}`

  // Create subdirectory if needed
  const outputDir = dirPath === '.' ? DIST_COMPONENTS_DIR : resolve(DIST_COMPONENTS_DIR, dirPath)
  await mkdir(outputDir, { recursive: true })

  // Process each output file
  let markedJsxContent = ''
  let clientJsContent = ''

  for (const file of result.files) {
    if (file.type === 'markedTemplate') {
      markedJsxContent = file.content
    } else if (file.type === 'clientJs') {
      clientJsContent = file.content
    }
  }

  // If no marked JSX and no client JS, copy original source with transformations
  // This handles files like icon.tsx with multiple components but no reactivity
  if (!markedJsxContent && !clientJsContent) {
    // Transform source: remove 'use client'
    let transformedSource = sourceContent
      .replace(/^['"]use client['"];?\s*/m, '')
    await Bun.write(resolve(outputDir, baseFileName), transformedSource)
    console.log(`Generated: dist/components/${relativePath}`)
    assertNoManifestCollision(manifest, manifestKey, relativePath)
    manifest[manifestKey] = { markedTemplate: `components/${relativePath}` }
    continue
  }

  // If we have marked JSX but no client JS, still use the compiled output
  if (markedJsxContent && !clientJsContent) {
    await Bun.write(resolve(outputDir, baseFileName), markedJsxContent)
    console.log(`Generated: dist/components/${relativePath}`)
    assertNoManifestCollision(manifest, manifestKey, relativePath)
    manifest[manifestKey] = { markedTemplate: `components/${relativePath}` }
    continue
  }

  // Write Client JS with hash
  const hasClientJs = clientJsContent.length > 0
  const hash = generateHash(clientJsContent || markedJsxContent)
  const clientJsFilename = `${baseNameNoExt}-${hash}.js`

  if (hasClientJs) {
    await Bun.write(resolve(outputDir, clientJsFilename), clientJsContent)
    const clientJsRelativePath = dirPath === '.' ? clientJsFilename : `${dirPath}/${clientJsFilename}`
    console.log(`Generated: dist/components/${clientJsRelativePath}`)
  }

  // Add script collection wrapper when client JS exists
  if (markedJsxContent && hasClientJs) {
    const clientJsRelPath = dirPath === '.' ? clientJsFilename : `${dirPath}/${clientJsFilename}`
    const wrappedContent = addScriptCollection(markedJsxContent, baseNameNoExt, clientJsRelPath)
    await Bun.write(resolve(outputDir, baseFileName), wrappedContent)
    console.log(`Generated: dist/components/${relativePath}`)
  } else if (markedJsxContent) {
    await Bun.write(resolve(outputDir, baseFileName), markedJsxContent)
    console.log(`Generated: dist/components/${relativePath}`)
  }

  // Manifest entry - use path-qualified key to avoid collisions between
  // files with the same basename in different directories.
  const markedJsxPath = `components/${relativePath}`
  const clientJsPath = hasClientJs
    ? `components/${dirPath === '.' ? clientJsFilename : `${dirPath}/${clientJsFilename}`}`
    : undefined

  assertNoManifestCollision(manifest, manifestKey, relativePath)
  manifest[manifestKey] = {
    markedTemplate: markedJsxPath,
    clientJs: clientJsPath,
  }
}

// Output manifest
await Bun.write(resolve(DIST_COMPONENTS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log('Generated: dist/components/manifest.json')

// Combine parent-child client JS into single files
async function combineClientJs(manifestData: typeof manifest): Promise<void> {
  const files = new Map<string, string>()
  for (const [name, entry] of Object.entries(manifestData)) {
    if (!entry.clientJs) continue
    const filePath = resolve(DIST_DIR, entry.clientJs)
    files.set(name, await Bun.file(filePath).text())
  }

  const combined = combineParentChildClientJs(files)
  for (const [name, content] of combined) {
    const entry = manifestData[name]
    if (!entry?.clientJs) continue
    await Bun.write(resolve(DIST_DIR, entry.clientJs), content)
    console.log(`Combined: ${entry.clientJs}`)
  }
}

// Combine parent-child client JS
await combineClientJs(manifest)

// Copy shared/ directory (utility modules) before bundling relative imports.
// The bundler needs these files to resolve imports like ./shared/playground-highlight.
const SHARED_DIR = resolve(ROOT_DIR, 'components/shared')
const DIST_SHARED_DIR = resolve(DIST_COMPONENTS_DIR, 'shared')
await copyTsFiles(SHARED_DIR, DIST_SHARED_DIR, 'dist/components/shared/')

// Resolve remaining relative imports in combined client JS files.
// The combiner handles @bf-child placeholders, but relative imports to utility
// modules (e.g., ./shared/playground-highlight) need to be inlined separately.
// Component imports that were already inlined via @bf-child are stripped as redundant.
await resolveRelativeImports({
  distDir: DIST_DIR,
  manifest,
  sourceDirs: [UI_COMPONENTS_DIR, SHARED_COMPONENTS_DIR, DOCS_COMPONENTS_DIR],
})

// Generate index.ts for re-exporting all components (handles subdirectories)
async function collectExports(dir: string, prefix: string = ''): Promise<string[]> {
  const exports: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })
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

// Generate tokens CSS from JSON and concatenate with globals.css
const { loadTokens, mergeTokenSets, generateCSS } = await import('../shared/tokens/index')
const STYLES_DIR = resolve(ROOT_DIR, 'styles')
const baseTokens = await loadTokens(resolve(ROOT_DIR, '../shared/tokens/tokens.json'))
const uiTokens = await loadTokens(resolve(ROOT_DIR, 'tokens.json'))
const mergedTokens = mergeTokenSets(baseTokens, uiTokens)
const tokensCSS = generateCSS(mergedTokens)
const siteGlobalsCSS = await Bun.file(resolve(STYLES_DIR, 'globals.css')).text()
await Bun.write(resolve(DIST_DIR, 'globals.css'), tokensCSS + '\n' + siteGlobalsCSS)
console.log('Generated: dist/globals.css (tokens + globals)')

// Copy third-party ESM modules needed by client JS
const EMBLA_ESM = resolve(ROOT_DIR, '../../node_modules/embla-carousel/esm/embla-carousel.esm.js')
if (await Bun.file(EMBLA_ESM).exists()) {
  const emblaDir = resolve(DIST_DIR, 'lib')
  await mkdir(emblaDir, { recursive: true })
  await Bun.write(resolve(emblaDir, 'embla-carousel.esm.js'), Bun.file(EMBLA_ESM))
  console.log('Copied: dist/lib/embla-carousel.esm.js')
}

// Copy lib/ directory to dist/
// These are runtime utilities needed by compiled components
const LIB_DIR = resolve(ROOT_DIR, 'lib')
const DIST_LIB_DIR = resolve(DIST_DIR, 'lib')

// Copy lib/*.tsx files
await copyTsFiles(LIB_DIR, DIST_LIB_DIR, 'dist/lib/')

// Copy server components (without "use client") to dist
// These are components that don't need compilation but are still imported from @/components/
async function copyServerComponents(srcDir: string, destDir: string, prefix: string = '') {
  const entries = await readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(srcDir, entry.name)
    const destPath = join(destDir, entry.name)
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true })
      await copyServerComponents(srcPath, destPath, `${prefix}${entry.name}/`)
    } else if (entry.name.endsWith('.tsx') && !isTestOrPreview(entry.name)) {
      const content = await Bun.file(srcPath).text()
      // Skip files that have "use client" directive (already compiled)
      if (!hasUseClientDirective(content)) {
        // Check if file wasn't already output by compiler
        const distFile = resolve(DIST_COMPONENTS_DIR, prefix, entry.name)
        if (!await Bun.file(distFile).exists()) {
          await mkdir(dirname(distFile), { recursive: true })
          // Rewrite @ui/ imports
          const rewrittenContent = content
            .replace(/@ui\/components\/ui\//g, '@/components/ui/')
          await Bun.write(distFile, rewrittenContent)
          console.log(`Copied (server component): dist/components/${prefix}${entry.name}`)
        }
      }
    }
  }
}
await copyServerComponents(DOCS_COMPONENTS_DIR, DIST_COMPONENTS_DIR)
await copyServerComponents(UI_COMPONENTS_DIR, DIST_COMPONENTS_DIR)

// shared/ directory already copied above (before bundleRelativeImports)

// Rewrite @ui/ imports in all dist/*.tsx files
// This is needed because compiled components may reference @ui/ paths
async function rewriteUiImports(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      await rewriteUiImports(fullPath)
    } else if (entry.name.endsWith('.tsx')) {
      const content = await Bun.file(fullPath).text()
      if (content.includes('@ui/')) {
        const rewritten = content
          .replace(/@ui\/components\/ui\//g, '@/components/ui/')
        await Bun.write(fullPath, rewritten)
      }
    }
  }
}
await rewriteUiImports(DIST_COMPONENTS_DIR)
console.log('Rewrote @ui/ imports in dist/')

// Generate UnoCSS
console.log('\nGenerating UnoCSS...')
const unoProc = Bun.spawn(['bunx', 'unocss', './**/*.tsx', './dist/**/*.tsx', '-o', 'dist/uno.css'], {
  cwd: ROOT_DIR,
  stdout: 'inherit',
  stderr: 'inherit',
})
await unoProc.exited
console.log('Generated: dist/uno.css')

// Create dist/static/ directory for Cloudflare Workers compatibility
// Wrangler [assets] serves files from dist/ at /, so /static/* needs dist/static/*
// Bun dev server uses serveStatic with rewrite, so this is only needed for production
const DIST_STATIC_DIR = resolve(DIST_DIR, 'static')
await mkdir(DIST_STATIC_DIR, { recursive: true })

// Copy CSS files to static/
await Bun.write(resolve(DIST_STATIC_DIR, 'globals.css'), Bun.file(resolve(DIST_DIR, 'globals.css')))
await Bun.write(resolve(DIST_STATIC_DIR, 'uno.css'), Bun.file(resolve(DIST_DIR, 'uno.css')))
console.log('Copied: dist/static/globals.css')
console.log('Copied: dist/static/uno.css')

// Copy icon files
// - dist/ for Bun dev server (serveStatic rewrites /static/* to /*)
// - dist/static/ for Cloudflare Workers ([assets] serves dist/ at /)
// - dist/favicon.ico for /favicon.ico requests
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

// Copy components/ to static/components/ for client JS
async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true })
  const entries = await readdir(src, { withFileTypes: true })
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

// Copy lib/ to static/lib/ for client-side third-party modules
const DIST_LIB_DIR_EXISTS = await Bun.file(resolve(DIST_DIR, 'lib/embla-carousel.esm.js')).exists()
if (DIST_LIB_DIR_EXISTS) {
  await copyDir(resolve(DIST_DIR, 'lib'), resolve(DIST_STATIC_DIR, 'lib'))
  console.log('Copied: dist/static/lib/')
}

// Generate _headers for Cloudflare Workers static assets (CORS + cache for registry)
const headersContent = `/r/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Cache-Control: public, max-age=300
`
await Bun.write(resolve(DIST_DIR, '_headers'), headersContent)
console.log('Generated: dist/_headers')

// Generate llms.txt from component metadata
const META_DIR = resolve(ROOT_DIR, '../../ui/meta')
const metaIndex = loadIndex(META_DIR)
const uiLlmsTxt = generateUiLlmsTxt(metaIndex, 'https://ui.barefootjs.dev/r')
await Bun.write(resolve(DIST_DIR, 'llms.txt'), uiLlmsTxt)
console.log('Generated: dist/llms.txt')

console.log('\nBuild complete!')
