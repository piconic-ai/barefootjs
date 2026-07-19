/**
 * Go lowering of helper calls to template expressions. Renders backend-neutral
 * `LoweringNode`s produced by registered lowering plugins (#2057) — one uniform
 * path for both userland plugins and built-ins like `queryHref` (a default plugin
 * that lowers to `bf_query`, #2042). Every node funnels through
 * `renderLoweringNode`, which maps a logical helper id to its Go helper; the
 * adapter carries no per-API recognition branch of its own.
 */

import {
  type LoweringNode,
  type ParsedExpr,
  parseExpression,
  stringifyParsedExpr,
  isValidHelperId,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { wrapIfMultiToken } from '../lib/go-emit.ts'

/**
 * Logical helper id → Go template helper name. `bf_<helper>` is a formula,
 * not a lookup table (#2069) — the built-in `query` helper (`bf_query`)
 * already follows the exact same convention every userland-registered
 * `helper-call` id gets for free. `isValidHelperId` guards against a
 * malformed id (e.g. containing a space or backtick) producing invalid Go
 * template source; a plugin author's helper id is otherwise untrusted
 * input reaching generated code.
 */
function goHelperName(helper: string): string | null {
  return isValidHelperId(helper) ? `bf_${helper}` : null
}

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
 * Lower a `conditional` (ternary) ParsedExpr to the pipeline-position
 * `(bf_ternary <test> <consequent> <alternate>)` form (#2335). Go
 * `text/template` is the only backend without an expression-level
 * conditional, so a ternary sitting in VALUE position — a helper-call arg, a
 * template-literal interpolation, an attribute value, or a boolean
 * sub-condition — cannot be an `{{if}}…{{end}}` action fragment (a parse error
 * inside a pipeline, and a silent branch-discard in condition position). This
 * is the single lowering every such position shares; each caller passes the
 * ternary's three child nodes directly (the ParsedExpr emitter hands them over
 * unwrapped).
 *
 *   - branches are quoted VALUES, recursing so a right-folded chain
 *     (`a ? x : b ? y : z`) nests as `(bf_ternary … (bf_ternary …))`.
 *   - the test is coerced to a real Go `bool` (see `lowerTernaryTest`).
 *
 * NOT for the text-position `IRConditional` (`renderConditional`), whose
 * branches are arbitrary markup, not values.
 */
export function lowerTernary(
  ctx: GoEmitContext,
  test: ParsedExpr,
  consequent: ParsedExpr,
  alternate: ParsedExpr,
): string {
  const t = lowerTernaryTest(ctx, test)
  return `(bf_ternary ${t} ${lowerTernaryOperand(ctx, consequent)} ${lowerTernaryOperand(ctx, alternate)})`
}

/**
 * A ternary branch in value position: a nested ternary recurses to another
 * `bf_ternary`; anything else lowers to its Go value (parenthesised when
 * multi-token so it stays one argument). String branches become quoted,
 * html/template-escaped values — not the bare unquoted text the old `{{if}}`
 * fragment path emitted — which is exactly right for the value positions this
 * is reached for.
 */
function lowerTernaryOperand(ctx: GoEmitContext, n: ParsedExpr): string {
  if (n.kind === 'conditional') {
    return lowerTernary(ctx, n.test, n.consequent, n.alternate)
  }
  return wrapIfMultiToken(ctx.convertExpressionToGo(stringifyParsedExpr(n), undefined, n))
}

/**
 * Lower a ternary TEST to a Go bool. `Ternary`'s first parameter is typed
 * `bool` and is NOT truthiness-coerced the way `{{if}}` is, so a non-bool test
 * (`x` where x is a string/number, `a && b`, …) fed in raw would fail the
 * runtime type assertion. A comparison / `!x` / bool literal already renders
 * to a bool via the generic emitter and passes through; every other shape is
 * wrapped `bf_truthy <value>`, which mirrors JS `Boolean(x)` (the runtime's
 * `isTruthy`) across string / number / bool / nil uniformly — the general
 * counterpart of `lowerUrlGuard`'s string-only `ne <value> ""`.
 */
function lowerTernaryTest(ctx: GoEmitContext, test: ParsedExpr): string {
  const go = wrapIfMultiToken(ctx.convertExpressionToGo(stringifyParsedExpr(test), undefined, test))
  const isBoolShape =
    (test.kind === 'binary' && BOOL_COMPARISON_OPS.has(test.op)) ||
    (test.kind === 'unary' && test.op === '!') ||
    (test.kind === 'literal' && test.literalType === 'boolean')
  return isBoolShape ? go : `(bf_truthy ${go})`
}

/**
 * Lower a helper call to a Go template expression, or null when no registered
 * plugin recognises it (→ the generic lowering). Matchers — including the
 * built-in `queryHref` plugin (#2042) — are bound to the component metadata at
 * init (`ctx.state.loweringMatchers`), so this is one uniform loop with no
 * per-API branch.
 *
 * Cheap-out: no active matchers → null; else reuse `preParsed` when it's already
 * a call, otherwise a regex pre-filter gates the parse so non-call expressions
 * never pay for `parseExpression`.
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
  const helper = goHelperName(node.helper)
  if (!helper) return null
  const lowerExpr = (n: ParsedExpr): string =>
    ctx.convertExpressionToGo(stringifyParsedExpr(n), undefined, n)
  // A `conditional` in ARGUMENT position cannot go through the generic
  // emitter: its `conditional` method would render an `{{if}}…{{end}}` action
  // fragment (a parse error inside a pipeline, "unexpected { in parenthesized
  // pipeline"). Route it through the shared `bf_ternary` lowering — the same
  // pipeline-position form the `conditional()` emitter and the condition-
  // expression emitter now use (#2335) — so a right-folded chain (the #2324
  // union stage's locale→pattern table) nests as
  // `(bf_ternary <cond> <a> (bf_ternary …))`.
  const lowerArg = (n: ParsedExpr): string =>
    n.kind === 'conditional'
      ? lowerTernary(ctx, n.test, n.consequent, n.alternate)
      : wrapIfMultiToken(lowerExpr(n))
  if (node.kind === 'helper-call') {
    const args = node.args.map(a => lowerArg(a))
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
