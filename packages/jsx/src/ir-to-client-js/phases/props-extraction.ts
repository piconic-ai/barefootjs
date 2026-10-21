/**
 * `props-extraction` phase — emit the one surviving one-time prop
 * extraction, `const children = _p.children [?? <default>]` (or
 * `const kids = _p.children` for a renamed `{ children: kids }`).
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

import { type PropUsage, isChildrenPropParam } from '../../types.ts'
import { computePropsUsedAsConditions } from '../compute-prop-usage.ts'
import { propReadBase, propReadFallback } from '../../props-binding.ts'
import type { ClientJsContext } from '../types.ts'

export function emitPropsExtraction(
  lines: string[],
  ctx: ClientJsContext,
  neededProps: Set<string>,
  propUsage: Map<string, PropUsage>,
): void {
  if (ctx.propsObjectName) return
  // The children prop's local binding: `children`, or the renamed local of
  // `{ children: kids }` (`isChildrenPropParam`, #3572), which reads
  // `_p.children` the same one-time way. A local named `children` that binds
  // another prop (`{ items: children }`) is an ordinary prop, read live.
  // `neededProps` holds only props-param locals, so a component with no
  // children param has nothing to extract.
  const prop = ctx.propsParams.find(isChildrenPropParam)
  if (!prop) return
  const local = prop.name
  if (!neededProps.has(local)) return

  const usedAsCondition = computePropsUsedAsConditions(ctx, neededProps).has(local)
  const fallback = propReadFallback(prop, propUsage.get(local), usedAsCondition)
  const read = propReadBase(prop) + (fallback === null ? '' : ` ?? ${fallback}`)
  lines.push(`  const ${local} = ${read}`, '')
}
