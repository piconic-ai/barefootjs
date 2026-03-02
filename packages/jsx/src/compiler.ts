/**
 * BarefootJS Compiler - Main Entry Point
 *
 * Compiles JSX components to Marked Templates + Client JS.
 */

import type {
  ComponentIR,
  IRMetadata,
  CompileOptions,
  CompileResult,
  FileOutput,
} from './types'
import type { TemplateAdapter } from './adapters/interface'
import { analyzeComponent, listExportedComponents, createProgramForFile } from './analyzer'
import { jsxToIR } from './jsx-to-ir'
import { generateClientJs, analyzeClientNeeds } from './ir-to-client-js'
import { collectComponentNamesFromIR } from './ir-to-client-js/generate-init'
import { applyCssLayerPrefix } from './css-layer-prefixer'

/**
 * Extended compile options with required adapter
 */
export interface CompileOptionsWithAdapter extends CompileOptions {
  /** Template adapter for generating output (required) */
  adapter: TemplateAdapter
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
  const componentNames = listExportedComponents(source, entryPath)

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

  files.push({
    path: entryPath.replace(/\.tsx?$/, adapter.extension),
    content: adapterOutput.template,
    type: 'markedTemplate',
  })

  const clientJs = generateClientJs(componentIR)
  if (clientJs) {
    files.push({
      path: entryPath.replace(/\.tsx?$/, '.client.js'),
      content: clientJs,
      type: 'clientJs',
    })
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

  // Create ts.Program once for all components in this file
  const program = options.program ?? createProgramForFile(source, filePath)?.program

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

  // --- Between passes: collect usedAsChild set ---
  const usedAsChild = new Set<string>()
  for (const { componentIR } of entries) {
    collectComponentNamesFromIR([componentIR.root], usedAsChild)
  }

  // --- Pass 2: adapter.generate + generateClientJs ---
  const allOutputs: { imports: string; types: string; component: string; clientJs?: string }[] = []

  for (const { componentIR } of entries) {
    const adapterOutput = adapter.generate(componentIR)
    const fullContent = adapterOutput.template

    // Parse output to separate imports, types, and component
    const lines = fullContent.split('\n')
    const importLines: string[] = []
    const typeLines: string[] = []
    const componentLines: string[] = []
    let inComponent = false

    for (const line of lines) {
      if (line.startsWith('export function ')) {
        inComponent = true
      }

      if (inComponent) {
        componentLines.push(line)
      } else if (line.startsWith('import ')) {
        importLines.push(line)
      } else if (line.trim()) {
        typeLines.push(line)
      }
    }

    allOutputs.push({
      imports: importLines.join('\n'),
      types: typeLines.join('\n'),
      component: componentLines.join('\n'),
      clientJs: generateClientJs(componentIR, componentNames, usedAsChild) || undefined,
    })
  }

  if (allOutputs.length === 0) {
    return { files, errors }
  }

  // Use imports from first component (they should be similar)
  // Combine unique type definitions
  const seenTypes = new Set<string>()
  const uniqueTypes: string[] = []
  for (const output of allOutputs) {
    if (output.types && !seenTypes.has(output.types)) {
      seenTypes.add(output.types)
      uniqueTypes.push(output.types)
    }
  }

  // Combine all components
  const combinedTemplate = [
    allOutputs[0].imports,
    uniqueTypes.join('\n\n'),
    '',
    ...allOutputs.map(o => o.component),
  ]
    .filter(Boolean)
    .join('\n\n')

  files.push({
    path: filePath.replace(/\.tsx?$/, adapter.extension),
    content: combinedTemplate,
    type: 'markedTemplate',
  })

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
  const componentNames = listExportedComponents(source, filePath)

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

  files.push({
    path: filePath.replace(/\.tsx?$/, adapter.extension),
    content: adapterOutput.template,
    type: 'markedTemplate',
  })

  const clientJs = generateClientJs(componentIR)
  if (clientJs) {
    files.push({
      path: filePath.replace(/\.tsx?$/, '.client.js'),
      content: clientJs,
      type: 'clientJs',
    })
  }

  return { files, errors }
}

// =============================================================================
// Export Types
// =============================================================================

export type { ComponentIR, CompileOptions, CompileResult, FileOutput }
