/**
 * Go rendering of a backend-neutral `guard-list` lowering node (#2057) — today
 * the `queryHref(base, { … })` URL-query API lowered to a `bf_query` template
 * expression (#2042). Recognition (which import, what call shape) lives in the
 * lowering-plugin registry; this module is the Go *renderer* for the neutral
 * node it produces: each triple maps to a `bf_query` include triple directly.
 */

import {
  type LoweringNode,
  type ParsedExpr,
  parseExpression,
  stringifyParsedExpr,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { wrapIfMultiToken } from '../lib/go-emit.ts'

/** Logical helper id → Go template helper name. */
const GO_HELPER_NAMES: Record<string, string> = { query: 'bf_query' }

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
 * Try every active lowering matcher against an expression, returning the Go
 * rendering of the first neutral node produced, or null when none match (→ the
 * generic lowering). Matchers are bound to the component metadata at init
 * (`ctx.state.loweringMatchers`), so recognition of *which* API this is lives in
 * the plugin registry, not here.
 *
 * Cheap-out order mirrors the old inline recognizer: no matchers → null; else
 * reuse `preParsed` when it's already a call, otherwise a regex pre-filter gates
 * the parse so non-call expressions never pay for `parseExpression`.
 */
export function lowerRegisteredCall(
  ctx: GoEmitContext,
  jsExpr: string,
  preParsed?: ParsedExpr,
): string | null {
  const matchers = ctx.state.loweringMatchers
  if (matchers.length === 0) return null

  let call: ParsedExpr | undefined = preParsed?.kind === 'call' ? preParsed : undefined
  if (!call) {
    if (!/^\s*[A-Za-z_$][\w$]*\s*\(/.test(jsExpr)) return null
    const parsed = parseExpression(jsExpr)
    if (parsed.kind !== 'call') return null
    call = parsed
  }

  for (const matcher of matchers) {
    const node = matcher(call.callee, call.args)
    if (!node) continue
    const rendered = renderLoweringNode(ctx, node)
    if (rendered !== null) return rendered
  }
  return null
}

/**
 * Render a backend-neutral lowering node to a Go template expression, or null
 * when the node's `helper` has no Go mapping — the caller then declines
 * (generic lowering → BF101), rather than emitting the raw helper id, which
 * would be invalid Go. Adapters must switch on `helper`; an unknown one is not
 * rendered.
 */
function renderLoweringNode(ctx: GoEmitContext, node: LoweringNode): string | null {
  const helper = GO_HELPER_NAMES[node.helper]
  if (!helper) return null
  const lowerExpr = (n: ParsedExpr): string =>
    ctx.convertExpressionToGo(stringifyParsedExpr(n), undefined, n)
  if (node.kind === 'helper-call') {
    const args = node.args.map(a => wrapIfMultiToken(lowerExpr(a)))
    return [helper, ...args].join(' ')
  }
  // guard-list — `queryHref`-shaped. Inclusion mirrors the client exactly, where
  // every param value is a STRING (`QueryParamValue`): bf_query drops an
  // included-but-empty value and appends array members.
  //   - plain `key: v` (guard null)        → `(true) "key" v`
  //   - conditional `key: cond ? a : <omit>` → `(<cond>) "key" a`, where the
  //     non-empty check is done by bf_query, not folded into the guard.
  const parts: string[] = [wrapIfMultiToken(lowerExpr(node.base))]
  for (const t of node.triples) {
    const includeGo = t.guard === null ? 'true' : lowerUrlGuard(ctx, t.guard)
    parts.push(`(${includeGo})`)
    parts.push(JSON.stringify(t.key))
    parts.push(wrapIfMultiToken(lowerExpr(t.value)))
  }
  return `${helper} ${parts.join(' ')}`
}
