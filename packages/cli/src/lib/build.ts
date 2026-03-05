// Core build module: shared pipeline for `barefoot build`.

import { compileJSX, combineParentChildClientJs } from '@barefootjs/jsx'
import type { TemplateAdapter } from '@barefootjs/jsx'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { resolve, basename, relative } from 'node:path'
import { resolveRelativeImports } from './resolve-imports'

export { resolveRelativeImports } from './resolve-imports'

// ── Types ────────────────────────────────────────────────────────────────

export interface BuildConfig {
  /** Absolute path to the project directory (where barefoot.config.ts lives) */
  projectDir: string
  /** Adapter instance */
  adapter: TemplateAdapter
  /** Source component directories (absolute paths) */
  componentDirs: string[]
  /** Output directory (absolute path) */
  outDir: string
  /** Minify client JS */
  minify: boolean
  /** Add content hash to filenames */
  contentHash: boolean
  /** Output only client JS, skip marked templates and manifest */
  clientOnly: boolean
  /** Adapter-specific post-processing hook for marked templates */
  transformMarkedTemplate?: (content: string, componentId: string, clientJsPath: string) => string
}

export interface BuildResult {
  /** Number of components compiled */
  compiledCount: number
  /** Number of components skipped (no "use client") */
  skippedCount: number
  /** Number of compilation errors */
  errorCount: number
  /** Manifest entries */
  manifest: Record<string, { clientJs?: string; markedTemplate: string }>
}

// ── Utility functions ────────────────────────────────────────────────────

/**
 * Check if file content starts with a "use client" directive.
 * Skips leading comments (block and line).
 */
export function hasUseClientDirective(content: string): boolean {
  let trimmed = content.trimStart()
  // Skip block comments
  while (trimmed.startsWith('/*')) {
    const endIndex = trimmed.indexOf('*/')
    if (endIndex === -1) break
    trimmed = trimmed.slice(endIndex + 2).trimStart()
  }
  // Skip line comments
  while (trimmed.startsWith('//')) {
    const endIndex = trimmed.indexOf('\n')
    if (endIndex === -1) break
    trimmed = trimmed.slice(endIndex + 1).trimStart()
  }
  return trimmed.startsWith('"use client"') || trimmed.startsWith("'use client'")
}

/**
 * Recursively discover .tsx component files in a directory.
 * Skips .test.tsx, .spec.tsx, and .preview.tsx files.
 */
export async function discoverComponentFiles(
  dir: string,
  options?: { skipDirs?: string[] }
): Promise<string[]> {
  const results: string[] = []
  const skipDirs = options?.skipDirs ? new Set(options.skipDirs) : null

  let entries: { name: string; isDirectory(): boolean }[]
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const fullPath = resolve(dir, String(entry.name))
    if (entry.isDirectory()) {
      if (skipDirs?.has(String(entry.name))) continue
      results.push(...await discoverComponentFiles(fullPath, options))
    } else if (
      String(entry.name).endsWith('.tsx') &&
      !String(entry.name).endsWith('.test.tsx') &&
      !String(entry.name).endsWith('.spec.tsx') &&
      !String(entry.name).endsWith('.preview.tsx')
    ) {
      results.push(fullPath)
    }
  }

  return results
}

/**
 * Generate a short content hash string (8 hex chars).
 */
export function generateHash(content: string): string {
  const hash = Bun.hash(content)
  return hash.toString(16).slice(0, 8)
}

// ── Resolve BuildConfig from BarefootBuildConfig ─────────────────────────

/**
 * Resolve a BuildConfig from a BarefootBuildConfig (from barefoot.config.ts).
 * Resolves relative paths against projectDir.
 */
export function resolveBuildConfigFromTs(
  projectDir: string,
  tsConfig: { adapter: TemplateAdapter; components?: string[]; outDir?: string; minify?: boolean; contentHash?: boolean; clientOnly?: boolean; transformMarkedTemplate?: (content: string, componentId: string, clientJsPath: string) => string },
  overrides?: { minify?: boolean }
): BuildConfig {
  const componentDirs = (tsConfig.components ?? ['components']).map(
    dir => resolve(projectDir, dir)
  )
  const outDir = resolve(projectDir, tsConfig.outDir ?? 'dist')

  return {
    projectDir,
    adapter: tsConfig.adapter,
    componentDirs,
    outDir,
    minify: overrides?.minify ?? tsConfig.minify ?? false,
    contentHash: tsConfig.contentHash ?? false,
    clientOnly: tsConfig.clientOnly ?? false,
    transformMarkedTemplate: tsConfig.transformMarkedTemplate,
  }
}

// ── Main build pipeline ──────────────────────────────────────────────────

export async function build(config: BuildConfig): Promise<BuildResult> {
  const componentsOutDir = resolve(config.outDir, 'components')
  await mkdir(componentsOutDir, { recursive: true })

  // 1. Build and copy barefoot.js runtime
  const domPkgDir = resolve(config.projectDir, 'node_modules/@barefootjs/dom')
  // Try workspace path first (monorepo), then node_modules
  const domDistCandidates = [
    resolve(config.projectDir, '../../packages/dom/dist/index.js'),
    resolve(domPkgDir, 'dist/index.js'),
  ]
  let domDistFile: string | null = null
  for (const candidate of domDistCandidates) {
    try {
      await stat(candidate)
      domDistFile = candidate
      break
    } catch {
      // continue
    }
  }

  if (domDistFile) {
    await Bun.write(
      resolve(componentsOutDir, 'barefoot.js'),
      Bun.file(domDistFile)
    )
    console.log('Generated: components/barefoot.js')
  } else {
    console.warn('Warning: @barefootjs/dom dist not found. Skipping barefoot.js copy.')
  }

  // 2. Adapter (already instantiated in config)
  const adapter = config.adapter

  // 3. Discover component files
  const allFiles: string[] = []
  for (const dir of config.componentDirs) {
    allFiles.push(...await discoverComponentFiles(dir))
  }

  // 4. Manifest
  const manifest: Record<string, { clientJs?: string; markedTemplate: string }> = {
    '__barefoot__': { markedTemplate: '', clientJs: 'components/barefoot.js' },
  }

  let compiledCount = 0
  let skippedCount = 0
  let errorCount = 0

  // 5. Compile each component
  for (const entryPath of allFiles) {
    const sourceContent = await Bun.file(entryPath).text()
    if (!hasUseClientDirective(sourceContent)) {
      skippedCount++
      continue
    }

    const baseFileName = basename(entryPath)
    const baseNameNoExt = baseFileName.replace('.tsx', '')
    let clientJsFilename = `${baseNameNoExt}.client.js`

    const result = await compileJSX(entryPath, async (path) => {
      return await Bun.file(path).text()
    }, { adapter })

    // Separate errors and warnings
    const errors = result.errors.filter(e => e.severity === 'error')
    const warnings = result.errors.filter(e => e.severity === 'warning')

    if (warnings.length > 0) {
      console.warn(`Warnings compiling ${relative(config.projectDir, entryPath)}:`)
      for (const warning of warnings) {
        console.warn(`  ${warning.message}`)
      }
    }

    if (errors.length > 0) {
      console.error(`Errors compiling ${relative(config.projectDir, entryPath)}:`)
      for (const error of errors) {
        console.error(`  ${error.message}`)
      }
      errorCount++
      continue
    }

    let markedJsxContent = ''
    let clientJsContent = ''

    for (const file of result.files) {
      if (file.type === 'markedTemplate') {
        markedJsxContent = file.content
      } else if (file.type === 'clientJs') {
        clientJsContent = file.content
      }
    }

    if (!markedJsxContent && !clientJsContent) {
      skippedCount++
      continue
    }

    // 5a. Content hash
    if (config.contentHash && clientJsContent) {
      const hash = generateHash(clientJsContent)
      clientJsFilename = `${baseNameNoExt}-${hash}.client.js`
    }

    const hasClientJs = clientJsContent.length > 0

    // 5c. Write client JS
    if (hasClientJs) {
      await Bun.write(resolve(componentsOutDir, clientJsFilename), clientJsContent)
      console.log(`Generated: components/${clientJsFilename}`)
    }

    // 5d. Write marked template (skip in clientOnly mode)
    if (markedJsxContent && !config.clientOnly) {
      let outputContent = markedJsxContent
      if (hasClientJs && config.transformMarkedTemplate) {
        outputContent = config.transformMarkedTemplate(markedJsxContent, baseNameNoExt, clientJsFilename)
      }
      await Bun.write(resolve(componentsOutDir, baseFileName), outputContent)
      console.log(`Generated: components/${baseFileName}`)
    }

    // 5e. Manifest entry
    if (!config.clientOnly) {
      manifest[baseNameNoExt] = {
        markedTemplate: `components/${baseFileName}`,
        clientJs: hasClientJs ? `components/${clientJsFilename}` : undefined,
      }
    }

    compiledCount++
  }

  // 6. Combine parent-child client JS
  const clientJsFiles = new Map<string, string>()
  for (const [name, entry] of Object.entries(manifest)) {
    if (!entry.clientJs) continue
    const filePath = resolve(config.outDir, entry.clientJs)
    try {
      clientJsFiles.set(name, await Bun.file(filePath).text())
    } catch {
      // File may not exist (e.g. __barefoot__)
    }
  }

  if (clientJsFiles.size > 0) {
    const combined = combineParentChildClientJs(clientJsFiles)
    for (const [name, content] of combined) {
      const entry = manifest[name]
      if (!entry?.clientJs) continue
      await Bun.write(resolve(config.outDir, entry.clientJs), content)
      console.log(`Combined: ${entry.clientJs}`)
    }
  }

  // 6b. Resolve relative imports
  await resolveRelativeImports({ distDir: config.outDir, manifest })

  // 7. Minify client JS (after combine so all files are final)
  if (config.minify) {
    // @ts-expect-error minifySyntax is supported at runtime but missing from older bun-types
    const transpiler = new Bun.Transpiler({ minifyWhitespace: true, minifySyntax: true })
    for (const [, entry] of Object.entries(manifest)) {
      if (!entry.clientJs) continue
      const filePath = resolve(config.outDir, entry.clientJs)
      try {
        const content = await Bun.file(filePath).text()
        if (content) {
          await Bun.write(filePath, transpiler.transformSync(content))
        }
      } catch {
        // File may not exist
      }
    }
  }

  // 8. Write manifest (skip in clientOnly mode)
  if (!config.clientOnly) {
    await Bun.write(
      resolve(componentsOutDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    )
    console.log('Generated: components/manifest.json')
  }

  return { compiledCount, skippedCount, errorCount, manifest }
}
