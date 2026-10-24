/**
 * Stringify a `ComponentLoopPlan` to source lines.
 *
 * Two output shapes (preserved byte-identical from the legacy
 * `emitComponentLoopReconciliation` for the case it covered):
 *
 *   nestedComps, rowEvents, childRefs empty AND reactiveEffects === null
 *   (simple) —
 *   two-line renderItem body:
 *     <i>mapArray(() => <arr>, <container>, <keyFn>, (<head>, <idx>, __existing) => {
 *     <i>  <unwrap?>
 *     <i>  if (__existing) { initChild('<C>', __existing, <props>); return __existing }
 *     <i>  return createComponent('<C>', <props>, <key>)
 *     <i>})
 *
 *   otherwise (nested comps and/or the root's own reactiveEffects) —
 *   SSR/CSR split:
 *     <i>mapArray(...) => {
 *     <i>  <unwrap?>
 *     <i>  if (__existing) {
 *     <i>    initChild('<C>', __existing, <props>)
 *     <i>    {<each nested initChild + optional createEffect>}
 *     <i>    {<each row event: qsa + addEventListener>}
 *     <i>    <stringifyReactiveEffects on __existing if reactiveEffects>
 *     <i>    {<each row ref: qsa + callback invocation>}
 *     <i>    return __existing
 *     <i>  }
 *     <i>  const __csrEl = createComponent('<C>', <props>, <key>)
 *     <i>  {<each nested initChild + optional createEffect>}
 *     <i>  {<each row event: qsa + addEventListener>}
 *     <i>  <stringifyReactiveEffects on __csrEl if reactiveEffects>
 *     <i>  {<each row ref: qsa + callback invocation>}
 *     <i>  return __csrEl
 *     <i>})
 *
 * Indent: top emission uses 2 spaces; renderItem body uses 4 spaces;
 * SSR-side nested-comp lines use 6 spaces (matches legacy).
 */

import { stringifyReactiveEffects } from './reactive-effects.ts'
import type { ComponentLoopPlan, NestedComponentInit } from '../plan/types.ts'
import { nameForRegistryRef } from '../../component-scope.ts'
import { stringifyChildrenTextEffect, emitRowEventListener } from '../shared.ts'
import { emitLoopChildRefs } from './loop.ts'

export function stringifyComponentLoop(lines: string[], plan: ComponentLoopPlan): void {
  const {
    containerVar,
    markerId,
    arrayExpr,
    keyFn,
    paramHead,
    paramUnwrap,
    indexParam,
    componentName,
    componentPropsExpr,
    keyExpr,
    nestedComps,
    rowEvents,
    childRefs,
    reactiveEffects,
    profileLoopId,
    mapPreambleWrapped,
  } = plan

  const loopBfId = profileLoopId ? `, ${JSON.stringify(profileLoopId)}` : ''
  lines.push(`  mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => {`)
  if (paramUnwrap) lines.push(`    ${paramUnwrap}`)
  // The preamble's consts are referenced by componentPropsExpr's getters
  // below, in BOTH the `initChild` (hydration-reuse) and `createComponent`
  // (fresh row) branches — a row rebuild and a hydration-reused row must
  // read the same preamble-computed value, so it can't be hoisted into only
  // one branch.
  if (mapPreambleWrapped) lines.push(`    ${mapPreambleWrapped}`)

  const scopedComp = nameForRegistryRef(componentName)

  // #3143: the "simple" 2-line shape must be reserved for a row with
  // NEITHER nested comps NOR any reactive effect of its own (attrs/texts on
  // an element forwarded as ITS OWN `children`, or a reactive conditional
  // in the row) — it returns straight from `initChild`/`createComponent`
  // with no handle to run an effect against. Gating on `nestedComps.length
  // === 0` alone (the pre-#3143 condition) silently skipped `reactiveEffects`
  // whenever a component-root loop had no nested child COMPONENTS, which is
  // exactly the `<Chip><a href={...}>...</a></Chip>` shape: `<a>` isn't a
  // component, so `nestedComps` was always empty, and the "simple" path
  // never even looked at `reactiveEffects`.
  //
  // #3607: the same holds for a handler on a forwarded element — it needs
  // the row element to attach to, and (#3612) for a `ref` callback on one —
  // it needs the row element to look the target up in.
  if (nestedComps.length === 0 && !reactiveEffects && rowEvents.length === 0 && childRefs.length === 0) {
    lines.push(`    if (__existing) { initChild('${scopedComp}', __existing, ${componentPropsExpr}); return __existing }`)
    lines.push(`    return createComponent('${scopedComp}', ${componentPropsExpr}, ${keyExpr})`)
    lines.push(`  }, '${markerId}'${loopBfId})`)
    return
  }

  // SSR side
  lines.push(`    if (__existing) {`)
  lines.push(`      initChild('${scopedComp}', __existing, ${componentPropsExpr})`)
  for (const nc of nestedComps) emitNestedInit(lines, '      ', '__existing', nc)
  for (const ev of rowEvents) emitRowEventListener(lines, '      ', '__existing', ev)
  if (reactiveEffects) {
    stringifyReactiveEffects(lines, reactiveEffects, { indent: '      ', elVar: '__existing' })
  }
  // #3612: refs run last, as on the composite row (`stringifyCompositeLoop`),
  // so the callback sees the row with its handlers and effects in place.
  // A ref that portals its element is refused (BF064) inside a child
  // component's forwarded children, so no row portal claim is needed here.
  emitLoopChildRefs(lines, childRefs, { indent: '      ', elVar: '__existing', bodyIsMultiRoot: false, containerVar })
  lines.push(`      return __existing`)
  lines.push(`    }`)

  // CSR side
  lines.push(`    const __csrEl = createComponent('${scopedComp}', ${componentPropsExpr}, ${keyExpr})`)
  for (const nc of nestedComps) emitNestedInit(lines, '    ', '__csrEl', nc)
  for (const ev of rowEvents) emitRowEventListener(lines, '    ', '__csrEl', ev)
  if (reactiveEffects) {
    stringifyReactiveEffects(lines, reactiveEffects, { indent: '    ', elVar: '__csrEl' })
  }
  emitLoopChildRefs(lines, childRefs, { indent: '    ', elVar: '__csrEl', bodyIsMultiRoot: false, containerVar })
  lines.push(`    return __csrEl`)
  lines.push(`  }, '${markerId}'${loopBfId})`)
}

function emitNestedInit(lines: string[], indent: string, parentVar: string, nc: NestedComponentInit): void {
  const scopedNc = nameForRegistryRef(nc.componentName)
  if (nc.childrenTextEffect) {
    lines.push(`${indent}{ const __c = qsa(${parentVar}, ${nc.selector}); if (__c) { initChild('${scopedNc}', __c, ${nc.propsExpr}); ${stringifyChildrenTextEffect(nc.childrenTextEffect)} } }`)
  } else {
    lines.push(`${indent}{ const __c = qsa(${parentVar}, ${nc.selector}); if (__c) initChild('${scopedNc}', __c, ${nc.propsExpr}) }`)
  }
}
