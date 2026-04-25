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
 *     <i>    <emitLoopChildReactiveEffects on __existing if childConditionals>
 *     <i>    return __existing
 *     <i>  }
 *     <i>  const __csrEl = createComponent('<C>', <props>, <key>)
 *     <i>  {<each nested initChild + optional createEffect>}
 *     <i>  <emitLoopChildReactiveEffects on __csrEl if childConditionals>
 *     <i>  return __csrEl
 *     <i>})
 *
 * Indent: top emission uses 2 spaces; renderItem body uses 4 spaces;
 * SSR-side nested-comp lines use 6 spaces (matches legacy).
 */

import { emitLoopChildReactiveEffects } from '../legacy-helpers'
import type { ComponentLoopPlan, NestedComponentInit } from '../plan/types'

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

  if (nestedComps.length === 0) {
    lines.push(`    if (__existing) { initChild('${componentName}', __existing, ${componentPropsExpr}); return __existing }`)
    lines.push(`    return createComponent('${componentName}', ${componentPropsExpr}, ${keyExpr})`)
    lines.push(`  })`)
    return
  }

  // SSR side
  lines.push(`    if (__existing) {`)
  lines.push(`      initChild('${componentName}', __existing, ${componentPropsExpr})`)
  for (const nc of nestedComps) emitNestedInit(lines, '      ', '__existing', nc)
  if (childConditionalEffects) {
    emitLoopChildReactiveEffects(
      lines, '      ', '__existing',
      childConditionalEffects.attrs,
      childConditionalEffects.texts,
      childConditionalEffects.conditionals,
      childConditionalEffects.loopParam,
      childConditionalEffects.loopParamBindings,
    )
  }
  lines.push(`      return __existing`)
  lines.push(`    }`)

  // CSR side
  lines.push(`    const __csrEl = createComponent('${componentName}', ${componentPropsExpr}, ${keyExpr})`)
  for (const nc of nestedComps) emitNestedInit(lines, '    ', '__csrEl', nc)
  if (childConditionalEffects) {
    emitLoopChildReactiveEffects(
      lines, '    ', '__csrEl',
      childConditionalEffects.attrs,
      childConditionalEffects.texts,
      childConditionalEffects.conditionals,
      childConditionalEffects.loopParam,
      childConditionalEffects.loopParamBindings,
    )
  }
  lines.push(`    return __csrEl`)
  lines.push(`  })`)
}

function emitNestedInit(lines: string[], indent: string, parentVar: string, nc: NestedComponentInit): void {
  if (nc.childrenTextEffect) {
    lines.push(`${indent}{ const __c = qsa(${parentVar}, '${nc.selector}'); if (__c) { initChild('${nc.componentName}', __c, ${nc.propsExpr}); createEffect(() => { const __v = ${nc.childrenTextEffect.wrappedChildren}; __c.textContent = Array.isArray(__v) ? __v.join('') : String(__v ?? '') }) } }`)
  } else {
    lines.push(`${indent}{ const __c = qsa(${parentVar}, '${nc.selector}'); if (__c) initChild('${nc.componentName}', __c, ${nc.propsExpr}) }`)
  }
}
