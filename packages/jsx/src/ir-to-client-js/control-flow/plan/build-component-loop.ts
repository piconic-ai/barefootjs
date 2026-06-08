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

import type { TopLevelLoop } from '../../types.ts'
import {
  buildChainedArrayExpr,
  varSlotId,
  wrapLoopParamAsAccessor,
  irChildrenFreeIds,
} from '../../utils.ts'
import {
  loopKeyFn,
  destructureLoopParam,
  buildComponentPropsExpr,
  buildCompSelector,
  isTextOnlyConditional,
  buildChildRefBindings,
} from '../shared.ts'
import { irChildrenToJsExpr } from '../../html-template.ts'
import { buildReactiveEffectsPlan } from './build-reactive-effects.ts'
import type { ComponentLoopPlan, NestedComponentInit } from './types.ts'

/** @internal — prefer `buildLoopPlan`. */
export function buildComponentLoopPlan(elem: TopLevelLoop, profileComponentName?: string): ComponentLoopPlan {
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
    const childrenFreeIds = isTextOnly && comp.children ? irChildrenFreeIds(comp.children) : undefined
    const childrenRefsLoop = rawChildrenExpr != null && childrenFreeIds != null && childrenFreeIds.has(elem.param)
    return {
      componentName: comp.name,
      selector: buildCompSelector(comp),
      propsExpr: buildComponentPropsExpr(comp, elem.param),
      childrenTextEffect: childrenRefsLoop
        ? { wrappedChildren: wrapLoopParamAsAccessor(rawChildrenExpr!, elem.param, elem.paramBindings) }
        : null,
    }
  })

  const hasChildConds = elem.bindings.conditionals.length > 0

  return {
    kind: 'component',
    containerVar: `_${varSlotId(elem.slotId)}`,
    markerId: elem.markerId,
    arrayExpr: buildChainedArrayExpr(elem),
    keyFn: loopKeyFn(elem),
    paramHead,
    paramUnwrap,
    indexParam: elem.index || '__idx',
    componentName: name,
    componentPropsExpr: propsExpr,
    keyExpr,
    nestedComps,
    // Refs on a component element (`<Comp ref={fn} />`) are not currently
    // wired here — the body root is the component, not a DOM element, so
    // the per-item factory has no `__el` handle to invoke. Still required
    // by the type so the structural invariant (every variant has a
    // `childRefs`) is preserved; populated as empty.
    childRefs: buildChildRefBindings(elem.bindings.refs, elem.param, elem.paramBindings),
    profileLoopId: profileComponentName ? `${profileComponentName}#binding:${elem.slotId}` : undefined,
    childConditionalEffects: hasChildConds
      ? buildReactiveEffectsPlan({
          attrs: [],
          texts: [],
          conditionals: elem.bindings.conditionals,
          loopParam: elem.param,
          loopParamBindings: elem.paramBindings,
          profileComponentName,
        })
      : null,
  }
}
