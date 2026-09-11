/**
 * `props-extraction` phase — emit the one surviving one-time prop
 * extraction, `const children = _p.children [?? <default>]`.
 *
 * `children` must stay a ONE-TIME read: a prop's slot-children value is a
 * getter that INSTANTIATES child components when read (see
 * `prune-unused-prop-extractions.ts`), so reading it live at every
 * `{children}` reference would re-mount the children each time. Every
 * other destructured prop is rewritten to a live read instead, by
 * `rewriteDestructuredPropReads` (`generate-init.ts`).
 *
 * The line is composed from `propReadBase`/`propReadFallback` rather than
 * `livePropReadExpr` so it stays unparenthesized — that exact
 * `const X = _p.X [?? d]` shape is what `pruneUnusedPropExtractions`'s AST
 * matcher recognizes when the init body never reads `children`.
 *
 * Skipped entirely for an opaque props object (`propsObjectName != null`):
 * downstream code there reads `_p.X` directly via the late-stage rename.
 */

import type { PropUsage } from '../../types.ts'
import { computePropsUsedAsConditions } from '../compute-prop-usage.ts'
import { propReadBase, propReadFallback } from '../../props-binding.ts'
import type { ClientJsContext } from '../types.ts'
import { PROPS_PARAM } from '../utils.ts'

const CHILDREN = 'children'

export function emitPropsExtraction(
  lines: string[],
  ctx: ClientJsContext,
  neededProps: Set<string>,
  propUsage: Map<string, PropUsage>,
): void {
  if (ctx.propsObjectName) return
  if (!neededProps.has(CHILDREN)) return

  const prop = ctx.propsParams.find(p => p.name === CHILDREN)
  if (!prop) {
    lines.push(`  const ${CHILDREN} = ${PROPS_PARAM}.${CHILDREN}`, '')
    return
  }

  const usedAsCondition = computePropsUsedAsConditions(ctx, neededProps).has(CHILDREN)
  const fallback = propReadFallback(prop, propUsage.get(CHILDREN), usedAsCondition)
  const read = propReadBase(prop) + (fallback === null ? '' : ` ?? ${fallback}`)
  lines.push(`  const ${CHILDREN} = ${read}`, '')
}
