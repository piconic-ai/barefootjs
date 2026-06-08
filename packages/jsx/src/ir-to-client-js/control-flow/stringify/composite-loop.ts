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

import { emitComponentAndEventSetup } from '../shared.ts'
import { stringifyInnerLoops } from './inner-loop.ts'
import { stringifyReactiveEffects } from './reactive-effects.ts'
import { emitLoopItemElementSetup } from './template-parse.ts'
import { emitLoopChildRefs } from './loop.ts'
import type { CompositeLoopPlan } from '../plan/types.ts'

export function stringifyCompositeLoop(lines: string[], plan: CompositeLoopPlan): void {
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
    outerComps,
    outerEvents,
    innerLoops,
    loopParam,
    loopParamBindings,
    reactiveEffects,
    childRefs,
    branchClearChildren,
    topIndent,
    bodyIndent: rawBodyIndent,
    bodyIsMultiRoot,
    profileComponentName: pc,
    profileLoopId,
  } = plan

  // When wrapping the mapArray in createDisposableEffect (branch case), the
  // renderItem body is one level deeper. Push everything inside that body
  // by 2 extra spaces so the output stays well-formed.
  const bodyIndent = branchClearChildren ? rawBodyIndent + '  ' : rawBodyIndent
  const mapArrayIndent = branchClearChildren ? topIndent + '  ' : topIndent

  if (branchClearChildren) {
    // Clear template-generated children so mapArray creates fresh elements
    // with properly initialized components via createComponent in renderItem.
    // Multi-root items also have per-item `<!--bf-loop-i-->` Comments to
    // remove, so use `getLoopNodes` (Elements + Comments) for that case.
    //
    // **DO NOT remove the `!__bfFirstRun` guard.** On the first hydration
    // pass `bindEvents` is called against the SSR-rendered branch element,
    // whose children already match the data and carry `bf-h` /
    // `bf-m` markers wired to the active scope chain. Wiping there
    // forces every loop item through the CSR `createComponent` path; for
    // self-referential recursive components (e.g. <CommentNode> rendering
    // <CommentNode>) every reactive update would then duplicate the
    // subtree exponentially because each new component synthesises a fresh
    // bf-s and the next reconcile fails to find it via the SSR scope
    // markers. The wipe is still required on subsequent branch swaps,
    // where the freshly-evaluated branch template eagerly inlines the
    // loop body and would otherwise double-mount items when mapArray
    // reconciles.
    const clearFn = bodyIsMultiRoot ? 'getLoopNodes' : 'getLoopChildren'
    lines.push(`${topIndent}if (${containerVar} && !__bfFirstRun) ${clearFn}(${containerVar}, '${markerId}').forEach(__el => __el.remove())`)
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

  const compsArr = [...outerComps]
  const eventsArr = [...outerEvents]

  // __el is either the existing SSR-rendered element or a fresh clone of
  // the template — both shapes accept the same mode-independent setup
  // (upsertChild resolves SSR vs CSR per-component at runtime, inner-loop
  // mapArrays are mode-independent by definition). Multi-root Fragment
  // items also stash their sibling roots on `__el.__bfExtras` (#1212).
  emitLoopItemElementSetup(lines, {
    template,
    bodyIsMultiRoot,
    indent: bodyIndent,
    singleRootLayout: 'multiline',
  })
  emitComponentAndEventSetup(lines, bodyIndent, '__el', compsArr, eventsArr, loopParam, loopParamBindings, bodyIsMultiRoot)
  if (innerLoops.length > 0) {
    stringifyInnerLoops(lines, innerLoops, bodyIndent, pc)
  }

  if (reactiveEffects) {
    stringifyReactiveEffects(lines, reactiveEffects, { indent: bodyIndent, elVar: '__el', bodyIsMultiRoot })
  }

  emitLoopChildRefs(lines, childRefs, { indent: bodyIndent, elVar: '__el', bodyIsMultiRoot })

  lines.push(`${bodyIndent}return __el`)
  const loopBfId = profileLoopId ? `, ${JSON.stringify(profileLoopId)}` : ''
  if (branchClearChildren) {
    // Close inner mapArray + createDisposableEffect wrapper.
    lines.push(`${mapArrayIndent}}, '${markerId}'${loopBfId})`)
    lines.push(`${topIndent}}))`)
  } else {
    lines.push(`${topIndent}}, '${markerId}'${loopBfId})`)
  }
}
