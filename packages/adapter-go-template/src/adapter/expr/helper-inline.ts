/**
 * Inlining of component-scope arrow-const helpers at a call site.
 *
 * Extracted from `go-template-adapter.ts` (Phase 4 decomposition). When a JSX
 * expression calls a local `const f = (a) => …` helper, the Go adapter has no
 * function to emit — it inlines the helper body with the call args spliced in
 * for the params, so the result lowers like any inline expression. The splicer
 * is scope-blind, so the guards here reject bodies where a textual identifier
 * replacement could be wrong.
 *
 * `substituteHelperParams` is exported because the URL-builder lowering reuses
 * it; the other helpers are module-internal.
 */

import ts from 'typescript'

import type { GoEmitContext } from '../emit-context.ts'

/**
 * Inline a call to a local arrow-const helper, returning the spliced body
 * source, or null when the expression isn't such a call or the body isn't
 * splice-safe (nested functions, helper-calling helpers, spread args, …).
 */
export function inlineLocalHelperCall(ctx: GoEmitContext, jsExpr: string): string | null {
  if (ctx.state.localHelperNames.size === 0) return null
  // Fast path: skip the AST parse unless the expression begins with a known
  // helper name applied as a call (`<helper>(`). The leading-identifier match
  // is an unambiguous prefix — the real shape check is the AST parse below.
  const head = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(jsExpr)
  if (!head || !ctx.state.localHelperNames.has(head[1])) return null

  const call = ctx.parseLiteralExpression(jsExpr)
  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return null
  // A spread arg (`f(...xs)`) can't map to positional params by text splice.
  if (call.arguments.some(a => ts.isSpreadElement(a))) return null
  const fnConst = ctx.state.localConstants.find(
    c => c.name === (call.expression as ts.Identifier).text && !c.isModule && c.value,
  )
  if (!fnConst?.value) return null
  const fn = ctx.parseLiteralExpression(fnConst.value)
  if (!fn || !ts.isArrowFunction(fn) || ts.isBlock(fn.body)) return null
  if (fn.parameters.length !== call.arguments.length) return null
  // Don't half-inline a helper that calls another local helper.
  if (bodyCallsLocalHelper(ctx, fn.body)) return null

  const subs = new Map<string, string>()
  for (let i = 0; i < fn.parameters.length; i++) {
    const p = fn.parameters[i]
    if (!ts.isIdentifier(p.name)) return null
    // Parenthesize the arg so its own precedence survives the splice into the
    // body (e.g. `x === <param>` with arg `a || b` must not become
    // `x === a || b`).
    subs.set(p.name.text, `(${call.arguments[i].getText()})`)
  }
  // The splicer is scope-blind, so reject bodies where a textual identifier
  // replacement could be wrong: nested function scopes (shadowing / param
  // positions) and object shorthand keys that are params.
  if (!isSpliceSafeHelperBody(fn.body, new Set(subs.keys()))) return null
  return substituteHelperParams(fn.body, subs)
}

/**
 * Guard for `substituteHelperParams`: the span splicer replaces identifiers by
 * name without scope tracking, so it is only safe on bodies free of
 * constructs where a param name could appear in a position the splice can't
 * handle — a nested function scope (shadowing or its own parameters), or an
 * object shorthand key (`{ k }`, which can't be rewritten to `{ (arg) }`).
 */
function isSpliceSafeHelperBody(body: ts.Node, paramNames: ReadonlySet<string>): boolean {
  let safe = true
  const visit = (n: ts.Node): void => {
    if (!safe) return
    if (
      ts.isArrowFunction(n) ||
      ts.isFunctionExpression(n) ||
      ts.isFunctionDeclaration(n)
    ) {
      safe = false
      return
    }
    if (ts.isShorthandPropertyAssignment(n) && paramNames.has(n.name.text)) {
      safe = false
      return
    }
    ts.forEachChild(n, visit)
  }
  visit(body)
  return safe
}

/**
 * True when `body` contains a call to a *local* (component-scope) arrow helper
 * const — the signal that inlining `body` here would only push the problem to
 * another un-lowered helper (e.g. `sortHref`'s body calls `hrefFor`).
 */
function bodyCallsLocalHelper(ctx: GoEmitContext, body: ts.Node): boolean {
  let found = false
  const visit = (n: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text
      if (
        ctx.state.localConstants.some(c => c.name === name && !c.isModule && c.containsArrow)
      ) {
        found = true
        return
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(body)
  return found
}

/**
 * Re-emit `body` to source with each identifier named in `subs` replaced by
 * the substitution's source text. Implemented as span splicing over `body`'s
 * own source (single source file — args are passed as text, not cross-file
 * AST nodes, which would corrupt a printer keyed to `body`'s source). The walk
 * skips non-value identifier positions — the property NAME in `a.b` and a
 * plain object-literal key in `{ k: … }` — so a param sharing a name with a
 * member or key is left untouched. (`isSpliceSafeHelperBody` has already
 * rejected nested functions and `{ k }` shorthand keys.)
 */
export function substituteHelperParams(
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
