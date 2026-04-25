/**
 * Local-declaration classification + sorted emission for the init body.
 *
 * Splits the orchestrator's analysis-to-emission pipeline into two pure
 * stages:
 *
 *   1. `classifyLocalDeclarations(ctx, graph)` — walks `ctx.localConstants`
 *      and `ctx.localFunctions`, consults the precomputed scope maps, and
 *      returns the buckets the orchestrator needs: init-scope constants,
 *      module-level constants, module-level functions, reactive-data-
 *      dependent props, and the controlled-signal list.
 *
 *   2. `emitSortedDeclarations(lines, ctx, classification)` — builds a
 *      unified `Declaration[]`, runs the dependency-based topological
 *      sort (#508), and emits each declaration via the existing
 *      per-kind emitters.
 *
 * Keeping the split lets `generate-init.ts` read like a pipeline of
 * typed stages rather than an inline cascade of `for`-loops. Byte-
 * identical to the pre-Stage D.2 inline version.
 */

import type {
  ConstantInfo,
  FunctionInfo,
  ReferencesGraph,
  SignalInfo,
} from '../types'
import { computeDeclarationScopes } from './compute-scope'
import { graphUsedIdentifiers } from './build-references'
import { valueReferencesReactiveData, getControlledPropName } from './prop-handling'
import { type Declaration, providedNames, sortDeclarations } from './declaration-sort'
import {
  emitDeclaration,
  emitControlledSignalEffect,
} from './emit-init-sections'
import type { ClientJsContext } from './types'

export interface ControlledSignal {
  signal: SignalInfo
  propName: string
}

export interface LocalClassification {
  /** Constants routed to init scope — emitted inside the init function. */
  neededConstants: ConstantInfo[]
  /** Constants routed to module scope — emitted at module level. */
  moduleLevelConstants: ConstantInfo[]
  /** Functions routed to init scope — emitted inside the init function. */
  initScopeFunctions: FunctionInfo[]
  /** Functions routed to module scope — emitted at module level. */
  moduleLevelFunctions: FunctionInfo[]
  /** Props referenced anywhere reachable from the emitted init body
   *  (direct identifier match in the reference graph OR transitively
   *  via an init-scope constant's reactive-data scan). */
  neededProps: Set<string>
  /** Signals whose initial value reads a prop — they need a
   *  createEffect to sync with parent updates. */
  controlledSignals: ControlledSignal[]
}

export function classifyLocalDeclarations(
  ctx: ClientJsContext,
  graph: ReferencesGraph,
): LocalClassification {
  const usedIdentifiers = graphUsedIdentifiers(graph)
  const { constantScope, functionScope } = computeDeclarationScopes(ctx, graph)

  const neededProps = new Set<string>()
  const neededConstants: ConstantInfo[] = []
  const moduleLevelConstants: ConstantInfo[] = []
  for (const constant of ctx.localConstants) {
    const scope = constantScope.get(constant.name)
    if (scope === 'skip') continue
    if (scope === 'module') {
      moduleLevelConstants.push(constant)
      continue
    }
    // scope === 'init'
    neededConstants.push(constant)
    if (constant.value) {
      const refs = valueReferencesReactiveData(constant.value, ctx)
      for (const propName of refs.usedProps) {
        neededProps.add(propName)
      }
    }
  }

  for (const id of usedIdentifiers) {
    if (ctx.propsParams.some(p => p.name === id)) {
      neededProps.add(id)
    }
  }

  const moduleLevelFunctions: FunctionInfo[] = []
  const initScopeFunctions: FunctionInfo[] = []
  for (const fn of ctx.localFunctions) {
    const scope = functionScope.get(fn.name)
    if (scope === 'module') moduleLevelFunctions.push(fn)
    else if (scope === 'init') initScopeFunctions.push(fn)
  }

  const controlledSignals: ControlledSignal[] = []
  for (const signal of ctx.signals) {
    const controlledPropName = getControlledPropName(signal, ctx.propsParams, ctx.propsObjectName)
    if (controlledPropName) {
      controlledSignals.push({ signal, propName: controlledPropName })
    }
  }

  return {
    neededConstants,
    moduleLevelConstants,
    initScopeFunctions,
    moduleLevelFunctions,
    neededProps,
    controlledSignals,
  }
}

/** Emit the init-scope declarations (constants, init-scope functions,
 *  signals, memos) in dependency-sorted order (#508). */
export function emitSortedDeclarations(
  lines: string[],
  ctx: ClientJsContext,
  classification: LocalClassification,
): void {
  const { neededConstants, initScopeFunctions, controlledSignals } = classification
  const declarations: Declaration[] = []

  for (const constant of neededConstants) {
    declarations.push({
      kind: 'constant',
      info: constant,
      sourceIndex: constant.loc.start.line,
    })
  }

  for (const fn of initScopeFunctions) {
    declarations.push({
      kind: 'function',
      info: fn,
      sourceIndex: fn.loc.start.line,
    })
  }

  for (const signal of ctx.signals) {
    const controlled = controlledSignals.find(c => c.signal === signal)
    declarations.push({
      kind: 'signal',
      info: signal,
      controlledPropName: controlled?.propName ?? null,
      sourceIndex: signal.loc.start.line,
    })
  }

  for (const memo of ctx.memos) {
    declarations.push({
      kind: 'memo',
      info: memo,
      sourceIndex: memo.loc.start.line,
    })
  }

  const declNameSet = new Set<string>()
  for (const decl of declarations) {
    for (const name of providedNames(decl)) {
      declNameSet.add(name)
    }
  }

  const sorted = sortDeclarations(declarations, declNameSet)

  let emittedAny = false
  for (const decl of sorted) {
    emitDeclaration(lines, decl, ctx, controlledSignals)
    if (decl.kind === 'signal' && decl.controlledPropName) {
      emitControlledSignalEffect(lines, decl.info, decl.controlledPropName, ctx)
    }
    emittedAny = true
  }
  if (emittedAny) lines.push('')
}
