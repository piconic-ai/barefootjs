/**
 * `generateInitFunction` — client-JS orchestrator.
 *
 * Pipes analysis → emission → finalisation. Every non-trivial stage
 * lives in its own file; this function's job is to show the order of
 * the pipeline and the data flowing between stages. See
 * See issue #1021 for the shape target (orchestrator only, no
 * classification logic).
 */

import type { ComponentIR } from '../types.ts'
import type { ClientJsContext } from './types.ts'
import { PROPS_PARAM } from './utils.ts'
import { buildReferencesGraph } from './build-references.ts'
import { computePropUsage } from './compute-prop-usage.ts'
import { IMPORT_PLACEHOLDER, MODULE_CONSTANTS_PLACEHOLDER } from './imports.ts'
import { emitRegistrationAndHydration, csrInlinableConstantsFromCtx } from './emit-registration.ts'
import { computeDeferredChildSlots } from './html-template.ts'
import { emitChildComponentImports } from './child-components.ts'
import { classifyLocalDeclarations } from './init-declarations.ts'
import { emitModuleLevelDeclarations, resolveFinalImports } from './emit-module-level.ts'
import { buildPhaseCtx, PHASES, runPhases } from './phases.ts'
import { rewritePropsObjectRef } from './rewrite-props-object.ts'
import { buildInlinableConstants } from './emit-registration.ts'
import { BF_SCOPE } from '@barefootjs/shared'

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
  // Host scope id for (bf-h, bf-m) child lookups inside this init body
  // (#1249). Compile-time selectors emit
  // `[bf-h="${__scopeId}"][bf-m="<slotId>"]` against this value.
  lines.push(`  const __scopeId = __scope.getAttribute('${BF_SCOPE}')`)
  lines.push('')

  // --- Analysis: one graph, many queries; scope routing as data ---
  const graph = buildReferencesGraph(ctx, ir.root)
  const classification = classifyLocalDeclarations(ctx, graph)
  const propUsage = computePropUsage(ctx, classification.neededConstants)
  // Compute once and thread through PhaseCtx + emitRegistrationAndHydration —
  // `buildInlinableConstants` walks the graph and pushes BF060/BF061
  // diagnostics into `ctx.warnings`, so calling it twice would surface
  // duplicate warnings (#1247).
  const inlinability = buildInlinableConstants(ctx, graph, ir.root)

  // Decide which direct child components must defer their render to init
  // because a forwarded prop resolves to an init-scope-only / non-inlinable
  // local (dropped-prop fix). The child-init phase reads this set to emit
  // `upsertChild` instead of `initChild`; `emitRegistrationAndHydration`
  // reads it to emit a `data-bf-ph` placeholder instead of
  // `renderChild(...)`. Computed here, once `unsafeLocalNames` is known.
  ctx.deferredChildSlots = computeDeferredChildSlots(
    ir.root,
    ctx,
    csrInlinableConstantsFromCtx(ctx),
    inlinability.unsafeLocalNames,
    ctx.propsObjectName,
  )

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
    unsafeLocalNames: inlinability.unsafeLocalNames,
  })
  runPhases(lines, phaseCtx, PHASES)

  const hydrateLine = emitRegistrationAndHydration(lines, ctx, ir, graph, inlinability)

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

  // Substitute module-level declarations BEFORE import detection: a
  // module-level helper's body (e.g. `buildSheetVMs` calling
  // `computeSheetGeometry`) only exists in `moduleConstantsCode`, so
  // scanning `generatedCode` first would miss any import referenced
  // only from that body and silently drop it (#2283).
  const moduleConstantsCode = emitModuleLevelDeclarations(
    classification.moduleLevelConstants,
    classification.moduleLevelFunctions,
    classification.moduleLevelSignals,
    classification.moduleLevelMemos,
  )
  const codeWithModuleConstants = generatedCode.replace(MODULE_CONSTANTS_PLACEHOLDER, moduleConstantsCode)
  const allImportLines = resolveFinalImports(codeWithModuleConstants, ir, localImportPrefixes)

  return codeWithModuleConstants.replace(IMPORT_PLACEHOLDER, allImportLines)
}

