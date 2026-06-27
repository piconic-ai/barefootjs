/**
 * Inlining of component-scope arrow-const helpers at a call site.
 *
 * Extracted from `go-template-adapter.ts` (Phase 4 decomposition). When a JSX
 * expression calls a local `const f = (a) => …` helper, the Go adapter has no
 * function to emit — it inlines the helper body with the call args substituted
 * for the params, so the result lowers like any inline expression. The
 * substitution is scope-blind, so the guards here reject bodies where a param
 * replacement could be wrong.
 *
 * The whole path is structural (#2006): the call arrives already parsed (its
 * `ParsedExpr` tree, threaded from `convertExpressionToGo`'s `preParsed`), and
 * the helper body is the analyzer-attached `ConstantInfo.parsed2` tree — so no
 * `ts.createSourceFile` re-parse is needed.
 */

import { type ParsedExpr, parsedExpr2ToParsedExpr } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'

/**
 * Inline a call to a local arrow-const helper, returning the substituted body
 * tree, or null when the expression isn't such a call or the body isn't
 * substitution-safe (nested functions, helper-calling helpers, spread args, …).
 *
 * `callParsed` is the call's already-built `ParsedExpr` (the `preParsed` tree
 * threaded from `convertExpressionToGo`). It must be a `call` node; without it
 * (a call site that didn't carry a tree) inlining is declined — every site that
 * legitimately inlines a helper threads its IR `parsed`.
 */
export function inlineLocalHelperCall(
  ctx: GoEmitContext,
  jsExpr: string,
  callParsed?: ParsedExpr,
): ParsedExpr | null {
  if (ctx.state.localHelperNames.size === 0) return null
  // Fast path: skip the work unless the expression begins with a known helper
  // name applied as a call (`<helper>(`). The leading-identifier match is an
  // unambiguous prefix — the real shape check is the tree inspection below.
  const head = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(jsExpr)
  if (!head || !ctx.state.localHelperNames.has(head[1])) return null

  if (!callParsed || callParsed.kind !== 'call' || callParsed.callee.kind !== 'identifier') {
    return null
  }
  const calleeName = callParsed.callee.name
  if (!ctx.state.localHelperNames.has(calleeName)) return null

  const fnConst = ctx.state.localConstants.find(
    c => c.name === calleeName && !c.isModule && c.parsed2,
  )
  const arrow = fnConst?.parsed2
  if (!arrow || arrow.kind !== 'arrow') return null
  if (arrow.params.length !== callParsed.args.length) return null

  // The body must lower to a `ParsedExpr` — a nested arrow / regex (the shapes
  // `ParsedExpr` can't model) refuses here, which subsumes the
  // nested-function-scope guard (a nested `(x) => …` in the body converts to
  // null) the former text splicer enforced separately.
  const body = parsedExpr2ToParsedExpr(arrow.body)
  if (!body || body.kind === 'unsupported') return null

  // Don't half-inline a helper that calls another local helper.
  if (bodyCallsLocalHelper(ctx, body)) return null

  // Refuse a body containing a method call (`x.foo(…)`). The structural body
  // tree models it as a generic `call`, but `parseExpression` (which the rest
  // of the lowering is keyed to) folds the string / array method family
  // (`.replace`, `.toLowerCase`, `.includes`, `.filter`, …) into specialised
  // `array-method` / `higher-order` nodes — so lowering this tree directly
  // would diverge. The current inliner fixtures (`sortClass` / `tagClass`) have
  // no method-call bodies; one that did falls back to the generic path
  // (#2006). (`x()` with an identifier callee — `params()` — is fine.)
  if (bodyHasMethodCall(body)) return null

  const subs = new Map<string, ParsedExpr>()
  for (let i = 0; i < arrow.params.length; i++) {
    subs.set(arrow.params[i], callParsed.args[i])
  }
  // Reject bodies where a param name appears as an object shorthand key
  // (`{ k }`, which can't be rewritten to `{ (arg) }`).
  if (!isSubstituteSafeBody(body, new Set(subs.keys()))) return null
  return substituteHelperParams(body, subs)
}

/**
 * Guard for `substituteHelperParams`: the substitution replaces value-position
 * identifiers by name, so it is only safe on bodies free of an object shorthand
 * key (`{ k }`) whose name is a param — that key isn't a value position and
 * can't be rewritten to `{ (arg) }`. Nested function scopes are already
 * rejected upstream (their `ParsedExpr2` `arrow` doesn't convert to
 * `ParsedExpr`), so this only checks shorthand keys.
 */
function isSubstituteSafeBody(body: ParsedExpr, paramNames: ReadonlySet<string>): boolean {
  let safe = true
  const visit = (n: ParsedExpr): void => {
    if (!safe) return
    if (n.kind === 'object-literal') {
      for (const p of n.properties) {
        if (p.shorthand && paramNames.has(p.key)) {
          safe = false
          return
        }
        visit(p.value)
      }
      return
    }
    forEachValueChild(n, visit)
  }
  visit(body)
  return safe
}

/**
 * True when `body` contains a call to a *local* (component-scope) arrow helper
 * const — the signal that inlining `body` here would only push the problem to
 * another un-lowered helper (e.g. `sortHref`'s body calls `hrefFor`).
 */
function bodyCallsLocalHelper(ctx: GoEmitContext, body: ParsedExpr): boolean {
  let found = false
  const visit = (n: ParsedExpr): void => {
    if (found) return
    if (n.kind === 'call' && n.callee.kind === 'identifier') {
      const name = n.callee.name
      if (ctx.state.localConstants.some(c => c.name === name && !c.isModule && c.containsArrow)) {
        found = true
        return
      }
    }
    forEachValueChild(n, visit)
  }
  visit(body)
  return found
}

/**
 * True when `body` contains a method call (`x.foo(…)` — a `call` whose callee
 * is a `member`). Such calls are folded by `parseExpression` into specialised
 * `array-method` / `higher-order` nodes that the structural body tree models as
 * a generic `call` instead, so a method-call body must not be lowered from this
 * tree (see the guard in `inlineLocalHelperCall`).
 */
function bodyHasMethodCall(body: ParsedExpr): boolean {
  let found = false
  const visit = (n: ParsedExpr): void => {
    if (found) return
    if (n.kind === 'call' && n.callee.kind === 'member') {
      found = true
      return
    }
    forEachValueChild(n, visit)
  }
  visit(body)
  return found
}

/**
 * Re-build `body` with each identifier named in `subs` replaced by the
 * substitution's `ParsedExpr` subtree. A structural rewrite (#2006): the
 * substitution is the arg subtree itself, so operator precedence survives
 * without parenthesisation (the tree *is* the precedence). Non-value identifier
 * positions — the property NAME in `a.b`, a plain `{ k: … }` key — are not
 * visited, so a param sharing a name with a member or key is left untouched.
 * (`isSubstituteSafeBody` has already rejected `{ k }` shorthand keys; nested
 * functions were rejected at conversion, so `arrow-fn` / `higher-order` /
 * `array-method` callbacks never reach here in practice — they pass through
 * unchanged.)
 */
export function substituteHelperParams(
  body: ParsedExpr,
  subs: ReadonlyMap<string, ParsedExpr>,
): ParsedExpr {
  const go = (n: ParsedExpr): ParsedExpr => {
    switch (n.kind) {
      case 'identifier': {
        const sub = subs.get(n.name)
        return sub !== undefined ? sub : n
      }
      // `object-literal` / `unsupported` lower from their `raw` string, so
      // re-lowering structured children would have no effect — leave as-is
      // (a param inside such a node is rejected by the shorthand guard or
      // simply never observed).
      case 'literal':
      case 'object-literal':
      case 'unsupported':
        return n
      case 'member':
        return { ...n, object: go(n.object) }
      case 'index-access':
        return { ...n, object: go(n.object), index: go(n.index) }
      case 'call':
        return { ...n, callee: go(n.callee), args: n.args.map(go) }
      case 'binary':
        return { ...n, left: go(n.left), right: go(n.right) }
      case 'logical':
        return { ...n, left: go(n.left), right: go(n.right) }
      case 'unary':
        return { ...n, argument: go(n.argument) }
      case 'conditional':
        return { ...n, test: go(n.test), consequent: go(n.consequent), alternate: go(n.alternate) }
      case 'template-literal':
        return {
          ...n,
          parts: n.parts.map(p =>
            p.type === 'expression' ? { type: 'expression', expr: go(p.expr) } : p,
          ),
        }
      case 'array-literal':
        return { ...n, elements: n.elements.map(go) }
      case 'arrow-fn':
        return { ...n, body: go(n.body) }
      case 'higher-order':
        return { ...n, object: go(n.object), predicate: go(n.predicate) }
      case 'array-method':
        // `object` is the only re-lowered child; the structured op
        // (comparator / reduceOp / …) is opaque to substitution.
        return { ...n, object: go(n.object) } as ParsedExpr
    }
  }
  return go(body)
}

/**
 * Visit the value-position `ParsedExpr` children of `n` (the property name in
 * `a.b` and a plain `{ k: v }` key are skipped — they aren't value positions;
 * `object-literal` is handled by the caller because its shorthand keys carry a
 * guard).
 */
function forEachValueChild(n: ParsedExpr, visit: (c: ParsedExpr) => void): void {
  switch (n.kind) {
    case 'identifier':
    case 'literal':
    case 'unsupported':
    case 'object-literal':
      return
    case 'member':
      visit(n.object)
      return
    case 'index-access':
      visit(n.object)
      visit(n.index)
      return
    case 'call':
      visit(n.callee)
      n.args.forEach(visit)
      return
    case 'binary':
    case 'logical':
      visit(n.left)
      visit(n.right)
      return
    case 'unary':
      visit(n.argument)
      return
    case 'conditional':
      visit(n.test)
      visit(n.consequent)
      visit(n.alternate)
      return
    case 'template-literal':
      for (const p of n.parts) if (p.type === 'expression') visit(p.expr)
      return
    case 'array-literal':
      n.elements.forEach(visit)
      return
    case 'arrow-fn':
      visit(n.body)
      return
    case 'higher-order':
      visit(n.object)
      visit(n.predicate)
      return
    case 'array-method':
      visit(n.object)
      return
  }
}
