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
import { boundPropLocalNames, bodyDestructuredPropParams, livePropReadExpr } from '../props-binding.ts'
import { rewriteScopedValueRefs } from '../prop-rewrite.ts'
import { PROPS_PARAM } from './utils.ts'
import type { ClientJsContext } from './types.ts'

/**
 * Rewrite every bare value-position read of a destructured prop in `code`
 * (the joined `init*` body, already past `rewritePropsObjectRef`) to a live
 * `_p.<key>` read. Covers both destructuring shapes:
 *
 *   - PARAMETER form (`function Child({ value })`, `propsObjectName ===
 *     null`) — bindings come from `ctx.propsParams` via
 *     `boundPropLocalNames`.
 *   - BODY form in props-object mode (`function Child(props) { const
 *     { value } = props }`) — bindings come from
 *     `bodyDestructuredPropParams(ctx.localConstants, ctx.propsObjectName)`.
 *     The alias declaration line (`const value = _p.value`) this synthesizes
 *     a live read FOR must already be absent from `code` by this point
 *     (suppressed at emission in `emitSortedDeclarations`,
 *     `init-declarations.ts`) — see the note below on why that suppression
 *     is mandatory, not optional.
 *
 * A no-op when neither mode has any eligible bindings.
 *
 * The walk is `rewriteScopedValueRefs` (`prop-rewrite.ts`), which carries a
 * binding-scope stack, so `items.map((title) => title.a)` and a
 * handler-local `const title = 'local'` keep their own binding even when
 * `title` is also a prop name.
 *
 * Excluding `children` is load-bearing, not belt-and-braces, in BOTH modes:
 * `code` at this point is the WHOLE `export function init<Name>(__scope, _p
 * = {}) { … }` function — a `FunctionDeclaration` whose body is a `ts.Block`
 * — and `scopeFrameOf` (`prop-rewrite.ts`) DOES open a frame for a `Block`
 * and collect every one of its statement-level `const`s as a shadow. So a
 * `const children = _p.children` (or `const kids = _p.children`) surviving
 * at that level is seen as a local binding shadowing its own name, and the
 * walk correctly leaves references to it alone WITHOUT needing to be told —
 * but only because that line is still IN `code`. This is exactly why the
 * body-form live-read candidates must have their OWN alias line suppressed
 * before it reaches this rewrite: leaving `const value = _p.value` in place
 * and relying on the same shadow mechanism to protect it would make the
 * "live read" rewrite silently rewrite nothing for that name at all (the
 * shadow hides every reference from the walk, not just protects it) —
 * `bodyDestructuredPropParams` and its caller in `init-declarations.ts`
 * exist so `children`/`kids` gets that protection on purpose while every
 * other body-destructured binding does NOT (its declaration line is never
 * emitted, so there is no shadow to hide behind).
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
  const propByName = new Map<string, ParamInfo>()
  let names: Set<string>
  let replacementFor: (name: string) => string

  if (ctx.propsObjectName !== null) {
    // Body-destructured props-object mode (#2934).
    const bindings = bodyDestructuredPropParams(ctx.localConstants, ctx.propsObjectName)
    if (bindings.size === 0) return code
    names = new Set(bindings.keys())
    for (const [name, param] of bindings) propByName.set(name, param)
    replacementFor = (name) => {
      const prop = propByName.get(name)
      // `names` comes straight from `bindings`' keys, so the fallback is
      // unreachable — kept over a non-null assertion.
      if (!prop) return `${PROPS_PARAM}.${name}`
      // Explicit destructure-default only, no synthesized
      // `PropUsage`-derived fallback — matches what the (now-suppressed)
      // captured-once line did, and matches direct-read props-object mode
      // (`props.items.length` → `_p.items.length`, no fallback either).
      return livePropReadExpr(prop, undefined, false)
    }
  } else {
    // Parameter-destructure mode.
    names = new Set(boundPropLocalNames(ctx))
    names.delete('children')
    if (names.size === 0) return code
    for (const p of ctx.propsParams) propByName.set(p.name, p)
    const propsUsedAsConditions = computePropsUsedAsConditions(ctx, names)
    replacementFor = (name) => {
      const prop = propByName.get(name)
      // `names` comes from `ctx.propsParams`, so the fallback is
      // unreachable — kept over a non-null assertion.
      if (!prop) return `${PROPS_PARAM}.${name}`
      return livePropReadExpr(prop, propUsage.get(name), propsUsedAsConditions.has(name))
    }
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
