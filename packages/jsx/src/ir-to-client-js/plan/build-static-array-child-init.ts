/**
 * Build `StaticArrayChildInitsPlan` from a `ClientJsContext`.
 *
 * Walks `ctx.loopElements`, filters static-array entries, and emits
 * one or more Plan entries per loop:
 *
 *   1. `single-comp` when `elem.childComponent` is set.
 *   2. `outer-nested` for each depth-0 entry in `elem.nestedComponents`.
 *   3. `inner-loop-nested` for each `elem.innerLoops` entry that has
 *      matching depth-N components.
 *   4. `component-rooted-inner-loop` instead of (3) when the outer item is
 *      itself a child component (#1725) — the inner `.map()` lives inside
 *      the component's JSX children, so it's addressed by a document-order
 *      zip rather than element offsets.
 *
 * Selector / propsExpr / offset decisions all resolve here. The
 * stringifier never inspects raw IR.
 */

import type { IRLoopChildComponent } from '../../types.ts'
import type { NestedLoop, TopLevelLoop } from '../types.ts'
import type { ClientJsContext } from '../types.ts'
import { quotePropName, varSlotId, attrValueToString, buildLoopChildIndexExpr } from '../utils.ts'
import { irChildrenToJsExpr } from '../html-template.ts'
import { buildCompSelector } from '../control-flow/shared.ts'

/** The inline prop shape carried on `IRLoopChildComponent.props`. */
type LoopChildCompProp = IRLoopChildComponent['props'][number]
import type {
  ComponentRootedInnerLoopInitPlan,
  InnerLoopComp,
  InnerLoopNestedInitPlan,
  OuterNestedInitPlan,
  PropsExpr,
  SingleCompInitPlan,
  StaticArrayChildInitPlan,
  StaticArrayChildInitsPlan,
} from './static-array-child-init.ts'

export function buildStaticArrayChildInitsPlan(
  ctx: ClientJsContext,
): StaticArrayChildInitsPlan {
  const plans: StaticArrayChildInitPlan[] = []

  for (const elem of ctx.loopElements) {
    if (!elem.isStaticArray) continue

    if (elem.childComponent) {
      plans.push(buildSingleCompPlan(elem, elem.childComponent))
    }

    if (elem.nestedComponents && elem.nestedComponents.length > 0) {
      for (const comp of elem.nestedComponents) {
        if (comp.loopDepth) continue // handled in inner-loop pass
        plans.push(buildOuterNestedPlan(elem, comp))
      }

      if (elem.innerLoops) {
        for (const innerLoop of elem.innerLoops) {
          const innerComps = elem.nestedComponents.filter(c =>
            (c.loopDepth ?? 0) === innerLoop.depth && c.innerLoopArray === innerLoop.array,
          )
          if (innerComps.length === 0) continue
          // Component-rooted outer item (#1725): the inner `.map()` lives
          // inside the child component's JSX children. The element-offset
          // addressing of `inner-loop-nested` can't reach a fragment-rooted
          // passthrough's flattened items, so use the document-order zip
          // shape instead.
          plans.push(
            elem.childComponent
              ? buildComponentRootedInnerLoopPlan(elem, innerLoop, innerComps)
              : buildInnerLoopNestedPlan(elem, innerLoop, innerComps),
          )
        }
      }
    }
  }

  return plans
}

function buildSingleCompPlan(
  elem: TopLevelLoop,
  childComponent: IRLoopChildComponent,
): SingleCompInitPlan {
  const { name, props, slotId } = childComponent
  const childSelector = buildCompSelector({ name, slotId })

  return {
    kind: 'single-comp',
    containerVar: `_${varSlotId(elem.slotId)}`,
    componentName: name,
    childSelector,
    arrayExpr: elem.array,
    param: elem.param,
    indexParam: elem.index || '__idx',
    outerPreludeStatements: elem.mapPreamble ? [elem.mapPreamble] : [],
    propsExpr: buildStaticPropsExpr(props),
  }
}

function buildOuterNestedPlan(
  elem: TopLevelLoop,
  comp: IRLoopChildComponent,
): OuterNestedInitPlan {
  const indexParam = elem.index || '__idx'
  return {
    kind: 'outer-nested',
    containerVar: `_${varSlotId(elem.slotId)}`,
    componentName: comp.name,
    selector: buildCompSelector(comp),
    arrayExpr: elem.array,
    param: elem.param,
    indexParam,
    offsetExpr: buildLoopChildIndexExpr(indexParam, elem.offset),
    outerPreludeStatements: elem.mapPreamble ? [elem.mapPreamble] : [],
    propsExpr: buildStaticPropsExpr(comp.props),
  }
}

function buildInnerLoopNestedPlan(
  elem: TopLevelLoop,
  innerLoop: NestedLoop,
  innerComps: readonly IRLoopChildComponent[],
): InnerLoopNestedInitPlan {
  const outerIndexParam = elem.index || '__idx'
  // The user's declared inner index name, falling back to the synthetic
  // `__innerIdx` — same idiom as the outer `elem.index || '__idx'` above.
  // Hardcoding the synthetic name left a referenced user index unbound and
  // `initChild`'s prop getters threw `ReferenceError` at hydration (#2231).
  const innerIndexParam = innerLoop.index || '__innerIdx'
  const comps: InnerLoopComp[] = innerComps.map(comp => ({
    componentName: comp.name,
    selector: buildCompSelector(comp),
    propsExpr: buildStaticPropsExpr(comp.props),
  }))

  return {
    kind: 'inner-loop-nested',
    containerVar: `_${varSlotId(elem.slotId)}`,
    outerArrayExpr: elem.array,
    outerParam: elem.param,
    outerIndexParam,
    outerOffsetExpr: buildLoopChildIndexExpr(outerIndexParam, elem.offset),
    outerPreludeStatements: elem.mapPreamble ? [elem.mapPreamble] : [],
    innerContainerSlotId: innerLoop.containerSlotId ?? null,
    innerArrayExpr: innerLoop.array,
    innerParam: innerLoop.param,
    innerIndexParam,
    innerOffsetExpr: buildLoopChildIndexExpr(innerIndexParam, innerLoop.offset),
    innerPreludeStatements: innerLoop.mapPreamble ? [innerLoop.mapPreamble] : [],
    depth: innerLoop.depth,
    comps,
  }
}

/**
 * Build the document-order-zip plan for an inner `.map()` of components living
 * inside a component-rooted loop item (#1725).
 *
 * Known limitation (shared with `inner-loop-nested`): the emitted `forEach`
 * iterates `innerLoop.array` — the *base* inner array. `NestedLoop` doesn't
 * carry `filterPredicate` / `sortComparator`, so a `.filter()` / `.sort()` on
 * the inner `.map()` makes the iteration order diverge from the SSR render
 * order. `inner-loop-nested` masks this per-group (each group re-indexes
 * `__ic.children` from 0, so a trailing filtered-out item just reads
 * `undefined`); the zip's single document-order cursor instead misaligns every
 * later group. Both are wrong for non-trailing filtered items — filter/sort on
 * a nested static-array loop is unsupported across this family, not a
 * regression introduced here.
 */
function buildComponentRootedInnerLoopPlan(
  elem: TopLevelLoop,
  innerLoop: NestedLoop,
  innerComps: readonly IRLoopChildComponent[],
): ComponentRootedInnerLoopInitPlan {
  const comps: InnerLoopComp[] = innerComps.map(comp => ({
    componentName: comp.name,
    selector: buildCompSelector(comp),
    propsExpr: buildStaticPropsExpr(comp.props),
  }))

  return {
    kind: 'component-rooted-inner-loop',
    containerVar: `_${varSlotId(elem.slotId)}`,
    outerArrayExpr: elem.array,
    outerParam: elem.param,
    // Declared index names only (#2231) — the zip shape never indexes by
    // position, so there's no synthetic fallback and index-less loops keep
    // byte-identical output.
    outerIndexParam: elem.index,
    outerPreludeStatements: elem.mapPreamble ? [elem.mapPreamble] : [],
    innerArrayExpr: innerLoop.array,
    innerParam: innerLoop.param,
    innerIndexParam: innerLoop.index,
    innerPreludeStatements: innerLoop.mapPreamble ? [innerLoop.mapPreamble] : [],
    depth: innerLoop.depth,
    comps,
  }
}

/**
 * Build the props object expression used by static-array child inits.
 *
 * Differs from `buildComponentPropsExpr` in `control-flow/shared.ts`:
 *   - Static-array context has no loop-param `wrap` (forEach binds the
 *     param as a plain value, not a signal accessor).
 *   - Literal props are emitted as `name: JSON.stringify(value)` (a plain
 *     property, NOT a getter), matching the legacy emitter byte-for-byte.
 */
function buildStaticPropsExpr(props: readonly LoopChildCompProp[]): PropsExpr {
  const entries = props.map(p => {
    if (p.isEventHandler) {
      return `${quotePropName(p.name)}: ${attrValueToString(p.value) ?? 'undefined'}`
    }
    switch (p.value.kind) {
      case 'literal':
        return `${quotePropName(p.name)}: ${JSON.stringify(p.value.value)}`
      case 'boolean-shorthand':
      case 'boolean-attr':
        return `${quotePropName(p.name)}: true`
      case 'jsx-children':
        return `get ${quotePropName(p.name)}() { return ${irChildrenToJsExpr(p.value.children)} }`
      case 'expression':
      case 'template':
      case 'spread':
        return `get ${quotePropName(p.name)}() { return ${attrValueToString(p.value) ?? 'undefined'} }`
    }
  })
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}'
}

