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
 *   <bodyIndent><stringifyReactiveEffects?>
 *   <bodyIndent>return __el
 *   <topIndent>})
 *
 * Inner-loop setup and component-and-event setup are passthroughs to legacy
 * helpers so the SSR/CSR duplication (observation O-1) stays bug-for-bug.
 * Fixing it requires Plan-ifying inner loops too — slated for a bug-fix PR
 * after the migration completes.
 */

import { emitComponentAndEventSetup } from '../shared'
import { stringifyInnerLoops } from './inner-loop'
import { stringifyReactiveEffects } from './reactive-effects'
import { emitTemplateCloneLines } from './template-parse'
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
    innerLoops,
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

  // __el is either the existing SSR-rendered element or a fresh clone of
  // the template — both shapes accept the same mode-independent setup
  // (upsertChild resolves SSR vs CSR per-component at runtime, inner-loop
  // mapArrays are mode-independent by definition).
  lines.push(`${bodyIndent}const __el = __existing ?? (() => {`)
  for (const ln of emitTemplateCloneLines(template, innerIndent)) lines.push(ln)
  lines.push(`${bodyIndent}})()`)
  emitComponentAndEventSetup(lines, bodyIndent, '__el', compsArr, eventsArr, loopParam, loopParamBindings)
  if (innerLoops.length > 0) {
    stringifyInnerLoops(lines, innerLoops, bodyIndent)
  }

  if (reactiveEffects) {
    stringifyReactiveEffects(lines, reactiveEffects, { indent: bodyIndent, elVar: '__el' })
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
