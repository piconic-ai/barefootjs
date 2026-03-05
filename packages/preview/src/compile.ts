/**
 * Preview compiler pipeline
 *
 * Compiles .previews.tsx and their dependencies into .preview-dist/.
 * Follows site/ui/build.ts patterns but minimal — only what previews need.
 */

import { compileJSX, combineParentChildClientJs } from '@barefootjs/jsx'
import { HonoAdapter } from '@barefootjs/hono/adapter'
import { addScriptCollection } from '@barefootjs/hono/build'
import { mkdir, readdir, symlink, lstat } from 'node:fs/promises'
import { dirname, resolve, join, relative, basename } from 'node:path'
import {
  hasUseClientDirective,
  discoverComponentFiles,
  generateHash,
} from '../../../cli/src/lib/build'
import { resolveRelativeImports } from '../../../cli/src/lib/resolve-imports'

const ROOT_DIR = resolve(import.meta.dir, '../../..')
const UI_COMPONENTS_DIR = resolve(ROOT_DIR, 'ui/components')
const DOM_PKG_DIR = resolve(ROOT_DIR, 'packages/dom')
const DIST_DIR = resolve(ROOT_DIR, '.preview-dist')
const DIST_COMPONENTS_DIR = resolve(DIST_DIR, 'components')

export interface CompileOptions {
  /** Absolute path to the .previews.tsx file */
  previewsPath: string
  /** Preview export function names */
  previewNames: string[]
}

export interface CompileResult {
  /** Compiled preview component path (for import in server) */
  previewsCompiledPath: string
  /** Map: componentName → { markedTemplate, clientJs? } */
  manifest: Record<string, { markedTemplate: string; clientJs?: string }>
}

export async function compile(options: CompileOptions): Promise<CompileResult> {
  const { previewsPath } = options

  await mkdir(DIST_COMPONENTS_DIR, { recursive: true })

  // 0. Symlink node_modules so compiled files resolve hono from the same instance as server
  const distNodeModules = resolve(DIST_DIR, 'node_modules')
  const previewNodeModules = resolve(ROOT_DIR, 'packages/preview/node_modules')
  const symlinkExists = await lstat(distNodeModules).then(s => s.isSymbolicLink(), () => false)
  if (!symlinkExists) {
    await symlink(previewNodeModules, distNodeModules, 'dir')
  }

  // 1. Copy barefoot.js runtime
  const domDistFile = resolve(DOM_PKG_DIR, 'dist/index.js')
  if (!await Bun.file(domDistFile).exists()) {
    console.log('Building @barefootjs/dom...')
    const proc = Bun.spawn(['bun', 'run', 'build'], { cwd: DOM_PKG_DIR })
    await proc.exited
  }
  await Bun.write(resolve(DIST_DIR, 'barefoot.js'), Bun.file(domDistFile))
  console.log('Generated: .preview-dist/barefoot.js')

  // 2. Generate CSS from token JSON
  const { loadTokens, mergeTokenSets, generateCSS } = await import(
    resolve(ROOT_DIR, 'site/shared/tokens/index')
  )
  const baseTokens = await loadTokens(resolve(ROOT_DIR, 'site/shared/tokens/tokens.json'))
  const uiTokens = await loadTokens(resolve(ROOT_DIR, 'site/ui/tokens.json'))
  const mergedTokens = mergeTokenSets(baseTokens, uiTokens)
  const tokensCSS = generateCSS(mergedTokens)
  const globalsCSS = await Bun.file(resolve(ROOT_DIR, 'site/ui/styles/globals.css')).text()
  await Bun.write(resolve(DIST_DIR, 'globals.css'), tokensCSS + '\n' + globalsCSS)
  console.log('Generated: .preview-dist/globals.css')

  // 3. Discover all component files (dependency compilation)
  const componentFiles = await discoverComponentFiles(UI_COMPONENTS_DIR, {
    skipDirs: ['__previews__', '__tests__', 'shared'],
  })
  // Add the previews file itself
  const allFiles = [...componentFiles, previewsPath]

  const manifest: Record<string, { markedTemplate: string; clientJs?: string }> = {
    '__barefoot__': { markedTemplate: '', clientJs: 'barefoot.js' }
  }

  const adapter = new HonoAdapter()

  // 4. Compile each "use client" component
  for (const entryPath of allFiles) {
    const sourceContent = await Bun.file(entryPath).text()
    if (!hasUseClientDirective(sourceContent)) continue

    const result = await compileJSX(entryPath, async (path) => {
      return await Bun.file(path).text()
    }, { adapter })

    const errors = result.errors.filter(e => e.severity === 'error')
    const warnings = result.errors.filter(e => e.severity === 'warning')

    if (warnings.length > 0) {
      console.warn(`Warnings compiling ${relative(ROOT_DIR, entryPath)}:`)
      for (const w of warnings) console.warn(`  ${w.message}`)
    }
    if (errors.length > 0) {
      console.error(`Errors compiling ${relative(ROOT_DIR, entryPath)}:`)
      for (const e of errors) console.error(`  ${e.message}`)
      continue
    }

    const relativePath = relative(UI_COMPONENTS_DIR, entryPath)
    const dirPath = dirname(relativePath)
    const baseFileName = basename(entryPath)
    const baseNameNoExt = baseFileName.replace('.tsx', '')

    const outputDir = dirPath === '.' ? DIST_COMPONENTS_DIR : resolve(DIST_COMPONENTS_DIR, dirPath)
    await mkdir(outputDir, { recursive: true })

    let markedJsxContent = ''
    let clientJsContent = ''

    for (const file of result.files) {
      if (file.type === 'markedTemplate') markedJsxContent = file.content
      else if (file.type === 'clientJs') clientJsContent = file.content
    }

    // No marked JSX and no client JS — copy source with "use client" removed
    if (!markedJsxContent && !clientJsContent) {
      const transformed = sourceContent.replace(/^['"]use client['"];?\s*/m, '')
      await Bun.write(resolve(outputDir, baseFileName), transformed)
      manifest[baseNameNoExt] = { markedTemplate: `components/${relativePath}` }
      continue
    }

    // Marked JSX but no client JS
    if (markedJsxContent && !clientJsContent) {
      await Bun.write(resolve(outputDir, baseFileName), markedJsxContent)
      manifest[baseNameNoExt] = { markedTemplate: `components/${relativePath}` }
      continue
    }

    // Write client JS with hash
    const hash = generateHash(clientJsContent || markedJsxContent)
    const clientJsFilename = `${baseNameNoExt}-${hash}.js`

    if (clientJsContent) {
      await Bun.write(resolve(outputDir, clientJsFilename), clientJsContent)
      const clientJsRelativePath = dirPath === '.' ? clientJsFilename : `${dirPath}/${clientJsFilename}`
      console.log(`Generated: .preview-dist/components/${clientJsRelativePath}`)
    }

    // Add script collection wrapper
    if (markedJsxContent && clientJsContent) {
      const clientJsRelPath = dirPath === '.' ? clientJsFilename : `${dirPath}/${clientJsFilename}`
      const wrappedContent = addScriptCollection(markedJsxContent, baseNameNoExt, clientJsRelPath)
      await Bun.write(resolve(outputDir, baseFileName), wrappedContent)
    } else if (markedJsxContent) {
      await Bun.write(resolve(outputDir, baseFileName), markedJsxContent)
    }

    console.log(`Generated: .preview-dist/components/${relativePath}`)

    const clientJsPath = clientJsContent
      ? `components/${dirPath === '.' ? clientJsFilename : `${dirPath}/${clientJsFilename}`}`
      : undefined
    manifest[baseNameNoExt] = { markedTemplate: `components/${relativePath}`, clientJs: clientJsPath }
  }

  // 5. Combine parent-child client JS
  const files = new Map<string, string>()
  for (const [name, entry] of Object.entries(manifest)) {
    if (!entry.clientJs) continue
    const filePath = resolve(DIST_DIR, entry.clientJs)
    const exists = await Bun.file(filePath).exists()
    if (exists) {
      files.set(name, await Bun.file(filePath).text())
    }
  }
  const combined = combineParentChildClientJs(files)
  for (const [name, content] of combined) {
    const entry = manifest[name]
    if (!entry?.clientJs) continue
    await Bun.write(resolve(DIST_DIR, entry.clientJs), content)
    console.log(`Combined: ${entry.clientJs}`)
  }

  // 5b. Resolve relative imports
  await resolveRelativeImports({ distDir: DIST_DIR, manifest })

  // 6. Rewrite imports and add JSX pragma in compiled .tsx files
  const HONO_UTILS_PATH = resolve(ROOT_DIR, 'packages/hono/src/utils')
  async function rewriteImports(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await rewriteImports(fullPath)
      } else if (entry.name.endsWith('.tsx')) {
        let content = await Bun.file(fullPath).text()
        let changed = false

        // Rewrite @ui/ imports
        if (content.includes('@ui/')) {
          content = content.replace(/@ui\/components\/ui\//g, '@/components/ui/')
          changed = true
        }

        // Rewrite @barefootjs/hono/utils → relative path to source
        if (content.includes("@barefootjs/hono/utils")) {
          const relPath = relative(dirname(fullPath), HONO_UTILS_PATH).replace(/\\/g, '/')
          content = content.replace(/@barefootjs\/hono\/utils/g, relPath)
          changed = true
        }

        // Add JSX pragma if missing (needed for Bun to use Hono's JSX)
        if (!content.includes('@jsxImportSource')) {
          content = '/** @jsxImportSource hono/jsx */\n' + content
          changed = true
        }

        if (changed) {
          await Bun.write(fullPath, content)
        }
      }
    }
  }
  await rewriteImports(DIST_COMPONENTS_DIR)

  // 7. Copy server components (without "use client") that compiled components may import
  for (const entryPath of componentFiles) {
    const sourceContent = await Bun.file(entryPath).text()
    if (hasUseClientDirective(sourceContent)) continue

    const relativePath = relative(UI_COMPONENTS_DIR, entryPath)
    const destPath = resolve(DIST_COMPONENTS_DIR, relativePath)
    if (await Bun.file(destPath).exists()) continue

    await mkdir(dirname(destPath), { recursive: true })
    let rewritten = sourceContent
      .replace(/@ui\/components\/ui\//g, '@/components/ui/')

    // Add JSX pragma for Bun to use Hono JSX
    if (destPath.endsWith('.tsx') && !rewritten.includes('@jsxImportSource')) {
      rewritten = '/** @jsxImportSource hono/jsx */\n' + rewritten
    }

    // Rewrite @barefootjs/hono/utils → relative path
    if (rewritten.includes('@barefootjs/hono/utils')) {
      const relPath = relative(dirname(destPath), HONO_UTILS_PATH).replace(/\\/g, '/')
      rewritten = rewritten.replace(/@barefootjs\/hono\/utils/g, relPath)
    }

    await Bun.write(destPath, rewritten)
  }

  // 7b. Copy ui/types/ to .preview-dist/types/ (for ../../types imports)
  const uiTypesDir = resolve(ROOT_DIR, 'ui/types')
  const distTypesDir = resolve(DIST_DIR, 'types')
  await mkdir(distTypesDir, { recursive: true })
  const typesEntries = await readdir(uiTypesDir).catch(() => [] as string[])
  for (const f of typesEntries) {
    if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      let content = await Bun.file(resolve(uiTypesDir, f)).text()
      if (f.endsWith('.tsx') && !content.includes('@jsxImportSource')) {
        content = '/** @jsxImportSource hono/jsx */\n' + content
      }
      await Bun.write(resolve(distTypesDir, f), content)
    }
  }

  // 8. Generate UnoCSS (run from site/ui where uno.config.ts lives)
  console.log('Generating UnoCSS...')
  const unoProc = Bun.spawn(
    ['bunx', 'unocss', '../../ui/components/**/*.tsx', './**/*.tsx', './dist/**/*.tsx',
     '-o', resolve(DIST_DIR, 'uno.css')],
    {
      cwd: resolve(ROOT_DIR, 'site/ui'),
      stdout: 'inherit',
      stderr: 'inherit',
    }
  )
  await unoProc.exited
  console.log('Generated: .preview-dist/uno.css')

  // 9. Write manifest
  await Bun.write(resolve(DIST_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log('Generated: .preview-dist/manifest.json')

  // Determine compiled previews path relative to DIST
  const previewsRelative = relative(UI_COMPONENTS_DIR, previewsPath)
  const previewsCompiledPath = resolve(DIST_COMPONENTS_DIR, previewsRelative)

  return { previewsCompiledPath, manifest }
}
