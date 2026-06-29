/**
 * Lowering of local `URLSearchParams` builder helpers to `bf_query`.
 *
 * The builder shape is recognised at analysis time and carried as pure IR on the
 * constant (`ConstantInfo.urlBuilder`, #2039) — the `URLSearchParams` idiom is a
 * block-bodied arrow that the structured parser collapses to `unsupported`, so
 * the recognition can't happen here. This module only *consumes* that IR: it
 * substitutes the call args for the helper's params and emits a `bf_query`
 * template expression, with no emit-time re-parse.
 */

import {
  type ParsedExpr,
  type UrlBuilderInfo,
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
