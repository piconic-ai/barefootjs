/**
 * BarefootJS Compiler - Client JS Generator
 *
 * Generates client-side JavaScript from Pure IR for hydration.
 */

import type { ComponentIR } from '../types.ts'
import type { ClientJsContext } from './types.ts'
import type {
  TemplatePrimitiveRegistry,
  TemplateCallAcceptor,
} from '../adapters/interface.ts'
import { collectElements, computeLoopSiblingOffsets } from './collect-elements.ts'
import { generateInitFunction } from './generate-init.ts'
import { buildReferencesGraph, graphUsedIdentifiers } from './build-references.ts'
import { addConstantPropRefsToSet } from './init-declarations.ts'
import { canGenerateStaticTemplate, irToComponentTemplate, generateCsrTemplate } from './html-template.ts'
import { PROPS_PARAM } from './utils.ts'
import { buildInlinableConstants, csrInlinableConstantsFromCtx } from './emit-registration.ts'
import { buildEnvFromCtx } from './compute-inlinability.ts'
import { nameForRegistryRef } from './component-scope.ts'
import { IMPORT_PLACEHOLDER, RUNTIME_MODULE, detectUsedImports, collectExternalImports } from './imports.ts'
import { isInlinableInTemplate } from '../relocate.ts'
import { buildSourceMapFromIR, type SourceMapV3 } from './source-map.ts'

export interface ClientJsResult {
  code: string
  sourceMap?: SourceMapV3
}

/**
 * Adapter capabilities consulted by relocate's inline-safety check
 * (#1187 phase 3). Threaded through the client-JS pipeline so that
 * `compute-inlinability` / `emit-registration` see the same registry
 * the adapter declares. Optional — empty caps reproduces pre-#1187
 * behaviour.
 */
export interface AdapterCapabilities {
  templatePrimitives?: TemplatePrimitiveRegistry
  acceptsTemplateCall?: TemplateCallAcceptor
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
  adapterCapabilities?: AdapterCapabilities,
  profile?: boolean,
): string {
  return generateClientJsWithSourceMap(
    ir,
    siblingComponents,
    localImportPrefixes,
    undefined,
    scope,
    adapterCapabilities,
    profile,
  ).code
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
  adapterCapabilities?: AdapterCapabilities,
  profile?: boolean,
): ClientJsResult {
  const ctx = createContext(ir, scope, adapterCapabilities, profile)
  const siblingOffsets = computeLoopSiblingOffsets(ir.root)
  collectElements(ir.root, ctx, siblingOffsets)

  // Both `generateTemplateOnlyMount` and `generateInitFunction` run inline
  // analysis passes (buildInlinableConstants → computeInlinability) that
  // can add to `ctx.warnings` — most notably the BF060/BF061 stage-violation
  // diagnostics. Flush warnings to `ir.errors` AFTER those passes so the
  // diagnostics survive to the caller.
  if (!needsClientJs(ctx)) {
    const code = generateTemplateOnlyMount(ir, ctx)
    ir.errors.push(...ctx.warnings)
    return { code }
  }

  const code = generateInitFunction(ir, ctx, siblingComponents, localImportPrefixes)
  ir.errors.push(...ctx.warnings)

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
function createContext(
  ir: ComponentIR,
  scope?: ScopeInfo,
  adapterCapabilities?: AdapterCapabilities,
  profile?: boolean,
): ClientJsContext {
  return {
    componentName: ir.metadata.componentName,
    fileScope: scope?.fileScope ?? '',
    nonExportedSiblings: scope?.nonExportedSiblings ?? new Set(),
    profile: profile ?? false,
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
    deferredChildSlots: new Set(),
    reactiveProps: [],
    reactiveChildProps: [],
    reactiveAttrs: [],
    clientOnlyElements: [],
    clientOnlyConditionals: [],
    providerSetups: [],
    restAttrElements: [],
    warnings: [],
    templatePrimitives: adapterCapabilities?.templatePrimitives,
    acceptsTemplateCall: adapterCapabilities?.acceptsTemplateCall,
    csrInlinable: new Map(),
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
  // A constant whose value can't be safely relocated into template
  // scope (per `isInlinableInTemplate`) needs init scope: the const
  // must be declared in the init body so the value is computed there
  // and so user imports referenced by the value survive the
  // import-collection pass. This is the same canonical decision the
  // inline classifier asks; reuse it instead of inventing a separate
  // heuristic (the failure mode behind the #1133 import drop).
  return hasInitScopeOnlyConstant(ctx)
}

function hasInitScopeOnlyConstant(ctx: ClientJsContext): boolean {
  if (ctx.localConstants.length === 0) return false
  const env = buildEnvFromCtx(ctx)
  for (const c of ctx.localConstants) {
    if (c.isModule || c.isJsx || c.containsArrow || c.systemConstructKind) continue
    if (!c.value) continue
    if (!isInlinableInTemplate(c.value, env).ok) return true
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
  const { inlinableConstants, unsafeLocalNames } = buildInlinableConstants(ctx, graph, ir.root)

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
    const csrInlinableConstants = csrInlinableConstantsFromCtx(ctx)
    templateHtml = generateCsrTemplate(
      ir.root, csrInlinableConstants, ctx, undefined, restSpreadNames, ctx.propsObjectName, unsafeLocalNames
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
  // See `emitRegistrationAndHydration` (./emit-registration.ts) for the
  // rationale on why the component is also emitted as a callable
  // shim. The same applies for template-only components since they
  // can still be referenced as values (e.g. `<Parent slot={Comp}>`).
  lines.push(`export function ${name}(${PROPS_PARAM}, __bfKey) { return createComponent('${registryKey}', ${PROPS_PARAM}, __bfKey) }`)

  const generatedCode = lines.join('\n')
  const usedImports = detectUsedImports(generatedCode)
  const sortedImports = [...usedImports].sort()
  const importLine = `import { ${sortedImports.join(', ')} } from '${RUNTIME_MODULE}'`
  // Preserve user-defined external imports referenced by the inlined
  // template body. The full-init path (`generateInitFunction`) calls
  // `collectExternalImports` for this; the template-only path needs the
  // same — without it, a constant whose value got inlined into the
  // template (e.g. `useYjs(_p.x)`) leaves the template referencing a
  // bare module-import name that's no longer imported (#1138 / #1133).
  const externalImports = collectExternalImports(ir, generatedCode)
  const allImports = externalImports.length > 0
    ? `${importLine}\n${externalImports.join('\n')}`
    : importLine

  return generatedCode.replace(IMPORT_PLACEHOLDER, allImports)
}
