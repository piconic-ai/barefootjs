/**
 * Stringify a `ComponentLoopPlan` to source lines.
 *
 * Two output shapes (preserved byte-identical from the legacy
 * `emitComponentLoopReconciliation`):
 *
 *   nestedComps.length === 0 (simple) — two-line renderItem body:
 *     <i>mapArray(() => <arr>, <container>, <keyFn>, (<head>, <idx>, __existing) => {
 *     <i>  <unwrap?>
 *     <i>  if (__existing) { initChild('<C>', __existing, <props>); return __existing }
 *     <i>  return createComponent('<C>', <props>, <key>)
 *     <i>})
 *
 *   nestedComps.length >  0 (nested) — SSR/CSR split:
 *     <i>mapArray(...) => {
 *     <i>  <unwrap?>
 *     <i>  if (__existing) {
 *     <i>    initChild('<C>', __existing, <props>)
 *     <i>    {<each nested initChild + optional createEffect>}
 *     <i>    <stringifyReactiveEffects on __existing if childConditionals>
 *     <i>    return __existing
 *     <i>  }
 *     <i>  const __csrEl = createComponent('<C>', <props>, <key>)
 *     <i>  {<each nested initChild + optional createEffect>}
 *     <i>  <stringifyReactiveEffects on __csrEl if childConditionals>
 *     <i>  return __csrEl
 *     <i>})
 *
 * Indent: top emission uses 2 spaces; renderItem body uses 4 spaces;
 * SSR-side nested-comp lines use 6 spaces (matches legacy).
 */

import { stringifyReactiveEffects } from './reactive-effects'
import type { ComponentLoopPlan, NestedComponentInit } from '../plan/types'
import { nameForRegistryRef } from '../../component-scope'

export function stringifyComponentLoop(lines: string[], plan: ComponentLoopPlan): void {
  const {
    containerVar,
    arrayExpr,
    keyFn,
    paramHead,
    paramUnwrap,
    indexParam,
    componentName,
    componentPropsExpr,
    keyExpr,
    nestedComps,
    childConditionalEffects,
  } = plan

  lines.push(`  mapArray(() => ${arrayExpr}, ${containerVar}, ${keyFn}, (${paramHead}, ${indexParam}, __existing) => {`)
  if (paramUnwrap) lines.push(`    ${paramUnwrap}`)

  const scopedComp = nameForRegistryRef(componentName)

  if (nestedComps.length === 0) {
    lines.push(`    if (__existing) { initChild('${scopedComp}', __existing, ${componentPropsExpr}); return __existing }`)
    lines.push(`    return createComponent('${scopedComp}', ${componentPropsExpr}, ${keyExpr})`)
    lines.push(`  })`)
    return
  }

  // SSR side
  lines.push(`    if (__existing) {`)
  lines.push(`      initChild('${scopedComp}', __existing, ${componentPropsExpr})`)
  for (const nc of nestedComps) emitNestedInit(lines, '      ', '__existing', nc)
  if (childConditionalEffects) {
    stringifyReactiveEffects(lines, childConditionalEffects, { indent: '      ', elVar: '__existing' })
  }
  lines.push(`      return __existing`)
  lines.push(`    }`)

  // CSR side
  lines.push(`    const __csrEl = createComponent('${scopedComp}', ${componentPropsExpr}, ${keyExpr})`)
  for (const nc of nestedComps) emitNestedInit(lines, '    ', '__csrEl', nc)
  if (childConditionalEffects) {
    stringifyReactiveEffects(lines, childConditionalEffects, { indent: '    ', elVar: '__csrEl' })
  }
  lines.push(`    return __csrEl`)
  lines.push(`  })`)
}

function emitNestedInit(lines: string[], indent: string, parentVar: string, nc: NestedComponentInit): void {
  const scopedNc = nameForRegistryRef(nc.componentName)
  if (nc.childrenTextEffect) {
    lines.push(`${indent}{ const __c = qsa(${parentVar}, '${nc.selector}'); if (__c) { initChild('${scopedNc}', __c, ${nc.propsExpr}); createEffect(() => { const __v = ${nc.childrenTextEffect.wrappedChildren}; __c.textContent = Array.isArray(__v) ? __v.join('') : String(__v ?? '') }) } }`)
  } else {
    lines.push(`${indent}{ const __c = qsa(${parentVar}, '${nc.selector}'); if (__c) initChild('${scopedNc}', __c, ${nc.propsExpr}) }`)
  }
}
