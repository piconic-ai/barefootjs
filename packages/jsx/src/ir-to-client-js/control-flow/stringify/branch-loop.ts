/**
 * Stringify a `BranchLoopPlan` to source lines.
 *
 * The composite shape delegates to `stringifyCompositeLoop`; the plain shape
 * emits a disposable-effect-wrapped `mapArray` with either a single-line
 * (no reactive effects) or multi-line (reactive effects via
 * `stringifyReactiveEffects`) renderItem body.
 *
 * Output is byte-identical to the legacy `emitBranchLoopBody` +
 * `emitBranchLoopEventDelegation` pair.
 */

import { stringifyCompositeLoop } from './composite-loop'
import { stringifyEventDelegation } from './event-delegation'
import { stringifyReactiveEffects } from './reactive-effects'
import type {
  BranchLoopPlan,
  BranchPlainLoopPlan,
} from '../plan/branch-loop'

export function stringifyBranchLoop(lines: string[], plan: BranchLoopPlan): void {
  // The container query runs first regardless of kind so the
  // `__loop_<cv>` variable is in scope for the body that follows.
  lines.push(`      const [${plan.containerVar}] = $(__branchScope, '${plan.containerSlotId}')`)

  if (plan.kind === 'composite') {
    stringifyCompositeLoop(lines, plan.composite)
    return
  }

  emitPlain(lines, plan)
}

export function stringifyBranchLoops(
  lines: string[],
  plans: readonly BranchLoopPlan[],
): void {
  for (const plan of plans) {
    stringifyBranchLoop(lines, plan)
  }
}

function emitPlain(lines: string[], plan: BranchPlainLoopPlan): void {
  const {
    containerVar,
    arrayExpr,
    keyFn,
    paramHead,
    paramUnwrap,
    indexParam,
    mapPreambleWrapped,
    template,
    reactiveEffects,
    eventDelegation,
  } = plan

  const unwrapInline = paramUnwrap ? `${paramUnwrap} ` : ''

  // Wrap the mapArray() in a disposable effect so the inner createEffect
  // (mapArray's own + per-item child effects) is registered as a child of
  // this disposable owner — branch swap then dispose()s the entry, releasing
  // both the effect and its dependency subscriptions (observation O-2).
  lines.push(`      __disposers.push(createDisposableEffect(() => {`)

  if (reactiveEffects === null) {
    // Simple case: single-line renderItem.
    if (mapPreambleWrapped) {
      lines.push(`        if (${containerVar}) mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => { ${unwrapInline}if (__existing) return __existing; ${mapPreambleWrapped}; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
    } else {
      lines.push(`        if (${containerVar}) mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => { ${unwrapInline}if (__existing) return __existing; const __tpl = document.createElement('template'); __tpl.innerHTML = \`${template}\`; return __tpl.content.firstElementChild.cloneNode(true) })`)
    }
  } else {
    // Multi-line renderItem with fine-grained effects.
    lines.push(`        if (${containerVar}) mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => {`)
    if (paramUnwrap) {
      lines.push(`          ${paramUnwrap}`)
    }
    if (mapPreambleWrapped) {
      lines.push(`          ${mapPreambleWrapped}`)
    }
    lines.push(`          const __el = __existing ?? (() => { const __tpl = document.createElement('template'); __tpl.innerHTML = \`${template}\`; return __tpl.content.firstElementChild.cloneNode(true) })()`)
    stringifyReactiveEffects(lines, reactiveEffects, { indent: '          ', elVar: '__el' })
    lines.push(`          return __el`)
    lines.push(`        })`)
  }
  lines.push(`      }))`)

  // Event delegation outside the disposable effect — listeners live on the
  // container element which persists across branch swaps.
  stringifyEventDelegation(lines, eventDelegation)
}
