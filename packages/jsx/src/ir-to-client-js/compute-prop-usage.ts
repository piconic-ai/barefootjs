/**
 * Per-prop usage classifier.
 *
 * Pure function of `ClientJsContext` + the init-scope constants
 * classifier output. Returns a `Map<propName, PropUsage>` describing
 * the access kinds observed for each prop (bare / property / index)
 * and whether the prop is consumed as a loop's array expression.
 *
 * Replaces `detectPropsWithPropertyAccess` in `prop-handling.ts` and
 * the inline `propsUsedAsLoopArrays` loop in `generate-init.ts`.
 *
 * Stage C.2 of issue #1021 — analysis-on-IR refactor.
 */

import type { ConstantInfo, PropAccessKind, PropUsage } from '../types'
import type { ClientJsContext } from './types'

export function computePropUsage(
  ctx: ClientJsContext,
  /** Constants the emitter is going to ship (scope === 'init'). Must
   *  mirror the sources the pre-Stage C.2 `detectPropsWithPropertyAccess`
   *  scanned, so that the `{}` default decision stays byte-identical. */
  initScopeConstants: readonly ConstantInfo[],
): Map<string, PropUsage> {
  const usage = new Map<string, PropUsage>()

  // Sources mirror the pre-refactor `detectPropsWithPropertyAccess`
  // scan (prop-handling.ts L150-183): conditional branch HTML +
  // condition, loop template, dynamic text expression, and init-scope
  // constant initializers. Extending the scan would widen the `{}`
  // default coverage — that is a deliberate Stage C.3 / later concern,
  // not a Stage C.2 change.
  const sources: string[] = []
  for (const elem of ctx.conditionalElements) {
    sources.push(elem.whenTrueHtml, elem.whenFalseHtml, elem.condition)
  }
  for (const elem of ctx.loopElements) {
    sources.push(elem.template)
  }
  for (const elem of ctx.dynamicElements) {
    sources.push(elem.expression)
  }
  for (const c of initScopeConstants) {
    if (c.value) sources.push(c.value)
  }

  for (const prop of ctx.propsParams) {
    const accessKinds = new Set<PropAccessKind>()
    const dotPattern = new RegExp(`\\b${prop.name}\\.[a-zA-Z_]`)
    const bracketPattern = new RegExp(`\\b${prop.name}\\s*\\[`)

    for (const source of sources) {
      if (dotPattern.test(source)) accessKinds.add('property')
      if (bracketPattern.test(source)) accessKinds.add('index')
      // Early exit once both kinds observed; `bare` is not tracked from
      // this scan (`detectPropsWithPropertyAccess` never did).
      if (accessKinds.size === 2) break
    }

    let usedAsLoopArray = false
    for (const loop of ctx.loopElements) {
      if (loop.array.trim() === prop.name) {
        usedAsLoopArray = true
        break
      }
    }

    usage.set(prop.name, {
      propName: prop.name,
      accessKinds,
      usedAsLoopArray,
    })
  }

  return usage
}

/** Convenience predicate: does this prop need a `{}` default in the
 *  destructure to guard against `undefined.xxx` at runtime? */
export function propHasPropertyAccess(u: PropUsage | undefined): boolean {
  if (!u) return false
  return u.accessKinds.has('property') || u.accessKinds.has('index')
}
