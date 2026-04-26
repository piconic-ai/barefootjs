/**
 * Build `ComponentLoopPlan` from a `TopLevelLoop` IR node whose body is a
 * single child component (with optional nested child components).
 *
 * The plan resolves all stringification decisions up-front:
 *   - props expression for the outer component and each nested component
 *   - selector to find the SSR-rendered nested component
 *   - whether each nested component's children should reactive-update via
 *     `createEffect` based on text-only-and-references-loop-param detection
 *   - the wrapped key argument for `createComponent(name, props, KEY)`
 *   - a fully resolved `ReactiveEffectsPlan` for `childConditionals`
 */

import type { TopLevelLoop } from '../../types'
import {
  buildChainedArrayExpr,
  varSlotId,
  wrapLoopParamAsAccessor,
  exprReferencesIdent,
} from '../../utils'
import {
  loopKeyFn,
  destructureLoopParam,
  buildComponentPropsExpr,
  buildCompSelector,
  isTextOnlyConditional,
} from '../shared'
import { irChildrenToJsExpr } from '../../html-template'
import { buildReactiveEffectsPlan } from './build-reactive-effects'
import type { ComponentLoopPlan, NestedComponentInit } from './types'

export function buildComponentLoopPlan(elem: TopLevelLoop): ComponentLoopPlan {
  const { name } = elem.childComponent!
  const propsExpr = buildComponentPropsExpr(elem.childComponent!, elem.param)
  const keyExpr = wrapLoopParamAsAccessor(elem.key || '__idx', elem.param, elem.paramBindings)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)

  // Only init components at loopDepth 0 — inner-loop components are handled by their own loop
  const outerNestedComps = (elem.nestedComponents ?? []).filter(c => !c.loopDepth)
  const nestedComps: NestedComponentInit[] = outerNestedComps.map(comp => {
    const isTextOnly = comp.children?.length
      ? comp.children.every(c => c.type === 'expression' || c.type === 'text' || isTextOnlyConditional(c))
      : false
    const rawChildrenExpr = isTextOnly ? irChildrenToJsExpr(comp.children!) : null
    const childrenRefsLoop = rawChildrenExpr != null && exprReferencesIdent(rawChildrenExpr, elem.param)
    return {
      componentName: comp.name,
      selector: buildCompSelector(comp),
      propsExpr: buildComponentPropsExpr(comp, elem.param),
      childrenTextEffect: childrenRefsLoop
        ? { wrappedChildren: wrapLoopParamAsAccessor(rawChildrenExpr!, elem.param, elem.paramBindings) }
        : null,
    }
  })

  const hasChildConds = (elem.childConditionals?.length ?? 0) > 0

  return {
    kind: 'component-loop',
    containerVar: `_${varSlotId(elem.slotId)}`,
    arrayExpr: buildChainedArrayExpr(elem),
    keyFn: loopKeyFn(elem),
    paramHead,
    paramUnwrap,
    indexParam: elem.index || '__idx',
    componentName: name,
    componentPropsExpr: propsExpr,
    keyExpr,
    nestedComps,
    childConditionalEffects: hasChildConds
      ? buildReactiveEffectsPlan({
          attrs: [],
          texts: [],
          conditionals: elem.childConditionals,
          loopParam: elem.param,
          loopParamBindings: elem.paramBindings,
        })
      : null,
  }
}
