/**
 * Lowering of the pure, functional `queryHref(base, { … })` URL-query API to a
 * `bf_query` template expression (#2042). The call + object literal are already
 * structured IR, so there is no recognizer and no emit-time re-parse — each
 * property maps to a `bf_query` include triple directly.
 */

import {
  type ParsedExpr,
  parseExpression,
  stringifyParsedExpr,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { wrapIfMultiToken } from '../lib/go-emit.ts'

const BOOL_COMPARISON_OPS: ReadonlySet<string> = new Set([
  '==', '===', '!=', '!==', '<', '>', '<=', '>=',
])

/**
 * Lower an expression to a Go *bool* for `bf_query`'s `include` argument. A
 * comparison / negation / bool-literal already yields a bool
 * (`convertConditionToGo`); anything else is JS string-truthiness, lowered to
 * `ne <value> ""`. The arg must be a real bool — `bf_query` type-asserts it, so
 * Go-template truthiness (`{{if x}}`) is not enough.
 *
 * The `ne <value> ""` path models *string* truthiness, which is the query
 * domain: `queryHref` values are strings (`QueryParamValue`). A guard on a
 * non-string value is outside the supported surface; the type-assert on
 * `bf_query`'s include arg surfaces it as a build error rather than silently
 * mis-including. (#2041 review.)
 */
function lowerUrlGuard(ctx: GoEmitContext, g: ParsedExpr): string {
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

/**
 * Lower a `queryHref(<base>, { <key>: <value>, … })` call to a `bf_query`
 * expression (#2042). Because the call + object literal are already structured
 * IR, there's no recognition or re-parse — this maps each property to a
 * `bf_query` include triple directly. Returns null for
 * anything that isn't a `queryHref(base, {object})` call (→ generic lowering).
 *
 * Inclusion mirrors the client `queryHref` exactly, where every param value is a
 * STRING (`QueryParamValue`): an entry is included iff its value is a non-empty
 * string (the client's `if (value)` over strings).
 *   - plain `key: v`            → `(ne v "") "key" v`
 *   - conditional `key: cond ? a : <undefined|null|''>` → the client evaluates
 *     `if (cond ? a : undefined)`, i.e. include iff `cond` AND `a` is non-empty,
 *     so this emits `(and (<cond>) (ne a "")) "key" a` — NOT just `(cond)`, which
 *     would wrongly include `?key=` when `cond` holds but `a` is empty.
 *
 * Number / boolean values are intentionally outside `QueryParamValue`: JS
 * truthiness omits `0` / `false`, which a string `ne … ""` guard can't model
 * without per-value type info (a possible follow-up). Keeping values string-only
 * guarantees SSR ≡ client.
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

  const lowerExpr = (n: ParsedExpr): string =>
    ctx.convertExpressionToGo(stringifyParsedExpr(n), undefined, n)
  const parts: string[] = [wrapIfMultiToken(lowerExpr(base))]
  for (const p of obj.properties) {
    const v = p.value
    let includeGo: string
    let valueNode: ParsedExpr
    if (v.kind === 'conditional' && isOmitSentinel(v.alternate)) {
      // `key: cond ? a : <omit>` ≡ client `if (cond ? a : undefined)` ≡
      // `cond` truthy AND `a` non-empty.
      const testBool = lowerUrlGuard(ctx, v.test)
      const consGo = wrapIfMultiToken(lowerExpr(v.consequent))
      includeGo = `and (${testBool}) (ne ${consGo} "")`
      valueNode = v.consequent
    } else {
      // `key: v` — include iff the (string) value is non-empty.
      includeGo = lowerUrlGuard(ctx, v)
      valueNode = v
    }
    parts.push(`(${includeGo})`)
    parts.push(JSON.stringify(p.key))
    parts.push(wrapIfMultiToken(lowerExpr(valueNode)))
  }
  return `bf_query ${parts.join(' ')}`
}

/**
 * The falsy "omit" branch of a conditional include — `undefined` (an identifier),
 * `null`, or `''`. These are the alternates that make `cond ? v : <omit>` a
 * conditional include.
 */
function isOmitSentinel(node: ParsedExpr): boolean {
  if (node.kind === 'identifier') return node.name === 'undefined'
  if (node.kind === 'literal') {
    return node.literalType === 'null' || (node.literalType === 'string' && node.value === '')
  }
  return false
}
