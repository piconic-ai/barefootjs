/**
 * BarefootJS Compiler - Main Entry Point
 *
 * Compiles JSX components to Marked Templates + Client JS.
 */

import type {
  ComponentIR,
  ImportInfo,
  ImportSpecifier,
  IRMetadata,
  CompileOptions,
  CompileResult,
  FileOutput,
} from './types'
import type { TemplateAdapter } from './adapters/interface'
import { analyzeComponent, listComponentFunctions, createProgramForFile, needsTypeBasedDetection } from './analyzer'
import { jsxToIR } from './jsx-to-ir'
import { generateClientJs, generateClientJsWithSourceMap, analyzeClientNeeds } from './ir-to-client-js'
import { setActiveComponentScope, computeFileScope } from './ir-to-client-js/component-scope'
import { generateModuleExports, collectInlineExportedNames } from './module-exports'
import { applyCssLayerPrefix } from './css-layer-prefixer'

/**
 * Extended compile options with required adapter
 */
export interface CompileOptionsWithAdapter extends CompileOptions {
  /** Template adapter for generating output (required) */
  adapter: TemplateAdapter
}

/**
 * Client-side package sources that need adapter-specific SSR handling.
 * When the adapter provides a `clientShimSource`, imports from these paths
 * are rewritten to that shim. Otherwise (e.g. go-template, which has no JS
 * runtime at SSR), the imports are stripped wholesale.
 */
const CLIENT_PACKAGE_SOURCES = new Set([
  '@barefootjs/client',
  '@barefootjs/client/runtime',
])

function rewriteTemplateImports(
  imports: ImportInfo[],
  shimSource: string | undefined,
): ImportInfo[] {
  if (!shimSource) {
    return imports.filter(imp => !CLIENT_PACKAGE_SOURCES.has(imp.source))
  }
  const merged = new Map<string, ImportInfo>()
  const result: ImportInfo[] = []
  for (const imp of imports) {
    if (!CLIENT_PACKAGE_SOURCES.has(imp.source)) {
      result.push(imp)
      continue
    }
    // Rewrite to the shim source. Multiple original sources collapse into a
    // single import statement so the SSR template stays clean.
    const existing = merged.get(shimSource)
    if (existing) {
      // Merge specifiers, deduplicating by (name, alias, isDefault, isNamespace)
      const seen = new Set(existing.specifiers.map(specKey))
      for (const spec of imp.specifiers) {
        if (!seen.has(specKey(spec))) {
          existing.specifiers.push(spec)
          seen.add(specKey(spec))
        }
      }
      // Type-only stays only if every contributing import is type-only
      existing.isTypeOnly = existing.isTypeOnly && imp.isTypeOnly
    } else {
      const rewritten: ImportInfo = {
        ...imp,
        source: shimSource,
        specifiers: imp.specifiers.map(s => ({ ...s })),
      }
      merged.set(shimSource, rewritten)
      result.push(rewritten)
    }
  }
  return result
}

function specKey(s: ImportSpecifier): string {
  return `${s.isDefault ? 'd' : ''}${s.isNamespace ? 'n' : ''}:${s.name}:${s.alias ?? ''}`
}

/**
 * Add 'export' keyword to the component function declaration if needed.
 * Adapters emit plain `function Name(...)` — the compiler adds module-level export.
 */
function applyExportKeyword(component: string, ir: ComponentIR): string {
  if (ir.metadata.isExported === false) return component
  // Prepend 'export ' to the first 'function' declaration
  return component.replace(/^function /, 'export function ')
}

// =============================================================================
// Main Entry Point
// =============================================================================

export async function compileJSX(
  entryPath: string,
  readFile: (path: string) => Promise<string>,
  options: CompileOptionsWithAdapter
): Promise<CompileResult> {
  const files: FileOutput[] = []
  const errors: CompileResult['errors'] = []

  // Read source file
  const source = await readFile(entryPath)

  // List all exported components in the file
  const componentNames = listComponentFunctions(source, entryPath)

  // If multiple components, compile each separately and combine
  if (componentNames.length > 1) {
    return compileMultipleComponents(source, entryPath, componentNames, options)
  }

  // Single component flow
  const ctx = analyzeComponent(source, entryPath, undefined, options.program)

  if (!ctx.jsxReturn) {
    errors.push(...ctx.errors)  // Only analyzer errors
    return { files, errors }
  }

  const ir = jsxToIR(ctx)
  errors.push(...ctx.errors)  // All errors: analyzer + IR phase

  if (!ir) {
    return { files, errors }
  }

  const componentIR: ComponentIR = {
    version: '0.1',
    metadata: buildMetadata(ctx, options.adapter.clientShimSource),
    root: ir,
    errors: [],
  }

  // Pre-compute client JS analysis for adapter optimization
  componentIR.metadata.clientAnalysis = analyzeClientNeeds(componentIR)

  // Apply CSS layer prefix if configured
  if (options.cssLayerPrefix) {
    applyCssLayerPrefix(componentIR, options.cssLayerPrefix)
  }

  if (options?.outputIR) {
    files.push({
      path: entryPath.replace(/\.tsx?$/, '.ir.json'),
      content: JSON.stringify(componentIR, null, 2),
      type: 'ir',
    })
  }

  const adapter = options.adapter
  const adapterOutput = adapter.generate(componentIR, { scriptBaseName: options.scriptBaseName })
  const moduleExports = generateModuleExports(componentIR)

  // Use structured sections if available, otherwise fall back to template
  let content: string
  if (adapterOutput.sections) {
    const s = adapterOutput.sections
    const component = applyExportKeyword(s.component, componentIR)
    content = [s.imports, s.moduleConstants ?? '', s.types, moduleExports, component]
      .filter(Boolean).join('\n\n') + (s.defaultExport || '')
  } else {
    content = adapterOutput.template
  }

  files.push({
    path: entryPath.replace(/\.tsx?$/, adapter.extension),
    content,
    type: 'markedTemplate',
  })

  // Emit adapter types as a separate FileOutput
  if (adapterOutput.types) {
    files.push({
      path: entryPath.replace(/\.tsx?$/, '.types'),
      content: adapterOutput.types,
      type: 'types',
    })
  }

  const clientJsPath = entryPath.replace(/\.tsx?$/, '.client.js')
  // Single-component file: only the component itself can collide. Scope it
  // when it's non-exported so a private helper can't be overwritten by an
  // identically-named exported component in another file.
  const singleScope = {
    fileScope: computeFileScope(entryPath),
    nonExportedSiblings: componentIR.metadata.isExported
      ? new Set<string>()
      : new Set([componentIR.metadata.componentName]),
  }
  setActiveComponentScope(singleScope)
  try {
    if (options.sourceMaps) {
      const result = generateClientJsWithSourceMap(componentIR, undefined, options.localImportPrefixes, {
        sourceMaps: true,
        generatedFileName: clientJsPath.split('/').pop(),
      })
      errors.push(...componentIR.errors)
      if (result.code) {
        files.push({ path: clientJsPath, content: result.code, type: 'clientJs' })
        if (result.sourceMap) {
          files.push({ path: clientJsPath + '.map', content: JSON.stringify(result.sourceMap), type: 'sourceMap' as FileOutput['type'] })
        }
      }
    } else {
      const clientJs = generateClientJs(componentIR, undefined, options.localImportPrefixes)
      errors.push(...componentIR.errors)
      if (clientJs) {
        files.push({ path: clientJsPath, content: clientJs, type: 'clientJs' })
      }
    }
  } finally {
    setActiveComponentScope(null)
  }

  return { files, errors }
}

// =============================================================================
// Multiple Component Compilation
// =============================================================================

function compileMultipleComponentsSync(
  source: string,
  filePath: string,
  componentNames: string[],
  options: CompileOptionsWithAdapter
): CompileResult {
  const files: FileOutput[] = []
  const errors: CompileResult['errors'] = []
  const adapter = options.adapter

  // --- Pass 1: analyze + jsxToIR for ALL components ---
  const entries: { componentIR: ComponentIR; ctx: ReturnType<typeof analyzeComponent> }[] = []

  // Create ts.Program only when the file needs type-based reactivity detection
  const program = options.program ?? (needsTypeBasedDetection(source) ? createProgramForFile(source, filePath)?.program : undefined)

  for (const componentName of componentNames) {
    const ctx = analyzeComponent(source, filePath, componentName, program)

    if (!ctx.jsxReturn) {
      errors.push(...ctx.errors)
      continue
    }

    const ir = jsxToIR(ctx)
    errors.push(...ctx.errors)
    if (!ir) continue

    const componentIR: ComponentIR = {
      version: '0.1',
      metadata: buildMetadata(ctx, options.adapter.clientShimSource),
      root: ir,
      errors: [],
    }

    componentIR.metadata.clientAnalysis = analyzeClientNeeds(componentIR)

    if (options.cssLayerPrefix) {
      applyCssLayerPrefix(componentIR, options.cssLayerPrefix)
    }

    entries.push({ componentIR, ctx })
  }

  // --- Pass 2: adapter.generate + generateClientJs ---
  const allOutputs: { componentName: string; rawTemplate: string; imports: string; types: string; moduleExports: string; component: string; clientJs?: string; adapterTypes?: string }[] = []

  // Find the default export name for scriptBaseName (multi-component files share one .client.js)
  const defaultExportName = entries.find(e => e.componentIR.metadata.hasDefaultExport)?.componentIR.metadata.componentName

  // Union of sibling-component inline exports — passed to each per-component
  // emit so the trailing `export { ... }` block is identical across siblings
  // and the line-dedup pass collapses them.
  const fileWideInlineExported = new Set<string>()
  for (const { componentIR } of entries) {
    for (const name of collectInlineExportedNames(componentIR)) {
      fileWideInlineExported.add(name)
    }
  }

  // Module-scope statements (e.g. SSR-side context bindings) are file-wide:
  // every component in the same source file generates the same block, so we
  // collect via exact-string dedup and emit once at the file level rather
  // than per component (per-line dedup of imports drops repeated lines like
  // closing `})` that recur across multiple multi-line bindings).
  const moduleConstantsSet = new Set<string>()
  const moduleConstantsOrdered: string[] = []

  // Component-name scope: rewrite `hydrate` / `renderChild` / `initChild` /
  // `createComponent` / `upsertChild` keys for non-exported helpers
  // (`function SunIcon` inside theme-switcher.tsx) so they cannot collide
  // with same-named components from another file in the global runtime
  // registry. Exported components keep their original name — their cross-
  // file consumers still resolve them as before.
  const fileScope = computeFileScope(filePath)
  const nonExportedSiblings = new Set<string>()
  for (const { componentIR } of entries) {
    if (!componentIR.metadata.isExported) {
      nonExportedSiblings.add(componentIR.metadata.componentName)
    }
  }
  setActiveComponentScope({ fileScope, nonExportedSiblings })
  try {

  for (const { componentIR } of entries) {
    // Non-default exports share the parent's .client.js, so they
    // route to the default export's script name. The pipeline's
    // path-based override (`options.scriptBaseName`) takes
    // precedence when set — it captures the on-disk filename
    // (e.g. `ui/button/index`) which the default-export name
    // (`Button`) doesn't.
    const scriptBaseName =
      options.scriptBaseName ??
      (!componentIR.metadata.hasDefaultExport && defaultExportName ? defaultExportName : undefined)
    const adapterOutput = adapter.generate(componentIR, { scriptBaseName })
    const moduleExports = generateModuleExports(componentIR, fileWideInlineExported)

    let imports: string
    let types: string
    let component: string

    if (adapterOutput.sections) {
      // Use structured sections directly — no string parsing needed
      const s = adapterOutput.sections
      imports = s.imports
      types = s.types
      component = applyExportKeyword(s.component, componentIR) + (s.defaultExport || '')
      const mc = s.moduleConstants
      if (mc && !moduleConstantsSet.has(mc)) {
        moduleConstantsSet.add(mc)
        moduleConstantsOrdered.push(mc)
      }
    } else {
      // Fallback: parse template string (for adapters without sections)
      const lines = adapterOutput.template.split('\n')
      const importLines: string[] = []
      const typeLines: string[] = []
      const componentLines: string[] = []
      let inComponent = false

      for (const line of lines) {
        if (line.startsWith('export function ') || line.startsWith('function ')) {
          const funcName = line.match(/^(?:export )?function (\w+)/)?.[1]
          if (funcName && componentNames.includes(funcName)) {
            inComponent = true
          }
        }

        if (inComponent) {
          componentLines.push(line)
        } else if (line.startsWith('import ')) {
          importLines.push(line)
        } else if (line.trim()) {
          typeLines.push(line)
        }
      }

      imports = importLines.join('\n')
      types = typeLines.join('\n')
      component = componentLines.join('\n')
    }

    allOutputs.push({
      componentName: componentIR.metadata.componentName,
      rawTemplate: adapterOutput.template,
      imports,
      types,
      moduleExports: moduleExports || '',
      component,
      clientJs: generateClientJs(componentIR, componentNames, options.localImportPrefixes) || undefined,
      adapterTypes: adapterOutput.types || undefined,
    })
    errors.push(...componentIR.errors)
  }
  } finally {
    setActiveComponentScope(null)
  }

  if (allOutputs.length === 0) {
    return { files, errors }
  }

  // Per-component adapters (e.g. Mojolicious) need one template file per component
  // because their template renderers look up templates by filename.
  if (adapter.templatesPerComponent) {
    const dir = filePath.substring(0, filePath.lastIndexOf('/') + 1)
    for (const output of allOutputs) {
      files.push({
        path: dir + output.componentName + adapter.extension,
        content: output.rawTemplate,
        type: 'markedTemplate',
      })
    }
    // Types and client JS remain one-per-source-file (shared across components)
    const adapterTypesOutputs = allOutputs.map(o => o.adapterTypes).filter(Boolean) as string[]
    if (adapterTypesOutputs.length > 0) {
      files.push({
        path: filePath.replace(/\.tsx?$/, '.types'),
        content: adapterTypesOutputs.join('\n\n'),
        type: 'types',
      })
    }
    const clientJsOutputs = allOutputs.map(o => o.clientJs).filter(Boolean) as string[]
    if (clientJsOutputs.length > 0) {
      const importsBySource = new Map<string, Set<string>>()
      const otherImports: string[] = []
      const allCode: string[] = []
      for (const js of clientJsOutputs) {
        for (const line of js.split('\n')) {
          if (line.startsWith('import ')) {
            const match = line.match(/^import \{ ([^}]+) \} from ['"]([^'"]+)['"]$/)
            if (match) {
              const source = match[2]
              if (!importsBySource.has(source)) importsBySource.set(source, new Set())
              for (const n of match[1].split(',').map(n => n.trim())) importsBySource.get(source)!.add(n)
            } else if (!otherImports.includes(line)) {
              otherImports.push(line)
            }
          }
        }
        allCode.push(js.replace(/^import .+\n/gm, '').trim())
      }
      const mergedClientImports = [...importsBySource].map(([src, names]) =>
        `import { ${[...names].sort().join(', ')} } from '${src}'`
      )
      files.push({
        path: filePath.replace(/\.tsx?$/, '.client.js'),
        content: [...mergedClientImports, ...otherImports, '', ...allCode.filter(Boolean)].join('\n'),
        type: 'clientJs',
      })
    }
    return { files, errors }
  }

  // Merge imports from all components, deduplicating by line
  const seenImportLines = new Set<string>()
  const uniqueImports: string[] = []
  for (const output of allOutputs) {
    if (output.imports) {
      for (const line of output.imports.split('\n')) {
        if (line.trim() && !seenImportLines.has(line)) {
          seenImportLines.add(line)
          uniqueImports.push(line)
        }
      }
    }
  }
  const mergedImports = uniqueImports.join('\n')

  // Combine unique type definitions
  const seenTypes = new Set<string>()
  const uniqueTypes: string[] = []
  for (const output of allOutputs) {
    if (output.types && !seenTypes.has(output.types)) {
      seenTypes.add(output.types)
      uniqueTypes.push(output.types)
    }
  }

  // Deduplicate module-level exports across components
  const seenModuleExports = new Set<string>()
  const uniqueModuleExports: string[] = []
  for (const output of allOutputs) {
    if (output.moduleExports) {
      for (const line of output.moduleExports.split('\n')) {
        if (line.trim() && !seenModuleExports.has(line)) {
          seenModuleExports.add(line)
          uniqueModuleExports.push(line)
        }
      }
    }
  }

  // Combine all components
  const combinedTemplate = [
    mergedImports,
    moduleConstantsOrdered.join('\n\n'),
    uniqueTypes.join('\n\n'),
    uniqueModuleExports.length > 0 ? uniqueModuleExports.join('\n') : '',
    ...allOutputs.map(o => o.component),
  ]
    .filter(Boolean)
    .join('\n\n')

  files.push({
    path: filePath.replace(/\.tsx?$/, adapter.extension),
    content: combinedTemplate,
    type: 'markedTemplate',
  })

  // Emit combined adapter types if any
  const adapterTypesOutputs = allOutputs.map(o => o.adapterTypes).filter(Boolean) as string[]
  if (adapterTypesOutputs.length > 0) {
    files.push({
      path: filePath.replace(/\.tsx?$/, '.types'),
      content: adapterTypesOutputs.join('\n\n'),
      type: 'types',
    })
  }

  // Combine client JS if any
  const clientJsOutputs = allOutputs.map(o => o.clientJs).filter(Boolean) as string[]
  if (clientJsOutputs.length > 0) {
    // Separate imports from code and merge imports by source
    const importsBySource = new Map<string, Set<string>>()
    const otherImports: string[] = []
    const allCode: string[] = []

    for (const js of clientJsOutputs) {
      const lines = js.split('\n')
      const codeLines: string[] = []

      for (const line of lines) {
        if (line.startsWith('import ')) {
          // Parse named imports: import { a, b } from 'source'
          const match = line.match(/^import \{ ([^}]+) \} from ['"]([^'"]+)['"]$/)
          if (match) {
            const names = match[1].split(',').map(n => n.trim())
            const source = match[2]
            if (!importsBySource.has(source)) {
              importsBySource.set(source, new Set())
            }
            const set = importsBySource.get(source)!
            for (const name of names) {
              set.add(name)
            }
          } else {
            // Other import styles (default, namespace, etc.)
            if (!otherImports.includes(line)) {
              otherImports.push(line)
            }
          }
        } else {
          codeLines.push(line)
        }
      }

      allCode.push(codeLines.join('\n').trim())
    }

    // Generate merged imports
    const mergedImports: string[] = []
    for (const [source, names] of importsBySource) {
      const sortedNames = [...names].sort()
      mergedImports.push(`import { ${sortedNames.join(', ')} } from '${source}'`)
    }

    const combinedClientJs = [
      ...mergedImports,
      ...otherImports,
      '',
      ...allCode.filter(Boolean),
    ].join('\n')

    files.push({
      path: filePath.replace(/\.tsx?$/, '.client.js'),
      content: combinedClientJs,
      type: 'clientJs',
    })
  }

  return { files, errors }
}

async function compileMultipleComponents(
  source: string,
  filePath: string,
  componentNames: string[],
  options: CompileOptionsWithAdapter
): Promise<CompileResult> {
  return compileMultipleComponentsSync(source, filePath, componentNames, options)
}

// =============================================================================
// Helpers
// =============================================================================

export function buildMetadata(
  ctx: ReturnType<typeof analyzeComponent>,
  clientShimSource?: string
): IRMetadata {
  return {
    componentName: ctx.componentName || 'Unknown',
    hasDefaultExport: ctx.hasDefaultExport,
    isExported: ctx.isExported,
    isClientComponent: ctx.hasUseClientDirective,
    typeDefinitions: ctx.typeDefinitions,
    propsType: ctx.propsType,
    propsParams: ctx.propsParams,
    propsObjectName: ctx.propsObjectName,
    restPropsName: ctx.restPropsName,
    restPropsExpandedKeys: ctx.restPropsExpandedKeys,
    signals: ctx.signals,
    memos: ctx.memos,
    effects: ctx.effects,
    onMounts: ctx.onMounts,
    initStatements: ctx.initStatements,
    imports: ctx.imports,
    templateImports: rewriteTemplateImports(ctx.imports, clientShimSource),
    namedExports: ctx.namedExports,
    localFunctions: ctx.localFunctions,
    localConstants: ctx.localConstants,
  }
}

// =============================================================================
// Sync Version (for compatibility)
// =============================================================================

export function compileJSXSync(
  source: string,
  filePath: string,
  options: CompileOptionsWithAdapter
): CompileResult {
  const files: FileOutput[] = []
  const errors: CompileResult['errors'] = []

  // List all exported components
  const componentNames = listComponentFunctions(source, filePath)

  // If multiple components, compile each separately and combine
  if (componentNames.length > 1) {
    return compileMultipleComponentsSync(source, filePath, componentNames, options)
  }

  // Single component flow
  const ctx = analyzeComponent(source, filePath, undefined, options.program)

  if (!ctx.jsxReturn) {
    errors.push(...ctx.errors)  // Only analyzer errors
    return { files, errors }
  }

  const ir = jsxToIR(ctx)
  errors.push(...ctx.errors)  // All errors: analyzer + IR phase

  if (!ir) {
    return { files, errors }
  }

  const componentIR: ComponentIR = {
    version: '0.1',
    metadata: buildMetadata(ctx, options.adapter.clientShimSource),
    root: ir,
    errors: [],
  }

  // Pre-compute client JS analysis for adapter optimization
  componentIR.metadata.clientAnalysis = analyzeClientNeeds(componentIR)

  // Apply CSS layer prefix if configured
  if (options.cssLayerPrefix) {
    applyCssLayerPrefix(componentIR, options.cssLayerPrefix)
  }

  if (options.outputIR) {
    files.push({
      path: filePath.replace(/\.tsx?$/, '.ir.json'),
      content: JSON.stringify(componentIR, null, 2),
      type: 'ir',
    })
  }

  const adapter = options.adapter
  const adapterOutput = adapter.generate(componentIR, { scriptBaseName: options.scriptBaseName })
  const moduleExports = generateModuleExports(componentIR)

  // Use structured sections if available, otherwise fall back to template
  let content: string
  if (adapterOutput.sections) {
    const s = adapterOutput.sections
    const component = applyExportKeyword(s.component, componentIR)
    content = [s.imports, s.moduleConstants ?? '', s.types, moduleExports, component]
      .filter(Boolean).join('\n\n') + (s.defaultExport || '')
  } else {
    content = adapterOutput.template
  }

  files.push({
    path: filePath.replace(/\.tsx?$/, adapter.extension),
    content,
    type: 'markedTemplate',
  })

  // Emit adapter types as a separate FileOutput
  if (adapterOutput.types) {
    files.push({
      path: filePath.replace(/\.tsx?$/, '.types'),
      content: adapterOutput.types,
      type: 'types',
    })
  }

  const clientJsPath = filePath.replace(/\.tsx?$/, '.client.js')
  const syncSingleScope = {
    fileScope: computeFileScope(filePath),
    nonExportedSiblings: componentIR.metadata.isExported
      ? new Set<string>()
      : new Set([componentIR.metadata.componentName]),
  }
  setActiveComponentScope(syncSingleScope)
  try {
    if (options.sourceMaps) {
      const result = generateClientJsWithSourceMap(componentIR, undefined, options.localImportPrefixes, {
        sourceMaps: true,
        generatedFileName: clientJsPath.split('/').pop(),
      })
      errors.push(...componentIR.errors)
      if (result.code) {
        files.push({ path: clientJsPath, content: result.code, type: 'clientJs' })
        if (result.sourceMap) {
          files.push({ path: clientJsPath + '.map', content: JSON.stringify(result.sourceMap), type: 'sourceMap' as FileOutput['type'] })
        }
      }
    } else {
      const clientJs = generateClientJs(componentIR, undefined, options.localImportPrefixes)
      errors.push(...componentIR.errors)
      if (clientJs) {
        files.push({ path: clientJsPath, content: clientJs, type: 'clientJs' })
      }
    }
  } finally {
    setActiveComponentScope(null)
  }

  return { files, errors }
}

// =============================================================================
// Export Types
// =============================================================================

export type { ComponentIR, CompileOptions, CompileResult, FileOutput }
