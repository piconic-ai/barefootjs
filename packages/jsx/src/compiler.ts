/**
 * BarefootJS Compiler - Main Entry Point
 *
 * Compiles JSX components to Marked Templates + Client JS.
 */

import type {
  ComponentIR,
  ImportInfo,
  IRMetadata,
  CompileOptions,
  CompileResult,
  FileOutput,
} from './types'
import type { TemplateAdapter } from './adapters/interface'
import { analyzeComponent, listComponentFunctions, createProgramForFile, needsTypeBasedDetection } from './analyzer'
import { jsxToIR } from './jsx-to-ir'
import { generateClientJs, generateClientJsWithSourceMap, analyzeClientNeeds } from './ir-to-client-js'
import { generateModuleExports } from './module-exports'
import { applyCssLayerPrefix } from './css-layer-prefixer'

/**
 * Extended compile options with required adapter
 */
export interface CompileOptionsWithAdapter extends CompileOptions {
  /** Template adapter for generating output (required) */
  adapter: TemplateAdapter
}

/**
 * Client-side package sources that should be excluded from template imports.
 * These packages are only needed by client JS, not by server-side templates.
 */
const CLIENT_PACKAGE_SOURCES = new Set([
  '@barefootjs/client-runtime',
  '@barefootjs/client',
])

function filterTemplateImports(imports: ImportInfo[]): ImportInfo[] {
  return imports.filter(imp => !CLIENT_PACKAGE_SOURCES.has(imp.source))
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
    metadata: buildMetadata(ctx),
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
  const adapterOutput = adapter.generate(componentIR)
  const moduleExports = generateModuleExports(componentIR)

  // Use structured sections if available, otherwise fall back to template
  let content: string
  if (adapterOutput.sections) {
    const s = adapterOutput.sections
    const component = applyExportKeyword(s.component, componentIR)
    content = [s.imports, s.types, moduleExports, component]
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
      metadata: buildMetadata(ctx),
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
  const allOutputs: { imports: string; types: string; moduleExports: string; component: string; clientJs?: string; adapterTypes?: string }[] = []

  for (const { componentIR } of entries) {
    const adapterOutput = adapter.generate(componentIR)
    const moduleExports = generateModuleExports(componentIR)

    let imports: string
    let types: string
    let component: string

    if (adapterOutput.sections) {
      // Use structured sections directly — no string parsing needed
      const s = adapterOutput.sections
      imports = s.imports
      types = s.types
      component = applyExportKeyword(s.component, componentIR) + (s.defaultExport || '')
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
      imports,
      types,
      moduleExports: moduleExports || '',
      component,
      clientJs: generateClientJs(componentIR, componentNames, options.localImportPrefixes) || undefined,
      adapterTypes: adapterOutput.types || undefined,
    })
    errors.push(...componentIR.errors)
  }

  if (allOutputs.length === 0) {
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
  ctx: ReturnType<typeof analyzeComponent>
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
    imports: ctx.imports,
    templateImports: filterTemplateImports(ctx.imports),
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
    metadata: buildMetadata(ctx),
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
  const adapterOutput = adapter.generate(componentIR)
  const moduleExports = generateModuleExports(componentIR)

  // Use structured sections if available, otherwise fall back to template
  let content: string
  if (adapterOutput.sections) {
    const s = adapterOutput.sections
    const component = applyExportKeyword(s.component, componentIR)
    content = [s.imports, s.types, moduleExports, component]
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

  return { files, errors }
}

// =============================================================================
// Export Types
// =============================================================================

export type { ComponentIR, CompileOptions, CompileResult, FileOutput }
