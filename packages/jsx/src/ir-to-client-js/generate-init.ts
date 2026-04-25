/**
 * `generateInitFunction` — client-JS orchestrator.
 *
 * Pipes analysis → emission → finalisation. Every non-trivial stage
 * lives in its own file; this function's job is to show the order of
 * the pipeline and the data flowing between stages. See
 * `spec/compiler-analysis-ir.md` §"Invariants after Stages B–C–D" #7
 * for the shape target (orchestrator only, no classification logic).
 */

import type { ComponentIR } from '../types'
import type { ClientJsContext } from './types'
import { PROPS_PARAM } from './utils'
import {
  buildReferencesGraph,
  graphUsedFunctions,
} from './build-references'
import { computePropUsage } from './compute-prop-usage'
import { IMPORT_PLACEHOLDER, MODULE_CONSTANTS_PLACEHOLDER } from './imports'
import {
  collectConditionalSlotIds,
  emitPropsExtraction,
  emitPropsEventHandlers,
  emitEventHandlers,
  emitRestAttrApplications,
  emitRefCallbacks,
  emitEffectsAndOnMounts,
  emitInitStatements,
  emitProviderAndChildInits,
  emitStaticArrayChildInits,
} from './emit-init-sections'
import { emitConditionalUpdates, emitClientOnlyConditionals, emitLoopUpdates } from './emit-control-flow'
import { emitDynamicTextUpdates, emitClientOnlyExpressions, emitReactiveAttributeUpdates, emitReactivePropBindings, emitReactiveChildProps } from './emit-reactive'
import { emitRegistrationAndHydration } from './emit-registration'
import { generateElementRefs } from './element-refs'
import { emitChildComponentImports } from './child-components'
import { classifyLocalDeclarations, emitSortedDeclarations } from './init-declarations'
import { emitModuleLevelDeclarations, resolveFinalImports } from './emit-module-level'

export function generateInitFunction(
  ir: ComponentIR,
  ctx: ClientJsContext,
  siblingComponents?: string[],
  localImportPrefixes?: string[],
): string {
  const lines: string[] = []
  const name = ctx.componentName

  // --- Preamble: placeholders for deferred imports + module-level code ---
  lines.push(IMPORT_PLACEHOLDER)
  emitChildComponentImports(lines, ctx, new Set(siblingComponents || []))
  lines.push('')
  lines.push(MODULE_CONSTANTS_PLACEHOLDER)
  lines.push(`export function init${name}(__scope, ${PROPS_PARAM} = {}) {`)
  lines.push(`  if (!__scope) return`)
  lines.push('')

  // --- Analysis: one graph, many queries; scope routing as data ---
  const graph = buildReferencesGraph(ctx, ir.root)
  const usedFunctions = graphUsedFunctions(graph)
  const classification = classifyLocalDeclarations(ctx, graph)
  const propUsage = computePropUsage(ctx, classification.neededConstants)

  // --- Emission: init body (runs at hydration for each instance) ---
  emitPropsExtraction(lines, ctx, classification.neededProps, propUsage)
  emitSortedDeclarations(lines, ctx, classification)
  emitInitStatements(lines, ctx)
  if (ctx.initStatements.length > 0) lines.push('')
  emitPropsEventHandlers(lines, ctx, usedFunctions, classification.neededProps)

  const elementRefs = generateElementRefs(ctx)
  if (elementRefs) {
    lines.push(elementRefs)
    lines.push('')
  }

  emitDynamicTextUpdates(lines, ctx)
  emitClientOnlyExpressions(lines, ctx)
  emitReactiveAttributeUpdates(lines, ctx)
  emitConditionalUpdates(lines, ctx)
  emitClientOnlyConditionals(lines, ctx)

  const conditionalSlotIds = collectConditionalSlotIds(ctx)
  emitRestAttrApplications(lines, ctx)
  emitEventHandlers(lines, ctx, conditionalSlotIds)
  emitReactivePropBindings(lines, ctx)
  emitReactiveChildProps(lines, ctx)
  emitRefCallbacks(lines, ctx, conditionalSlotIds)
  emitEffectsAndOnMounts(lines, ctx)
  emitProviderAndChildInits(lines, ctx)
  // Loop updates must run AFTER provider/child inits so parent components
  // have already provided their context before loop children useContext().
  emitLoopUpdates(lines, ctx)
  emitStaticArrayChildInits(lines, ctx)

  const hydrateLine = emitRegistrationAndHydration(lines, ctx, ir, graph)

  // --- Finalisation: props rename → hydrate line → import / module-level
  //     placeholder replacement.
  //
  // The props rename is a post-join string hack (replaces a bare
  // user-level name like `props` or `p` with the generated `_p`
  // parameter across every non-comment init-body line). Removing it
  // needs analyzer-time pre-rewriting of every IR string field that
  // can carry a prop reference — tracked as Stage E / follow-up. ---
  let generatedCode = renamePropsObjectInInitBody(
    lines.join('\n'),
    ctx.propsObjectName,
  )
  generatedCode += '\n' + hydrateLine

  const allImportLines = resolveFinalImports(generatedCode, ir, localImportPrefixes)
  const moduleConstantsCode = emitModuleLevelDeclarations(
    classification.moduleLevelConstants,
    classification.moduleLevelFunctions,
  )

  return generatedCode
    .replace(IMPORT_PLACEHOLDER, allImportLines)
    .replace(MODULE_CONSTANTS_PLACEHOLDER, moduleConstantsCode)
}

/**
 * Rename the source-level props object name (`props` / user's custom
 * name) to the generated parameter name `_p`. Runs on the joined init-
 * body string, skipping comment lines so JSDoc / explanatory comments
 * survive verbatim.
 *
 * No-op when the user already uses destructured props (`propsObjectName`
 * is `null`, handled by `?? 'props'` not matching `_p`). The hydrate
 * line is excluded structurally — callers append it AFTER this runs so
 * template expressions already using `_p` are never double-replaced.
 */
function renamePropsObjectInInitBody(code: string, propsObjectName: string | null): string {
  const srcPropsName = propsObjectName ?? 'props'
  if (srcPropsName === PROPS_PARAM) return code
  return code
    .split('\n')
    .map(line => {
      if (line.trimStart().startsWith('//')) return line
      return line.replace(new RegExp(`\\b${srcPropsName}\\b`, 'g'), PROPS_PARAM)
    })
    .join('\n')
}
