/**
 * Lowering of local `URLSearchParams` builder helpers to `bf_query`.
 *
 * Recognises the `(…) => { const u = new URLSearchParams(); if (G) u.set(K, V);
 * …; return <s> ? \`${base}?${u}\` : base }` idiom (and a pass-through delegate
 * to another such helper) and emits a `bf_query` template expression. Anything
 * else returns null so the caller falls back to the generic lowering.
 */

import ts from 'typescript'

import type { GoEmitContext } from '../emit-context.ts'
import { wrapIfMultiToken } from '../lib/go-emit.ts'

type UrlBuilderShape = {
  base: ts.Expression
  sets: { guard: ts.Expression | null; key: string; value: ts.Expression }[]
}

/**
 * Lower a call to a local URL-builder helper to a `bf_query` template
 * expression. Handles two shapes:
 *   - the builder itself — substitute the call args for params and emit
 *     `bf_query <base> (<guard>) "key" <value> …`;
 *   - a pass-through delegate (`(k) => hrefFor(k, params().tag)`) — substitute
 *     and recurse on the delegated call.
 *
 * @returns the `bf_query` expression, or null for anything else (→ generic
 *   lowering / method-call fallback)
 */
export function lowerUrlBuilderHelperCall(ctx: GoEmitContext, jsExpr: string): string | null {
  if (ctx.state.localHelperNames.size === 0) return null
  const head = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(jsExpr)
  if (!head || !ctx.state.localHelperNames.has(head[1])) return null

  const call = ctx.parseLiteralExpression(jsExpr)
  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null
  if (call.arguments.some(a => ts.isSpreadElement(a))) return null
  const fnConst = ctx.state.localConstants.find(
    c => c.name === (call.expression as ts.Identifier).text && !c.isModule && c.value,
  )
  if (!fnConst?.value) return null
  const fn = ctx.parseLiteralExpression(fnConst.value)
  if (!fn || !ts.isArrowFunction(fn) || fn.parameters.length !== call.arguments.length) return null

  const subs = new Map<string, string>()
  for (let i = 0; i < fn.parameters.length; i++) {
    const p = fn.parameters[i]
    if (!ts.isIdentifier(p.name)) return null
    subs.set(p.name.text, `(${call.arguments[i].getText()})`)
  }

  // Shape 1: the helper is itself a URLSearchParams builder.
  const shape = extractUrlBuilder(fn)
  if (shape) return emitUrlBuilder(ctx, shape, subs)

  // Shape 2: a pass-through delegate to another local URL-builder helper.
  if (!ts.isBlock(fn.body)) {
    let body: ts.Expression = fn.body
    while (ts.isParenthesizedExpression(body)) body = body.expression
    if (
      ts.isCallExpression(body) &&
      ts.isIdentifier(body.expression) &&
      ctx.state.localHelperNames.has(body.expression.text)
    ) {
      return lowerUrlBuilderHelperCall(ctx, substituteHelperParams(body, subs))
    }
  }
  return null
}

/**
 * Extract the `bf_query` shape from a `(…) => { const u = new URLSearchParams();
 * [if (G)] u.set(K, V); …; return <s> ? … : <base> }` helper, or null when the
 * block doesn't match that exact builder idiom.
 */
function extractUrlBuilder(arrow: ts.ArrowFunction): UrlBuilderShape | null {
  if (!ts.isBlock(arrow.body)) return null
  let builderVar: string | null = null
  let base: ts.Expression | null = null
  const sets: { guard: ts.Expression | null; key: string; value: ts.Expression }[] = []

  for (const s of arrow.body.statements) {
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          ts.isNewExpression(d.initializer) &&
          ts.isIdentifier(d.initializer.expression) &&
          d.initializer.expression.text === 'URLSearchParams' &&
          (d.initializer.arguments?.length ?? 0) === 0
        ) {
          builderVar = d.name.text
        }
        // Other locals (`const s = u.toString()`) are inert — ignored.
      }
      continue
    }
    // `if (G) u.set(K, V)` (no else).
    if (ts.isIfStatement(s) && !s.elseStatement && builderVar) {
      const set = matchUrlSet(s.thenStatement, builderVar)
      if (!set) return null
      sets.push({ guard: s.expression, key: set.key, value: set.value })
      continue
    }
    // Unguarded `u.set(K, V)`.
    if (ts.isExpressionStatement(s) && builderVar) {
      const set = matchUrlSet(s, builderVar)
      if (set) {
        sets.push({ guard: null, key: set.key, value: set.value })
        continue
      }
      return null
    }
    // `return <s> ? `${base}?…` : <base>` — the builder's return must be the
    // conditional that picks between the with-query and bare-base URL; its
    // `whenFalse` (no-query) branch is the base. Any other return shape bails
    // to the method-call fallback.
    if (ts.isReturnStatement(s) && s.expression) {
      let e: ts.Expression = s.expression
      while (ts.isParenthesizedExpression(e)) e = e.expression
      if (!ts.isConditionalExpression(e)) return null
      base = e.whenFalse
      continue
    }
    return null
  }
  if (!builderVar || !base || sets.length === 0) return null
  return { base, sets }
}

/**
 * Match `<builderVar>.set('literalKey', <value>)` — as a statement or an
 * if-then — returning the key text and value node, else null.
 */
function matchUrlSet(
  node: ts.Node,
  builderVar: string,
): { key: string; value: ts.Expression } | null {
  const stmt = ts.isBlock(node) ? (node.statements.length === 1 ? node.statements[0] : null) : node
  if (!stmt || !ts.isExpressionStatement(stmt)) return null
  const call = stmt.expression
  if (
    ts.isCallExpression(call) &&
    ts.isPropertyAccessExpression(call.expression) &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === builderVar &&
    call.expression.name.text === 'set' &&
    call.arguments.length === 2 &&
    ts.isStringLiteral(call.arguments[0])
  ) {
    return { key: call.arguments[0].text, value: call.arguments[1] }
  }
  return null
}

/**
 * Emit `bf_query <base> (<guard>) "key" <value> …` from an extracted builder
 * shape, lowering each part (with the call args substituted for params) via
 * the normal expression / condition lowering. Unguarded sets use `true`.
 */
function emitUrlBuilder(
  ctx: GoEmitContext,
  shape: UrlBuilderShape,
  subs: ReadonlyMap<string, string>,
): string | null {
  const lowerExpr = (n: ts.Expression): string =>
    ctx.convertExpressionToGo(substituteHelperParams(n, subs))
  const baseGo = wrapIfMultiToken(lowerExpr(shape.base))
  const parts: string[] = [baseGo]
  for (const set of shape.sets) {
    const guardGo = set.guard ? lowerUrlGuard(ctx, set.guard, subs) : 'true'
    parts.push(`(${guardGo})`)
    parts.push(JSON.stringify(set.key))
    parts.push(wrapIfMultiToken(lowerExpr(set.value)))
  }
  return `bf_query ${parts.join(' ')}`
}

/**
 * Lower a `u.set()` guard to a Go *bool* for `bf_query`'s `include` argument.
 * A comparison / logical / negation / bool-literal already yields a bool
 * (`convertConditionToGo`); a bare value (`if (tag)`) is JS string-truthiness,
 * lowered to `ne <value> ""`. The arg must be a real bool — `bf_query` type-
 * asserts it, so Go-template truthiness (`{{if x}}`) is not enough.
 */
function lowerUrlGuard(
  ctx: GoEmitContext,
  guard: ts.Expression,
  subs: ReadonlyMap<string, string>,
): string {
  let g = guard
  while (ts.isParenthesizedExpression(g)) g = g.expression
  // Comparisons, `!x`, and bool literals lower to a Go bool via the condition
  // lowering. `&&` / `||` do NOT qualify: Go's `and`/`or` return one of their
  // operands (a string for a truthiness guard like `tag && other`), not a
  // bool — so they take the truthiness-wrap path below, yielding
  // `ne (and …) ""`, an actual bool.
  const isBoolShape =
    (ts.isBinaryExpression(g) &&
      [
        ts.SyntaxKind.EqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken,
        ts.SyntaxKind.LessThanToken,
        ts.SyntaxKind.GreaterThanToken,
        ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanEqualsToken,
      ].includes(g.operatorToken.kind)) ||
    (ts.isPrefixUnaryExpression(g) && g.operator === ts.SyntaxKind.ExclamationToken) ||
    g.kind === ts.SyntaxKind.TrueKeyword ||
    g.kind === ts.SyntaxKind.FalseKeyword
  if (isBoolShape) {
    return ctx.convertConditionToGo(substituteHelperParams(guard, subs)).condition
  }
  const valueGo = wrapIfMultiToken(
    ctx.convertExpressionToGo(substituteHelperParams(guard, subs)),
  )
  return `ne ${valueGo} ""`
}

/**
 * Re-emit `body` to source with each identifier named in `subs` replaced by the
 * substitution's source text. Span splicing over `body`'s own source (single
 * source file — args are passed as text, not cross-file AST nodes, which would
 * corrupt a printer keyed to `body`'s source). The walk skips non-value
 * identifier positions — the property NAME in `a.b` and a plain object-literal
 * key in `{ k: … }` — so a param sharing a name with a member or key is left
 * untouched. The spliced string is re-parsed by the caller.
 */
function substituteHelperParams(
  body: ts.Expression,
  subs: ReadonlyMap<string, string>,
): string {
  const sf = body.getSourceFile()
  const base = body.getStart(sf)
  // Collect replacement spans (relative to the body's start), right-to-left.
  const repls: { start: number; end: number; text: string }[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      visit(node.expression) // skip `.name`
      return
    }
    if (ts.isPropertyAssignment(node)) {
      // A plain identifier/string key isn't a value position; only a computed
      // key (`[expr]`) is. Visit the initializer (and computed key) only.
      if (ts.isComputedPropertyName(node.name)) visit(node.name)
      visit(node.initializer)
      return
    }
    if (ts.isIdentifier(node)) {
      const sub = subs.get(node.text)
      if (sub !== undefined) {
        repls.push({ start: node.getStart(sf) - base, end: node.getEnd() - base, text: sub })
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(body)

  let text = body.getText(sf)
  for (const r of repls.sort((a, b) => b.start - a.start)) {
    text = text.slice(0, r.start) + r.text + text.slice(r.end)
  }
  return text
}
