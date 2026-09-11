/**
 * Live-read rewrite for destructured props.
 *
 * A destructured name can appear bare in a dozen raw-captured text shapes
 * (effect bodies, memo computations, signal initials, handler bodies,
 * `mapArray` row bodies, conditional thunks, …), so rewriting it per
 * emitter would mean N places to keep in sync; the single door is the
 * joined init body, same precedent as `rewritePropsObjectRef`
 * (`rewrite-props-object.ts`) one step earlier in the same pipeline.
 */

import type { ParamInfo, PropUsage } from '../types.ts'
import { computePropsUsedAsConditions } from './compute-prop-usage.ts'
import { boundPropLocalNames, livePropReadExpr } from '../props-binding.ts'
import { rewriteScopedValueRefs } from '../prop-rewrite.ts'
import { PROPS_PARAM } from './utils.ts'
import type { ClientJsContext } from './types.ts'

/**
 * Rewrite every bare value-position read of a destructured prop in `code`
 * (the joined `init*` body, already past `rewritePropsObjectRef`) to a live
 * `_p.<key>` read. No-op in props-object mode — there every prop read is
 * already `_p.X` via that rename.
 *
 * The walk is `rewriteScopedValueRefs` (`prop-rewrite.ts`), which carries a
 * binding-scope stack, so `items.map((title) => title.a)` and a
 * handler-local `const title = 'local'` keep their own binding even when
 * `title` is also a prop name.
 *
 * Excluding `children` is load-bearing, not belt-and-braces: its one-time
 * `const children = _p.children` extraction sits at the TOP LEVEL of this
 * text, which parses as a statement list, and `scopeFrameOf` only opens a
 * frame for a `Block` — so the walk would NOT see that const as a shadow
 * and would rewrite the references it binds. Reading `_p.children` live
 * re-invokes a getter that instantiates child components (see
 * `emitPropsExtraction`).
 *
 * A null result can only mean `code` did not parse — never that a
 * substitution broke it, since the walk parses the pristine input and every
 * substituted string is a well-formed expression spliced where the walk
 * already proved an identifier sat. The one shape that trips it is a
 * tracked pre-existing hole (`map-body-no-silent-divergence.test.ts`'s
 * `KNOWN_HOLES`): a `.map()` preamble leaking raw JSX, which is already a
 * browser `SyntaxError` with or without this rewrite. Warning and passing
 * the code through keeps that a tracked silent hole instead of promoting it
 * to a compiler crash — same precedent as `pruneUnusedPropExtractions`.
 */
export function rewriteDestructuredPropReads(
  code: string,
  ctx: ClientJsContext,
  propUsage: ReadonlyMap<string, PropUsage>,
): string {
  if (ctx.propsObjectName !== null) return code

  const names = new Set(boundPropLocalNames(ctx))
  names.delete('children')
  if (names.size === 0) return code

  const propsUsedAsConditions = computePropsUsedAsConditions(ctx, names)
  const propByName = new Map<string, ParamInfo>()
  for (const p of ctx.propsParams) propByName.set(p.name, p)

  const replacementFor = (name: string): string => {
    // `names` comes from `ctx.propsParams`, so the fallback is unreachable —
    // kept over a non-null assertion.
    const prop = propByName.get(name)
    if (!prop) return `${PROPS_PARAM}.${name}`
    return livePropReadExpr(prop, propUsage.get(name), propsUsedAsConditions.has(name))
  }

  const result = rewriteScopedValueRefs(code, names, replacementFor, { allowStatements: true })
  if (result === null) {
    console.warn(
      `[barefootjs] rewriteDestructuredPropReads: the generated init body for ` +
        `component "${ctx.componentName}" did not parse as JS/TSX (most likely a ` +
        `pre-existing raw-JSX leak — see this function's docstring); skipping the ` +
        `live-prop-read rewrite for it.`,
    )
    return code
  }
  return result
}
