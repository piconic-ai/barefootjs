/**
 * Registry Build Script
 *
 * Generates individual component JSON files for the shadcn/ui registry format.
 * Output: dist/r/{component}.json
 */

import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import * as ts from 'typescript'

const ROOT_DIR = dirname(import.meta.path)
const DIST_DIR = resolve(ROOT_DIR, 'dist/r')

/**
 * Relative module specifiers a source file imports from, via a TS AST walk
 * — never regex (CLAUDE.md bans regex/string-matching for import parsing:
 * it false-matches inside string/template literals and comments). Used
 * below to detect the `ui/lib/*` shared-helper import; the sibling-component
 * and `../../../types` detections predate that rule and are left as their
 * existing regex form to keep this change scoped.
 */
function collectRelativeImportSpecifiers(content: string, filePath: string): string[] {
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const specifiers: string[] = []
  for (const stmt of sourceFile.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    const spec = stmt.moduleSpecifier.text
    if (spec.startsWith('.')) specifiers.push(spec)
  }
  return specifiers
}

/**
 * Scan a component's source file and collect internal UI dependencies.
 * Detects `from '../{dep}'` patterns and recurses one level for transitive deps.
 * Also detects `from '../../../types'` to include types/index.tsx, and
 * `from '../../../lib/*'` to include the matching `ui/lib/*.ts` helper.
 */
async function resolveFiles(name: string): Promise<string[]> {
  const paths: string[] = []
  const seen = new Set<string>()

  async function collect(componentName: string) {
    if (seen.has(componentName)) return
    seen.add(componentName)

    const filePath = `components/ui/${componentName}/index.tsx`
    paths.push(filePath)

    const absPath = resolve(ROOT_DIR, filePath)
    const content = await Bun.file(absPath).text()

    // Detect internal UI deps: from '../{dep}'
    const depPattern = /from\s+['"]\.\.\/([a-z][\w-]*)['"/]/g
    let match: RegExpExecArray | null
    while ((match = depPattern.exec(content)) !== null) {
      await collect(match[1])
    }

    // Detect types import: from '../../../types'
    if (/from\s+['"]\.\.\/\.\.\/\.\.\/types['"]/.test(content)) {
      if (!seen.has('__types__')) {
        seen.add('__types__')
        paths.push('types/index.tsx')
      }
    }

    // Detect shared `ui/lib/*` helper imports: from '../../../lib/<name>'
    for (const specifier of collectRelativeImportSpecifiers(content, absPath)) {
      const libMatch = /^\.\.\/\.\.\/\.\.\/lib\/([a-z][\w-]*)$/.exec(specifier)
      if (!libMatch) continue
      const libKey = `__lib_${libMatch[1]}__`
      if (seen.has(libKey)) continue
      seen.add(libKey)
      paths.push(`lib/${libMatch[1]}.ts`)
    }
  }

  await collect(name)
  return paths
}

/**
 * Resolve npm dependencies for a component.
 * Always includes @barefootjs/jsx. Adds @barefootjs/client if imported by the
 * component or any of its transitive internal deps.
 */
async function resolveDependencies(files: string[]): Promise<string[]> {
  const deps = ['@barefootjs/jsx']

  for (const file of files) {
    if (file === 'types/index.tsx') continue
    const absPath = resolve(ROOT_DIR, file)
    const content = await Bun.file(absPath).text()
    if (content.includes('@barefootjs/client')) {
      deps.push('@barefootjs/client')
      break
    }
  }

  return deps
}

interface RegistryItem {
  $schema: string
  name: string
  type: string
  title: string
  description: string
  dependencies: string[]
  requires?: string[]
  files: Array<{
    path: string
    type: string
    content: string
  }>
}

interface RegistryIndex {
  $schema: string
  name: string
  homepage: string
  items: Array<{
    name: string
    type: string
    title: string
    description: string
    requires?: string[]
  }>
}

async function buildRegistryItem(
  name: string,
  registryMeta: { title: string; description: string; requires?: string[] },
): Promise<RegistryItem> {
  const filePaths = await resolveFiles(name)
  const dependencies = await resolveDependencies(filePaths)

  const files: RegistryItem['files'] = []

  for (const fp of filePaths) {
    const absPath = resolve(ROOT_DIR, fp)
    const content = await Bun.file(absPath).text()

    files.push({
      path: fp,
      type: 'registry:ui',
      content,
    })
  }

  const item: RegistryItem = {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    name,
    type: 'registry:ui',
    title: registryMeta.title,
    description: registryMeta.description,
    dependencies,
    files,
  }

  if (registryMeta.requires && registryMeta.requires.length > 0) {
    item.requires = registryMeta.requires
  }

  return item
}

async function main() {
  await mkdir(DIST_DIR, { recursive: true })

  // Read and copy registry.json
  const registryPath = resolve(ROOT_DIR, 'registry.json')
  const registry: RegistryIndex = JSON.parse(await Bun.file(registryPath).text())
  await Bun.write(resolve(DIST_DIR, 'registry.json'), JSON.stringify(registry, null, 2))
  console.log('Generated: dist/r/registry.json')

  // Build individual component files
  for (const item of registry.items) {
    try {
      const registryItem = await buildRegistryItem(item.name, {
        title: item.title,
        description: item.description,
      })
      await Bun.write(resolve(DIST_DIR, `${item.name}.json`), JSON.stringify(registryItem, null, 2))
      console.log(`Generated: dist/r/${item.name}.json`)
    } catch (error) {
      console.error(`Error building ${item.name}:`, error)
    }
  }

  console.log('\nRegistry build complete!')
}

main()
