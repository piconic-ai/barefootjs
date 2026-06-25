/**
 * Constructor-context expression lowering (#1897 PostList derived state).
 *
 * Pure free functions over a {@link GoEmitContext} that lower the narrow
 * surface of JS expressions a derived-state memo needs into Go *code* (not
 * template syntax) evaluated in the `NewXxxProps` constructor — e.g. a
 * search-param read becomes `in.SearchParams.Get("k")`. Mutually recursive
 * (`lowerCtorExpr` ↔ `lowerCtorCond`), they read the context's
 * `state.localConstants` / `state.propsObjectName` / `state.needsStringsImport`
 * and `parseLiteralExpression`. Anything outside the supported surface returns
 * null so the caller can fall back to nil safely.
 */

import ts from 'typescript'

import type { GoEmitContext } from '../emit-context.ts'
import type { CtorLowerEnv } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'

/**
 * Lower a JS expression to a Go expression in the `NewXxxProps` constructor
 * context. This is Go *code*, not template syntax — so a search-param read
 * becomes `in.SearchParams.Get("k")` (method call), not the template's
 * `.SearchParams.Get "k"`. Supports the narrow surface derived-state memos
 * need: string/number literals, `<sp>.get('k')`, `<arr>.includes(<x>)`,
 * module arrow-helper inlining, `<expr> ?? <fallback>`, and string ternaries.
 * Returns null for anything else so the caller can fall back safely.
 */
export function lowerCtorExpr(
  ctx: GoEmitContext,
  node: ts.Expression,
  env: CtorLowerEnv,
): string | null {
  while (ts.isParenthesizedExpression(node)) node = node.expression

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return JSON.stringify(node.text)
  }
  if (ts.isNumericLiteral(node)) return node.text

  // Identifier: a substituted helper param, a module string const, or a
  // component-scope derived const inlined recursively (e.g. `root` → its
  // `base || '/'` value).
  if (ts.isIdentifier(node)) {
    const sub = env.params.get(node.text)
    if (sub !== undefined) return sub
    const c = ctx.state.localConstants.find(lc => lc.name === node.text)
    if (c?.value !== undefined) {
      if (c.isModule) {
        const lit = ctx.parseLiteralExpression(c.value)
        if (lit && (ts.isStringLiteral(lit) || ts.isNoSubstitutionTemplateLiteral(lit))) {
          return JSON.stringify(lit.text)
        }
        return null
      }
      // Component-scope const: inline its computed value, guarding cycles.
      if (env.consts?.has(node.text)) return null
      const inner = ctx.parseLiteralExpression(c.value)
      if (!inner) return null
      return lowerCtorExpr(ctx, inner, {
        ...env,
        consts: new Set([...(env.consts ?? []), node.text]),
      })
    }
    return null
  }

  // `props.<X>` → the constructor input field `in.<X>`.
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === ctx.state.propsObjectName
  ) {
    return `in.${capitalizeFieldName(node.name.text)}`
  }

  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text
    const recv = node.expression.expression
    // `<sp>.get('k')` where <sp> is bound to searchParams().
    if (
      method === 'get' &&
      ts.isIdentifier(recv) &&
      env.searchParamsVars.has(recv.text) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      return `in.SearchParams.Get(${JSON.stringify(node.arguments[0].text)})`
    }
    // `<arr>.includes(<x>)` → bf.Includes(<[]string{…}>, <x>) (bool).
    if (method === 'includes' && node.arguments.length === 1) {
      const arr = lowerCtorStringArray(ctx, recv)
      const elem = lowerCtorExpr(ctx, node.arguments[0], env)
      if (arr !== null && elem !== null) return `bf.Includes(${arr}, ${elem})`
      return null
    }
    // `<s>.replace(/\/+$/, '')` — strip trailing slashes → strings.TrimRight.
    // Only this exact trailing-slash regex is recognized (a general regex
    // replace would need Go's regexp; out of scope).
    if (
      method === 'replace' &&
      node.arguments.length === 2 &&
      node.arguments[0].kind === ts.SyntaxKind.RegularExpressionLiteral &&
      (node.arguments[0] as ts.Node).getText() === '/\\/+$/' &&
      (ts.isStringLiteral(node.arguments[1]) ||
        ts.isNoSubstitutionTemplateLiteral(node.arguments[1])) &&
      node.arguments[1].text === ''
    ) {
      const recvGo = lowerCtorExpr(ctx, recv, env)
      if (recvGo === null) return null
      ctx.state.needsStringsImport = true
      return `strings.TrimRight(${recvGo}, "/")`
    }
    return null
  }

  // `helper(<args>)` where helper is a module arrow const → inline its body.
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const fnConst = ctx.state.localConstants.find(
      lc => lc.name === (node.expression as ts.Identifier).text && lc.isModule,
    )
    if (fnConst?.value) {
      const fn = ctx.parseLiteralExpression(fnConst.value)
      if (
        fn &&
        ts.isArrowFunction(fn) &&
        !ts.isBlock(fn.body) &&
        fn.parameters.length === node.arguments.length
      ) {
        const params = new Map(env.params)
        for (let i = 0; i < fn.parameters.length; i++) {
          const p = fn.parameters[i]
          if (!ts.isIdentifier(p.name)) return null
          const argGo = lowerCtorExpr(ctx, node.arguments[i], env)
          if (argGo === null) return null
          params.set(p.name.text, argGo)
        }
        return lowerCtorExpr(ctx, fn.body, { searchParamsVars: env.searchParamsVars, params })
      }
    }
    return null
  }

  // `<expr> ?? <fallback>`
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    const left = lowerCtorExpr(ctx, node.left, env)
    if (left === null) return null
    let r: ts.Expression = node.right
    while (ts.isParenthesizedExpression(r)) r = r.expression
    // `?? ''` is a no-op: SearchParams.Get already returns "" for a missing key.
    if ((ts.isStringLiteral(r) || ts.isNoSubstitutionTemplateLiteral(r)) && r.text === '') {
      return left
    }
    const right = lowerCtorExpr(ctx, node.right, env)
    if (right === null) return null
    return `func() string { v := ${left}; if v != "" { return v }; return ${right} }()`
  }

  // `<expr> || <fallback>` (string `||` — falsy = empty, like `?? ''` but the
  // left can itself be empty): `base || '/'`.
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.BarBarToken
  ) {
    const left = lowerCtorExpr(ctx, node.left, env)
    const right = lowerCtorExpr(ctx, node.right, env)
    if (left === null || right === null) return null
    return `func() string { v := ${left}; if v != "" { return v }; return ${right} }()`
  }

  // `<cond> ? <t> : <f>` (string result)
  if (ts.isConditionalExpression(node)) {
    // The condition must be lowered as a *boolean* (`lowerCtorCond`), not a
    // value: a string-valued JS condition like `sp.get('tag') ? a : b` is
    // truthy in JS, but `if "<string>"` does not compile in Go — such shapes
    // return null so the memo falls back to nil rather than emitting invalid
    // code (#1941 review).
    const cond = lowerCtorCond(ctx, node.condition, env)
    const t = lowerCtorExpr(ctx, node.whenTrue, env)
    const f = lowerCtorExpr(ctx, node.whenFalse, env)
    if (cond !== null && t !== null && f !== null) {
      return `func() string { if ${cond} { return ${t} }; return ${f} }()`
    }
    return null
  }

  return null
}

/**
 * Lower a JS expression used as a *boolean* condition to a Go bool expression,
 * or null when it is not provably boolean. Distinct from `lowerCtorExpr`,
 * which lowers value expressions: a string-valued condition (`sp.get('tag')`)
 * is truthy in JS but `if "<string>"` does not compile in Go, so anything not
 * known to yield a Go bool must fall back to null (#1941 review).
 */
export function lowerCtorCond(
  ctx: GoEmitContext,
  node: ts.Expression,
  env: CtorLowerEnv,
): string | null {
  while (ts.isParenthesizedExpression(node)) node = node.expression

  if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true'
  if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false'

  // `!<cond>`
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.ExclamationToken
  ) {
    const inner = lowerCtorCond(ctx, node.operand, env)
    return inner === null ? null : `!(${inner})`
  }

  // `<a> && <b>` / `<a> || <b>` — both operands must themselves be boolean.
  if (ts.isBinaryExpression(node)) {
    const op =
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        ? '&&'
        : node.operatorToken.kind === ts.SyntaxKind.BarBarToken
          ? '||'
          : null
    if (op) {
      const l = lowerCtorCond(ctx, node.left, env)
      const r = lowerCtorCond(ctx, node.right, env)
      return l !== null && r !== null ? `(${l} ${op} ${r})` : null
    }
  }

  // `<arr>.includes(<x>)` is the one value-shape `lowerCtorExpr` lowers to a
  // Go bool (`bf.Includes(...)`); reuse it for that case only.
  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'includes'
  ) {
    return lowerCtorExpr(ctx, node, env)
  }

  return null
}

/**
 * Resolve a string-array expression (a `['a','b']` literal, or a module const
 * bound to one) to a Go `[]string{…}` literal, or null when it isn't a pure
 * string-array. Used by `lowerCtorExpr` for `<arr>.includes(<x>)`.
 */
export function lowerCtorStringArray(ctx: GoEmitContext, node: ts.Expression): string | null {
  let arr: ts.Expression | null = node
  if (ts.isIdentifier(node)) {
    const c = ctx.state.localConstants.find(lc => lc.name === node.text && lc.isModule)
    if (!c?.value) return null
    arr = ctx.parseLiteralExpression(c.value)
  }
  if (!arr || !ts.isArrayLiteralExpression(arr)) return null
  const elems: string[] = []
  for (const el of arr.elements) {
    if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
      elems.push(JSON.stringify(el.text))
    } else return null
  }
  return `[]string{${elems.join(', ')}}`
}
