/**
 * Lower a structured literal `ParsedExpr` (carried on the IR) to a Go literal,
 * for baking a signal's inline initial value into the SSR data context.
 *
 * Covers scalar literals, a unary-minus number, arrays of those, and object
 * literals baked against a concrete local struct — including, per #2087, a
 * struct property whose OWN value is a nested array or object literal
 * (`{ id, cells: ['a', 'b'] }`, `{ id, user: { name: 'Ada' } }`): the struct's
 * declared property TYPE (looked up from `ctx.state.currentTypeDefinitions`)
 * threads through so a typed nested array bakes via the normal array branch
 * below, and a nested INLINE object (one with no named Go struct —
 * `typeInfoToGo`'s `'object'` case always falls back to
 * `map[string]interface{}`) bakes as a capitalized-key Go map literal instead
 * — the same convention `test-render.ts`'s harness-prop baking already uses
 * for object elements, since `html/template`'s map field access is an exact
 * case-sensitive `MapIndex`.
 *
 * Contract is **null-means-defer**: returns null for anything not reproduced
 * exactly — an object whose target type isn't a known struct, a key the struct
 * doesn't declare, an empty array, an identifier/call, or a numeric literal
 * missing its `raw` token. The caller then keeps `nil`.
 */

import type { ParsedExpr, TypeDefinition, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

/**
 * Look up a struct property's declared `TypeInfo` by source key, from the
 * user's own `TypeDefinition` (not a synthesized struct — those only arise
 * from an UNTYPED literal, which never carries nested object/array elements
 * because `synthesizeStructFromSignal` requires every property value to be a
 * scalar literal). Returns undefined when the struct name isn't a user type
 * or the key isn't declared — callers treat that as "nested type unknown"
 * and fall back to the generic/inline lowering.
 */
function structPropertyType(ctx: GoEmitContext, structGoType: string, key: string): TypeInfo | undefined {
  const td = ctx.state.currentTypeDefinitions.find((t: TypeDefinition) => t.name === structGoType)
  return td?.properties?.find(p => p.name === key)?.type
}

/**
 * Bake a nested INLINE object-literal property value — one whose declared
 * type has no named Go struct (`user: { name: string }` lowers its field to
 * `map[string]interface{}`, not a struct) — as a Go map literal with
 * CAPITALIZED keys, recursing for further nesting. `html/template`'s dot
 * access on a map value does an exact-string `MapIndex`, so a template
 * action like `.User.Name` only resolves when the baked key is literally
 * `"Name"`, not the source-cased `"name"` — mirrors the same convention
 * `test-render.ts`'s `goArrayLiteralFromArray` uses for object elements
 * passed as harness props.
 */
function bakeInlineObjectAsGoMap(ctx: GoEmitContext, expr: ParsedExpr): string | null {
  if (expr.kind !== 'object-literal') return null
  const entries: string[] = []
  for (const prop of expr.properties) {
    if (prop.shorthand) return null
    const go =
      prop.value.kind === 'object-literal'
        ? bakeInlineObjectAsGoMap(ctx, prop.value)
        : parsedLiteralToGo(ctx, prop.value)
    if (go === null) return null
    entries.push(`${JSON.stringify(capitalizeFieldName(prop.key))}: ${go}`)
  }
  return `map[string]interface{}{${entries.join(', ')}}`
}

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
      const propType = structPropertyType(ctx, goType, prop.key)
      let go: string | null
      if (prop.value.kind === 'array-literal') {
        // A nested array property (`cells: readonly string[]`, #2087):
        // thread the struct's own declared property type through so the
        // array branch below bakes a properly-typed slice (`[]string{…}`)
        // instead of deferring.
        go = parsedLiteralToGo(ctx, prop.value, propType)
      } else if (prop.value.kind === 'object-literal') {
        // A nested object property (`user: { name: string }`, #2087): bake
        // against a named struct if the declared type resolves to one,
        // else fall back to the capitalized-key inline-map convention.
        const nestedGoType = propType ? typeInfoToGo(ctx, propType) : undefined
        go =
          nestedGoType && ctx.state.localStructFields.has(nestedGoType)
            ? parsedLiteralToGo(ctx, prop.value, propType)
            : bakeInlineObjectAsGoMap(ctx, prop.value)
      } else {
        go = parsedLiteralToGo(ctx, prop.value)
      }
      if (go === null) return null
      entries.push(`${goField}: ${go}`)
    }
    return `${goType}{${entries.join(', ')}}`
  }

  // identifier / call / member / … → defer.
  return null
}
