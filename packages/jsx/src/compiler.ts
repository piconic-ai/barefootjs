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
} from './types.ts'
import type { TemplateAdapter } from './adapters/interface.ts'
import { analyzeComponent, listComponentFunctions, createProgramForFile, needsTypeBasedDetection } from './analyzer.ts'
import { jsxToIR } from './jsx-to-ir.ts'
import { stripClientBuiltinImports } from './builtins.ts'
import { generateClientJs, generateClientJsWithSourceMap, analyzeClientNeeds } from './ir-to-client-js/index.ts'
import { emitModuleLevelDeclarations } from './ir-to-client-js/emit-module-level.ts'
import { RUNTIME_MODULE, detectUsedImports as detectUsedImportsFromCode } from './ir-to-client-js/imports.ts'
import { setActiveComponentScope, computeFileScope } from './ir-to-client-js/component-scope.ts'
import { generateModuleExports, collectInlineExportedNames } from './module-exports.ts'
import { applyCssLayerPrefix } from './css-layer-prefixer.ts'
import { preprocessInlineJsxCallbacks } from './preprocess-inline-jsx-callbacks.ts'
import { extractSsrDefaults } from './ssr-defaults.ts'

/**
 * Extended compile options with required adapter
 */
export interface CompileOptionsWithAdapter extends CompileOptions {
  /** Template adapter for generating output (required) */
  adapter: TemplateAdapter
}

/**
 * Merge the import lines of a multi-component template file into a single,
 * conflict-free block.
 *
 * Named value/type imports from the same source are folded into their first
 * occurrence (preserving line order and first-seen symbol order); every
 * other import form (side-effect, default, namespace) is kept in place and
 * de-duplicated by exact line. This ensures a symbol is never imported
 * twice across sibling components — a redeclaration that Bun tolerates but
 * stricter ESM parsers (the Deno runtime that renders SSR templates) reject.
 *
 * For a single-component file the output is identical to the input order;
 * only repeated sibling imports collapse.
 *
 * Matching is whitespace-insensitive (`import {a,b} from 'x'` and
 * `import {  a , b  }  from  "x"` fold the same): the merge must not silently
 * depend on the emitter's exact spacing. A named import that failed to match
 * would fall through to the by-line branch below and re-introduce the very
 * duplicate-binding SyntaxError this function exists to prevent, so the
 * patterns tolerate any spacing the generated lines might carry.
 */
export function mergeTemplateImports(lines: string[]): string {
  const result: string[] = []
  const valueIdx = new Map<string, number>()
  const valueNames = new Map<string, Set<string>>()
  const typeIdx = new Map<string, number>()
  const typeNames = new Map<string, Set<string>>()
  const seenOther = new Set<string>()

  const fold = (
    src: string,
    rawNames: string,
    idx: Map<string, number>,
    names: Map<string, Set<string>>,
    render: (src: string, names: Set<string>) => string,
  ) => {
    if (!idx.has(src)) {
      idx.set(src, result.length)
      names.set(src, new Set())
      result.push('')
    }
    const set = names.get(src)!
    for (const n of rawNames.split(',').map(s => s.trim()).filter(Boolean)) set.add(n)
    result[idx.get(src)!] = render(src, set)
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const typeMatch = line.match(/^import\s+type\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?$/)
    const valueMatch = line.match(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?$/)
    if (valueMatch) {
      fold(valueMatch[2], valueMatch[1], valueIdx, valueNames, (s, n) => `import { ${[...n].join(', ')} } from '${s}'`)
    } else if (typeMatch) {
      fold(typeMatch[2], typeMatch[1], typeIdx, typeNames, (s, n) => `import type { ${[...n].join(', ')} } from '${s}'`)
    } else if (!seenOther.has(line)) {
      seenOther.add(line)
      result.push(line)
    }
  }

  return result.filter(Boolean).join('\n')
}

// =============================================================================
// Multiple Component Compilation
// =============================================================================

function compileMultipleComponents(
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

  // Emit IR files per component when requested. The contract is "if the
  // user asks for IR, they get IR" regardless of `isClientComponent` or
  // adapter (#1297). Single-component files emit `<base>.ir.json`; multi-
  // component files emit one file per component as
  // `<base>.<ComponentName>.ir.json` to keep paths unique. Test harnesses
  // (go-template, Mojo) pick the IR for the primary component by matching
  // `metadata.hasDefaultExport` / `metadata.isExported`.
  if (options.outputIR) {
    for (const { componentIR } of entries) {
      const componentName = componentIR.metadata.componentName
      files.push({
        path: filePath.replace(/\.tsx?$/, `.${componentName}.ir.json`),
        content: JSON.stringify(componentIR, null, 2),
        type: 'ir',
      })
    }
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
  // Same adapter capabilities for every component compiled in this file
  // (#1187 phase 3).
  const multiAdapterCaps = {
    templatePrimitives: options.adapter.templatePrimitives,
    acceptsTemplateCall: options.adapter.acceptsTemplateCall,
  }
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
    const adapterOutput = adapter.generate(componentIR, {
      scriptBaseName,
      siblingTemplatesRegistered: options.siblingTemplatesRegistered,
      rewriteRelativeImport: options.rewriteRelativeImport,
    })
    const moduleExports = generateModuleExports(
      componentIR,
      fileWideInlineExported,
      options.rewriteRelativeImport,
    )

    const s = adapterOutput.sections
    const imports = s.imports
    const types = s.types
    const component = s.component + (s.defaultExport || '')
    const mc = s.moduleConstants
    if (mc && !moduleConstantsSet.has(mc)) {
      moduleConstantsSet.add(mc)
      moduleConstantsOrdered.push(mc)
    }

    allOutputs.push({
      componentName: componentIR.metadata.componentName,
      rawTemplate: adapterOutput.template,
      imports,
      types,
      moduleExports: moduleExports || '',
      component,
      clientJs: generateClientJs(
        componentIR,
        componentNames,
        options.localImportPrefixes,
        undefined,
        multiAdapterCaps,
        options.profile,
      ) || undefined,
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
      // SSR defaults, paired with the per-component template file via
      // the matching basename (the build pipeline pairs them in
      // `compileEntry`).
      const ir = entries.find(e => e.componentIR.metadata.componentName === output.componentName)
      const ssrDefaults = ir ? extractSsrDefaults(ir.componentIR.metadata) : undefined
      if (ssrDefaults) {
        files.push({
          path: dir + output.componentName + '.ssr-defaults.json',
          content: JSON.stringify(ssrDefaults),
          type: 'ssrDefaults',
        })
      }
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

  // Merge imports from all components. Named imports from the same source
  // are combined into their first occurrence rather than deduplicated by
  // exact line: in a multi-component file each component emits its own
  // `import { … } from '@barefootjs/hono/utils'` listing only the symbols
  // it uses, so plain line-dedup leaves several statements that re-declare
  // the same binding (e.g. `bfComment`). Bun tolerates the redeclaration,
  // but stricter ESM parsers — including Deno, used to render the SSR
  // template — reject it as a SyntaxError.
  const mergedImports = mergeTemplateImports(
    allOutputs.flatMap(o => (o.imports ? o.imports.split('\n') : [])),
  )

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

  // SSR defaults — for non-per-component adapters the single template
  // is keyed by source filename, so only the entry-point component's
  // defaults are surfaced (default export → exported sibling → first).
  {
    const entryIR =
      entries.find(e => e.componentIR.metadata.hasDefaultExport) ??
      entries.find(e => e.componentIR.metadata.isExported) ??
      entries[0]
    const ssrDefaults = entryIR ? extractSsrDefaults(entryIR.componentIR.metadata) : undefined
    if (ssrDefaults) {
      files.push({
        path: filePath.replace(/\.tsx?$/, '.ssr-defaults.json'),
        content: JSON.stringify(ssrDefaults),
        type: 'ssrDefaults',
      })
    }
  }

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

// =============================================================================
// Helpers
// =============================================================================

export function buildMetadata(
  ctx: ReturnType<typeof analyzeComponent>,
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
    // `templateImports` is the raw import list adapters consider for SSR
    // re-emission. Adapters that re-emit imports (Hono, test) call
    // `rewriteImportsForTemplate` themselves to apply client-shim rewrite or
    // strip behaviour; adapters whose templates never carry imports (Go,
    // Mojo) only consult this list for diagnostics like BF103. The
    // compile-away built-ins (`<Async>` / `<Region>`) are stripped here so
    // their `@barefootjs/client` import never reaches any adapter's template
    // as a phantom (#1915).
    templateImports: stripClientBuiltinImports(ctx.imports),
    namedExports: ctx.namedExports,
    localFunctions: ctx.localFunctions,
    localConstants: ctx.localConstants,
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

export function compileJSX(
  source: string,
  filePath: string,
  options: CompileOptionsWithAdapter
): CompileResult {
  const files: FileOutput[] = []
  const errors: CompileResult['errors'] = []

  // Inline JSX-callback preprocessing (#1211): hoist
  // `renderNode={(n) => <div/>}` style arrows into synthesized
  // `'use client'` components before downstream parsing. Without this
  // the arrows survive as raw JSX in the emitted client bundle and
  // crash the parser.
  const preprocessed = preprocessInlineJsxCallbacks(source, filePath)
  errors.push(...preprocessed.errors)
  if (preprocessed.errors.length > 0) {
    return { files, errors }
  }
  const compileSource = preprocessed.source

  // List all exported components
  const componentNames = listComponentFunctions(compileSource, filePath)

  // If multiple components, compile each separately and combine
  if (componentNames.length > 1) {
    return compileMultipleComponents(compileSource, filePath, componentNames, options)
  }

  // Single component flow
  const ctx = analyzeComponent(compileSource, filePath, undefined, options.program)

  if (!ctx.jsxReturn) {
    errors.push(...ctx.errors)

    // State-only file: no component, but has exported @client signals.
    // Produce a standalone client JS module so other components can
    // `import { count, setCount } from './state.client.js'`.
    const exportedModuleSignals = ctx.signals.filter(s => s.isModule && s.isExported)
    const exportedModuleMemos = ctx.memos.filter(m => m.isModule && m.isExported)
    if (exportedModuleSignals.length > 0 || exportedModuleMemos.length > 0) {
      const body = emitModuleLevelDeclarations([], [], exportedModuleSignals, exportedModuleMemos)
      const runtimeImports = detectUsedImportsFromCode(body)
      const sortedRuntimeImports = [...runtimeImports].sort()
      const runtimeImportLine = sortedRuntimeImports.length > 0
        ? `import { ${sortedRuntimeImports.join(', ')} } from '${RUNTIME_MODULE}'`
        : ''

      // Preserve non-runtime user imports whose specifiers are referenced
      // in the generated body (e.g. an initializer that calls an imported
      // helper: `createSignal(defaultValue())`).
      const externalImportLines: string[] = []
      for (const imp of ctx.imports) {
        if (imp.isTypeOnly) continue
        if (imp.source === '@barefootjs/client' || imp.source === RUNTIME_MODULE) continue
        if (imp.specifiers.length === 0) {
          externalImportLines.push(`import '${imp.source}'`)
          continue
        }
        const used = imp.specifiers
          .filter(s => !s.isDefault && !s.isNamespace && new RegExp(`\\b${s.alias || s.name}\\b`).test(body))
          .map(s => s.alias ? `${s.name} as ${s.alias}` : s.name)
        if (used.length > 0) {
          externalImportLines.push(`import { ${used.join(', ')} } from '${imp.source}'`)
        }
      }

      const allImports = [runtimeImportLine, ...externalImportLines].filter(Boolean).join('\n')
      const clientJsPath = filePath.replace(/\.tsx?$/, '.client.js')
      files.push({ path: clientJsPath, content: allImports + (allImports ? '\n\n' : '') + body, type: 'clientJs' })
    }

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

  // Cross-file @client signal sources: identify which import sources
  // need `.client.js` path rewriting in the client bundle.
  if (ctx.importedClientSignalNames.size > 0) {
    const sources = new Set<string>()
    for (const imp of ctx.imports) {
      if (imp.isTypeOnly) continue
      if (!imp.source.startsWith('./') && !imp.source.startsWith('../')) continue
      for (const spec of imp.specifiers) {
        if (ctx.importedClientSignalNames.has(spec.alias ?? spec.name)) {
          sources.add(imp.source)
          break
        }
      }
    }
    if (sources.size > 0) {
      componentIR.metadata.clientSignalImportSources = sources
    }
  }

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
  const adapterOutput = adapter.generate(componentIR, {
    scriptBaseName: options.scriptBaseName,
    siblingTemplatesRegistered: options.siblingTemplatesRegistered,
    rewriteRelativeImport: options.rewriteRelativeImport,
  })

  // `templatesPerComponent` adapters (Mojolicious) emit non-JS template files
  // (`.html.ep`), so imports / types / module exports / default-export
  // sections don't belong in the output — the template engine renders them
  // as plain text. Mirror `compileMultipleComponents`'s `templatesPerComponent`
  // branch and use the raw template directly.
  const s = adapterOutput.sections
  let content: string
  if (adapter.templatesPerComponent) {
    content = adapterOutput.template
  } else {
    const moduleExports = generateModuleExports(componentIR, undefined, options.rewriteRelativeImport)
    content = [s.imports, s.moduleConstants ?? '', s.types, moduleExports, s.component]
      .filter(Boolean).join('\n\n') + (s.defaultExport || '')
  }

  files.push({
    path: filePath.replace(/\.tsx?$/, adapter.extension),
    content,
    type: 'markedTemplate',
  })

  // SSR defaults — JSON-encoded seed values for the template's
  // stash, derived statically from props / signals / memos. The CLI
  // build pipeline reads this output (it isn't written to disk) and
  // attaches it to the manifest entry so adapters can populate the
  // SSR stash without per-component wire-up in user code.
  {
    const ssrDefaults = extractSsrDefaults(componentIR.metadata)
    if (ssrDefaults) {
      files.push({
        path: filePath.replace(/\.tsx?$/, '.ssr-defaults.json'),
        content: JSON.stringify(ssrDefaults),
        type: 'ssrDefaults',
      })
    }
  }

  // Emit adapter types as a separate FileOutput
  if (adapterOutput.types) {
    files.push({
      path: filePath.replace(/\.tsx?$/, '.types'),
      content: adapterOutput.types,
      type: 'types',
    })
  }

  const clientJsPath = filePath.replace(/\.tsx?$/, '.client.js')
  // Single-component file: only the component itself can collide. Scope it
  // when it's non-exported so a private helper can't be overwritten by an
  // identically-named exported component in another file.
  const singleScope = {
    fileScope: computeFileScope(filePath),
    nonExportedSiblings: componentIR.metadata.isExported
      ? new Set<string>()
      : new Set([componentIR.metadata.componentName]),
  }
  setActiveComponentScope(singleScope)
  // Adapter capabilities thread through to relocate's inline-safety
  // check so a registered template primitive escapes the bridged-arg /
  // zero-arg rejection (#1187 phase 3).
  const adapterCaps = {
    templatePrimitives: options.adapter.templatePrimitives,
    acceptsTemplateCall: options.adapter.acceptsTemplateCall,
  }
  try {
    if (options.sourceMaps) {
      const result = generateClientJsWithSourceMap(
        componentIR,
        undefined,
        options.localImportPrefixes,
        {
          sourceMaps: true,
          generatedFileName: clientJsPath.split('/').pop(),
        },
        undefined,
        adapterCaps,
        options.profile,
      )
      errors.push(...componentIR.errors)
      if (result.code) {
        files.push({ path: clientJsPath, content: result.code, type: 'clientJs' })
        if (result.sourceMap) {
          files.push({ path: clientJsPath + '.map', content: JSON.stringify(result.sourceMap), type: 'sourceMap' as FileOutput['type'] })
        }
      }
    } else {
      const clientJs = generateClientJs(
        componentIR,
        undefined,
        options.localImportPrefixes,
        undefined,
        adapterCaps,
        options.profile,
      )
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
