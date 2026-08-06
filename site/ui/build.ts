/**
 * BarefootJS UI build script
 *
 * Component compilation is owned by `@barefootjs/vite` (see
 * vite.config.ts): `vite build` emits compiled SSR templates for every
 * discovered component into dist/components/ (+ manifest.json) and
 * bundled, content-hashed client chunks into dist/static/components/.
 * This script runs that build first, then assembles everything else the
 * site serves out of dist/:
 *
 * - passthrough modules the emitted templates import (components/shared/*,
 *   plain .ts data modules) copied into dist/components/
 * - dist/globals.css (+ static copy) — tokens CSS + globals.css
 * - dist/uno.css (+ static copy) — UnoCSS over sources and templates
 * - icons, dist/_headers (registry CORS), dist/llms.txt
 *
 * The registry (dist/r, dist/meta) is built separately by build:registry.
 */

import { mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, resolve, join, relative } from 'node:path'
import { loadIndex } from '../../packages/cli/src/lib/meta-loader'
import { generateUiLlmsTxt } from '../../packages/cli/src/lib/llms-txt-generator'

const ROOT_DIR = dirname(import.meta.path)

// `--clean` wipes dist before building (used by build:worker for CI / deploy).
// Without it the build overwrites files in place, so a running
// `bun run --watch server.tsx` never sees a window where
// `dist/components/*.tsx` is missing. Wiping dist mid-run was the cause of
// dev-time `Cannot find module '@/components/...'` errors when the dev
// server reloaded during a rebuild.
const CLEAN_DIST = process.argv.includes('--clean')

const DOCS_COMPONENTS_DIR = resolve(ROOT_DIR, 'components')
const UI_COMPONENTS_DIR = resolve(ROOT_DIR, '../../ui/components')
const SHARED_COMPONENTS_DIR = resolve(ROOT_DIR, '../shared/components')
const DIST_DIR = resolve(ROOT_DIR, 'dist')
const DIST_COMPONENTS_DIR = resolve(DIST_DIR, 'components')

if (CLEAN_DIST) {
  await rm(DIST_DIR, { recursive: true, force: true })
}
await mkdir(DIST_COMPONENTS_DIR, { recursive: true })

// ── 1. Compile components + bundle client JS via @barefootjs/vite ──
console.log('Building components with vite...')
const viteProc = Bun.spawn(['bunx', 'vite', 'build'], {
  cwd: ROOT_DIR,
  stdout: 'inherit',
  stderr: 'inherit',
})
if ((await viteProc.exited) !== 0) {
  throw new Error('vite build failed')
}

// ── 2. Copy passthrough modules into dist/components ──────────
// Two kinds of files the compiler doesn't emit but emitted templates
// import (relative imports are re-anchored under dist/components/):
// - anything under a `shared/` directory (utility modules plus
//   PlaygroundLayout.tsx, which the legacy build also never compiled),
// - plain .ts modules anywhere in a component tree (e.g.
//   gallery/saas/blog-data.ts).
async function copyPassthroughModules(rootDir: string, insideShared = false): Promise<void> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const srcPath = join(rootDir, entry.name)
    if (entry.isDirectory()) {
      await copyPassthroughModules(srcPath, insideShared || entry.name === 'shared')
      continue
    }
    const isPlainTs = entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
    const isSharedFile = insideShared && (isPlainTs || entry.name.endsWith('.tsx'))
    if (!isPlainTs && !isSharedFile) continue
    if (entry.name.includes('.test.') || entry.name.includes('.preview.')) continue
    const rootFor = [UI_COMPONENTS_DIR, DOCS_COMPONENTS_DIR, SHARED_COMPONENTS_DIR]
      .find(d => srcPath.startsWith(d + '/'))
    if (!rootFor) continue
    const relPath = relative(rootFor, srcPath)
    const destPath = resolve(DIST_COMPONENTS_DIR, relPath)
    await mkdir(dirname(destPath), { recursive: true })
    await Bun.write(destPath, Bun.file(srcPath))
    console.log(`Copied: dist/components/${relPath}`)
  }
}
await copyPassthroughModules(UI_COMPONENTS_DIR)
await copyPassthroughModules(DOCS_COMPONENTS_DIR)
await copyPassthroughModules(SHARED_COMPONENTS_DIR)

// ── 3. Generate tokens CSS from JSON and concatenate with globals.css ──
const { loadTokens, mergeTokenSets, generateCSS } = await import('../shared/tokens/index')
const STYLES_DIR = resolve(ROOT_DIR, 'styles')
const baseTokens = await loadTokens(resolve(ROOT_DIR, '../shared/tokens/tokens.json'))
const uiTokens = await loadTokens(resolve(ROOT_DIR, 'tokens.json'))
const mergedTokens = mergeTokenSets(baseTokens, uiTokens)
const tokensCSS = generateCSS(mergedTokens)
const siteGlobalsCSS = await Bun.file(resolve(STYLES_DIR, 'globals.css')).text()
await Bun.write(resolve(DIST_DIR, 'globals.css'), tokensCSS + '\n' + siteGlobalsCSS)
console.log('Generated: dist/globals.css (tokens + globals)')

// ── 4. Generate UnoCSS ────────────────────────────────────────
// Scans sources AND the emitted templates (layer-prefixed classes only
// exist in dist/components/*.tsx).
console.log('\nGenerating UnoCSS...')
const unoProc = Bun.spawn(['bunx', 'unocss', './**/*.tsx', './dist/**/*.tsx', '-o', 'dist/uno.css'], {
  cwd: ROOT_DIR,
  stdout: 'inherit',
  stderr: 'inherit',
})
await unoProc.exited
console.log('Generated: dist/uno.css')

// ── 5. dist/static: CSS + icons ───────────────────────────────
// Wrangler [assets] serves files from dist/ at /, so /static/* needs
// dist/static/*. The Bun dev server serves the same layout.
const DIST_STATIC_DIR = resolve(DIST_DIR, 'static')
await mkdir(DIST_STATIC_DIR, { recursive: true })

await Bun.write(resolve(DIST_STATIC_DIR, 'globals.css'), Bun.file(resolve(DIST_DIR, 'globals.css')))
await Bun.write(resolve(DIST_STATIC_DIR, 'uno.css'), Bun.file(resolve(DIST_DIR, 'uno.css')))
console.log('Copied: dist/static/globals.css')
console.log('Copied: dist/static/uno.css')

// Icon files
// - dist/ for Bun dev server (serveStatic rewrites /static/* to /*)
// - dist/static/ for Cloudflare Workers ([assets] serves dist/ at /)
// - dist/favicon.ico for /favicon.ico requests
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

// ── 6. _headers for Cloudflare Workers static assets ──────────
// CORS + cache for the registry.
const headersContent = `/r/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, OPTIONS
  Cache-Control: public, max-age=300
`
await Bun.write(resolve(DIST_DIR, '_headers'), headersContent)
console.log('Generated: dist/_headers')

// ── 7. llms.txt from component metadata ───────────────────────
const META_DIR = resolve(ROOT_DIR, '../../ui/meta')
const metaIndex = loadIndex(META_DIR)
const uiLlmsTxt = generateUiLlmsTxt(metaIndex, 'https://ui.barefootjs.dev/r')
await Bun.write(resolve(DIST_DIR, 'llms.txt'), uiLlmsTxt)
console.log('Generated: dist/llms.txt')

console.log('\nBuild complete!')
