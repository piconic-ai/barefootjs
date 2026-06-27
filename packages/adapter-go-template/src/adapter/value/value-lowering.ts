/**
 * Value lowering: convert a JS signal/const initial value into a Go literal for
 * the SSR data context — scalars, prop references, and fully-literal
 * arrays/objects — falling back to `nil`/`0` for anything not reducible to a
 * literal. Pure free functions over a {@link GoEmitContext}.
 */

import type { ParsedExpr, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { PropFallbackVar } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { parsedLiteralToGo } from './parsed-literal-to-go.ts'

/** Default for `getSignalInitialValueAsGo`'s optional fallback-var map. */
const EMPTY_PROP_FALLBACK_VARS: ReadonlyMap<string, PropFallbackVar> = new Map()

/**
 * Lower a signal/const initial value to its Go SSR literal.
 *
 * @param value     the initial-value source text
 * @param preParsed the analyzer's structured parse of `value`, when available
 * @returns the Go literal; `in.<Field>` for a prop reference; or the type's
 *   zero (`nil` / `0` / `""`) when `value` is not a bakeable literal
 */
export function convertInitialValue(
  ctx: GoEmitContext,
  value: string,
  typeInfo: TypeInfo,
  propsParams?: { name: string }[],
  preParsed?: ParsedExpr,
): string {
  // A bare identifier matching a props param → its input field.
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    if (propsParams?.some(p => p.name === value)) {
      return `in.${capitalizeFieldName(value)}`
    }
  }

  // `props.X ?? …` referencing a props param → its input field.
  const propName = ctx.extractPropNameFromInitialValue(value)
  if (propName && propsParams?.some(p => p.name === propName)) {
    return `in.${capitalizeFieldName(propName)}`
  }

  if (typeInfo.kind === 'primitive') {
    if (typeInfo.primitive === 'boolean') {
      return value === 'true' ? 'true' : 'false'
    }
    if (typeInfo.primitive === 'number') {
      if (/^\d+$/.test(value)) return value
      if (/^\d+\.\d+$/.test(value)) return value
      return '0'
    }
    if (typeInfo.primitive === 'string') {
      // Normalize single-quoted / unquoted source to a Go string literal.
      if (value.startsWith("'") || value.endsWith("'")) {
        return value.replace(/'/g, '"')
      }
      if (value.startsWith('"') && value.endsWith('"')) {
        return value
      }
      return '""'
    }
  }

  // Bake a fully-literal array into a Go slice literal so the SSR context
  // carries the items, element-type-aware so it both compiles and renders
  // (`[]string{…}` / `[]Item{Item{ID: …}}`). A call / identifier / empty array /
  // object-in-`[]interface{}` yields null → keep `nil`.
  if (typeInfo.kind === 'array') {
    return jsLiteralToGo(ctx, typeInfo, preParsed) ?? 'nil'
  }

  // String alias (e.g. `type Filter = string`) → the string value, not nil.
  if (typeInfo.kind === 'interface' && typeInfo.raw) {
    const aliasBase = ctx.state.localTypeAliases.get(typeInfo.raw)
    if (aliasBase === 'string') {
      if (value.startsWith("'") || value.startsWith('"')) {
        return value.replace(/'/g, '"')
      }
      return '""'
    }
  }

  // Default for complex expressions
  return 'nil'
}

/**
 * Lower a fully-literal value — from the analyzer's carried `ParsedExpr` tree —
 * to a Go literal typed as `typeInfo`:
 *
 *   `["x", "y"]`    (string[])  → `[]string{"x", "y"}`
 *   `["x", "y"]`    (unknown[]) → `[]interface{}{"x", "y"}`
 *   `[{ id: "a" }]` (Item[])    → `[]Item{Item{ID: "a"}}`
 *
 * @returns `null` (→ caller keeps `nil`) when no tree was carried, the tree
 *   isn't a pure literal, or it can't be expressed in the target Go type
 *   without a render/compile mismatch (e.g. an object element in a
 *   `[]interface{}`, unreachable via the template's struct-field access).
 */
export function jsLiteralToGo(
  ctx: GoEmitContext,
  typeInfo: TypeInfo,
  preParsed?: ParsedExpr,
): string | null {
  // `parsedLiteralToGo` reproduces every bakeable shape (scalars, unary-minus
  // number, scalar arrays, objects against a local struct) and returns null to
  // keep `nil` for anything else.
  if (preParsed) {
    const structured = parsedLiteralToGo(ctx, preParsed, typeInfo)
    if (structured !== null) return structured
  }
  return null
}

/**
 * Bake a flat object literal (`{ align: 'start' }`) into a Go
 * `map[string]interface{}` keyed by the SOURCE property names, so it
 * round-trips through `bf_json` like `JSON.stringify` — only the supplied keys,
 * no zero-filled struct fields. Used for an inline object passed to a child's
 * optional object prop (`<Carousel opts={{ align: 'start' }}>`).
 *
 * @returns `null` for a non-object-literal, a shorthand property, a nested
 *   object/array value, or an empty object.
 */
export function objectLiteralToGoMap(ctx: GoEmitContext, expr: ParsedExpr): string | null {
  if (expr.kind !== 'object-literal') return null
  const entries: string[] = []
  for (const prop of expr.properties) {
    // Shorthand `{ a }` (identifier value) is unsupported.
    if (prop.shorthand) return null
    // Scalar lowering (no typeInfo); a nested object/array value defers to null.
    const val = parsedLiteralToGo(ctx, prop.value)
    if (val === null) return null
    entries.push(`${JSON.stringify(prop.key)}: ${val}`)
  }
  if (entries.length === 0) return null
  return `map[string]interface{}{${entries.join(', ')}}`
}

/**
 * Get a signal's initial value as Go code — a literal (`0`, `true`, `"str"`) or
 * a props reference.
 *
 * @param propFallbackVars when the signal is `props.X ?? N` and the caller
 *   hoisted a fallback var for `X`, its name is returned so the memo inherits
 *   the signal-time fallback.
 * @returns the Go expression, or `0` for an unrecognized value
 */
export function getSignalInitialValueAsGo(
  ctx: GoEmitContext,
  initialValue: string,
  propsParams: { name: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
): string {
  // A bare props-param reference → its input field (or the hoisted fallback var).
  if (propsParams.some(p => p.name === initialValue)) {
    const hoisted = propFallbackVars.get(initialValue)
    if (hoisted) return hoisted.varName
    return `in.${capitalizeFieldName(initialValue)}`
  }

  // `props.X ?? …` referencing a props param → its input field / fallback var.
  const propName = ctx.extractPropNameFromInitialValue(initialValue)
  if (propName && propsParams.some(p => p.name === propName)) {
    const hoisted = propFallbackVars.get(propName)
    if (hoisted) return hoisted.varName
    return `in.${capitalizeFieldName(propName)}`
  }

  // Literals pass through (single quotes normalized to Go double quotes).
  if (/^-?\d+$/.test(initialValue)) {
    return initialValue
  }
  if (/^-?\d+\.\d+$/.test(initialValue)) {
    return initialValue
  }
  if (initialValue === 'true' || initialValue === 'false') {
    return initialValue
  }
  if ((initialValue.startsWith("'") && initialValue.endsWith("'")) ||
      (initialValue.startsWith('"') && initialValue.endsWith('"'))) {
    return initialValue.replace(/'/g, '"')
  }

  return '0'
}
