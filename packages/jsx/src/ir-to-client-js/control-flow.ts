/**
 * Public entry points for control-flow client JS emission.
 *
 * These three functions are called from `generate-init.ts` to emit the
 * client-side runtime calls that drive reactive conditionals
 * (`insert(...)`) and reactive loops (`mapArray(...)` /
 * `reconcileElements`) for a single component.
 *
 * Each entry point thinly wraps the Plan layer:
 *
 *     IR -> build*Plan -> *Plan (pure data) -> stringify* -> source lines
 *
 * The Plan layer lives under `control-flow/{plan,stringify}/`. Helpers
 * still emitting strings directly (mode-dependent SSR/CSR shapes,
 * recursive branch/cond/inner-loop structures that haven't been
 * Plan-ified yet) live in `control-flow/legacy-helpers.ts`.
 *
 * Dependency direction:
 *
 *     control-flow.ts -> control-flow/{plan,stringify}/* -> legacy-helpers.ts
 */

import type { ClientJsContext, TopLevelLoop } from './types'
import { buildInsertPlan } from './control-flow/plan/build-insert'
import { stringifyInsert } from './control-flow/stringify/insert'
import { buildPlainLoopPlan, buildStaticLoopPlan } from './control-flow/plan/build-loop'
import { stringifyPlainLoop, stringifyStaticLoop } from './control-flow/stringify/loop'
import { buildComponentLoopPlan } from './control-flow/plan/build-component-loop'
import { stringifyComponentLoop } from './control-flow/stringify/component-loop'
import { buildTopLevelCompositePlan } from './control-flow/plan/build-composite-loop'
import { stringifyCompositeLoop } from './control-flow/stringify/composite-loop'
import {
  buildDynamicLoopDelegationPlan,
  buildStaticArrayDelegationPlan,
} from './control-flow/plan/build-event-delegation'
import { stringifyEventDelegation } from './control-flow/stringify/event-delegation'

/** Emit insert() calls for server-rendered reactive conditionals with branch configs. */
export function emitConditionalUpdates(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.conditionalElements) {
    const plan = buildInsertPlan(elem, { scope: { kind: 'top' }, eventNameMode: 'dom' })
    stringifyInsert(lines, plan, { leadingIndent: '  ', bodyIndent: '      ' })
    lines.push('')
  }
}

/** Emit insert() calls for client-only conditionals (not server-rendered). */
export function emitClientOnlyConditionals(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.clientOnlyConditionals) {
    const plan = buildInsertPlan(elem, { scope: { kind: 'top' }, eventNameMode: 'raw' })
    lines.push(`  // @client conditional: ${elem.slotId}`)
    stringifyInsert(lines, plan, { leadingIndent: '  ', bodyIndent: '      ' })
    lines.push('')
  }
}

/** Emit loop updates: dispatches to static or dynamic handlers per element. */
export function emitLoopUpdates(lines: string[], ctx: ClientJsContext): void {
  for (const elem of ctx.loopElements) {
    if (elem.isStaticArray) {
      emitStaticArrayUpdates(lines, elem)
    } else {
      emitDynamicLoopUpdates(lines, elem)
    }
  }
}

/**
 * Emit reactive attribute effects and event delegation for static arrays.
 * Static arrays are server-rendered once; only signal-dependent attributes
 * and event handlers need client-side setup. (initChild calls are deferred to
 * emit-init-sections so parent context providers run first.)
 */
function emitStaticArrayUpdates(lines: string[], elem: TopLevelLoop): void {
  stringifyStaticLoop(lines, buildStaticLoopPlan(elem))

  // Event delegation for plain elements in static arrays (#537).
  // Static arrays have no data-key/bf-i markers, so walk up from target to
  // the container's direct child and use indexOf for index lookup.
  if (!elem.childComponent && elem.childEvents.length > 0) {
    stringifyEventDelegation(lines, buildStaticArrayDelegationPlan(elem))
  }
}

/**
 * Emit reconcileElements for a dynamic loop element. Three sub-cases:
 *   - Composite (native element body containing nested comps or inner loops)
 *   - Single-component body
 *   - Plain element body
 * Plus event delegation for plain element loops (component loops handle
 * events differently — through the component's own event surface).
 */
function emitDynamicLoopUpdates(lines: string[], elem: TopLevelLoop): void {
  if (elem.useElementReconciliation && (elem.nestedComponents?.length || elem.innerLoops?.length)) {
    stringifyCompositeLoop(lines, buildTopLevelCompositePlan(elem))
  } else if (elem.childComponent) {
    stringifyComponentLoop(lines, buildComponentLoopPlan(elem))
  } else {
    stringifyPlainLoop(lines, buildPlainLoopPlan(elem))
  }
  lines.push('')

  if (!elem.childComponent && !elem.useElementReconciliation && elem.childEvents.length > 0) {
    stringifyEventDelegation(lines, buildDynamicLoopDelegationPlan(elem))
  }
}
