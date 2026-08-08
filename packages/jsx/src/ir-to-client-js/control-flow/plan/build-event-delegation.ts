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

import type { TopLevelLoop, BranchLoop, LoopChildEvent } from '../../types.ts'
import { buildChainedArrayExpr, varSlotId, substituteLoopBindings } from '../../utils.ts'
import { identifierPattern } from '../../../identifier-pattern.ts'
import { renderPreamble, irToHtmlTemplate } from '../../html-template.ts'
import type {
  EventDelegationPlan,
  ItemLookup,
} from './types.ts'

export function buildDynamicLoopDelegationPlan(
  elem: TopLevelLoop,
  profileComponentName?: string,
): EventDelegationPlan {
  return {
    kind: 'event-delegation',
    containerVar: `_${varSlotId(elem.slotId)}`,
    events: elem.bindings.events,
    profileComponentName,
    itemLookup: buildKeyedOrIndexLookup({
      // Chain `.filter()` / `.toSorted()` so the index-based lookup walks
      // the same array shape mapArray reconciled into the DOM (#1434).
      // Keyed `.find()` is identity-based and works either way; using the
      // chained array keeps the two delegation paths consistent.
      array: buildChainedArrayExpr(elem),
      param: elem.param,
      paramBindings: elem.paramBindings,
      key: elem.key,
      index: elem.index,
      // No loopParams spec here (unlike the row-render context) — in the
      // delegated handler `elem.param` is bound to the plain `.find()`/
      // indexed result, not a signal accessor, so leaf refs must stay in
      // their literal (`t.name`) form. Passing a loopParams spec here was
      // BUG-3: it rewrote leaf refs to accessor-call form (`t().name`),
      // which throws since `t` is a plain object in this scope.
      mapPreamble: elem.preamble
        ? renderPreamble(elem.preamble, {
            renderLeaf: (ir) => irToHtmlTemplate(ir, undefined, 1, undefined, undefined),
          })
        : null,
      mapPreambleDeclaredNames: elem.preamble?.declaredNames ?? [],
    }),
  }
}

// Branch-scoped delegation (a dynamic loop nested inside a conditional branch):
// `profileComponentName` is threaded from `buildInsertPlan` → `buildBranchLoopPlan`
// so its delegated handlers get turn markers like every other path (#1786).
export function buildBranchLoopDelegationPlan(
  loop: BranchLoop,
  cv: string,
  profileComponentName?: string,
): EventDelegationPlan {
  return {
    kind: 'event-delegation',
    containerVar: `__loop_${cv}`,
    events: loop.bindings.events,
    profileComponentName,
    itemLookup: buildKeyedOrIndexLookup({
      // See note on `buildDynamicLoopDelegationPlan` above (#1434).
      array: buildChainedArrayExpr(loop),
      param: loop.param,
      paramBindings: loop.paramBindings,
      key: loop.key,
      index: loop.index,
      // See note in `buildDynamicLoopDelegationPlan` above (BUG-3): no
      // loopParams spec — leaf refs must stay in plain-object form here.
      mapPreamble: loop.preamble
        ? renderPreamble(loop.preamble, {
            renderLeaf: (ir) => irToHtmlTemplate(ir, undefined, 1, undefined, undefined),
          })
        : null,
      mapPreambleDeclaredNames: loop.preamble?.declaredNames ?? [],
    }),
  }
}

/**
 * Build a Plan for the static-array event-delegation block. Static arrays have
 * no `data-key` markers, so the lookup walks up to the container's direct
 * child and uses `indexOf` (with optional sibling offset).
 */
export function buildStaticArrayDelegationPlan(
  elem: TopLevelLoop,
  profileComponentName?: string,
): EventDelegationPlan {
  return {
    kind: 'event-delegation',
    containerVar: `_${varSlotId(elem.slotId)}`,
    events: elem.bindings.events,
    profileComponentName,
    itemLookup: {
      kind: 'static-index',
      // Static arrays render through the same `.filter()`/`.toSorted()`
      // chain at runtime, so the indexOf lookup must walk the chained
      // array too (#1434).
      arrayExpr: buildChainedArrayExpr(elem),
      param: elem.param,
      // See note in `buildDynamicLoopDelegationPlan` above (BUG-3): no
      // loopParams spec — leaf refs must stay in plain-object form here.
      mapPreamble: elem.preamble
        ? renderPreamble(elem.preamble, {
            renderLeaf: (ir) => irToHtmlTemplate(ir, undefined, 1, undefined, undefined),
          })
        : null,
      mapPreambleDeclaredNames: elem.preamble?.declaredNames ?? [],
      offset: elem.offset ?? null,
      indexParam: elem.index ?? null,
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
  index: string | null
  mapPreamble: string | null
  mapPreambleDeclaredNames: readonly string[]
}): ItemLookup {
  const hasBindings = (args.paramBindings?.length ?? 0) > 0
  if (args.key !== null) {
    // For destructured params the regex replace can't reach binding names, so
    // we substitute bindings with `item.<path>` directly (#951).
    const keyWithItem = hasBindings
      ? substituteLoopBindings(args.key, args.paramBindings!, 'item')
      : args.key.replace(identifierPattern(args.param, 'g'), 'item')
    return {
      kind: 'keyed',
      arrayExpr: args.array,
      param: args.param,
      paramBindings: args.paramBindings,
      keyWithItem,
      mapPreamble: args.mapPreamble,
      mapPreambleDeclaredNames: args.mapPreambleDeclaredNames,
      hasBindings,
      indexParam: args.index,
    }
  }
  return {
    kind: 'dynamic-index',
    arrayExpr: args.array,
    param: args.param,
    mapPreamble: args.mapPreamble,
    mapPreambleDeclaredNames: args.mapPreambleDeclaredNames,
    hasBindings,
    indexParam: args.index,
  }
}

export type { LoopChildEvent }
