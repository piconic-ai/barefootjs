/**
 * `props-extraction` phase — emit the one-time prop extractions:
 * `const children = _p.children [?? <default>]` (or `const kids =
 * _p.children` for a renamed `{ children: kids }`), and `let start =
 * _p.start [?? <default>]` for each prop the component writes
 * (`ParamInfo.reassigned`, see `keepsDeclaredValue`).
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
import { propReadBase, propReadFallback, keepsDeclaredValue } from '../../props-binding.ts'
import type { ClientJsContext } from '../types.ts'

export function emitPropsExtraction(
  lines: string[],
  ctx: ClientJsContext,
  neededProps: Set<string>,
  propUsage: Map<string, PropUsage>,
): void {
  if (ctx.propsObjectName) return
  emitWrittenPropLocals(lines, ctx, propUsage)
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
  // A children binding the component writes needs a `let` to take the write.
  lines.push(`  ${keepsDeclaredValue(prop) ? 'const' : 'let'} ${local} = ${read}`, '')
}

/**
 * A prop the component writes (`++start`, `start = clamp(start)`) is a
 * local it owns, as in JS: declared once from the prop, then read and
 * written in place. It is declared whether or not `neededProps` lists it,
 * since a write is itself a use.
 */
function emitWrittenPropLocals(lines: string[], ctx: ClientJsContext, propUsage: Map<string, PropUsage>): void {
  const written = ctx.propsParams.filter(p => !p.isRest && !isChildrenPropParam(p) && !keepsDeclaredValue(p))
  if (written.length === 0) return
  const usedAsCondition = computePropsUsedAsConditions(ctx, new Set(written.map(p => p.name)))
  for (const prop of written) {
    const fallback = propReadFallback(prop, propUsage.get(prop.name), usedAsCondition.has(prop.name))
    lines.push(`  let ${prop.name} = ${propReadBase(prop)}${fallback === null ? '' : ` ?? ${fallback}`}`)
  }
  lines.push('')
}
