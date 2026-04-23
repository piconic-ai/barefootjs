/**
 * BarefootJS Compiler - Client JS Generator
 *
 * Generates client-side JavaScript from Pure IR for hydration.
 */

import type { ComponentIR } from '../types'
import type { ClientJsContext } from './types'
import { collectElements, computeLoopSiblingOffsets } from './collect-elements'
import { generateInitFunction } from './generate-init'
import { collectUsedIdentifiers, collectUsedFunctions, collectIdentifiersFromIRTree } from './identifiers'
import { valueReferencesReactiveData } from './prop-handling'
import { canGenerateStaticTemplate, irToComponentTemplate, generateCsrTemplate } from './html-template'
import { PROPS_PARAM } from './utils'
import { buildInlinableConstants, buildSignalAndMemoMaps, buildCsrInlinableConstants } from './emit-registration'
import { IMPORT_PLACEHOLDER, RUNTIME_MODULE, detectUsedImports } from './imports'
import { buildSourceMapFromIR, type SourceMapV3 } from './source-map'

export interface ClientJsResult {
  code: string
  sourceMap?: SourceMapV3
}

/** Public entry point: IR → client JS string. Returns '' if no client JS is needed. */
export function generateClientJs(ir: ComponentIR, siblingComponents?: string[], localImportPrefixes?: string[]): string {
  return generateClientJsWithSourceMap(ir, siblingComponents, localImportPrefixes).code
}

/**
 * Generate client JS with optional source map.
 * When sourceMaps is true, returns both the JS code and a V3 source map.
 */
export function generateClientJsWithSourceMap(
  ir: ComponentIR,
  siblingComponents?: string[],
  localImportPrefixes?: string[],
  options?: { sourceMaps?: boolean; generatedFileName?: string },
): ClientJsResult {
  const ctx = createContext(ir)
  const siblingOffsets = computeLoopSiblingOffsets(ir.root)
  collectElements(ir.root, ctx, siblingOffsets)
  ir.errors.push(...ctx.warnings)

  if (!needsClientJs(ctx)) {
    const code = generateTemplateOnlyMount(ir, ctx)
    return { code }
  }

  const code = generateInitFunction(ir, ctx, siblingComponents, localImportPrefixes)

  if (options?.sourceMaps && code) {
    const fileName = options.generatedFileName ?? `${ir.metadata.componentName}.client.js`
    const sourceMap = buildSourceMapFromIR(code, ir, fileName)
    const codeWithUrl = code + `\n//# sourceMappingURL=${fileName}.map`
    return { code: codeWithUrl, sourceMap }
  }

  return { code }
}

/**
 * Pre-pass analysis: determine whether a component needs a client JS init function,
 * and which props the init function actually reads. This runs BEFORE the adapter
 * so the adapter can use the results to optimize bf-p serialization.
 */
export function analyzeClientNeeds(ir: ComponentIR): { needsInit: boolean; usedProps: string[] } {
  const ctx = createContext(ir)
  const siblingOffsets = computeLoopSiblingOffsets(ir.root)
  collectElements(ir.root, ctx, siblingOffsets)

  if (!needsClientJs(ctx)) {
    return { needsInit: false, usedProps: [] }
  }

  // Replicate the props-detection logic from generate-init.ts
  const usedIdentifiers = collectUsedIdentifiers(ctx)
  collectIdentifiersFromIRTree(ir.root, usedIdentifiers)  // comprehensive fallback
  const usedFunctions = collectUsedFunctions(ctx)
  for (const fn of usedFunctions) {
    usedIdentifiers.add(fn)
  }

  const neededProps = new Set<string>()

  // Transitive props via constants
  for (const constant of ctx.localConstants) {
    if (usedIdentifiers.has(constant.name)) {
      if (!constant.value) continue
      if (constant.systemConstructKind) continue
      const refs = valueReferencesReactiveData(constant.value, ctx)
      for (const propName of refs.usedProps) {
        neededProps.add(propName)
      }
    }
  }

  // Direct identifier matches
  for (const id of usedIdentifiers) {
    if (ctx.propsParams.some(p => p.name === id)) {
      neededProps.add(id)
    }
  }

  return { needsInit: true, usedProps: [...neededProps] }
}

/** Initialize an empty ClientJsContext from component IR metadata. */
function createContext(ir: ComponentIR): ClientJsContext {
  return {
    componentName: ir.metadata.componentName,
    signals: ir.metadata.signals,
    memos: ir.metadata.memos,
    effects: ir.metadata.effects,
    onMounts: ir.metadata.onMounts,
    initStatements: ir.metadata.initStatements ?? [],
    localFunctions: ir.metadata.localFunctions,
    localConstants: ir.metadata.localConstants,
    propsParams: ir.metadata.propsParams,
    propsObjectName: ir.metadata.propsObjectName,
    restPropsName: ir.metadata.restPropsName,

    interactiveElements: [],
    dynamicElements: [],
    conditionalElements: [],
    loopElements: [],
    refElements: [],
    childInits: [],
    reactiveProps: [],
    reactiveChildProps: [],
    reactiveAttrs: [],
    clientOnlyElements: [],
    clientOnlyConditionals: [],
    providerSetups: [],
    restAttrElements: [],
    warnings: [],
  }
}

/** Return true if the context has any elements that require client-side hydration. */
function needsClientJs(ctx: ClientJsContext): boolean {
  return (
    ctx.signals.length > 0 ||
    ctx.memos.length > 0 ||
    ctx.effects.length > 0 ||
    ctx.onMounts.length > 0 ||
    ctx.initStatements.length > 0 ||
    ctx.interactiveElements.length > 0 ||
    ctx.dynamicElements.length > 0 ||
    ctx.conditionalElements.length > 0 ||
    ctx.loopElements.length > 0 ||
    ctx.refElements.length > 0 ||
    ctx.childInits.length > 0 ||
    ctx.reactiveAttrs.length > 0 ||
    ctx.clientOnlyElements.length > 0 ||
    ctx.clientOnlyConditionals.length > 0 ||
    ctx.providerSetups.length > 0
  )
}

/**
 * Generate minimal client JS for stateless components that only need
 * template registration. This allows renderChild() to find and render
 * the component's template when it appears in conditional branches (#435).
 *
 * Returns '' if a static template cannot be generated.
 */
function generateTemplateOnlyMount(ir: ComponentIR, ctx: ClientJsContext): string {
  const propNamesForStaticCheck = new Set(ctx.propsParams.map((p) => p.name))
  const { inlinableConstants, unsafeLocalNames } = buildInlinableConstants(ctx)

  // Build rest spread names: these are rest/props spreads handled by applyRestAttrs, not spreadAttrs
  const restSpreadNames = new Set<string>()
  if (ctx.restPropsName) restSpreadNames.add(ctx.restPropsName)
  if (ctx.propsObjectName) restSpreadNames.add(ctx.propsObjectName)

  let templateHtml: string | undefined

  if (canGenerateStaticTemplate(ir.root, propNamesForStaticCheck, inlinableConstants, unsafeLocalNames)) {
    templateHtml = irToComponentTemplate(ir.root, inlinableConstants, restSpreadNames, ctx.propsObjectName)
  }

  // CSR fallback: when static template generation fails (e.g., components with
  // nested child components or loops), try generateCsrTemplate() (#536).
  if (!templateHtml) {
    const { signalMap, memoMap } = buildSignalAndMemoMaps(ctx)
    const csrInlinableConstants = buildCsrInlinableConstants(ctx, inlinableConstants, unsafeLocalNames, signalMap, memoMap)

    templateHtml = generateCsrTemplate(
      ir.root, csrInlinableConstants, signalMap, memoMap, undefined, restSpreadNames, ctx.propsObjectName
    )
  }

  if (!templateHtml) {
    return ''
  }

  const name = ctx.componentName
  const lines: string[] = []

  lines.push(IMPORT_PLACEHOLDER)
  lines.push('')
  lines.push(`function init${name}() {}`)
  lines.push('')
  lines.push(`hydrate('${name}', { init: init${name}, template: (${PROPS_PARAM}) => \`${templateHtml}\` })`)

  const generatedCode = lines.join('\n')
  const usedImports = detectUsedImports(generatedCode)
  const sortedImports = [...usedImports].sort()
  const importLine = `import { ${sortedImports.join(', ')} } from '${RUNTIME_MODULE}'`

  return generatedCode.replace(IMPORT_PLACEHOLDER, importLine)
}
