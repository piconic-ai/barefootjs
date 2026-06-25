/**
 * Value lowering: convert JS signal/const initial values into Go literals.
 *
 * Pure free functions over a {@link GoEmitContext}. The cluster bakes inline
 * initial values into the SSR data context — scalars, prop references, and
 * fully-literal arrays/objects — and falls back to `nil`/`0` for anything the
 * parser can't reduce to a literal. They depend on the context's `state`
 * (struct-field / type-alias tables), `parseLiteralExpression`, and
 * `extractPropNameFromInitialValue`, plus `typeInfoToGo` from the type-codegen
 * module.
 */

import ts from 'typescript'

import type { TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { PropFallbackVar } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

/** Default for `getSignalInitialValueAsGo`'s optional fallback-var map. */
const EMPTY_PROP_FALLBACK_VARS: ReadonlyMap<string, PropFallbackVar> = new Map()

export function convertInitialValue(
  ctx: GoEmitContext,
  value: string,
  typeInfo: TypeInfo,
  propsParams?: { name: string }[],
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
    return jsLiteralToGo(ctx, value, typeInfo) ?? 'nil'
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
 * Convert a fully-literal JS expression string into an equivalent Go literal
 * whose Go type matches `typeInfo` (#1672), used to bake a signal's inline
 * initial value into the SSR data context:
 *
 *   `["x", "y"]`             (string[])  → `[]string{"x", "y"}`
 *   `["x", "y"]`             (unknown[]) → `[]interface{}{"x", "y"}`
 *   `[{ id: "a" }]`          (Item[])    → `[]Item{Item{ID: "a"}}`
 *
 * Returns `null` — so the caller keeps `nil` — when the expression (or any
 * nested element) is not a pure literal (a call, identifier, template with
 * interpolation, …) or cannot be expressed in the target Go type without a
 * render/compile mismatch (e.g. an object element in a `[]interface{}` field,
 * which the SSR template reaches via struct field access the map lacks).
 */
export function jsLiteralToGo(
  ctx: GoEmitContext,
  value: string,
  typeInfo: TypeInfo,
): string | null {
  const expr = ctx.parseLiteralExpression(value)
  if (!expr) return null
  return tsLiteralToGo(ctx, expr, typeInfo)
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
export function objectLiteralToGoMap(ctx: GoEmitContext, exprText: string): string | null {
  const expr = ctx.parseLiteralExpression(exprText)
  if (!expr || !ts.isObjectLiteralExpression(expr)) return null
  const entries: string[] = []
  for (const prop of expr.properties) {
    if (!ts.isPropertyAssignment(prop)) return null
    if (
      !ts.isIdentifier(prop.name) &&
      !ts.isStringLiteral(prop.name) &&
      !ts.isNumericLiteral(prop.name)
    ) {
      return null
    }
    const val = tsLiteralToGo(ctx, prop.initializer)
    if (val === null) return null
    entries.push(`${JSON.stringify(prop.name.text)}: ${val}`)
  }
  if (entries.length === 0) return null
  return `map[string]interface{}{${entries.join(', ')}}`
}

/**
 * Recursively convert a TS literal AST node to a Go literal typed as
 * `typeInfo`, or null when the node is not a pure literal / cannot be
 * represented in that Go type.
 */
export function tsLiteralToGo(
  ctx: GoEmitContext,
  node: ts.Expression,
  typeInfo?: TypeInfo,
): string | null {
  // Unwrap a leading unary minus on a numeric literal (`-1`).
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return `-${node.operand.text}`
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return JSON.stringify(node.text)
  }
  // Pass the numeric literal's source spelling through verbatim. Every form
  // the TS parser accepts here (`1`, `1.5`, `1e3`, `0x10`, `1_000`) is also a
  // valid Go numeric literal, so no re-formatting is needed.
  if (ts.isNumericLiteral(node)) return node.text
  if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true'
  if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false'
  if (node.kind === ts.SyntaxKind.NullKeyword) return 'nil'

  if (ts.isArrayLiteralExpression(node)) {
    // An empty array literal (`[]`, and — since the TS parser tolerates
    // whitespace/comments — `[ ]`, `[/* */]`) carries no items, so there's
    // nothing to bake. Returning null keeps the field `nil`, which JSON-
    // marshals as `null` rather than the `[]` an empty slice would produce.
    if (node.elements.length === 0) return null

    // Slice header mirrors the field's Go type (`[]string`, `[]Item`,
    // `[]interface{}`); elements are converted against the element type.
    const elemType = typeInfo?.kind === 'array' ? typeInfo.elementType : undefined
    const sliceHeader = typeInfo?.kind === 'array'
      ? typeInfoToGo(ctx, typeInfo)
      : '[]interface{}'
    const elems: string[] = []
    for (const el of node.elements) {
      const go = tsLiteralToGo(ctx, el, elemType)
      if (go === null) return null
      elems.push(go)
    }
    return `${sliceHeader}{${elems.join(', ')}}`
  }

  if (ts.isObjectLiteralExpression(node)) {
    // An object can only be baked when the target Go type is a concrete
    // struct — otherwise it would land in `interface{}` / a map the SSR
    // template can't reach via field access. The struct's field map is the
    // source of truth: it tells us the exact Go field name for each source
    // key and, by omission, which keys the struct doesn't declare. Bail
    // (→ nil) when the type isn't a known struct.
    const goType = typeInfo ? typeInfoToGo(ctx, typeInfo) : 'interface{}'
    const structFields = ctx.state.localStructFields.get(goType)
    if (!structFields) return null
    const entries: string[] = []
    for (const prop of node.properties) {
      // Only plain `key: scalar` pairs are baked; spreads, methods,
      // shorthand, computed/accessor members, and nested object/array
      // values (whose struct field types we don't track here) bail to nil.
      if (!ts.isPropertyAssignment(prop)) return null
      if (
        !ts.isIdentifier(prop.name) &&
        !ts.isStringLiteral(prop.name) &&
        !ts.isNumericLiteral(prop.name)
      ) {
        return null
      }
      // Resolve the Go field name from the struct's own field map rather
      // than re-deriving it. A key the struct doesn't declare (a typo, or a
      // non-identifier key like `"data-id"` that never became a field) is
      // absent here, so we bail to nil instead of emitting a literal that
      // names a nonexistent field and won't compile.
      const goField = structFields.get(prop.name.text)
      if (!goField) return null
      const init = prop.initializer
      if (ts.isObjectLiteralExpression(init) || ts.isArrayLiteralExpression(init)) {
        return null
      }
      const go = tsLiteralToGo(ctx, init)
      if (go === null) return null
      entries.push(`${goField}: ${go}`)
    }
    return `${goType}{${entries.join(', ')}}`
  }
  return null
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
