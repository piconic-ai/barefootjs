/**
 * Template-literal memo lowering.
 *
 * Pure free functions over a {@link GoEmitContext} that compute the SSR initial
 * value of a template-literal memo (`() => `${a} ${props.x ?? ''} grid``) as a
 * Go `string` expression. Each quasi becomes a Go string literal; each
 * interpolation resolves to a module string const, a `Record`-index access, or
 * a `props.<name>` field read. They read the context's `state.localConstants` /
 * `state.propsObjectName` / `state.usesFmt` and `resolveModuleStringConst`.
 */

import ts from 'typescript'

import { parseRecordIndexAccess } from '@barefootjs/jsx'
import type { TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { escapeGoString } from '../lib/go-emit.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'

/**
 * (#checkbox) Compute the SSR initial value of a template-literal memo as a
 * Go `string` expression. The memo computation looks like
 * `() => `${a} ${b} ${props.className ?? ''} grid place-content-center``.
 *
 * Each quasi (literal text span) becomes a Go string literal; each
 * interpolation is resolved:
 *   - an identifier naming a module string const → its inlined literal
 *     (covers both pure-string and `[...].join(' ')` consts);
 *   - `props.<name> ?? '<fallback>'` or bare `props.<name>` → `in.<Field>`
 *     when `<name>` is a known prop param (typed `string`); the `?? ''`
 *     fallback maps to Go's zero value for an unset string field, matching
 *     the Hono reference's empty-string result.
 *
 * Returns the `"a" + in.Field + " grid..."` concatenation, or null when the
 * computation isn't a single template literal or any interpolation isn't
 * representable (so the caller keeps its existing pattern matching).
 */
export function computeTemplateLiteralMemoInitialValue(
  ctx: GoEmitContext,
  computation: string,
  propsParams: { name: string; type?: TypeInfo; defaultValue?: string }[],
): string | null {
  const sf = ts.createSourceFile(
    '__memo.ts',
    `const __x = (${computation});`,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
  )
  const stmt = sf.statements[0]
  if (!stmt || !ts.isVariableStatement(stmt)) return null
  let init = stmt.declarationList.declarations[0]?.initializer
  while (init && ts.isParenthesizedExpression(init)) init = init.expression
  if (!init || !ts.isArrowFunction(init)) return null
  let body = init.body as ts.Node
  while (ts.isParenthesizedExpression(body as ts.Expression)) {
    body = (body as ts.ParenthesizedExpression).expression
  }

  // Block-bodied arrow (the Toggle `classes` memo): collect leading
  // `const X = props.Y ?? 'lit'` key bindings, then resolve against the
  // single returned template literal. The bindings let `variantClasses[variant]`
  // resolve `variant` to prop `variant` with its `'default'` fallback key.
  const localKeyBindings = new Map<string, { propName: string; defaultLiteral?: string }>()
  if (ts.isBlock(body)) {
    let returned: ts.Node | null = null
    for (const s of body.statements) {
      if (ts.isVariableStatement(s)) {
        for (const d of s.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || !d.initializer) continue
          const binding = parseLocalKeyBinding(ctx, d.initializer)
          if (binding) localKeyBindings.set(d.name.text, binding)
        }
      } else if (ts.isReturnStatement(s) && s.expression) {
        returned = s.expression
      } else if (ts.isExpressionStatement(s) || ts.isEmptyStatement(s)) {
        // ignore
      } else {
        return null // unsupported statement shape — bail to existing patterns
      }
    }
    if (!returned) return null
    body = returned
    while (ts.isParenthesizedExpression(body as ts.Expression)) {
      body = (body as ts.ParenthesizedExpression).expression
    }
  }

  if (!ts.isTemplateExpression(body) && !ts.isNoSubstitutionTemplateLiteral(body)) {
    return null
  }
  const propNames = new Set(propsParams.map(p => p.name))
  const escGo = (s: string) => `"${escapeGoString(s)}"`
  const segments: string[] = []

  if (ts.isNoSubstitutionTemplateLiteral(body)) {
    return escGo(body.text)
  }
  // head + each span
  if (body.head.text) segments.push(escGo(body.head.text))
  for (const span of body.templateSpans) {
    const resolved = resolveTemplateInterpolation(ctx, span.expression, propNames, localKeyBindings)
    if (resolved === null) return null
    segments.push(resolved)
    if (span.literal.text) segments.push(escGo(span.literal.text))
  }
  if (segments.length === 0) return '""'
  return segments.join(' + ')
}

/**
 * (#checkbox) Resolve one `${expr}` interpolation of a template-literal memo
 * to a Go string expression, or null when unsupported. See
 * `computeTemplateLiteralMemoInitialValue` for the supported shapes.
 */
export function resolveTemplateInterpolation(
  ctx: GoEmitContext,
  expr: ts.Expression,
  propNames: Set<string>,
  localKeyBindings: ReadonlyMap<string, { propName: string; defaultLiteral?: string }> = new Map(),
): string | null {
  let node: ts.Expression = expr
  while (ts.isParenthesizedExpression(node)) node = node.expression

  // Identifier → module string const inline.
  if (ts.isIdentifier(node)) {
    const inlined = ctx.resolveModuleStringConst(node.text)
    if (inlined !== null) return inlined
    return null
  }

  // `recordConst[key]` → inline indexed Go map (the Toggle `classes` memo's
  // `variantClasses[variant]` / `sizeClasses[size]`).
  if (ts.isElementAccessExpression(node)) {
    const indexed = recordIndexInterpolationToGo(ctx, node, propNames, localKeyBindings)
    if (indexed !== null) return indexed
    return null
  }

  // `props.X ?? '...'` — string-typed prop with an empty-string fallback.
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    const right = node.right
    const isEmptyStr =
      (ts.isStringLiteral(right) || ts.isNoSubstitutionTemplateLiteral(right)) &&
      right.text === ''
    const propName = propsAccessName(ctx, node.left)
    if (propName && propNames.has(propName) && isEmptyStr) {
      // Unset string field is "" in Go — same as `?? ''`.
      return `in.${capitalizeFieldName(propName)}`
    }
    return null
  }

  // Bare `props.X` (string-typed prop).
  const propName = propsAccessName(ctx, node)
  if (propName && propNames.has(propName)) {
    return `in.${capitalizeFieldName(propName)}`
  }
  return null
}

/**
 * Parse a memo-local `const X = …` initializer into a `Record`-index key
 * binding: `props.Y ?? 'lit'` → `{ propName: 'Y', defaultLiteral: 'lit' }`,
 * or bare `props.Y` → `{ propName: 'Y' }`. Returns null for any other shape
 * (a literal const, a call, etc.) so it simply isn't registered as a key.
 */
export function parseLocalKeyBinding(
  ctx: GoEmitContext,
  init: ts.Expression,
): { propName: string; defaultLiteral?: string } | null {
  let node: ts.Expression = init
  while (ts.isParenthesizedExpression(node)) node = node.expression
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
  ) {
    const propName = propsAccessName(ctx, node.left)
    const right = node.right
    if (
      propName &&
      (ts.isStringLiteral(right) || ts.isNoSubstitutionTemplateLiteral(right))
    ) {
      return { propName, defaultLiteral: right.text }
    }
    return null
  }
  const propName = propsAccessName(ctx, node)
  if (propName) return { propName }
  return null
}

/**
 * Lower a `recordConst[key]` interpolation to an inline indexed Go map,
 * emitting `map[string]string{…}[fmt.Sprint(in.Field)]` (or `map[string]any`
 * for mixed values). `key` is a bare prop or a memo-local const bound to
 * `props.X ?? 'default'` (resolved via `localKeyBindings`); a `'default'`
 * fallback also maps `""` to that entry, so an unset prop (Go zero value `""`)
 * renders the default — matching Hono's `props.X ?? 'default'`. Returns null
 * for any non-record / non-resolvable key so the caller falls through.
 */
export function recordIndexInterpolationToGo(
  ctx: GoEmitContext,
  node: ts.ElementAccessExpression,
  propNames: Set<string>,
  localKeyBindings: ReadonlyMap<string, { propName: string; defaultLiteral?: string }>,
): string | null {
  const parsed = parseRecordIndexAccess(
    node,
    ctx.state.localConstants ?? [],
    [...propNames].map(name => ({ name })),
    name => localKeyBindings.get(name) ?? null,
  )
  if (!parsed) return null
  const goVal = (v: { kind: 'number' | 'string'; text: string }) =>
    v.kind === 'number' ? v.text : JSON.stringify(v.text)
  const entries = parsed.entries.map(e => `${JSON.stringify(e.key)}: ${goVal(e.value)}`)
  if (parsed.defaultKey !== undefined) {
    const def = parsed.entries.find(e => e.key === parsed.defaultKey)
    if (def) entries.unshift(`"": ${goVal(def.value)}`)
  }
  const allString = parsed.entries.every(e => e.value.kind === 'string')
  const mapType = allString ? 'map[string]string' : 'map[string]any'
  ctx.state.usesFmt = true
  return `${mapType}{${entries.join(', ')}}[fmt.Sprint(in.${capitalizeFieldName(parsed.indexPropName)})]`
}

/**
 * If `node` is a `<propsObjectName>.<name>` access, return `<name>`, else
 * null. Used to recognize props-object reads inside memo interpolations.
 */
export function propsAccessName(ctx: GoEmitContext, node: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(node)) return null
  if (!ts.isIdentifier(node.expression)) return null
  if (!ctx.state.propsObjectName || node.expression.text !== ctx.state.propsObjectName) return null
  return node.name.text
}
