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
import { irChildrenToJsExpr, renderPreamble } from '../../html-template.ts'
import { buildReactiveEffectsPlan } from './build-reactive-effects.ts'
import type { ComponentLoopPlan, NestedComponentInit } from './types.ts'
import { internalInvariant } from '../../../errors.ts'

/** @internal — prefer `buildLoopPlan`. */
export function buildComponentLoopPlan(elem: TopLevelLoop, profileComponentName?: string): ComponentLoopPlan {
  const { name } = elem.childComponent!
  const propsExpr = buildComponentPropsExpr(elem.childComponent!, elem.param, undefined, elem.index)
  const keyExpr = wrapLoopParamAsAccessor(elem.key || '__idx', elem.param, elem.paramBindings, elem.index)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(elem.param, elem.paramBindings)

  // A component-root loop's preamble is JS-only by construction: Phase 1
  // (jsx-to-ir.ts) already refuses and strips any preamble with a JSX leaf
  // (`builderNames.length > 0`) on this shape, because a lowered HTML-string
  // leaf passed as a prop would diverge from SSR's real JSX elements — see
  // `rowConstruction: 'dom-ops'` below. `renderLeaf` is therefore never
  // reachable here; if it ever fires, a Phase-1 refusal for the new shape
  // that let a JSX-bearing preamble through is missing, not this line.
  const mapPreambleWrapped = elem.preamble
    ? renderPreamble(elem.preamble, {
        transformJs: text => wrapLoopParamAsAccessor(text, elem.param, elem.paramBindings, elem.index),
        renderLeaf: () => {
          internalInvariant(false, 'component-root loop received a JSX-bearing preamble — Phase 1 should have refused it')
        },
      })
    : ''

  // Only init components at loopDepth 0 — inner-loop components are handled by their own loop
  const outerNestedComps = (elem.nestedComponents ?? []).filter(c => !c.loopDepth)
  const nestedComps: NestedComponentInit[] = outerNestedComps.map(comp => {
    const isTextOnly = comp.children?.length
      ? comp.children.every(c => c.type === 'expression' || c.type === 'text' || isTextOnlyConditional(c))
      : false
    const rawChildrenExpr = isTextOnly ? irChildrenToJsExpr(comp.children!) : null
    const childrenFreeIds = isTextOnly && comp.children ? irChildrenFreeIds(comp.children) : undefined
    const childrenRefsLoop = rawChildrenExpr != null && childrenFreeIds != null
      && (childrenFreeIds.has(elem.param) || (!!elem.index && childrenFreeIds.has(elem.index)))
    return {
      componentName: comp.name,
      selector: buildCompSelector(comp),
      propsExpr: buildComponentPropsExpr(comp, elem.param, undefined, elem.index),
      childrenTextEffect: childrenRefsLoop
        ? { wrappedChildren: wrapLoopParamAsAccessor(rawChildrenExpr!, elem.param, elem.paramBindings, elem.index) }
        : null,
    }
  })

  // #3143: a component-root loop's own reactive attrs/texts — collected via
  // `collectLoopChildBindings` into `elem.bindings` the same way as every
  // other loop shape (`collect-elements.ts`'s `loop:` visitor calls it
  // unconditionally) — used to be silently dropped here: this builder only
  // ever read `elem.bindings.conditionals`, never `.reactiveAttrs` /
  // `.reactiveTexts`. Those two collectors DO reach a forwarded element
  // inside the root component's own `<Chip>...</Chip>` JSX-children body
  // (`traverseElements`'s default `walkIR` descent into an `IRComponent`
  // node's `.children` — no `component:` visitor override needed, unlike
  // the JSX-children PROP form), so the bindings were computed and then
  // thrown away. Routing them through the same `ReactiveEffectsPlan` the
  // conditionals already used fixes it — see `stringifyComponentLoop`'s
  // gate, widened alongside this to actually emit the effects on the
  // no-nested-components ("simple") path too.
  const hasReactiveEffects =
    elem.bindings.reactiveAttrs.length > 0
    || elem.bindings.reactiveTexts.length > 0
    || elem.bindings.conditionals.length > 0

  return {
    kind: 'component',
    // Rows are createComponent-driven: a lowered HTML-string leaf passed as a
    // prop would diverge from SSR (which passes real JSX elements). The plan
    // dispatcher refuses a JSX-bearing preamble on this variant.
    rowConstruction: 'dom-ops',
    mapPreambleWrapped,
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
    childRefs: buildChildRefBindings(elem.bindings.refs, elem.param, elem.paramBindings, elem.index),
    profileLoopId: profileComponentName ? `${profileComponentName}#binding:${elem.slotId}` : undefined,
    reactiveEffects: hasReactiveEffects
      ? buildReactiveEffectsPlan({
          attrs: elem.bindings.reactiveAttrs,
          texts: elem.bindings.reactiveTexts,
          conditionals: elem.bindings.conditionals,
          loopParam: elem.param,
          loopParamBindings: elem.paramBindings,
          loopIndex: elem.index,
          profileComponentName,
        })
      : null,
  }
}
