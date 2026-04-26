/**
 * Per-prop usage classifier.
 *
 * Pure function of `ClientJsContext` + the init-scope constants
 * classifier output. Returns a `Map<propName, PropUsage>` describing
 * the access kinds observed for each prop (bare / property / index)
 * and whether the prop is consumed as a loop's array expression.
 *
 * Detection runs through `collectPropAccesses` (an AST walk) so
 * optional-chaining (`<name>?.foo`) and computed access patterns are
 * caught — a regex `\\b<name>\\.[a-zA-Z_]` would silently miss the `?.`
 * case.
 */

import type { ConstantInfo, PropUsage } from '../types'
import type { ClientJsContext } from './types'
import { collectPropAccesses, type PropAccessKindMap } from './walk-prop-accesses'

export function computePropUsage(
  ctx: ClientJsContext,
  /** Constants the emitter is going to ship (scope === 'init'). Mirrors
   *  the source set the pre-Stage C.2 `detectPropsWithPropertyAccess`
   *  scanned, so the `{}` default decision stays byte-identical for any
   *  source the regex did catch. */
  initScopeConstants: readonly ConstantInfo[],
): Map<string, PropUsage> {
  const propNames = new Set(ctx.propsParams.map(p => p.name))
  const accesses: PropAccessKindMap = new Map()

  // Same source set as the legacy scan: conditional branch HTML +
  // condition, loop template, dynamic text expression, and init-scope
  // constant initializers.
  for (const elem of ctx.conditionalElements) {
    collectPropAccesses(elem.whenTrueHtml, propNames, accesses)
    collectPropAccesses(elem.whenFalseHtml, propNames, accesses)
    collectPropAccesses(elem.condition, propNames, accesses)
  }
  for (const elem of ctx.loopElements) {
    collectPropAccesses(elem.template, propNames, accesses)
  }
  for (const elem of ctx.dynamicElements) {
    collectPropAccesses(elem.expression, propNames, accesses)
  }
  for (const c of initScopeConstants) {
    if (c.value) collectPropAccesses(c.value, propNames, accesses)
  }

  const usage = new Map<string, PropUsage>()
  for (const prop of ctx.propsParams) {
    const accessKinds = accesses.get(prop.name) ?? new Set()
    let usedAsLoopArray = false
    for (const loop of ctx.loopElements) {
      if (loop.array.trim() === prop.name) {
        usedAsLoopArray = true
        break
      }
    }
    usage.set(prop.name, { propName: prop.name, accessKinds, usedAsLoopArray })
  }

  return usage
}

/** Convenience predicate: does this prop need a `{}` default in the
 *  destructure to guard against `undefined.xxx` at runtime? */
export function propHasPropertyAccess(u: PropUsage | undefined): boolean {
  if (!u) return false
  return u.accessKinds.has('property') || u.accessKinds.has('index')
}
