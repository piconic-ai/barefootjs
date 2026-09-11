/**
 * `props-extraction` phase — emit the ONE surviving one-time prop
 * extraction: `const children = _p.children [?? <default>]`.
 *
 * Every other destructured prop used to get its own captured-once
 * `const propName = _p.propName [?? default]` line here too — that is
 * exactly the bug Move B (#2760's follow-up) fixes: a bare `propName`
 * read downstream captured the value at init time and never saw a later
 * prop update. Those reads are now rewritten live, in place, by
 * `rewriteDestructuredPropReads` (`generate-init.ts`), which walks the
 * FINISHED init body and turns every bare value-position reference into
 * `_p.propName` (or `(_p.propName ?? <fallback>)`) directly — no local
 * binding involved, so there is nothing to capture.
 *
 * `children` is the deliberate exception: its extraction must stay a
 * ONE-TIME read, never a live one. A prop's slot-children value is a
 * GETTER that INSTANTIATES child components when read
 * (`packages/jsx/src/ir-to-client-js/prune-unused-prop-extractions.ts`'s
 * docstring) — rewriting every `{children}` reference to read `_p.children`
 * live would re-invoke that getter (and re-mount the children) on every
 * downstream read instead of once. So `children` keeps this hand-written
 * extraction line, in the SAME unparenthesized `_p.X [?? default]` shape
 * as before (not `livePropReadExpr`'s parenthesized form) — that exact
 * shape is what `pruneUnusedPropExtractions`'s AST matcher recognizes as a
 * prunable extraction when the init body never actually reads `children`.
 *
 * The default value depends on usage:
 *   - prop has explicit default          → use it (wrap arrow defaults
 *                                            in parens for syntax safety)
 *   - prop is consumed as a loop array   → `?? []`
 *   - prop has property/index access     → `?? {}`  (skipped when the
 *                                            prop is a conditional guard
 *                                            so falsy values stay falsy)
 *   - otherwise                          → no default
 *
 * Skipped entirely when the component uses an opaque props object name
 * (`propsObjectName != null`) — in that case downstream code reads
 * `_p.X` directly via the late-stage rename.
 */

import type { PropUsage } from '../../types.ts'
import { computePropsUsedAsConditions, propHasPropertyAccess } from '../compute-prop-usage.ts'
import type { ClientJsContext } from '../types.ts'
import { PROPS_PARAM } from '../utils.ts'

export function emitPropsExtraction(
  lines: string[],
  ctx: ClientJsContext,
  neededProps: Set<string>,
  propUsage: Map<string, PropUsage>,
): void {
  if (ctx.propsObjectName) return
  const propName = 'children'
  if (!neededProps.has(propName)) return

  // Props that guard a conditional branch must remain falsy when undefined,
  // so `{}` (truthy) is the wrong default for them — track and exclude.
  const propsUsedAsConditions = computePropsUsedAsConditions(ctx, neededProps)

  const prop = ctx.propsParams.find(p => p.name === propName)
  // `_p` is always keyed by the caller-facing name (#2524 CSR half); the
  // local binding on the left of `const` stays `propName`.
  const callerKey = prop?.sourceName ?? propName
  const usage = propUsage.get(propName)
  const defaultVal = prop?.defaultValue
  if (defaultVal) {
    // `props.onInput ?? () => {}` is a syntax error — `??` binds tighter
    // than the arrow head. Wrap arrow defaults in parens.
    const wrappedDefault = prop?.defaultContainsArrow ? `(${defaultVal})` : defaultVal
    lines.push(`  const ${propName} = ${PROPS_PARAM}.${callerKey} ?? ${wrappedDefault}`)
  } else if (usage?.usedAsLoopArray) {
    lines.push(`  const ${propName} = ${PROPS_PARAM}.${callerKey} ?? []`)
  } else if (propHasPropertyAccess(usage) && !propsUsedAsConditions.has(propName)) {
    lines.push(`  const ${propName} = ${PROPS_PARAM}.${callerKey} ?? {}`)
  } else {
    // No synthesized default for a defaultless optional (`{ size }:
    // { size?: number }`): the JS binding is `undefined` when absent, and
    // a zero default would diverge from SSR (`size ?? 1` seeds 1
    // server-side; a `_p.size ?? 0` extraction would hydrate to 0).
    lines.push(`  const ${propName} = ${PROPS_PARAM}.${callerKey}`)
  }
  lines.push('')
}
