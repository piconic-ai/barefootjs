/**
 * Stringify a `CompositeLoopPlan` to source lines.
 *
 * Output shape (preserved byte-identical from the legacy
 * `emitCompositeRenderItemBody` + dispatch glue):
 *
 *   <branchClearPrefix?>
 *   <topIndent>mapArray(() => <arr>, <container>, <keyFn>, (<head>, <idx>, __existing) => {
 *   <bodyIndent><unwrap?>
 *   <bodyIndent><mapPreambleWrapped?>
 *   <bodyIndent>let __el
 *   <bodyIndent>if (__existing) {
 *   <bodyIndent>  __el = __existing
 *   <bodyIndent>  <emitComponentAndEventSetup ssr>
 *   <bodyIndent>  <emitInnerLoopSetup ssr>
 *   <bodyIndent>} else {
 *   <bodyIndent>  const __tpl = document.createElement('template')
 *   <bodyIndent>  __tpl.innerHTML = `<template>`
 *   <bodyIndent>  __el = __tpl.content.firstElementChild.cloneNode(true)
 *   <bodyIndent>  <emitComponentAndEventSetup csr>
 *   <bodyIndent>  <emitInnerLoopSetup csr>
 *   <bodyIndent>}
 *   <bodyIndent><emitLoopChildReactiveEffects?>
 *   <bodyIndent>return __el
 *   <topIndent>})
 *
 * Inner-loop setup and component-and-event setup are passthroughs to legacy
 * helpers so the SSR/CSR duplication (observation O-1) stays bug-for-bug.
 * Fixing it requires Plan-ifying inner loops too — slated for a bug-fix PR
 * after the migration completes.
 */

import {
  emitComponentAndEventSetup,
  emitInnerLoopSetup,
  emitLoopChildReactiveEffects,
} from '../../emit-control-flow'
import type { CompositeLoopPlan } from '../plan/types'

export function stringifyCompositeLoop(lines: string[], plan: CompositeLoopPlan): void {
  const {
    containerVar,
    arrayExpr,
    keyFn,
    paramHead,
    paramUnwrap,
    indexParam,
    mapPreambleWrapped,
    template,
    outerComps,
    outerEvents,
    depthLevels,
    loopParam,
    loopParamBindings,
    reactiveEffects,
    branchClearChildren,
    topIndent,
    bodyIndent: rawBodyIndent,
  } = plan

  // When wrapping the mapArray in createDisposableEffect (branch case), the
  // renderItem body is one level deeper. Push everything inside that body
  // by 2 extra spaces so the output stays well-formed.
  const bodyIndent = branchClearChildren ? rawBodyIndent + '  ' : rawBodyIndent
  const mapArrayIndent = branchClearChildren ? topIndent + '  ' : topIndent

  if (branchClearChildren) {
    // Clear template-generated children so mapArray creates fresh elements
    // with properly initialized components via createComponent in renderItem.
    lines.push(`${topIndent}if (${containerVar}) getLoopChildren(${containerVar}).forEach(__el => __el.remove())`)
    // Wrap the mapArray call in createDisposableEffect so the inner
    // createEffects (mapArray's own + per-item child effects) are released
    // when the surrounding branch swaps away (observation O-2). The branch
    // arm's bindEvents writer expects a `__disposers` array in scope.
    lines.push(`${topIndent}__disposers.push(createDisposableEffect(() => {`)
    lines.push(`${mapArrayIndent}if (${containerVar}) mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => {`)
  } else {
    lines.push(`${topIndent}mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => {`)
  }
  if (paramUnwrap) lines.push(`${bodyIndent}${paramUnwrap}`)

  // Hoist mapPreamble before the SSR/CSR split so variables it declares are
  // accessible in both branches and in any reactive attribute getters
  // emitted after the if/else block.
  if (mapPreambleWrapped) lines.push(`${bodyIndent}${mapPreambleWrapped}`)

  const innerIndent = bodyIndent + '  '
  const compsArr = [...outerComps]
  const eventsArr = [...outerEvents]
  const levelsArr = [...depthLevels]

  // SSR/CSR split — only the bits that genuinely differ live inside the
  // if/else: __el initialisation and `emitComponentAndEventSetup`
  // (createComponent vs initChild). Inner-loop setup is hoisted out below
  // because the mapArray it emits is mode-independent — the outer if/else
  // used to duplicate every inner loop's body verbatim (observation O-1).
  lines.push(`${bodyIndent}let __el`)
  lines.push(`${bodyIndent}if (__existing) {`)
  lines.push(`${innerIndent}__el = __existing`)
  emitComponentAndEventSetup(lines, innerIndent, '__el', compsArr, eventsArr, 'ssr', loopParam, loopParamBindings)
  lines.push(`${bodyIndent}} else {`)
  lines.push(`${innerIndent}const __tpl = document.createElement('template')`)
  lines.push(`${innerIndent}__tpl.innerHTML = \`${template}\``)
  lines.push(`${innerIndent}__el = __tpl.content.firstElementChild.cloneNode(true)`)
  emitComponentAndEventSetup(lines, innerIndent, '__el', compsArr, eventsArr, 'csr', loopParam, loopParamBindings)
  lines.push(`${bodyIndent}}`)

  // Inner-loop setup runs once for both SSR and CSR. The mode argument is
  // forwarded to `emitInnerLoopSetup`'s static-forEach branch where it
  // matters for inner `emitComponentAndEventSetup` calls; reactive inner
  // loops dispatch SSR vs CSR per-item via mapArray's `__existing` check
  // and don't read it. We pass `'ssr'` so a static inner loop nested
  // inside a composite renderItem still gets the SSR initChild shape
  // (matching the historical behaviour for hydration).
  if (levelsArr.length > 0) {
    emitInnerLoopSetup(lines, bodyIndent, '__el', levelsArr, 'ssr', loopParam, loopParamBindings)
  }

  if (reactiveEffects) {
    emitLoopChildReactiveEffects(
      lines, bodyIndent, '__el',
      reactiveEffects.attrs,
      reactiveEffects.texts,
      reactiveEffects.conditionals,
      reactiveEffects.loopParam,
      reactiveEffects.loopParamBindings,
    )
  }

  lines.push(`${bodyIndent}return __el`)
  if (branchClearChildren) {
    // Close inner mapArray + createDisposableEffect wrapper.
    lines.push(`${mapArrayIndent}})`)
    lines.push(`${topIndent}}))`)
  } else {
    lines.push(`${topIndent}})`)
  }
}
