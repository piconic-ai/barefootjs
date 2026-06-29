/**
 * Recognition of the local `URLSearchParams` URL-query helper idiom, lowered to
 * a pure {@link UrlBuilderInfo} tree at analysis time (#2039).
 *
 * The go-template adapter lowers these helpers to a `bf_query` template action.
 * Their bodies are multi-statement block-bodied arrows, which the structured
 * expression parser collapses to `unsupported` — so the adapter used to recover
 * the shape by re-parsing the arrow source with `ts.createSourceFile` at emit
 * time. Doing the recognition here, where the TS AST is already in hand, carries
 * the shape as IR (`ConstantInfo.urlBuilder`) and retires the adapter-side
 * re-parse. The recognition is backend-neutral; only the `bf_query` emission is
 * go-template-specific (and stays in the adapter).
 */

import ts from 'typescript'

import { tsNodeToParsedExpr } from './expression-parser.ts'
import type { ParsedExpr } from './expression-parser.ts'
import type { UrlBuilderInfo, UrlBuilderSet } from './types.ts'

/**
 * Recognise a local URL-query helper arrow and lower it to a pure
 * {@link UrlBuilderInfo}, or null when it isn't one of the two supported shapes.
 *
 * `isUrlBuilderName` reports whether a name resolves to an already-recognised
 * URL-builder helper — used to gate the `delegate` shape. (Helpers are recognised
 * in declaration order, so a delegate must follow the builder it targets; a
 * forward reference is left unrecognised and the adapter falls back to its
 * generic lowering, which is a no-op-equivalent rather than a miscompile.)
 */
export function recognizeUrlBuilder(
  arrow: ts.ArrowFunction,
  isUrlBuilderName: (name: string) => boolean,
): UrlBuilderInfo | null {
  // Every param must be a plain identifier — the call-site substitution binds
  // params by name. A destructured / rest param can't be substituted, so bail.
  const params: string[] = []
  for (const p of arrow.parameters) {
    if (!ts.isIdentifier(p.name) || p.dotDotDotToken) return null
    params.push(p.name.text)
  }

  // Shape 1: the helper is itself a `URLSearchParams` builder (block body).
  const builder = extractUrlBuilder(arrow)
  if (builder) return { kind: 'builder', params, base: builder.base, sets: builder.sets }

  // Shape 2: a pass-through delegate to another local URL-builder helper
  // (`(k) => hrefFor(k, params().tag)`).
  if (!ts.isBlock(arrow.body)) {
    let body: ts.Expression = arrow.body
    while (ts.isParenthesizedExpression(body)) body = body.expression
    if (
      ts.isCallExpression(body) &&
      ts.isIdentifier(body.expression) &&
      isUrlBuilderName(body.expression.text) &&
      !body.arguments.some(a => ts.isSpreadElement(a))
    ) {
      return {
        kind: 'delegate',
        params,
        target: body.expression.text,
        args: body.arguments.map(a => tsNodeToParsedExpr(a)),
      }
    }
  }
  return null
}

/**
 * Extract the builder shape from a `(…) => { const u = new URLSearchParams();
 * [if (G)] u.set(K, V); …; return <s> ? … : <base> }` helper, or null when the
 * block doesn't match that exact builder idiom. Sub-expressions are converted to
 * `ParsedExpr` so the result is a pure tree.
 */
function extractUrlBuilder(
  arrow: ts.ArrowFunction,
): { base: ParsedExpr; sets: UrlBuilderSet[] } | null {
  if (!ts.isBlock(arrow.body)) return null
  let builderVar: string | null = null
  // Locals bound to `<builderVar>.toString()` — the query-string truthiness the
  // builder's `return <s> ? … : <base>` switches on. Tracked (not ignored) so
  // the return shape can be validated, not assumed.
  const toStringVars = new Set<string>()
  let base: ParsedExpr | null = null
  const sets: UrlBuilderSet[] = []

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
        } else if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          builderVar &&
          isBuilderToString(d.initializer, builderVar)
        ) {
          // `const s = u.toString()` — the query-string value.
          toStringVars.add(d.name.text)
        }
        // Any other local is inert — ignored.
      }
      continue
    }
    // `if (G) u.set(K, V)` (no else).
    if (ts.isIfStatement(s) && !s.elseStatement && builderVar) {
      const set = matchUrlSet(s.thenStatement, builderVar)
      if (!set) return null
      sets.push({ guard: tsNodeToParsedExpr(s.expression), key: set.key, value: set.value })
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
    // `return <q> ? `${base}?…` : <base>` — the builder's return must be the
    // conditional that switches on the *query-string truthiness* (`u.toString()`,
    // or a local bound to it) and falls back to the bare base. Validating the
    // condition is what makes "`whenFalse` is the base" sound — a conditional
    // return over some unrelated predicate is NOT a query builder and must bail
    // to the adapter's method-call fallback rather than be mis-lowered (#2041
    // review). Other return shapes bail too.
    if (ts.isReturnStatement(s) && s.expression && builderVar) {
      let e: ts.Expression = s.expression
      while (ts.isParenthesizedExpression(e)) e = e.expression
      if (!ts.isConditionalExpression(e)) return null
      if (!isQueryTruthiness(e.condition, builderVar, toStringVars)) return null
      base = tsNodeToParsedExpr(e.whenFalse)
      continue
    }
    return null
  }
  if (!builderVar || !base || sets.length === 0) return null
  return { base, sets }
}

/** `<builderVar>.toString()` — the query-string materialisation. */
function isBuilderToString(node: ts.Expression, builderVar: string): boolean {
  let e: ts.Expression = node
  while (ts.isParenthesizedExpression(e)) e = e.expression
  return (
    ts.isCallExpression(e) &&
    e.arguments.length === 0 &&
    ts.isPropertyAccessExpression(e.expression) &&
    ts.isIdentifier(e.expression.expression) &&
    e.expression.expression.text === builderVar &&
    e.expression.name.text === 'toString'
  )
}

/**
 * The builder return's condition is the query-string truthiness: a direct
 * `<builderVar>.toString()` call, or an identifier bound to one earlier
 * (`const s = u.toString()`). Anything else is not a query builder.
 */
function isQueryTruthiness(
  cond: ts.Expression,
  builderVar: string,
  toStringVars: ReadonlySet<string>,
): boolean {
  let e: ts.Expression = cond
  while (ts.isParenthesizedExpression(e)) e = e.expression
  if (ts.isIdentifier(e)) return toStringVars.has(e.text)
  return isBuilderToString(e, builderVar)
}

/**
 * Match `<builderVar>.set('literalKey', <value>)` — as a statement or an
 * if-then — returning the key text and value as a `ParsedExpr`, else null.
 */
function matchUrlSet(
  node: ts.Node,
  builderVar: string,
): { key: string; value: ParsedExpr } | null {
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
    return { key: call.arguments[0].text, value: tsNodeToParsedExpr(call.arguments[1]) }
  }
  return null
}
