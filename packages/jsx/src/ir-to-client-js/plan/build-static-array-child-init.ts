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
 *
 * Selector / propsExpr / offset decisions all resolve here. The
 * stringifier never inspects raw IR.
 */

import type { IRLoopChildComponent } from '../../types'
import type { NestedLoop, TopLevelLoop } from '../types'
import type { ClientJsContext } from '../types'
import { quotePropName, varSlotId } from '../utils'
import { buildCompSelector } from '../control-flow/shared'

/** The inline prop shape carried on `IRLoopChildComponent.props`. */
type LoopChildCompProp = IRLoopChildComponent['props'][number]
import type {
  InnerLoopComp,
  InnerLoopNestedInitPlan,
  OuterNestedInitPlan,
  PropsExpr,
  SingleCompInitPlan,
  StaticArrayChildInitPlan,
  StaticArrayChildInitsPlan,
} from './static-array-child-init'

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
          plans.push(buildInnerLoopNestedPlan(elem, innerLoop, innerComps))
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
  // Use both suffix match (for inlined stateless components whose bf-s uses
  // parent scope + slotId, e.g. ~ParentName_hash_s3) and prefix match (for
  // stateful components whose bf-s uses their own name, e.g. ToggleItem_hash).
  const namePrefixSelector = `[bf-s^="~${name}_"], [bf-s^="${name}_"]`
  const childSelector = slotId
    ? `[bf-s$="_${slotId}"], ${namePrefixSelector}`
    : namePrefixSelector

  return {
    kind: 'single-comp',
    containerVar: `_${varSlotId(elem.slotId)}`,
    componentName: name,
    childSelector,
    arrayExpr: elem.array,
    param: elem.param,
    indexParam: elem.index || '__idx',
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
    offsetExpr: elem.siblingOffset ? `${indexParam} + ${elem.siblingOffset}` : indexParam,
    preludeStatements: elem.mapPreamble ? [elem.mapPreamble] : [],
    propsExpr: buildStaticPropsExpr(comp.props),
  }
}

function buildInnerLoopNestedPlan(
  elem: TopLevelLoop,
  innerLoop: NestedLoop,
  innerComps: readonly IRLoopChildComponent[],
): InnerLoopNestedInitPlan {
  const outerIndexParam = elem.index || '__idx'
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
    outerOffsetExpr: elem.siblingOffset
      ? `${outerIndexParam} + ${elem.siblingOffset}`
      : outerIndexParam,
    outerPreludeStatements: elem.mapPreamble ? [elem.mapPreamble] : [],
    innerContainerSlotId: innerLoop.containerSlotId ?? null,
    innerArrayExpr: innerLoop.array,
    innerParam: innerLoop.param,
    innerOffsetExpr: innerLoop.siblingOffset
      ? `__innerIdx + ${innerLoop.siblingOffset}`
      : '__innerIdx',
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
      return `${quotePropName(p.name)}: ${p.value}`
    }
    if (p.isLiteral) {
      return `${quotePropName(p.name)}: ${JSON.stringify(p.value)}`
    }
    return `get ${quotePropName(p.name)}() { return ${p.value} }`
  })
  return entries.length > 0 ? `{ ${entries.join(', ')} }` : '{}'
}

