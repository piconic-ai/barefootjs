// Resolve and inline relative imports in compiled client JS files.

import { dirname, resolve } from 'node:path'
import { RELATIVE_IMPORT_RE } from './patterns'
import { fileExists, readText, transpile, writeText } from './runtime'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface ResolveRelativeImportsOptions {
  /** Absolute path to the dist directory (base for manifest paths) */
  distDir: string
  /** Build manifest: componentName -> { clientJs?, markedTemplate } */
  manifest: Record<string, { clientJs?: string; markedTemplate: string }>
  /** Source directories to search for modules (checked after the client JS file's own directory) */
  sourceDirs?: string[]
}

async function resolveSourceFile(importPath: string, searchDirs: string[]): Promise<string> {
  for (const dir of searchDirs) {
    const basePath = resolve(dir, importPath)
    for (const ext of ['.ts', '.tsx', '.js']) {
      if (await fileExists(basePath + ext)) return basePath + ext
    }
  }
  return ''
}

/**
 * Process a single file's relative imports, mutating `content` in place.
 * Recurses into transitively-imported `.ts` modules so that, e.g.,
 * `client.tsx → nav-data.ts → component-registry.ts` all end up inlined
 * in the right declaration order.
 */
async function inlineRelativeImports(
  content: string,
  searchDirs: string[],
  inlinedPaths: Set<string>,
  loggingPath: string
): Promise<string> {
  const re = new RegExp(RELATIVE_IMPORT_RE.source, RELATIVE_IMPORT_RE.flags)
  const matches = [...content.matchAll(re)]
  if (matches.length === 0) return content

  for (const match of matches) {
    const importPath = match[1]
    const fullMatch = match[0]
    const sourceFile = await resolveSourceFile(importPath, searchDirs)

    if (!sourceFile || inlinedPaths.has(sourceFile)) {
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      continue
    }

    if (sourceFile.endsWith('.tsx')) {
      content = content.replace(new RegExp(escapeRegExp(fullMatch) + '\\n?'), '')
      console.log(`Stripped server component import: ${importPath} from ${loggingPath}`)
      continue
    }

    inlinedPaths.add(sourceFile)
    const sourceContent = await readText(sourceFile)
    let jsCode = transpile(sourceContent, { loader: 'ts' })

    // Recursively resolve relative imports inside the inlined module before
    // stripping its import lines. Resolution is anchored to the source file's
    // own directory so transitive paths (e.g. './component-registry') resolve
    // correctly regardless of where the parent client JS lives.
    jsCode = await inlineRelativeImports(
      jsCode,
      [dirname(sourceFile), ...searchDirs.slice(1)],
      inlinedPaths,
      loggingPath,
    )

    // Convert exports/imports of the inlined module to plain declarations.
    // Also drop bare `export { foo, bar };` blocks emitted by the transpiler —
    // stripping just the `export` keyword leaves a stray block statement.
    jsCode = jsCode
      .replace(/^import\s+.*$/gm, '')
      .replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '')
      .replace(/^export\s+/gm, '')
      .trim()

    content = content.replace(fullMatch, jsCode)
    console.log(`Inlined: ${importPath} into ${loggingPath}`)
  }

  return content
}

/**
 * Resolve relative imports in compiled client JS files.
 *
 * For each client JS file in the manifest:
 * - `.ts` imports: transpile and inline the code (recursively for transitive `.ts` deps)
 * - `.tsx` imports: strip (server component, already rendered at SSR time)
 * - Not found / already inlined: strip
 */
export async function resolveRelativeImports(options: ResolveRelativeImportsOptions): Promise<void> {
  const { distDir, manifest, sourceDirs = [] } = options

  for (const [, entry] of Object.entries(manifest)) {
    if (!entry.clientJs) continue
    const filePath = resolve(distDir, entry.clientJs)
    let content: string
    try {
      content = await readText(filePath)
    } catch {
      continue
    }

    const inlinedPaths = new Set<string>()
    const next = await inlineRelativeImports(
      content,
      [dirname(filePath), ...sourceDirs],
      inlinedPaths,
      entry.clientJs,
    )

    if (next !== content) {
      await writeText(filePath, next)
    }
  }
}
