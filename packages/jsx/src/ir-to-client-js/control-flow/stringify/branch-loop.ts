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

import { stringifyCompositeLoop } from './composite-loop.ts'
import { stringifyEventDelegation } from './event-delegation.ts'
import { stringifyReactiveEffects } from './reactive-effects.ts'
import { emitTemplateCloneInline, emitLoopItemElementSetup } from './template-parse.ts'
import { emitLoopChildRefs, emitPreambleRegionEffects } from './loop.ts'
import type {
  BranchLoopPlan,
  BranchPlainLoopPlan,
} from '../plan/branch-loop.ts'

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
    markerId,
    arrayExpr,
    keyFn,
    paramHead,
    paramUnwrap,
    indexParam,
    mapPreambleWrapped,
    template,
    reactiveEffects,
    eventDelegation,
    childRefs,
    bodyIsMultiRoot,
    profileLoopId,
    preambleRegions,
  } = plan

  const loopBfId = profileLoopId ? `, ${JSON.stringify(profileLoopId)}` : ''
  const unwrapInline = paramUnwrap ? `${paramUnwrap} ` : ''

  // Wrap the mapArray() in a disposable effect so the inner createEffect
  // (mapArray's own + per-item child effects) is registered as a child of
  // this disposable owner — branch swap then dispose()s the entry, releasing
  // both the effect and its dependency subscriptions (observation O-2).
  lines.push(`      __disposers.push(createDisposableEffect(() => {`)

  // flatMap descriptor mode — build-or-patch renderItem, mirrors the
  // top-level shape in stringify/loop.ts (see comment there).
  if (plan.flatMapLeafItem) {
    lines.push(`        if (${containerVar}) mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (__bfD, ${indexParam}, __existing) => {`)
    lines.push(`          let __el = __existing`)
    lines.push(`          if (!__el) { const __tpl = document.createElement('template'); __tpl.innerHTML = __bfD().h; __el = __tpl.content.firstElementChild }`)
    lines.push(`          let __last = __existing ? undefined : __bfD().h`)
    lines.push(`          createEffect(() => {`)
    lines.push(`            const __html = __bfD().h`)
    lines.push(`            if (__last === undefined) { __last = __html; return }`)
    lines.push(`            if (__html !== __last) { __last = __html; patchLeaf(__el, __html) }`)
    lines.push(`          })`)
    lines.push(`          return __el`)
    lines.push(`        }, '${markerId}'${loopBfId})`)
    lines.push(`      }))`)
    stringifyEventDelegation(lines, eventDelegation)
    return
  }

  // Non-empty `childRefs` need `__el` as a handle inside the factory body,
  // so force the multi-line layout (#1244) — preamble-patched regions
  // (#2389) need the same handle for their own effect.
  if (reactiveEffects === null && !bodyIsMultiRoot && childRefs.length === 0 && preambleRegions.length === 0) {
    // Simple case: single-line renderItem (single root, no reactive effects).
    const cloneExpr = emitTemplateCloneInline(template)
    if (mapPreambleWrapped) {
      lines.push(`        if (${containerVar}) mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => { ${unwrapInline}if (__existing) return __existing; ${mapPreambleWrapped}; ${cloneExpr} }, '${markerId}'${loopBfId})`)
    } else {
      lines.push(`        if (${containerVar}) mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => { ${unwrapInline}if (__existing) return __existing; ${cloneExpr} }, '${markerId}'${loopBfId})`)
    }
  } else {
    // Multi-line renderItem (reactive effects and/or multi-root and/or refs).
    lines.push(`        if (${containerVar}) mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => {`)
    if (paramUnwrap) {
      lines.push(`          ${paramUnwrap}`)
    }
    if (mapPreambleWrapped) {
      lines.push(`          ${mapPreambleWrapped}`)
    }
    emitLoopItemElementSetup(lines, {
      template,
      bodyIsMultiRoot,
      indent: '          ',
      singleRootLayout: 'inline',
    })
    if (reactiveEffects !== null) {
      stringifyReactiveEffects(lines, reactiveEffects, { indent: '          ', elVar: '__el', bodyIsMultiRoot })
    }
    emitLoopChildRefs(lines, childRefs, { indent: '          ', elVar: '__el', bodyIsMultiRoot })
    emitPreambleRegionEffects(lines, preambleRegions, mapPreambleWrapped, { indent: '          ', elVar: '__el' })
    lines.push(`          return __el`)
    lines.push(`        }, '${markerId}'${loopBfId})`)
  }
  lines.push(`      }))`)

  // Event delegation outside the disposable effect — listeners live on the
  // container element which persists across branch swaps.
  stringifyEventDelegation(lines, eventDelegation)
}
