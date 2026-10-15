/**
 * The decisions behind a DSL adapter's `renderLoop` (#3473), as data.
 *
 * Every DSL adapter decides the same things about a `.map()` loop before it
 * spells a line of template: whether its destructure pattern lowers (BF104),
 * whether the source is a static literal, whether it names a computed const
 * no template binds (BF101), how its `.sort` comparator lowers, and which
 * filter captures need an alias. {@link planLoop} makes those decisions once,
 * against the scope outside the loop. The adapter keeps the spelling: the
 * loop header, the row bindings, the diagnostics' wording, and the order it
 * emits them in.
 */

import { isLowerableLoopDestructure } from '../loop-destructure.ts'
import type { BindingScope } from '../scope/binding-scope.ts'
import { resolveStaticLoopSource } from '../static-literal.ts'
import type { ConstantInfo, IRLoop } from '../types.ts'
import { type CallbackLoweringOptions, type CallbackPlan, lowerCallbackMethod } from './callback-method.ts'
import { filterCaptureCollisions } from './filter-capture-collisions.ts'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

export interface LoopPlanContext {
  /** The scope outside the loop. */
  scope: BindingScope
  localConstants: readonly ConstantInfo[]
  /** The adapter's literal-const resolution: a literal const inlines at its use site. */
  resolveLiteralConst(name: string): unknown
  callbackLowering: CallbackLoweringOptions
}

export interface LoopPlan {
  /**
   * The loop param's destructure pattern: none, one the adapter lowers to
   * per-binding accessors, or one no template binds (BF104).
   */
  destructure: 'none' | 'lowerable' | 'unlowerable'
  /** The source's items when it is an inline literal or an unshadowed static const. */
  staticItems: unknown[] | null
  /**
   * The const the source names when no template binds it as a literal. The
   * adapter refuses the loop with BF101 unless it spells the source
   * statically (`staticItems`, which a backend may not represent). A loop
   * binding that shadows the name is the row's value, not the const (#3473).
   */
  unresolvableConst: ConstantInfo | null
  /** The `.sort` / `.toSorted` comparator's lowering, or `null` without one. */
  sort: CallbackPlan | null
  /** The filter predicate's captures that a row binding would shadow, each with its alias. */
  captureAliases: Array<{ name: string; alias: string }>
}

/** Plan a loop against the scope outside it. */
export function planLoop(loop: IRLoop, ctx: LoopPlanContext): LoopPlan {
  const staticItems = resolveStaticLoopSource(loop.arrayParsed, ctx.localConstants, {
    isNameShadowed: ctx.scope.asShadowPredicate(),
  })
  return {
    destructure: destructureKind(loop),
    staticItems,
    unresolvableConst: unresolvableConst(loop.array.trim(), ctx),
    sort: loop.sortComparator ? lowerCallbackMethod('sort', loop.sortComparator.arrow, [], ctx.callbackLowering) : null,
    captureAliases: filterCaptureCollisions(loop).map((name) => ({ name, alias: `__bf_cap_${loop.markerId}_${name}` })),
  }
}

function destructureKind(loop: IRLoop): LoopPlan['destructure'] {
  if (!loop.paramBindings || loop.paramBindings.length === 0) return 'none'
  return isLowerableLoopDestructure(loop) ? 'lowerable' : 'unlowerable'
}

function unresolvableConst(name: string, ctx: LoopPlanContext): ConstantInfo | null {
  if (!IDENTIFIER.test(name) || ctx.scope.isBound(name)) return null
  const constant = ctx.localConstants.find((c) => c.name === name)
  return constant && ctx.resolveLiteralConst(name) === null ? constant : null
}
