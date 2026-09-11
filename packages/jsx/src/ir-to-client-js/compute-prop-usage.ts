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

import type { ConstantInfo, PropUsage } from '../types.ts'
import type { ClientJsContext } from './types.ts'
import { collectPropAccesses, type PropAccessKindMap } from './walk-prop-accesses.ts'

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

/**
 * Which of `propNames` guard a conditional branch (`ctx.conditionalElements`
 * / `ctx.clientOnlyConditionals`'s `.condition`). A prop in this set must
 * NOT get a `{}` fallback (truthy) when it also has property access — the
 * conditional needs it to stay falsy when the caller omits it. Shared by
 * `emitPropsExtraction`'s (legacy, `children`-only) extraction line and
 * `rewriteDestructuredPropReads`'s live-read rewrite so the two agree on
 * the same set (previously computed independently at each call site).
 */
export function computePropsUsedAsConditions(
  ctx: Pick<ClientJsContext, 'conditionalElements' | 'clientOnlyConditionals'>,
  propNames: ReadonlySet<string>,
): Set<string> {
  const result = new Set<string>()
  for (const cond of ctx.conditionalElements) {
    if (propNames.has(cond.condition)) result.add(cond.condition)
  }
  for (const cond of ctx.clientOnlyConditionals) {
    if (propNames.has(cond.condition)) result.add(cond.condition)
  }
  return result
}
