/**
 * Constructor-context expression lowering for derived-state memos.
 *
 * Free functions over a {@link GoEmitContext} that lower the narrow surface of
 * JS expressions a derived-state memo needs into Go *code* (not template
 * syntax) evaluated in the `NewXxxProps` constructor — e.g. a search-param read
 * becomes `in.SearchParams.Get("k")`. `lowerCtorExpr` and `lowerCtorCond` are
 * mutually recursive and set `state.needsStringsImport` when they emit a
 * `strings.*` call. Anything outside the supported surface returns null so the
 * caller can fall back to nil safely.
 */

import { type ParsedExpr } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { CtorLowerEnv } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'

/**
 * Whether `node` is the trailing-slash strip `<recv>.replace(/\/+$/, '')`. The
 * structured parser carries the deferred regex form of `String.replace` as an
 * `array-method` whose first arg is a `regex` node (#2039), so the one pattern
 * the ctor lowering recognises is matched off the IR — no emit-time re-parse.
 * Validates the exact regex pattern and the empty-string replacement.
 */
function isTrailingSlashReplace(node: ParsedExpr): boolean {
  if (node.kind !== 'array-method' || node.method !== 'replace') return false
  const [pattern, replacement] = node.args
  return (
    pattern?.kind === 'regex' &&
    pattern.raw === '/\\/+$/' &&
    replacement?.kind === 'literal' &&
    replacement.literalType === 'string' &&
    replacement.value === ''
  )
}

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
  node: ParsedExpr,
  env: CtorLowerEnv,
): string | null {
  if (node.kind === 'literal' && node.literalType === 'string') {
    return JSON.stringify(node.value)
  }
  if (node.kind === 'literal' && node.literalType === 'number') {
    return node.raw ?? String(node.value)
  }

  // Identifier: a substituted helper param, a module string const, or a
  // component-scope derived const inlined recursively (e.g. `root` → its
  // `base || '/'` value).
  if (node.kind === 'identifier') {
    const sub = env.params.get(node.name)
    if (sub !== undefined) return sub
    const c = ctx.state.localConstants.find(lc => lc.name === node.name)
    if (c?.value !== undefined) {
      if (c.isModule) {
        const lit = c.parsed
        if (lit && lit.kind === 'literal' && lit.literalType === 'string') {
          return JSON.stringify(lit.value)
        }
        return null
      }
      // Component-scope const: inline its computed value, guarding cycles.
      if (env.consts?.has(node.name)) return null
      const inner = c.parsed
      if (!inner) return null
      return lowerCtorExpr(ctx, inner, {
        ...env,
        consts: new Set([...(env.consts ?? []), node.name]),
      })
    }
    return null
  }

  // `props.<X>` → the constructor input field `in.<X>`.
  if (
    node.kind === 'member' &&
    node.object.kind === 'identifier' &&
    node.object.name === ctx.state.propsObjectName &&
    !node.computed
  ) {
    return `in.${capitalizeFieldName(node.property)}`
  }

  if (node.kind === 'call' && node.callee.kind === 'member') {
    const method = node.callee.property
    const recv = node.callee.object
    // `<sp>.get('k')` where the receiver is `searchParams()`: either a local
    // bound to it (`const sp = searchParams()` → `sp.get(...)`, the env path) or
    // — once the block memo is folded (#2040) — the inlined `searchParams()`
    // call directly.
    const isSearchParamsRecv =
      (recv.kind === 'identifier' && env.searchParamsVars.has(recv.name)) ||
      (recv.kind === 'call' &&
        recv.callee.kind === 'identifier' &&
        recv.args.length === 0 &&
        ctx.state.searchParamsLocals.has(recv.callee.name))
    if (
      method === 'get' &&
      isSearchParamsRecv &&
      node.args.length === 1 &&
      node.args[0].kind === 'literal' &&
      node.args[0].literalType === 'string'
    ) {
      return `in.SearchParams.Get(${JSON.stringify(node.args[0].value)})`
    }
    return null
  }

  // `<arr>.includes(<x>)` → bf.Includes(<[]string{…}>, <x>) (bool). The
  // collapsed `parseExpression` folds `.includes` into a generic `array-method`
  // node (not a `call` with a member callee), so it's matched here.
  if (node.kind === 'array-method' && node.method === 'includes' && node.args.length === 1) {
    const arr = lowerCtorStringArray(ctx, node.object)
    const elem = lowerCtorExpr(ctx, node.args[0], env)
    if (arr !== null && elem !== null) return `bf.Includes(${arr}, ${elem})`
    return null
  }

  // `<s>.replace(/\/+$/, '')` — strip trailing slashes → strings.TrimRight. The
  // parser defers the regex form of `String.replace` but carries its shape
  // structurally (an `array-method` replace with a `regex` first arg, #2039), so
  // the one recognized pattern is matched off the IR — no re-parse. Only this
  // exact trailing-slash regex is supported (a general regex replace would need
  // Go's regexp).
  if (node.kind === 'array-method' && node.method === 'replace') {
    if (!isTrailingSlashReplace(node)) return null
    const recvGo = lowerCtorExpr(ctx, node.object, env)
    if (recvGo === null) return null
    ctx.state.needsStringsImport = true
    return `strings.TrimRight(${recvGo}, "/")`
  }

  // `helper(<args>)` where helper is a module arrow const → inline its body.
  if (node.kind === 'call' && node.callee.kind === 'identifier') {
    const calleeName = node.callee.name
    const fnConst = ctx.state.localConstants.find(
      lc => lc.name === calleeName && lc.isModule,
    )
    if (fnConst?.value) {
      const fn = fnConst.parsed
      if (fn && fn.kind === 'arrow' && fn.params.length === node.args.length) {
        const params = new Map(env.params)
        for (let i = 0; i < fn.params.length; i++) {
          const argGo = lowerCtorExpr(ctx, node.args[i], env)
          if (argGo === null) return null
          params.set(fn.params[i], argGo)
        }
        return lowerCtorExpr(ctx, fn.body, { searchParamsVars: env.searchParamsVars, params })
      }
    }
    return null
  }

  // `<expr> ?? <fallback>`
  if (node.kind === 'logical' && node.op === '??') {
    const left = lowerCtorExpr(ctx, node.left, env)
    if (left === null) return null
    const r = node.right
    // `?? ''` is a no-op: SearchParams.Get already returns "" for a missing key.
    if (r.kind === 'literal' && r.literalType === 'string' && r.value === '') {
      return left
    }
    const right = lowerCtorExpr(ctx, node.right, env)
    if (right === null) return null
    return `func() string { v := ${left}; if v != "" { return v }; return ${right} }()`
  }

  // `<expr> || <fallback>` (string `||` — falsy = empty, like `?? ''` but the
  // left can itself be empty): `base || '/'`.
  if (node.kind === 'logical' && node.op === '||') {
    const left = lowerCtorExpr(ctx, node.left, env)
    const right = lowerCtorExpr(ctx, node.right, env)
    if (left === null || right === null) return null
    return `func() string { v := ${left}; if v != "" { return v }; return ${right} }()`
  }

  // `<cond> ? <t> : <f>` (string result)
  if (node.kind === 'conditional') {
    // The condition must be lowered as a *boolean* (`lowerCtorCond`), not a
    // value: a string-valued JS condition like `sp.get('tag') ? a : b` is
    // truthy in JS, but `if "<string>"` does not compile in Go — such shapes
    // return null so the memo falls back to nil rather than emitting invalid Go.
    const cond = lowerCtorCond(ctx, node.test, env)
    const t = lowerCtorExpr(ctx, node.consequent, env)
    const f = lowerCtorExpr(ctx, node.alternate, env)
    if (cond !== null && t !== null && f !== null) {
      return `func() string { if ${cond} { return ${t} }; return ${f} }()`
    }
    return null
  }

  return null
}

/**
 * Lower a JS expression used as a *boolean* condition to a Go bool expression,
 * or null when it is not provably boolean. Distinct from `lowerCtorExpr`, which
 * lowers value expressions: a string-valued condition (`sp.get('tag')`) is
 * truthy in JS but `if "<string>"` does not compile in Go, so anything not
 * known to yield a Go bool must fall back to null.
 */
export function lowerCtorCond(
  ctx: GoEmitContext,
  node: ParsedExpr,
  env: CtorLowerEnv,
): string | null {
  if (node.kind === 'literal' && node.literalType === 'boolean') {
    return String(node.value)
  }

  // `!<cond>`
  if (node.kind === 'unary' && node.op === '!') {
    const inner = lowerCtorCond(ctx, node.argument, env)
    return inner === null ? null : `!(${inner})`
  }

  // `<a> && <b>` / `<a> || <b>` — both operands must themselves be boolean.
  if (node.kind === 'logical' && (node.op === '&&' || node.op === '||')) {
    const op = node.op
    const l = lowerCtorCond(ctx, node.left, env)
    const r = lowerCtorCond(ctx, node.right, env)
    return l !== null && r !== null ? `(${l} ${op} ${r})` : null
  }

  // `<arr>.includes(<x>)` is the one value-shape `lowerCtorExpr` lowers to a
  // Go bool (`bf.Includes(...)`); reuse it for that case only. The collapsed
  // `parseExpression` folds `.includes` into an `array-method` node.
  if (node.kind === 'array-method' && node.method === 'includes') {
    return lowerCtorExpr(ctx, node, env)
  }

  return null
}

/**
 * Resolve a string-array expression (a `['a','b']` literal, or a module const
 * bound to one) to a Go `[]string{…}` literal, or null when it isn't a pure
 * string-array. Used by `lowerCtorExpr` for `<arr>.includes(<x>)`.
 */
export function lowerCtorStringArray(ctx: GoEmitContext, node: ParsedExpr): string | null {
  let arr: ParsedExpr | null = node
  if (node.kind === 'identifier') {
    const c = ctx.state.localConstants.find(lc => lc.name === node.name && lc.isModule)
    if (!c?.value) return null
    arr = c.parsed ?? null
  }
  if (!arr || arr.kind !== 'array-literal') return null
  const elems: string[] = []
  for (const el of arr.elements) {
    if (el.kind === 'literal' && el.literalType === 'string') {
      elems.push(JSON.stringify(el.value))
    } else return null
  }
  return `[]string{${elems.join(', ')}}`
}
