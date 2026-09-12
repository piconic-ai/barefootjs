/**
 * Public entry points for control-flow client JS emission.
 *
 * These three functions are called from `generate-init.ts` to emit the
 * client-side runtime calls that drive reactive conditionals
 * (`insert(...)`) and reactive loops (`mapArray(...)` /
 * `mapArrayAnchored(...)`) for a single component.
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
import { internalInvariant } from '../errors.ts'
import { buildInsertPlan } from './control-flow/plan/build-insert.ts'
import { stringifyInsert } from './control-flow/stringify/insert.ts'
import { buildLoopPlan } from './control-flow/plan/build-loop.ts'
import { buildLazyRowScopeInfo } from './control-flow/plan/build-lazy-row.ts'
import { stringifyLoop } from './control-flow/stringify/loop.ts'
import {
  buildDynamicLoopDelegationPlan,
  buildStaticArrayDelegationPlan,
} from './control-flow/plan/build-event-delegation.ts'
import { stringifyEventDelegation } from './control-flow/stringify/event-delegation.ts'
import { findContainerOwnHandler, type ContainerOwnHandler } from './control-flow/plan/event-collision.ts'
import { loopEventDelegationVariant, type LoopDelegationIndex } from './control-flow/plan/loop-delegation-index.ts'
import { toDomEventName } from './utils.ts'

/** Emit insert() calls for server-rendered reactive conditionals with branch configs. */
export function emitConditionalUpdates(lines: string[], ctx: ClientJsContext): void {
  const profileComponentName = ctx.profile ? ctx.componentName : undefined
  for (const elem of ctx.conditionalElements) {
    const plan = buildInsertPlan(elem, { scope: { kind: 'top' }, eventNameMode: 'dom', profileComponentName, lazyScope: buildLazyRowScopeInfo(ctx) })
    stringifyInsert(lines, plan, { leadingIndent: '  ', bodyIndent: '      ' })
    lines.push('')
  }
}

/** Emit insert() calls for client-only conditionals (not server-rendered). */
export function emitClientOnlyConditionals(lines: string[], ctx: ClientJsContext): void {
  const profileComponentName = ctx.profile ? ctx.componentName : undefined
  for (const elem of ctx.clientOnlyConditionals) {
    const plan = buildInsertPlan(elem, { scope: { kind: 'top' }, eventNameMode: 'raw', profileComponentName, lazyScope: buildLazyRowScopeInfo(ctx) })
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
export function emitLoopUpdates(
  lines: string[],
  ctx: ClientJsContext,
  unsafeLocalNames: Set<string>,
  conditionalSlotIds: Set<string>,
  loopDelegationIndex: LoopDelegationIndex,
): void {
  // Lazy row graph (§9.4) name facts — built once per component, consulted
  // by every plain loop's eligibility gate.
  const lazyScope = buildLazyRowScopeInfo(ctx)
  const profileComponentName = ctx.profile ? ctx.componentName : undefined
  ctx.loopElements.forEach((elem, loopIndex) => {
    const plan = buildLoopPlan(elem, {
      unsafeLocalNames,
      profileComponentName,
      lazyScope,
    })
    // Stage 3 root cure — a JSX-bearing preamble can only be spliced into a
    // string-templated row (renderPreamble). Every shape that reaches a
    // 'dom-ops' variant today is already refused in Phase 1 with a proper
    // source location; this backstop exists for FUTURE variants, so a new
    // plan kind that declares 'dom-ops' cannot silently drop the preamble —
    // it fails the build here instead.
    internalInvariant(
      !(elem.preamble && elem.preamble.builderNames.length > 0 && plan.rowConstruction === 'dom-ops'),
      `loop variant '${plan.kind}' declares dom-ops row construction but received a JSX-bearing preamble — add a Phase-1 refusal (or wire renderPreamble support) for this shape`,
    )
    // #2797's hole, generalized: a JS-only preamble (no JSX leaf, so the
    // check above doesn't fire) can still be silently dropped if a variant
    // just never reads `elem.preamble` at all — which is exactly what
    // happened to the 'component' variant before it grew
    // `mapPreambleWrapped`. A variant that doesn't declare that field can't
    // be checked here (nothing to read), so this only catches a variant
    // that declares it but leaves it unpopulated for a preamble that has
    // names to declare.
    internalInvariant(
      !(elem.preamble && elem.preamble.declaredNames.length > 0 && 'mapPreambleWrapped' in plan && plan.mapPreambleWrapped === ''),
      `loop variant '${plan.kind}' has a preamble with declared names (${elem.preamble?.declaredNames.join(', ')}) but its plan's mapPreambleWrapped is empty — wire it up or the emitted call site references a name nothing declares`,
    )
    stringifyLoop(lines, plan)
    emitLoopEventDelegation(lines, elem, plan.kind, profileComponentName, {
      loopIndex,
      loopDelegationIndex,
      interactiveElements: ctx.interactiveElements,
      conditionalSlotIds,
    })
  })
}

interface CollisionInputs {
  loopIndex: number
  loopDelegationIndex: LoopDelegationIndex
  interactiveElements: ClientJsContext['interactiveElements']
  conditionalSlotIds: Set<string>
}

function emitLoopEventDelegation(
  lines: string[],
  elem: TopLevelLoop,
  kind: 'plain' | 'component' | 'composite' | 'static',
  profileComponentName: string | undefined,
  collision: CollisionInputs,
): void {
  // `loopEventDelegationVariant` (`plan/loop-delegation-index.ts`) is the
  // single shared gate for "does this loop delegate, and via which
  // builder" — also consulted by `LoopDelegationIndex` when precomputing
  // collisions, so the two can't silently diverge (#2930 review). Static
  // arrays have no data-key/bf-i markers, so 'static' walks up from target
  // to the container's direct child and uses indexOf for index lookup;
  // 'dynamic' (the `'plain'` kind, non-reconciled) does keyed delegation by
  // data-key/bf-i marker instead. `'component'`/`'composite'` loops' events
  // ride on the child component's own event surface, so they return `null`.
  const variant = loopEventDelegationVariant(elem, kind)
  if (!variant) return
  const ownHandlers = collectOwnHandlers(elem, collision)
  const plan = variant === 'static'
    ? buildStaticArrayDelegationPlan(elem, profileComponentName, ownHandlers)
    : buildDynamicLoopDelegationPlan(elem, profileComponentName, ownHandlers)
  stringifyEventDelegation(lines, plan)
}

/**
 * Collect, for THIS loop's container slot, which of its delegated DOM event
 * names should also carry the container's own directly-authored handler
 * (#2930) — only the loop `loopDelegationIndex` marks as "last" for a given
 * (container slot, DOM event) pair may claim it; every other loop sharing
 * the pair returns `undefined` for that entry and keeps emitting its
 * listener unchanged.
 */
function collectOwnHandlers(
  elem: TopLevelLoop,
  { loopIndex, loopDelegationIndex, interactiveElements, conditionalSlotIds }: CollisionInputs,
): Map<string, ContainerOwnHandler> | undefined {
  let ownHandlers: Map<string, ContainerOwnHandler> | undefined
  const domEventNames = new Set(elem.bindings.events.map(ev => toDomEventName(ev.eventName)))
  for (const domEventName of domEventNames) {
    if (!loopDelegationIndex.isLastDelegator(elem.slotId, domEventName, loopIndex)) continue
    const own = findContainerOwnHandler(interactiveElements, conditionalSlotIds, elem.slotId, domEventName)
    if (!own) continue
    ownHandlers ??= new Map()
    ownHandlers.set(domEventName, own)
  }
  return ownHandlers
}
