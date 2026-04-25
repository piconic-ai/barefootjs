/**
 * Build `EventDelegationPlan` for the three legacy emitters:
 *   - `emitDynamicLoopEventDelegation` (top-level dynamic loop)
 *   - `emitBranchLoopEventDelegation`  (branch-scoped dynamic loop)
 *   - the inline delegation block in `emitStaticArrayUpdates`
 *
 * Builders take the smallest IR slice they need (loop core + childEvents +
 * containerVar) so the same shape works for `TopLevelLoop`, `BranchLoop`,
 * and the static-array context.
 */

import type { TopLevelLoop, BranchLoop, LoopChildEvent } from '../../types'
import { varSlotId, substituteLoopBindings } from '../../utils'
import type {
  EventDelegationPlan,
  ItemLookup,
} from './types'

export function buildDynamicLoopDelegationPlan(elem: TopLevelLoop): EventDelegationPlan {
  return {
    kind: 'event-delegation',
    containerVar: `_${varSlotId(elem.slotId)}`,
    events: elem.childEvents,
    itemLookup: buildKeyedOrIndexLookup({
      array: elem.array,
      param: elem.param,
      paramBindings: elem.paramBindings,
      key: elem.key,
      mapPreamble: elem.mapPreamble ?? null,
    }),
  }
}

export function buildBranchLoopDelegationPlan(loop: BranchLoop, cv: string): EventDelegationPlan {
  return {
    kind: 'event-delegation',
    containerVar: `__loop_${cv}`,
    events: loop.childEvents,
    itemLookup: buildKeyedOrIndexLookup({
      array: loop.array,
      param: loop.param,
      paramBindings: loop.paramBindings,
      key: loop.key,
      mapPreamble: loop.mapPreamble ?? null,
    }),
  }
}

/**
 * Build a Plan for the static-array event-delegation block. Static arrays have
 * no `data-key` markers, so the lookup walks up to the container's direct
 * child and uses `indexOf` (with optional sibling offset).
 */
export function buildStaticArrayDelegationPlan(elem: TopLevelLoop): EventDelegationPlan {
  return {
    kind: 'event-delegation',
    containerVar: `_${varSlotId(elem.slotId)}`,
    events: elem.childEvents,
    itemLookup: {
      kind: 'static-index',
      arrayExpr: elem.array,
      param: elem.param,
      mapPreamble: elem.mapPreamble ?? null,
      siblingOffset: elem.siblingOffset ?? null,
    },
  }
}

/**
 * Helper used by both the top-level and branch-scoped builders. Picks
 * `keyed` vs `dynamic-index` based on whether the loop has an explicit key.
 */
function buildKeyedOrIndexLookup(args: {
  array: string
  param: string
  paramBindings: TopLevelLoop['paramBindings']
  key: string | null
  mapPreamble: string | null
}): ItemLookup {
  const hasBindings = (args.paramBindings?.length ?? 0) > 0
  if (args.key !== null) {
    // For destructured params the regex replace can't reach binding names, so
    // we substitute bindings with `item.<path>` directly (#951).
    const keyWithItem = hasBindings
      ? substituteLoopBindings(args.key, args.paramBindings!, 'item')
      : args.key.replace(new RegExp(`\\b${args.param}\\b`, 'g'), 'item')
    return {
      kind: 'keyed',
      arrayExpr: args.array,
      param: args.param,
      paramBindings: args.paramBindings,
      keyWithItem,
      mapPreamble: args.mapPreamble,
      hasBindings,
    }
  }
  return {
    kind: 'dynamic-index',
    arrayExpr: args.array,
    param: args.param,
    mapPreamble: args.mapPreamble,
    hasBindings,
  }
}

export type { LoopChildEvent }
