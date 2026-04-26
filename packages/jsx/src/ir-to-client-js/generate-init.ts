/**
 * `generateInitFunction` — client-JS orchestrator.
 *
 * Pipes analysis → emission → finalisation. Every non-trivial stage
 * lives in its own file; this function's job is to show the order of
 * the pipeline and the data flowing between stages. See
 * See issue #1021 for the shape target (orchestrator only, no
 * classification logic).
 */

import type { ComponentIR } from '../types'
import type { ClientJsContext } from './types'
import { PROPS_PARAM } from './utils'
import { buildReferencesGraph } from './build-references'
import { computePropUsage } from './compute-prop-usage'
import { IMPORT_PLACEHOLDER, MODULE_CONSTANTS_PLACEHOLDER } from './imports'
import { emitRegistrationAndHydration } from './emit-registration'
import { emitChildComponentImports } from './child-components'
import { classifyLocalDeclarations } from './init-declarations'
import { emitModuleLevelDeclarations, resolveFinalImports } from './emit-module-level'
import { buildPhaseCtx, PHASES, runPhases } from './phases'
import { rewritePropsObjectRef } from './rewrite-props-object'

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
  const classification = classifyLocalDeclarations(ctx, graph)
  const propUsage = computePropUsage(ctx, classification.neededConstants)

  // --- Emission: declarative phase pipeline. Each entry in `PHASES`
  //     declares its inputs (dependsOn) and emission action (run); the
  //     stable topological execution preserves the legacy by-position
  //     order whenever no constraint forces a different one. ---
  const phaseCtx = buildPhaseCtx({
    ctx,
    ir,
    graph,
    classification,
    propUsage,
  })
  runPhases(lines, phaseCtx, PHASES)

  const hydrateLine = emitRegistrationAndHydration(lines, ctx, ir, graph)

  // --- Finalisation: props rename → hydrate line → import / module-level
  //     placeholder replacement.
  //
  // The props rename uses an AST walk (`rewritePropsObjectRef`) over
  // the joined init body. Object literal keys, property access names,
  // and shorthand properties are skipped at AST level so collisions
  // never silently corrupt user code. A future PR may move this rewrite
  // into the analyzer / IR construction stage and introduce a
  // `PropRewritten<T>` brand type so missing the rewrite becomes a
  // compile-time error. ---
  let generatedCode = rewritePropsObjectRef(lines.join('\n'), ctx.propsObjectName)
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

