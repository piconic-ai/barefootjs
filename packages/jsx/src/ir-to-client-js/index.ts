/**
 * BarefootJS Compiler - Client JS Generator
 *
 * Generates client-side JavaScript from Pure IR for hydration.
 */

import type { ComponentIR } from '../types'
import type { ClientJsContext } from './types'
import { collectElements, computeLoopSiblingOffsets } from './collect-elements'
import { generateInitFunction } from './generate-init'
import { buildReferencesGraph, graphUsedIdentifiers } from './build-references'
import { addConstantPropRefsToSet } from './init-declarations'
import { canGenerateStaticTemplate, irToComponentTemplate, generateCsrTemplate } from './html-template'
import { PROPS_PARAM } from './utils'
import { buildInlinableConstants, buildSignalAndMemoMaps, buildCsrInlinableConstants } from './emit-registration'
import { nameForRegistryRef } from './component-scope'
import { IMPORT_PLACEHOLDER, RUNTIME_MODULE, detectUsedImports, collectExternalImports } from './imports'
import { buildSourceMapFromIR, type SourceMapV3 } from './source-map'

export interface ClientJsResult {
  code: string
  sourceMap?: SourceMapV3
}

/**
 * Optional component-name scope info. When supplied, the generator
 * disambiguates non-exported siblings by rewriting their registry key
 * to `${name}__${fileScope}` so private helpers can't collide across
 * files. See component-scope.ts for the full rationale.
 */
export interface ScopeInfo {
  fileScope: string
  nonExportedSiblings: Set<string>
}

/** Public entry point: IR → client JS string. Returns '' if no client JS is needed. */
export function generateClientJs(
  ir: ComponentIR,
  siblingComponents?: string[],
  localImportPrefixes?: string[],
  scope?: ScopeInfo,
): string {
  return generateClientJsWithSourceMap(ir, siblingComponents, localImportPrefixes, undefined, scope).code
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
  scope?: ScopeInfo,
): ClientJsResult {
  const ctx = createContext(ir, scope)
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
  const ctx = createContext(ir, undefined)
  const siblingOffsets = computeLoopSiblingOffsets(ir.root)
  collectElements(ir.root, ctx, siblingOffsets)

  if (!needsClientJs(ctx)) {
    return { needsInit: false, usedProps: [] }
  }

  // Use the shared reference graph instead of replicating the extraction
  // passes. Byte-identical to the old three-call composition (issue #1021).
  const graph = buildReferencesGraph(ctx, ir.root)
  const usedIdentifiers = graphUsedIdentifiers(graph)

  const neededProps = new Set<string>()

  // Transitive props via constants — for each reachable, non-system-construct
  // constant, pull any prop refs from its initializer into `neededProps`.
  for (const constant of ctx.localConstants) {
    if (!usedIdentifiers.has(constant.name)) continue
    if (!constant.value) continue
    if (constant.systemConstructKind) continue
    addConstantPropRefsToSet(constant, ctx, graph, neededProps)
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
function createContext(ir: ComponentIR, scope?: ScopeInfo): ClientJsContext {
  return {
    componentName: ir.metadata.componentName,
    fileScope: scope?.fileScope ?? '',
    nonExportedSiblings: scope?.nonExportedSiblings ?? new Set(),
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
  if (
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
  ) return true
  // A constant whose value calls a module-imported helper requires init
  // scope: emitting the call into a module-scope `template(_p) => ...`
  // lambda runs the helper twice (once per render) and drops the import
  // when the value isn't kept in init body too (#1138 / #1133).
  if (hasUnsafeLocalConstant(ctx)) return true
  return false
}

/**
 * Detect locals whose value depends on a name that the template scope
 * cannot reach safely. Used by `needsClientJs` to force the full init
 * path so unsafe-resolved references stay rooted in init body and the
 * collectExternalImports pass picks up the imports they pull in.
 */
function hasUnsafeLocalConstant(ctx: ClientJsContext): boolean {
  // Names declared in this component (signals, memos, locals, params,
  // and the props object). A free identifier outside this set is
  // probably a module import or an unknown global — both are unsafe to
  // duplicate into template scope without a declaration there.
  const declared = new Set<string>()
  for (const c of ctx.localConstants) declared.add(c.name)
  for (const f of ctx.localFunctions) declared.add(f.name)
  for (const s of ctx.signals) {
    declared.add(s.getter)
    if (s.setter) declared.add(s.setter)
  }
  for (const m of ctx.memos) declared.add(m.name)
  for (const p of ctx.propsParams) declared.add(p.name)
  if (ctx.propsObjectName) declared.add(ctx.propsObjectName)

  for (const c of ctx.localConstants) {
    if (!c.freeIdentifiers || c.freeIdentifiers.size === 0) continue
    if (!c.value || c.containsArrow) continue
    if (!/\b\w+\s*\(/.test(c.value)) continue // value has no call → safe
    for (const id of c.freeIdentifiers) {
      if (!declared.has(id)) return true
    }
  }
  return false
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
  const graph = buildReferencesGraph(ctx, ir.root)
  const { inlinableConstants, unsafeLocalNames } = buildInlinableConstants(ctx, graph)

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
    const csrInlinableConstants = buildCsrInlinableConstants(ctx, inlinableConstants, unsafeLocalNames, signalMap, memoMap, ctx.propsObjectName)

    templateHtml = generateCsrTemplate(
      ir.root, csrInlinableConstants, signalMap, memoMap, undefined, restSpreadNames, ctx.propsObjectName, unsafeLocalNames
    )
  }

  if (!templateHtml) {
    return ''
  }

  const name = ctx.componentName
  const registryKey = nameForRegistryRef(name)
  const lines: string[] = []

  lines.push(IMPORT_PLACEHOLDER)
  lines.push('')
  lines.push(`function init${name}() {}`)
  lines.push('')
  lines.push(`hydrate('${registryKey}', { init: init${name}, template: (${PROPS_PARAM}) => \`${templateHtml}\` })`)

  const generatedCode = lines.join('\n')
  const usedImports = detectUsedImports(generatedCode)
  const sortedImports = [...usedImports].sort()
  const importLine = `import { ${sortedImports.join(', ')} } from '${RUNTIME_MODULE}'`
  // Preserve user-defined external imports referenced by the inlined
  // template body. The full-init path (`generateInitFunction`) calls
  // `collectExternalImports` for this; the template-only path needs the
  // same — without it, a constant whose value got inlined into the
  // template (e.g. `useYjs(_p.x)`) leaves the template referencing a
  // bare module-import name that's no longer imported (#1138, #1133).
  const externalImports = collectExternalImports(ir, generatedCode)
  const allImports = [importLine, ...externalImports].join('\n')

  return generatedCode.replace(IMPORT_PLACEHOLDER, allImports)
}
