/**
 * Lower a structured literal `ParsedExpr` (carried on the IR by the analyzer)
 * to a Go literal, mirroring `tsLiteralToGo`'s output for the shapes it covers
 * so the signal-init bake can read the tree instead of re-parsing the value
 * string with `ts.createSourceFile`.
 *
 * The contract is **null-means-defer**: this returns null for anything it does
 * not reproduce exactly (object literals — whose struct-field baking lives in
 * `tsLiteralToGo`; empty arrays; identifiers / calls; or a numeric literal
 * whose raw spelling wasn't carried). The caller then falls back to the
 * `ts.createSourceFile` path, so only the shapes reproduced here short-circuit
 * and behaviour stays byte-identical.
 */

import type { ParsedExpr, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

export function parsedLiteralToGo(
  ctx: GoEmitContext,
  expr: ParsedExpr,
  typeInfo?: TypeInfo,
): string | null {
  // Leading unary minus on a numeric literal (`-1`) — mirror
  // `tsLiteralToGo`'s `-${operand.text}` using the carried `raw` token.
  if (
    expr.kind === 'unary' &&
    expr.op === '-' &&
    expr.argument.kind === 'literal' &&
    expr.argument.literalType === 'number'
  ) {
    return expr.argument.raw !== undefined ? `-${expr.argument.raw}` : null
  }

  if (expr.kind === 'literal') {
    switch (expr.literalType) {
      case 'string':
        // `value` is the interpreted (unquoted) text, exactly like
        // `ts.StringLiteral.text`; `JSON.stringify` re-quotes it for Go.
        return JSON.stringify(expr.value)
      case 'number':
        // Need the exact source token (`tsLiteralToGo` returns
        // `NumericLiteral.text`); without it the `parseFloat` value could
        // change spelling / lose precision, so defer.
        return expr.raw ?? null
      case 'boolean':
        return expr.value ? 'true' : 'false'
      case 'null':
        return 'nil'
    }
  }

  if (expr.kind === 'array-literal') {
    // An empty array bakes to nothing in `tsLiteralToGo` (returns null so the
    // field stays nil, JSON-marshalling as `null`). Defer so the fallback
    // reaches that same nil rather than emitting an empty slice.
    if (expr.elements.length === 0) return null
    const elemType = typeInfo?.kind === 'array' ? typeInfo.elementType : undefined
    const sliceHeader = typeInfo?.kind === 'array' ? typeInfoToGo(ctx, typeInfo) : '[]interface{}'
    const elems: string[] = []
    for (const el of expr.elements) {
      const go = parsedLiteralToGo(ctx, el, elemType)
      // Any non-scalar element (an object, a call, an identifier) defers the
      // WHOLE array to the TS path, which owns the struct-element baking.
      if (go === null) return null
      elems.push(go)
    }
    return `${sliceHeader}{${elems.join(', ')}}`
  }

  // object-literal / identifier / call / member / … → defer.
  return null
}
