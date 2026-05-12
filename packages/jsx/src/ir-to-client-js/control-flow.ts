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
export function emitLoopUpdates(
  lines: string[],
  ctx: ClientJsContext,
  unsafeLocalNames: Set<string>,
): void {
  for (const elem of ctx.loopElements) {
    if (elem.isStaticArray && !arrayReferencesUnsafeName(elem.array, unsafeLocalNames)) {
      emitStaticArrayUpdates(lines, elem)
    } else {
      emitDynamicLoopUpdates(lines, elem)
    }
  }
}

/**
 * Static-array dispatch (`emitStaticArrayUpdates`) emits a `forEach` that
 * binds reactive effects on `containerVar.children[idx]` — which assumes
 * the SSR template has already rendered one DOM child per array entry. But
 * when the array expression is an init-body-only local (a `const` whose
 * value can't be relocated to template scope; see #1128 + the
 * `UNSAFE_TEMPLATE_EXPR` substitution at html-template.ts), the template
 * emits `${[].map(…)}` and SSR produces zero children. The static loop
 * then iterates a non-empty array but finds `__iterEl === undefined` for
 * every index, leaving the DOM permanently empty.
 *
 * Re-route those loops through the dynamic emitter (`stringifyPlainLoop`
 * + `mapArray`), which materialises children at init time from the loop
 * body's per-iteration template. The `TopLevelLoop` element already
 * carries the same `template` clone source the dynamic path needs, so
 * no IR-level rewrite is required.
 */
function arrayReferencesUnsafeName(arrayExpr: string, unsafeLocalNames: Set<string>): boolean {
  if (unsafeLocalNames.size === 0) return false
  // Conservative-but-cheap check: the array expression on a TopLevelLoop is
  // typically a bare identifier (`{items.map(...)}` → `items`) or a short
  // member chain (`{state.items.map(...)}` → `state.items`). A whole-word
  // scan over the identifier set covers both without paying for an AST
  // parse on every loop. Names come from a Set of valid JS identifiers, so
  // no regex escaping is needed.
  for (const name of unsafeLocalNames) {
    const re = new RegExp(`(^|[^\\w$])${name}([^\\w$]|$)`)
    if (re.test(arrayExpr)) return true
  }
  return false
}

/**
 * Emit reactive attribute effects and event delegation for static arrays.
 * Static arrays are server-rendered once; only signal-dependent attributes
 * and event handlers need client-side setup. (initChild calls are deferred to
 * the `static-array-child-inits` phase so parent context providers run first.)
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
