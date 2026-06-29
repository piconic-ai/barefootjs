/**
 * Lowering of URL-query helpers to `bf_query`.
 *
 * Two entry points, sharing the `bf_query` emitter:
 *   - {@link lowerUrlBuilderHelperCall} — the imperative `URLSearchParams`
 *     builder idiom, recognised at analysis time and carried as pure IR on the
 *     constant (`ConstantInfo.urlBuilder`, #2039). The block-bodied arrow is
 *     `unsupported` to the structured parser, so recognition can't happen here;
 *     this just consumes the IR (substituting the call args for the helper's
 *     params) with no emit-time re-parse.
 *   - {@link lowerQueryHrefCall} — the pure, functional `queryHref(base, { … })`
 *     API (#2042). The call + object literal are already structured IR, so this
 *     needs no recognizer at all — it maps each property to a `bf_query` include
 *     triple directly.
 */

import {
  type ParsedExpr,
  type UrlBuilderInfo,
  type UrlBuilderSet,
  parseExpression,
  stringifyParsedExpr,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { wrapIfMultiToken } from '../lib/go-emit.ts'
import { substituteHelperParams } from './helper-inline.ts'

/**
 * Lower a call to a local URL-builder helper to a `bf_query` template
 * expression, or null for anything else (→ generic lowering / method-call
 * fallback). `jsExpr` is the call source; `preParsed` is its already-built tree
 * (reused instead of re-parsing). Handles the builder itself and a pass-through
 * delegate (`(k) => hrefFor(k, params().tag)`) by recursing on the delegated
 * call with the args substituted.
 */
export function lowerUrlBuilderHelperCall(
  ctx: GoEmitContext,
  jsExpr: string,
  preParsed?: ParsedExpr,
): string | null {
  // Cheap gate: a `name(` call whose head names a recognised URL-builder helper.
  // Avoids parsing for the overwhelmingly common non-helper expression.
  const head = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(jsExpr)
  if (!head) return null
  if (
    !ctx.state.localConstants.some(
      c => c.name === head[1] && !c.isModule && c.urlBuilder !== undefined,
    )
  ) {
    return null
  }
  const call = preParsed?.kind === 'call' ? preParsed : parseExpression(jsExpr)
  return lowerCall(ctx, call)
}

/** Lower an already-parsed `helper(args)` call tree, recursing through delegates. */
function lowerCall(ctx: GoEmitContext, call: ParsedExpr): string | null {
  if (call.kind !== 'call' || call.callee.kind !== 'identifier') return null
  if (call.args.some(a => a.kind === 'unsupported')) return null
  const calleeName = call.callee.name
  const fnConst = ctx.state.localConstants.find(
    c => c.name === calleeName && !c.isModule && c.urlBuilder !== undefined,
  )
  const info: UrlBuilderInfo | undefined = fnConst?.urlBuilder
  if (!info || info.params.length !== call.args.length) return null

  const subs = new Map<string, ParsedExpr>()
  for (let i = 0; i < info.params.length; i++) subs.set(info.params[i], call.args[i])

  if (info.kind === 'delegate') {
    const args = info.args.map(a => substituteHelperParams(a, subs))
    return lowerCall(ctx, { kind: 'call', callee: { kind: 'identifier', name: info.target }, args })
  }
  return emitUrlBuilder(ctx, info, subs)
}

/**
 * Emit `bf_query <base> (<guard>) "key" <value> …` from a builder shape, lowering
 * each part (with the call args substituted for params) via the normal expression
 * / condition lowering. Unguarded sets use `true`.
 */
function emitUrlBuilder(
  ctx: GoEmitContext,
  info: Extract<UrlBuilderInfo, { kind: 'builder' }>,
  subs: ReadonlyMap<string, ParsedExpr>,
): string | null {
  const lowerExpr = (n: ParsedExpr): string => {
    const sub = substituteHelperParams(n, subs)
    return ctx.convertExpressionToGo(stringifyParsedExpr(sub), undefined, sub)
  }
  const baseGo = wrapIfMultiToken(lowerExpr(info.base))
  const parts: string[] = [baseGo]
  for (const set of info.sets) {
    const guardGo = set.guard ? lowerUrlGuard(ctx, set.guard, subs) : 'true'
    parts.push(`(${guardGo})`)
    parts.push(JSON.stringify(set.key))
    parts.push(wrapIfMultiToken(lowerExpr(set.value)))
  }
  return `bf_query ${parts.join(' ')}`
}

const BOOL_COMPARISON_OPS: ReadonlySet<string> = new Set([
  '==', '===', '!=', '!==', '<', '>', '<=', '>=',
])

/**
 * Lower a `u.set()` guard to a Go *bool* for `bf_query`'s `include` argument.
 * A comparison / negation / bool-literal already yields a bool
 * (`convertConditionToGo`); a bare value (`if (tag)`) is JS string-truthiness,
 * lowered to `ne <value> ""`. The arg must be a real bool — `bf_query` type-
 * asserts it, so Go-template truthiness (`{{if x}}`) is not enough.
 *
 * The `ne <value> ""` path models *string* truthiness, which is the query-
 * builder domain: `URLSearchParams.set(k, v)` stringifies `v`, and these guards
 * gate string values (`if (tag)`). A guard on a non-string value (a raw number,
 * `null`, a bool-typed identifier) is outside the recognised idiom; the type-
 * assert on `bf_query`'s include arg surfaces it as a build error rather than
 * silently mis-including. (Pre-existing behaviour, carried verbatim from the
 * former re-parse path; #2041 review.)
 */
function lowerUrlGuard(
  ctx: GoEmitContext,
  guard: ParsedExpr,
  subs: ReadonlyMap<string, ParsedExpr>,
): string {
  const g = substituteHelperParams(guard, subs)
  // Comparisons, `!x`, and bool literals lower to a Go bool via the condition
  // lowering. `&&` / `||` do NOT qualify: Go's `and`/`or` return one of their
  // operands (a string for a truthiness guard like `tag && other`), not a
  // bool — so they take the truthiness-wrap path below, yielding
  // `ne (and …) ""`, an actual bool.
  const isBoolShape =
    (g.kind === 'binary' && BOOL_COMPARISON_OPS.has(g.op)) ||
    (g.kind === 'unary' && g.op === '!') ||
    (g.kind === 'literal' && g.literalType === 'boolean')
  if (isBoolShape) {
    return ctx.convertConditionToGo(stringifyParsedExpr(g), g).condition
  }
  const valueGo = wrapIfMultiToken(ctx.convertExpressionToGo(stringifyParsedExpr(g), undefined, g))
  return `ne ${valueGo} ""`
}

const EMPTY_SUBS: ReadonlyMap<string, ParsedExpr> = new Map()

/**
 * Lower a `queryHref(<base>, { <key>: <value>, … })` call to a `bf_query`
 * expression (#2042). `queryHref` is the pure, functional counterpart to the
 * recognised `URLSearchParams` builder: because the call + object literal are
 * already structured IR, there's no block-body recognition or re-parse — this
 * just maps each property to a `bf_query` include triple and reuses the shared
 * emitter. Returns null for anything that isn't a `queryHref(base, {object})`
 * call (→ generic lowering).
 *
 * Inclusion is truthy-omit (the client `queryHref` semantics): an entry is
 * included iff its value is truthy. A conditional include written as
 * `key: cond ? v : undefined` lowers to `(cond) "key" v`; a plain `key: v`
 * lowers to `(ne v "") "key" v` (value-truthiness).
 */
export function lowerQueryHrefCall(
  ctx: GoEmitContext,
  jsExpr: string,
  preParsed?: ParsedExpr,
): string | null {
  const localNames = ctx.state.queryHrefLocals
  if (localNames.size === 0) return null
  const head = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(jsExpr)
  if (!head || !localNames.has(head[1])) return null

  const call = preParsed?.kind === 'call' ? preParsed : parseExpression(jsExpr)
  if (call.kind !== 'call' || call.callee.kind !== 'identifier') return null
  if (!localNames.has(call.callee.name) || call.args.length !== 2) return null
  const [base, obj] = call.args
  // The params must be a plain object literal — a dynamic object can't be lowered
  // to static include triples, so fall back to the generic lowering.
  if (obj.kind !== 'object-literal') return null

  const sets: UrlBuilderSet[] = []
  for (const p of obj.properties) {
    const v = p.value
    if (v.kind === 'conditional' && isOmitSentinel(v.alternate)) {
      // `key: cond ? value : undefined` — include iff `cond`, with `value`.
      sets.push({ guard: v.test, key: p.key, value: v.consequent })
    } else {
      // `key: value` — include iff `value` is truthy (guard == value).
      sets.push({ guard: v, key: p.key, value: v })
    }
  }
  return emitUrlBuilder(ctx, { kind: 'builder', params: [], base, sets }, EMPTY_SUBS)
}

/**
 * The falsy "omit" branch of a conditional include — `undefined` (an identifier),
 * `null`, or `''`. These are the alternates that make `cond ? v : <omit>` mean
 * "include `v` only when `cond`".
 */
function isOmitSentinel(node: ParsedExpr): boolean {
  if (node.kind === 'identifier') return node.name === 'undefined'
  if (node.kind === 'literal') {
    return node.literalType === 'null' || (node.literalType === 'string' && node.value === '')
  }
  return false
}
