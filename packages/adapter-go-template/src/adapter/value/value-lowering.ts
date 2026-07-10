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
 * Lower a signal/const initial value to its Go SSR literal: a prop reference
 * becomes `in.<Field>`, a non-literal falls back to the type's zero value.
 */
export function convertInitialValue(
  ctx: GoEmitContext,
  value: string,
  typeInfo: TypeInfo,
  propsParams?: { name: string }[],
  preParsed?: ParsedExpr,
): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    if (propsParams?.some(p => p.name === value)) {
      return `in.${capitalizeFieldName(value)}`
    }
  }

  const propName = ctx.extractPropNameFromInitialValue(value)
  if (propName && propsParams?.some(p => p.name === propName)) {
    return `in.${capitalizeFieldName(propName)}`
  }

  if (typeInfo.kind === 'primitive') {
    if (typeInfo.primitive === 'boolean') {
      return value === 'true' ? 'true' : 'false'
    }
    if (typeInfo.primitive === 'number') {
      // Leading `-` (#2168 math-methods: `createSignal(-7.6)`) — without it,
      // a negative initial value never matches either literal shape below
      // and silently falls to the `0` zero-value fallback, regardless of the
      // field's Go type.
      if (/^-?\d+$/.test(value)) return value
      if (/^-?\d+\.\d+$/.test(value)) return value
      return '0'
    }
    if (typeInfo.primitive === 'string') {
      if (value.startsWith("'") || value.endsWith("'")) {
        return value.replace(/'/g, '"')
      }
      if (value.startsWith('"') && value.endsWith('"')) {
        return value
      }
      return '""'
    }
  }

  if (typeInfo.kind === 'array') {
    return jsLiteralToGo(ctx, typeInfo, preParsed) ?? 'nil'
  }

  // A string type-alias keeps its string value instead of falling to nil.
  if (typeInfo.kind === 'interface' && typeInfo.raw) {
    const aliasBase = ctx.state.localTypeAliases.get(typeInfo.raw)
    if (aliasBase === 'string') {
      if (value.startsWith("'") || value.startsWith('"')) {
        return value.replace(/'/g, '"')
      }
      return '""'
    }
    // A struct-backed `interface` kind (an explicitly-typed object signal,
    // `createSignal<User>({...})`) — #2168 signal-object-field. Mirrors the
    // `array` branch above: `jsLiteralToGo` → `parsedLiteralToGo`'s
    // object-literal case already bakes an object literal against a named
    // local struct correctly (proven by the existing typed-array-of-objects
    // test); it just wasn't reachable from a SCALAR struct signal, which
    // fell straight through to `nil` — a compile error for a non-pointer
    // struct field (`cannot use nil as User value in struct literal`), not
    // merely a silently-dropped initial value.
    if (ctx.state.localStructFields.has(typeInfo.raw)) {
      const baked = jsLiteralToGo(ctx, typeInfo, preParsed)
      if (baked !== null) return baked
      // Baking failed (a non-literal initial value, or no `preParsed` tree)
      // — `nil` is STILL invalid Go for this non-pointer struct field, so
      // the same compile error would resurface for any such case (Copilot
      // review, #2201). The struct's own zero value (`User{}`) is the
      // correct fallback here — mirrors this function's own docstring
      // ("falls back to the type's zero value") for every other typed
      // branch above.
      return `${typeInfo.raw}{}`
    }
  }

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
 * Returns null (caller keeps `nil`) for a non-literal, or a shape that can't be
 * expressed in the target type (e.g. an object in a `[]interface{}`, unreachable
 * via the template's struct-field access).
 */
export function jsLiteralToGo(
  ctx: GoEmitContext,
  typeInfo: TypeInfo,
  preParsed?: ParsedExpr,
): string | null {
  if (preParsed) {
    const structured = parsedLiteralToGo(ctx, preParsed, typeInfo)
    if (structured !== null) return structured
  }
  return null
}

/**
 * Bake a flat object literal (`{ align: 'start' }`) into a Go
 * `map[string]interface{}` keyed by SOURCE property names, so it round-trips
 * through `bf_json` like `JSON.stringify` (only the supplied keys, no zero-filled
 * struct fields). Used for an inline object passed to a child's optional object
 * prop. Returns null for a non-object / shorthand / nested / empty object.
 */
export function objectLiteralToGoMap(ctx: GoEmitContext, expr: ParsedExpr): string | null {
  if (expr.kind !== 'object-literal') return null
  const entries: string[] = []
  for (const prop of expr.properties) {
    if (prop.shorthand) return null
    const val = parsedLiteralToGo(ctx, prop.value)
    if (val === null) return null
    entries.push(`${JSON.stringify(prop.key)}: ${val}`)
  }
  if (entries.length === 0) return null
  return `map[string]interface{}{${entries.join(', ')}}`
}

/**
 * Get a signal's initial value as Go code — a literal, or a props reference
 * (`in.<Field>`, or the hoisted fallback var when `props.X ?? N` has one).
 * Unrecognized values default to `0`.
 */
export function getSignalInitialValueAsGo(
  ctx: GoEmitContext,
  initialValue: string,
  propsParams: { name: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
): string {
  if (propsParams.some(p => p.name === initialValue)) {
    const hoisted = propFallbackVars.get(initialValue)
    if (hoisted) return hoisted.varName
    return `in.${capitalizeFieldName(initialValue)}`
  }

  const propName = ctx.extractPropNameFromInitialValue(initialValue)
  if (propName && propsParams.some(p => p.name === propName)) {
    const hoisted = propFallbackVars.get(propName)
    if (hoisted) return hoisted.varName
    return `in.${capitalizeFieldName(propName)}`
  }

  // single quotes are normalized to Go double quotes
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
