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
 * A bare prop-field reference (`in.<Field>`), type-asserted when the prop
 * was flipped to nillable `interface{}` (#2248/#2259/#2260's
 * `resolvePropGoType` flips) while THE CONSUMER's own expected type is a
 * concrete scalar — e.g. `createSignal<boolean | undefined>(props.pressed)`
 * resolves to a plain `bool` signal field (the `| undefined` half doesn't
 * itself trigger a flip), but `props.pressed` now bakes as `interface{}`.
 * A bare `interface{}` value can't assign into a `bool` field/branch (Go
 * compile error) — safely type-assert with a zero-value fallback for the
 * concrete-scalar case instead of the bare field reference. Object/array
 * expected types are left alone (already `interface{}`-compatible).
 *
 * `expectedType` may be `kind: 'union'` — a `T | undefined` signal type
 * annotation (the controlled-component idiom's controlled signal) — the `|
 * undefined` half is source-level documentation of nullability, not a
 * Go-representable branch, so it's unwrapped to its single non-
 * undefined/null primitive branch.
 */
function nillableAwarePropRef(ctx: GoEmitContext, propName: string, expectedType: TypeInfo): string {
  const fieldRef = `in.${capitalizeFieldName(propName)}`
  const scalar =
    expectedType.kind === 'primitive'
      ? expectedType
      : expectedType.kind === 'union' && expectedType.unionTypes?.length === 2
        ? expectedType.unionTypes.find(t => t.primitive !== 'undefined' && t.primitive !== 'null')
        : undefined
  if (ctx.state.nillablePropNames.has(propName) && scalar?.kind === 'primitive') {
    const goType =
      scalar.primitive === 'boolean' ? 'bool' :
      scalar.primitive === 'number' ? 'float64' :
      scalar.primitive === 'string' ? 'string' : null
    if (goType) {
      const zero = goType === 'bool' ? 'false' : goType === 'string' ? '""' : '0'
      return `func() ${goType} { if v, ok := ${fieldRef}.(${goType}); ok { return v }; return ${zero} }()`
    }
  }
  return fieldRef
}

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
  const propRef = (propName: string): string => nillableAwarePropRef(ctx, propName, typeInfo)

  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    if (propsParams?.some(p => p.name === value)) {
      return propRef(value)
    }
  }

  const propName = ctx.extractPropNameFromInitialValue(value, preParsed)
  if (propName && propsParams?.some(p => p.name === propName)) {
    return propRef(propName)
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
 *
 * `signalType`, when passed, drives the same nillable-prop type-assertion
 * `convertInitialValue` applies (#2260) — a caller resolving a getter as the
 * operand of a boolean condition/ternary branch (`resolveGetterValueAsGo`)
 * needs a concrete-typed result, not a bare `interface{}` field reference,
 * when the referenced prop was flipped to nillable. Omitted by call sites
 * that splice the result into an `interface{}`-typed context (e.g. a
 * `map[string]any{...}` env entry), where the bare reference is fine.
 */
export function getSignalInitialValueAsGo(
  ctx: GoEmitContext,
  initialValue: string,
  propsParams: { name: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
  signalType?: TypeInfo,
): string {
  const propRef = (propName: string): string =>
    signalType ? nillableAwarePropRef(ctx, propName, signalType) : `in.${capitalizeFieldName(propName)}`

  if (propsParams.some(p => p.name === initialValue)) {
    const hoisted = propFallbackVars.get(initialValue)
    if (hoisted) return hoisted.varName
    return propRef(initialValue)
  }

  const propName = ctx.extractPropNameFromInitialValue(initialValue)
  if (propName && propsParams.some(p => p.name === propName)) {
    const hoisted = propFallbackVars.get(propName)
    if (hoisted) return hoisted.varName
    return propRef(propName)
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
