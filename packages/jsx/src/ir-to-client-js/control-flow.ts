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

import type { ClientJsContext, TopLevelLoop } from './types.ts'
import { buildInsertPlan } from './control-flow/plan/build-insert.ts'
import { stringifyInsert } from './control-flow/stringify/insert.ts'
import { buildLoopPlan } from './control-flow/plan/build-loop.ts'
import { stringifyLoop } from './control-flow/stringify/loop.ts'
import {
  buildDynamicLoopDelegationPlan,
  buildStaticArrayDelegationPlan,
} from './control-flow/plan/build-event-delegation.ts'
import { stringifyEventDelegation } from './control-flow/stringify/event-delegation.ts'

/** Emit insert() calls for server-rendered reactive conditionals with branch configs. */
export function emitConditionalUpdates(lines: string[], ctx: ClientJsContext): void {
  const profileComponentName = ctx.profile ? ctx.componentName : undefined
  for (const elem of ctx.conditionalElements) {
    const plan = buildInsertPlan(elem, { scope: { kind: 'top' }, eventNameMode: 'dom', profileComponentName })
    stringifyInsert(lines, plan, { leadingIndent: '  ', bodyIndent: '      ' })
    lines.push('')
  }
}

/** Emit insert() calls for client-only conditionals (not server-rendered). */
export function emitClientOnlyConditionals(lines: string[], ctx: ClientJsContext): void {
  const profileComponentName = ctx.profile ? ctx.componentName : undefined
  for (const elem of ctx.clientOnlyConditionals) {
    const plan = buildInsertPlan(elem, { scope: { kind: 'top' }, eventNameMode: 'raw', profileComponentName })
    lines.push(`  // @client conditional: ${elem.slotId}`)
    stringifyInsert(lines, plan, { leadingIndent: '  ', bodyIndent: '      ' })
    lines.push('')
  }
}

/**
 * Emit loop updates: builds a unified `LoopPlan` via the single
 * `buildLoopPlan` entry, stringifies via `stringifyLoop`, and attaches
 * event delegation per-variant.
 *
 * Event-delegation predicates (kept here because they consult the IR's
 * `childEvents` and `childComponent`, not the Plan):
 *   - `'static'`  → plain-element static array with events
 *   - `'plain'`   → dynamic plain-element body with events
 *   - `'component' / 'composite'` → events ride on the component's own
 *     event surface, no delegation pass needed
 */
export function emitLoopUpdates(lines: string[], ctx: ClientJsContext, unsafeLocalNames: Set<string>): void {
  for (const elem of ctx.loopElements) {
    const plan = buildLoopPlan(elem, {
      unsafeLocalNames,
      profileComponentName: ctx.profile ? ctx.componentName : undefined,
    })
    stringifyLoop(lines, plan)
    emitLoopEventDelegation(lines, elem, plan.kind, ctx.profile ? ctx.componentName : undefined)
  }
}

function emitLoopEventDelegation(
  lines: string[],
  elem: TopLevelLoop,
  kind: 'plain' | 'component' | 'composite' | 'static',
  profileComponentName?: string,
): void {
  if (kind === 'static') {
    // Event delegation for plain elements in static arrays (#537). Static
    // arrays have no data-key/bf-i markers, so walk up from target to the
    // container's direct child and use indexOf for index lookup.
    if (!elem.childComponent && elem.bindings.events.length > 0) {
      stringifyEventDelegation(lines, buildStaticArrayDelegationPlan(elem, profileComponentName))
    }
    return
  }
  // Dynamic plain-element body: keyed delegation by data-key/bf-i marker.
  //
  // `!elem.useElementReconciliation` is preserved here even though the
  // decision tree only routes to `'plain'` when `useElementReconciliation`
  // is false OR `hasInnerStructure` is false. The hand-constructed boundary
  // shape (`useElementReconciliation=true` AND empty nestedComponents /
  // innerLoops) is unreachable from real IR — the collector sets
  // `useElementReconciliation` only when it has at least one of those —
  // but the explicit guard keeps the legacy behaviour byte-equal even if a
  // future collector change makes that combination valid.
  if (
    kind === 'plain'
    && !elem.useElementReconciliation
    && elem.bindings.events.length > 0
  ) {
    stringifyEventDelegation(lines, buildDynamicLoopDelegationPlan(elem, profileComponentName))
  }
}
