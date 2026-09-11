/**
 * Live-read rewrite for destructured props (Move B, #2760's follow-up).
 *
 * A destructured-props component (`function Child({ value, onClick })`)
 * used to get exactly one `const value = _p.value` extraction line per
 * prop at the top of `init*`, and every downstream reference — effect
 * bodies, memo computations, handlers, text slots, `.map()` row bodies —
 * read that captured-once local. The parent side was always live
 * (`initChild('Display', _s0, { get value() { return count() } })`), so
 * the child silently never saw an update past its first render — the
 * BF043 warning existed to steer users away from this shape entirely.
 *
 * This pass makes destructuring behave exactly like today's
 * `function Component(props)` mode already does: every VALUE-POSITION
 * read of a destructured prop name, anywhere in the FINISHED init body,
 * becomes a live `_p.<callerKey>` read (or `(_p.<callerKey> ?? <fallback>)`
 * — see `livePropReadExpr`, `props-binding.ts`). Not a per-emitter fix:
 * a destructured name can appear bare in a dozen raw-captured text
 * shapes (effect bodies, memo computations, signal initials, handler
 * bodies, `mapArray` row bodies, conditional thunks, …), so the single
 * door is the joined body, same precedent as `rewritePropsObjectRef`
 * (`rewrite-props-object.ts`) one step earlier in the same pipeline.
 *
 * `rewriteScopedValueRefs` (`prop-rewrite.ts`) is the walk: it carries a
 * real binding-scope stack, so `items.map((title) => title.a)` and a
 * handler-local `const title = 'local'` are never touched even when
 * `title` also happens to be a destructured prop name — only genuinely
 * free references are live-read.
 */

import type { ParamInfo, PropUsage } from '../types.ts'
import { computePropsUsedAsConditions } from './compute-prop-usage.ts'
import { boundPropLocalNames, livePropReadExpr } from '../props-binding.ts'
import { rewriteScopedValueRefs } from '../prop-rewrite.ts'
import type { ClientJsContext } from './types.ts'

/**
 * Rewrite every bare value-position read of a destructured prop in `code`
 * (the joined `init*` body, already past `rewritePropsObjectRef`) to a
 * live `_p.<key>` read. No-op when the component uses props-object mode
 * (`ctx.propsObjectName != null`) — there every prop read is already
 * `_p.X` via that late-stage rename, so there is nothing captured to fix.
 *
 * `children` is excluded (see `emitPropsExtraction`'s docstring): its
 * one-time `const children = _p.children` extraction is deliberately
 * kept, so a bare `children` reference downstream is a real local
 * binding, not a stray capture — rewriting it here would both be
 * redundant AND (per `scopeFrameOf`) never fire anyway, since that const
 * shadows `children` for the rest of the init `Block`.
 *
 * `rewriteScopedValueRefs` is asked to parse `code` — the PRISTINE joined
 * body, before this function has made any edit — so a `null` return can
 * only mean `code` itself didn't already parse as JS/TSX, never that a
 * substitution THIS function made broke otherwise-good syntax (every
 * substituted string is a well-formed `_p.x` / `(_p.x ?? y)` expression
 * spliced at a position the walk already proved was a valid identifier).
 * The one shape that trips this today is a documented, tracked
 * pre-existing hole (`map-body-no-silent-divergence.test.ts`'s
 * `KNOWN_HOLES`): a `.map()` preamble that pushes raw JSX into an array
 * leaks that JSX verbatim into the emitted "client JS" text — already
 * unparseable, already non-functional (a browser `SyntaxError` before any
 * of this code runs), with or without this rewrite. Throwing here would
 * turn that TRACKED, silently-broken-but-still-compiling shape into a
 * hard compiler crash — a strictly worse outcome the trichotomy contract
 * (`compiles clean AND sound`, XOR `loud BF error` — never a THIRD, crash
 * outcome) doesn't ask for. So: warn (matching `pruneUnusedPropExtractions`'s
 * identical parse-failure precedent) and pass `code` through unchanged —
 * safe specifically because the input was never going to run either way.
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
    const prop = propByName.get(name)
    // Every name in `names` came from `ctx.propsParams` itself, so this
    // is unreachable in practice — kept as a safe fallback rather than a
    // non-null assertion.
    if (!prop) return `_p.${name}`
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
