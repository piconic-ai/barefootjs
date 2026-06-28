/**
 * Lower a structured literal `ParsedExpr` (carried on the IR) to a Go literal,
 * for baking a signal's inline initial value into the SSR data context.
 *
 * Covers scalar literals, a unary-minus number, arrays of those, and object
 * literals baked against a concrete local struct.
 *
 * Contract is **null-means-defer**: returns null for anything not reproduced
 * exactly — an object whose target type isn't a known struct, a key the struct
 * doesn't declare, a nested object/array property value, an empty array, an
 * identifier/call, or a numeric literal missing its `raw` token. The caller
 * then keeps `nil`.
 */

import type { ParsedExpr, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

export function parsedLiteralToGo(
  ctx: GoEmitContext,
  expr: ParsedExpr,
  typeInfo?: TypeInfo,
): string | null {
  // Leading unary minus on a numeric literal (`-1`), from the carried `raw`
  // token.
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
        // `value` is the unquoted text; `JSON.stringify` re-quotes it for Go.
        return JSON.stringify(expr.value)
      case 'number':
        // Need the exact source token; without it the value could change
        // spelling / lose precision, so defer.
        return expr.raw ?? null
      case 'boolean':
        return expr.value ? 'true' : 'false'
      case 'null':
        return 'nil'
    }
  }

  if (expr.kind === 'array-literal') {
    // Empty array → null so the field stays nil (JSON-marshals as `null`)
    // rather than an empty slice.
    if (expr.elements.length === 0) return null
    const elemType = typeInfo?.kind === 'array' ? typeInfo.elementType : undefined
    const sliceHeader = typeInfo?.kind === 'array' ? typeInfoToGo(ctx, typeInfo) : '[]interface{}'
    const elems: string[] = []
    for (const el of expr.elements) {
      const go = parsedLiteralToGo(ctx, el, elemType)
      // Any non-scalar element (object / call / identifier) defers the WHOLE
      // array — struct-element baking is owned elsewhere.
      if (go === null) return null
      elems.push(go)
    }
    return `${sliceHeader}{${elems.join(', ')}}`
  }

  if (expr.kind === 'object-literal') {
    // Bake against a concrete local struct only. The struct's field map is the
    // source of truth for each source key's Go field name (and, by omission,
    // which keys it declares); defer when the target type isn't a known struct.
    const goType = typeInfo ? typeInfoToGo(ctx, typeInfo) : 'interface{}'
    const structFields = ctx.state.localStructFields.get(goType)
    if (!structFields) return null
    const entries: string[] = []
    for (const prop of expr.properties) {
      // A shorthand `{ a }` carries an identifier value → lowers to null below
      // and defers the whole object.
      const goField = structFields.get(prop.key)
      if (!goField) return null
      // Nested object/array property values aren't baked here (field types
      // untracked) — defer.
      if (prop.value.kind === 'object-literal' || prop.value.kind === 'array-literal') return null
      const go = parsedLiteralToGo(ctx, prop.value)
      if (go === null) return null
      entries.push(`${goField}: ${go}`)
    }
    return `${goType}{${entries.join(', ')}}`
  }

  // identifier / call / member / … → defer.
  return null
}
