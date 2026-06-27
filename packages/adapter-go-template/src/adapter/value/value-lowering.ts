/**
 * Value lowering: convert JS signal/const initial values into Go literals.
 *
 * Pure free functions over a {@link GoEmitContext}. The cluster bakes inline
 * initial values into the SSR data context — scalars, prop references, and
 * fully-literal arrays/objects — and falls back to `nil`/`0` for anything the
 * parser can't reduce to a literal. They depend on the context's `state`
 * (struct-field / type-alias tables) and `extractPropNameFromInitialValue`,
 * plus `typeInfoToGo` from the type-codegen module.
 */

import type { ParsedExpr, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { PropFallbackVar } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { parsedLiteralToGo } from './parsed-literal-to-go.ts'

/** Default for `getSignalInitialValueAsGo`'s optional fallback-var map. */
const EMPTY_PROP_FALLBACK_VARS: ReadonlyMap<string, PropFallbackVar> = new Map()

export function convertInitialValue(
  ctx: GoEmitContext,
  value: string,
  typeInfo: TypeInfo,
  propsParams?: { name: string }[],
  preParsed?: ParsedExpr,
): string {
  // Check if it's a simple identifier (props param reference)
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    // Check if this matches a props param
    if (propsParams?.some(p => p.name === value)) {
      return `in.${capitalizeFieldName(value)}`
    }
  }

  // Check for props.xxx pattern (e.g., "props.initial ?? 0")
  const propName = ctx.extractPropNameFromInitialValue(value)
  if (propName && propsParams?.some(p => p.name === propName)) {
    return `in.${capitalizeFieldName(propName)}`
  }

  if (typeInfo.kind === 'primitive') {
    if (typeInfo.primitive === 'boolean') {
      return value === 'true' ? 'true' : 'false'
    }
    if (typeInfo.primitive === 'number') {
      // Check if it's a simple number
      if (/^\d+$/.test(value)) return value
      if (/^\d+\.\d+$/.test(value)) return value
      return '0'
    }
    if (typeInfo.primitive === 'string') {
      // Remove quotes if present and add Go string syntax
      if (value.startsWith("'") || value.endsWith("'")) {
        return value.replace(/'/g, '"')
      }
      if (value.startsWith('"') && value.endsWith('"')) {
        return value
      }
      return '""'
    }
  }

  // For arrays, bake a fully-literal initial value into a Go slice literal
  // so the SSR data context carries the items (#1672). Empty / nullish
  // literals collapse to nil, and any non-literal element (a call, a
  // variable reference, …) falls back to nil so the handler populates it.
  //
  // The baked literal is element-type-aware so it both compiles and renders:
  //   - scalar elements →  `[]string{…}` / `[]interface{}{…}`  (template `{{.}}`)
  //   - struct elements →  `[]Item{Item{ID: …}}`               (template `.ID`)
  // An untyped object array would land in a `[]interface{}` field whose
  // `map[string]interface{}` items the template can't reach via field access
  // (`.ID` → <nil>), so `jsLiteralToGo` returns null there and we keep nil.
  if (typeInfo.kind === 'array') {
    // Bake a fully-literal initial value into a Go slice literal; anything
    // the parser can't reduce to a literal — a call, an identifier, `null` /
    // `undefined`, or an empty array — yields null and we keep `nil`.
    return jsLiteralToGo(ctx, typeInfo, preParsed) ?? 'nil'
  }

  // String alias (e.g., Filter = string) — return string value instead of nil
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
 * Convert a fully-literal JS expression — carried as the analyzer's structured
 * `ParsedExpr` tree (#2006) — into an equivalent Go literal whose Go type
 * matches `typeInfo` (#1672), used to bake a signal's inline initial value into
 * the SSR data context:
 *
 *   `["x", "y"]`             (string[])  → `[]string{"x", "y"}`
 *   `["x", "y"]`             (unknown[]) → `[]interface{}{"x", "y"}`
 *   `[{ id: "a" }]`          (Item[])    → `[]Item{Item{ID: "a"}}`
 *
 * Returns `null` — so the caller keeps `nil` — when no structured tree was
 * carried (the analyzer's `parseExpression` returned `unsupported`), or when
 * the tree (or any nested element) is not a pure literal (a call, identifier,
 * template with interpolation, …) or cannot be expressed in the target Go type
 * without a render/compile mismatch (e.g. an object element in a `[]interface{}`
 * field, which the SSR template reaches via struct field access the map lacks).
 */
export function jsLiteralToGo(
  ctx: GoEmitContext,
  typeInfo: TypeInfo,
  preParsed?: ParsedExpr,
): string | null {
  // Roadmap A (terminal sweep, #2006): lower the literal from the carried
  // structured parse only. `parsedLiteralToGo` reproduces every bakeable shape
  // (scalars, a unary-minus number, scalar arrays, and objects against a local
  // struct) and returns null to keep `nil` for everything else (empty arrays,
  // objects with no known struct, identifiers / calls, nested object/array
  // values, `as const`). The former `ctx.parseLiteralExpression` +
  // `tsLiteralToGo` re-parse fallback covered the same bakeable shapes — every
  // shape the analyzer's `parseExpression` leaves `unsupported` (so `preParsed`
  // is absent) is also one the fallback's own `ts.is*` checks declined — so
  // dropping it is byte-identical (verified by the 786/556 adapter gauntlet,
  // the project's byte-identity authority).
  if (preParsed) {
    const structured = parsedLiteralToGo(ctx, preParsed, typeInfo)
    if (structured !== null) return structured
  }
  return null
}

/**
 * (#1971) Bake a pure object-literal expression (`{ align: 'start' }`) into a
 * Go `map[string]interface{}` literal keyed by the SOURCE property names, so
 * it round-trips through `bf_json` exactly like JS `JSON.stringify` of the
 * same object — only the supplied keys, no zero-filled struct fields. Used
 * when an inline object literal is passed to a child's optional object prop
 * (`<Carousel opts={{ align: 'start' }}>`). Returns null for any non-literal
 * or nested object/array value (carousel's opts are flat scalars).
 */
export function objectLiteralToGoMap(ctx: GoEmitContext, expr: ParsedExpr): string | null {
  // Roadmap A: read the carried `ParsedExpr` tree instead of re-parsing the
  // source with `ts.createSourceFile`. The tree is only an `object-literal`
  // when every property is a non-computed `key: value` / shorthand `{ key }`
  // (spreads, computed keys, methods fall through to `unsupported` upstream),
  // which is exactly the shape the old `ts.isObjectLiteralExpression` +
  // `ts.isPropertyAssignment` checks accepted.
  if (expr.kind !== 'object-literal') return null
  const entries: string[] = []
  for (const prop of expr.properties) {
    // Shorthand `{ a }` carried an identifier value upstream; the old code
    // refused a `ShorthandPropertyAssignment`, so bail here too.
    if (prop.shorthand) return null
    // `parsedLiteralToGo` with no typeInfo reproduces `tsLiteralToGo`'s scalar
    // output byte-for-byte (string via `JSON.stringify`, number via the
    // carried `raw` token, boolean/null literally). Nested object / array
    // property values lower to null and defer — matching the old behaviour,
    // where carousel's flat-scalar opts were the only supported shape.
    const val = parsedLiteralToGo(ctx, prop.value)
    if (val === null) return null
    // `prop.key` is the resolved key text (identifier / string / numeric all
    // normalised to a string), exactly like the old `prop.name.text`.
    entries.push(`${JSON.stringify(prop.key)}: ${val}`)
  }
  if (entries.length === 0) return null
  return `map[string]interface{}{${entries.join(', ')}}`
}

/**
 * Get signal's initial value as Go code.
 * Handles both literal values (0, true, "str") and props references (initial).
 *
 * (#1423) When the signal references a prop via `props.X ?? N` and
 * the caller hoisted a fallback variable for `X`, return the hoisted
 * variable's name so the memo inherits the signal-time fallback.
 */
export function getSignalInitialValueAsGo(
  ctx: GoEmitContext,
  initialValue: string,
  propsParams: { name: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
): string {
  // Check if it's a props param reference
  if (propsParams.some(p => p.name === initialValue)) {
    const hoisted = propFallbackVars.get(initialValue)
    if (hoisted) return hoisted.varName
    return `in.${capitalizeFieldName(initialValue)}`
  }

  // Check for props.xxx pattern (e.g., "props.initial ?? 0")
  const propName = ctx.extractPropNameFromInitialValue(initialValue)
  if (propName && propsParams.some(p => p.name === propName)) {
    const hoisted = propFallbackVars.get(propName)
    if (hoisted) return hoisted.varName
    return `in.${capitalizeFieldName(propName)}`
  }

  // Check if it's a literal value
  // Number literals
  if (/^-?\d+$/.test(initialValue)) {
    return initialValue
  }
  if (/^-?\d+\.\d+$/.test(initialValue)) {
    return initialValue
  }
  // Boolean literals
  if (initialValue === 'true' || initialValue === 'false') {
    return initialValue
  }
  // String literals
  if ((initialValue.startsWith("'") && initialValue.endsWith("'")) ||
      (initialValue.startsWith('"') && initialValue.endsWith('"'))) {
    return initialValue.replace(/'/g, '"')
  }

  // Default: return 0 for unknown
  return '0'
}
