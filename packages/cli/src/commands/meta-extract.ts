// bf meta extract — extract component metadata from ui/components/ui/*/index.tsx.
// Uses the compiler's analyzeComponent() for precise extraction,
// with regex-based JSDoc parsing for descriptions/examples.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import path from 'path'
import { globFiles } from '../lib/runtime'
import { analyzeComponent, listExportedComponents } from '@barefootjs/jsx'
import type { AnalyzerContext } from '@barefootjs/jsx'
import type { CliContext } from '../context'
import { generateCoreLlmsTxt, generateUiLlmsTxt } from '../lib/llms-txt-generator'
import { scanCoreDocs } from '../lib/docs-loader'
import { extractDescription, extractExamples, parsePropsFromDefinition, extractJsdocBefore } from '../lib/parse-jsdoc'
import { categoryMap, relatedMap, detectTags } from '../lib/categories'
import type { ComponentMeta, MetaIndex, MetaIndexEntry, PropMeta, SubComponentMeta, SignalMeta, MemoMeta, EffectMeta, CompilerErrorMeta } from '../lib/types'

/**
 * Decide what `generatedAt` to write for the new `ui/meta/index.json`.
 * Returns the previous timestamp when the component list is byte-identical
 * (so the file ends up unchanged on disk), otherwise a fresh ISO timestamp.
 * Exported for unit testing.
 */
export function pickGeneratedAt(
  previousIndexJson: string | null,
  nextEntries: MetaIndexEntry[],
  now: () => string = () => new Date().toISOString(),
): string {
  if (previousIndexJson === null) return now()
  try {
    const prev = JSON.parse(previousIndexJson) as MetaIndex
    const prevSig = JSON.stringify({ ...prev, generatedAt: '' })
    const nextSig = JSON.stringify({ version: 1, generatedAt: '', components: nextEntries })
    if (prevSig === nextSig) return prev.generatedAt
  } catch {
    // Corrupt or unreadable — fall through to a fresh timestamp.
  }
  return now()
}

// Read registry.json for fallback descriptions
function loadRegistry(root: string): Record<string, { title: string; description: string }> {
  const registryPath = path.join(root, 'ui/registry.json')
  const registry: Record<string, { title: string; description: string }> = {}
  try {
    const data = JSON.parse(readFileSync(registryPath, 'utf-8'))
    for (const item of data.items || []) {
      registry[item.name] = { title: item.title, description: item.description }
    }
  } catch {
    // registry.json is optional
  }
  return registry
}

// Convert directory path to component name (e.g., ".../radio-group/index.tsx" → "radio-group")
function fileToName(filePath: string): string {
  return path.basename(path.dirname(filePath))
}

// Convert kebab-case to Title Case
function toTitle(name: string): string {
  return name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

// Extract accessibility attributes via regex (deferred to IR phase for per-element accuracy)
function extractAccessibility(source: string) {
  const roleMatches = source.match(/role[={"]+([^"}\s]+)/g)
  const roles = new Set<string>()
  if (roleMatches) {
    for (const rm of roleMatches) {
      const val = rm.match(/role[={"]+([^"}\s]+)/)
      if (val) roles.add(val[1])
    }
  }

  const ariaMatches = source.match(/aria-[\w]+/g)
  const ariaAttrs = [...new Set(ariaMatches || [])]

  const dataMatches = source.match(/data-(?:state|slot|orientation|value|disabled|side)[\w-]*/g)
  const dataAttrs = [...new Set(dataMatches || [])]

  return {
    role: roles.size > 0 ? [...roles].join(', ') : undefined,
    ariaAttributes: ariaAttrs,
    dataAttributes: dataAttrs,
  }
}

// Extract main component props from the Props interface definition.
// Uses the type definition from the analyzer but parses the interface body for accurate types.
function extractMainProps(ctx: AnalyzerContext, source: string): PropMeta[] {
  // Find the main component's Props interface
  const propsTypeName = ctx.propsType?.raw
  if (propsTypeName) {
    const typeDef = ctx.typeDefinitions.find(t => t.name === propsTypeName && t.kind === 'interface')
    if (typeDef) {
      return parsePropsFromDefinition(typeDef.definition)
    }
  }

  // Fallback: find the first Props interface in type definitions
  const firstPropsInterface = ctx.typeDefinitions.find(
    t => t.kind === 'interface' && t.name.endsWith('Props')
  )
  if (firstPropsInterface) {
    return parsePropsFromDefinition(firstPropsInterface.definition)
  }

  return []
}

// Extract sub-components from analyzer context + source JSDoc
function extractSubComponents(ctx: AnalyzerContext, source: string): SubComponentMeta[] {
  const exportedNames = listExportedComponents(source, ctx.filePath)
  if (exportedNames.length <= 1) return []

  // Determine which interface is the main component's props
  const mainPropsName = ctx.propsType?.raw
  const firstPropsInterface = ctx.typeDefinitions.find(
    t => t.kind === 'interface' && t.name.endsWith('Props')
  )
  const mainPropsInterfaceName = mainPropsName || firstPropsInterface?.name

  const mainName = ctx.componentName
  const subs: SubComponentMeta[] = []

  for (const name of exportedNames) {
    if (name === mainName) continue

    // Find matching Props interface in type definitions
    const propsInterfaceName = `${name}Props`
    const typeDef = ctx.typeDefinitions.find(t => t.name === propsInterfaceName && t.kind === 'interface')

    // Skip if this is the main component's Props interface
    if (typeDef && typeDef.name === mainPropsInterfaceName) continue

    const props = typeDef ? parsePropsFromDefinition(typeDef.definition) : []

    // Extract JSDoc description by finding the interface declaration in source
    let description = ''
    if (typeDef) {
      // Use line number from analyzer to find the byte position
      const defPos = findPositionOfLine(source, typeDef.loc.start.line)
      if (defPos > 0) {
        description = extractJsdocBefore(source, defPos)
      }
    }

    subs.push({ name, description, props })
  }

  return subs
}

// Find byte position of a 1-indexed line number in source
function findPositionOfLine(source: string, line: number): number {
  let pos = 0
  for (let i = 1; i < line; i++) {
    const newline = source.indexOf('\n', pos)
    if (newline === -1) return source.length
    pos = newline + 1
  }
  return pos
}

// Extract variant/union type definitions from analyzer context
function extractVariants(ctx: AnalyzerContext): Record<string, string[]> {
  const variants: Record<string, string[]> = {}
  const variantPattern = /(?:Variant|Size|Orientation|Side|Position)$/

  for (const typeDef of ctx.typeDefinitions) {
    if (typeDef.kind !== 'type') continue
    if (!variantPattern.test(typeDef.name)) continue

    const values = typeDef.definition.match(/'([^']+)'/g)
    if (values) {
      variants[typeDef.name] = values.map(v => v.replace(/'/g, ''))
    }
  }

  return variants
}

// Extract dependencies from analyzer context imports
function extractDependencies(ctx: AnalyzerContext) {
  const internal: string[] = []
  const external: string[] = []

  for (const imp of ctx.imports) {
    if (imp.isTypeOnly) continue

    if (imp.source.startsWith('./') || imp.source.startsWith('../')) {
      const parts = imp.source.split('/')
      const name = parts[parts.length - 1].replace(/\.tsx?$/, '')
      if (name !== 'types' && name !== 'index') {
        internal.push(name)
      }
    } else {
      external.push(imp.source)
    }
  }

  return {
    internal: [...new Set(internal)],
    external: [...new Set(external)],
  }
}

// Map signals from analyzer context
function mapSignals(ctx: AnalyzerContext): SignalMeta[] | undefined {
  if (ctx.signals.length === 0) return undefined
  return ctx.signals.map(s => ({
    getter: s.getter,
    setter: s.setter,
    initialValue: s.initialValue,
  }))
}

// Map memos from analyzer context
function mapMemos(ctx: AnalyzerContext): MemoMeta[] | undefined {
  if (ctx.memos.length === 0) return undefined
  return ctx.memos.map(m => ({
    name: m.name,
    deps: m.deps,
  }))
}

// Map effects from analyzer context
function mapEffects(ctx: AnalyzerContext): EffectMeta[] | undefined {
  if (ctx.effects.length === 0) return undefined
  return ctx.effects.map(e => ({
    deps: e.deps,
  }))
}

// Map compiler errors from analyzer context
function mapCompilerErrors(ctx: AnalyzerContext): CompilerErrorMeta[] | undefined {
  if (ctx.errors.length === 0) return undefined
  return ctx.errors.map(e => ({
    code: e.code,
    message: e.message,
    line: e.loc.start.line,
  }))
}

/**
 * Build a `ComponentMeta` for a single component file. Pure with respect
 * to the filesystem on input — callers handle writing the JSON out.
 *
 * The bulk-scan `run()` below uses this in a loop; `bf add` uses it
 * one-at-a-time to keep `meta/<name>.json` in sync with each newly
 * fetched registry item. The `source` field is computed relative to
 * `projectRoot` so the same helper produces correct paths in both the
 * monorepo (`ui/components/ui/...`) and scaffolded apps
 * (`components/ui/...`).
 */
export function extractMetaForFile(
  filePath: string,
  projectRoot: string,
  registry: Record<string, { title: string; description: string }> = {},
): { meta: ComponentMeta; subComponents: SubComponentMeta[] } {
  const name = fileToName(filePath)
  const source = readFileSync(filePath, 'utf-8')

  const analyzerCtx = analyzeComponent(source, filePath)

  const description = extractDescription(source) || registry[name]?.description || ''
  const title = registry[name]?.title || toTitle(name)
  const examples = extractExamples(source)

  const props = extractMainProps(analyzerCtx, source)
  const subComponentsList = extractSubComponents(analyzerCtx, source)
  const variants = extractVariants(analyzerCtx)
  const dependencies = extractDependencies(analyzerCtx)
  const accessibility = extractAccessibility(source)
  const category = categoryMap[name] || 'display'
  const tags = detectTags(source)
  const related = relatedMap[name] || []

  const meta: ComponentMeta = {
    name,
    title,
    category,
    description,
    tags,
    stateful: analyzerCtx.hasUseClientDirective && analyzerCtx.signals.length > 0,
    props,
    subComponents: subComponentsList.length > 0 ? subComponentsList : undefined,
    variants: Object.keys(variants).length > 0 ? variants : undefined,
    examples,
    accessibility,
    dependencies,
    related,
    source: path.relative(projectRoot, filePath),
    signals: mapSignals(analyzerCtx),
    memos: mapMemos(analyzerCtx),
    effects: mapEffects(analyzerCtx),
    compilerErrors: mapCompilerErrors(analyzerCtx),
  }

  return { meta, subComponents: subComponentsList }
}

export async function run(_args: string[], ctx: CliContext): Promise<void> {
  // Two layouts to support:
  //   - Monorepo dev: components live at `<root>/ui/components/ui/` and
  //     `<root>/docs/core/` is present. Pre-fix behavior — kept verbatim.
  //   - Scaffolded app: components live at
  //     `<projectDir>/<paths.components>/` (default `components/ui`).
  //     The pre-fix command scanned `<ctx.root>/ui/components/ui` —
  //     which in a scaffolded app is `node_modules/ui/components/ui/`,
  //     where the only files are leftover scaffolding artifacts. We
  //     then overwrote `meta/index.json` with the partial result,
  //     clobbering meta written by `bf add`.
  const inProject = ctx.config !== null && ctx.projectDir !== null
  const componentsDir = inProject
    ? path.resolve(ctx.projectDir!, ctx.config!.paths.components)
    : path.join(ctx.root, 'ui/components/ui')
  const writeRoot = inProject ? ctx.projectDir! : ctx.root

  // Ensure output directory exists
  if (!existsSync(ctx.metaDir)) {
    mkdirSync(ctx.metaDir, { recursive: true })
  }

  const registry = loadRegistry(ctx.root)

  // Glob all component index.tsx files (colocated structure)
  const matched = await globFiles('*/index.tsx', { cwd: componentsDir })
  const files = matched.map(f => path.join(componentsDir, f)).sort()

  const indexEntries: MetaIndexEntry[] = []
  let count = 0

  for (const filePath of files) {
    const { meta, subComponents: subComponentsList } = extractMetaForFile(
      filePath,
      writeRoot,
      registry,
    )

    // Write per-component JSON
    writeFileSync(
      path.join(ctx.metaDir, `${meta.name}.json`),
      JSON.stringify(meta, null, 2) + '\n',
    )

    // Build index entry
    const indexEntry: MetaIndexEntry = {
      name: meta.name,
      title: meta.title,
      category: meta.category,
      description: meta.description,
      tags: meta.tags,
      stateful: meta.stateful,
    }
    if (subComponentsList.length > 0) {
      indexEntry.subComponents = subComponentsList.map(s => s.name)
    }
    indexEntries.push(indexEntry)
    count++
  }

  // Write index.json. Preserve the previous `generatedAt` when only the
  // timestamp would have changed — otherwise every run produces a 1-line
  // diff in CI even when no component has actually changed, which makes
  // `update-meta.yml` push useless auto-commits.
  const indexPath = path.join(ctx.metaDir, 'index.json')
  const prevRaw = existsSync(indexPath) ? readFileSync(indexPath, 'utf-8') : null
  const index: MetaIndex = {
    version: 1,
    generatedAt: pickGeneratedAt(prevRaw, indexEntries),
    components: indexEntries,
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n')

  // Generate llms.txt files
  const uiLlmsTxt = generateUiLlmsTxt(index, 'https://ui.barefootjs.dev/r')
  writeFileSync(path.join(ctx.metaDir, 'llms.txt'), uiLlmsTxt)

  // Display paths relative to the user's project root so the summary
  // matches what they'd `cd` into. In monorepo mode this is the same
  // `ui/meta/` it always printed; in scaffolded apps it's `meta/`
  // (or whatever `paths.meta` resolves to).
  const metaRel = path.relative(writeRoot, ctx.metaDir) || '.'
  const docsDir = path.join(ctx.root, 'docs/core')
  if (existsSync(docsDir)) {
    const coreDocs = scanCoreDocs(docsDir)
    const coreLlmsTxt = generateCoreLlmsTxt(coreDocs, 'https://barefootjs.dev/docs')
    writeFileSync(path.join(docsDir, 'llms.txt'), coreLlmsTxt)
    console.log(`Extracted metadata for ${count} components → ${metaRel}/`)
    console.log(`Generated: ${metaRel}/llms.txt, docs/core/llms.txt`)
  } else {
    console.log(`Extracted metadata for ${count} components → ${metaRel}/`)
    console.log(`Generated: ${metaRel}/llms.txt`)
  }
}
