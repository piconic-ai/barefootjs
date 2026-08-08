/**
 * Value lowering: convert a JS signal/const initial value into a Go literal for
 * the SSR data context — scalars, prop references, and fully-literal
 * arrays/objects — falling back to `nil`/`0` for anything not reducible to a
 * literal. Pure free functions over a {@link GoEmitContext}.
 */

import type { ParsedExpr, TypeInfo } from '@barefootjs/jsx'
import {
  asCallbackMethodCall,
  freeVarsInBody,
  materializeGetterCalls,
  serializeParsedExpr,
} from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import type { PropFallbackVar } from '../lib/types.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { escapeGoString } from '../lib/go-emit.ts'
import { numberLiteralRawGo, parsedLiteralToGo } from './parsed-literal-to-go.ts'
import { collapseLiteralUnion } from '../type/type-codegen.ts'

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
 *
 * `param.name` is the LOCAL binding — `nillablePropNames` (a source-level
 * analysis set, `collectNillablePropNames`) stays keyed by it — while the
 * emitted `in.<Field>` reference is caller-facing (`sourceName ?? name`,
 * #2525), so the two must resolve separately rather than off one name.
 */
function nillableAwarePropRef(
  ctx: GoEmitContext,
  param: { name: string; sourceName?: string },
  expectedType: TypeInfo,
): string {
  const fieldRef = `in.${capitalizeFieldName(param.sourceName ?? param.name)}`
  const scalar =
    expectedType.kind === 'primitive'
      ? expectedType
      : expectedType.kind === 'union' && expectedType.unionTypes?.length === 2
        ? expectedType.unionTypes.find(t => t.primitive !== 'undefined' && t.primitive !== 'null')
        : undefined
  if (ctx.state.nillablePropNames.has(param.name) && scalar?.kind === 'primitive') {
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
  _typeInfo: TypeInfo,
  propsParams?: { name: string; sourceName?: string }[],
  preParsed?: ParsedExpr,
): string {
  // Literal unions collapse to their backing primitive the same way
  // `typeInfoToGo` collapses the field's type — the two MUST agree, or a
  // `string` field gets a `nil` seed (#2477's `go run` failure).
  const typeInfo = collapseLiteralUnion(_typeInfo)
  const propRef = (param: { name: string; sourceName?: string }): string =>
    nillableAwarePropRef(ctx, param, typeInfo)

  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    const param = propsParams?.find(p => p.name === value)
    if (param) {
      return propRef(param)
    }
  }

  const propName = ctx.extractPropNameFromInitialValue(value, preParsed)
  const param = propName ? propsParams?.find(p => p.name === propName) : undefined
  if (param) {
    return propRef(param)
  }

  if (typeInfo.kind === 'primitive') {
    if (typeInfo.primitive === 'boolean') {
      // Structural first: the SAME initial value, already parsed
      // (`SignalInfo.parsed`/module-const `parsed`) — text-matching
      // `value === 'true'` is the fallback for a caller with no `preParsed`
      // (an unsupported shape `tsNodeToParsedExpr` couldn't represent).
      if (preParsed?.kind === 'literal' && preParsed.literalType === 'boolean' && typeof preParsed.value === 'boolean') {
        return preParsed.value ? 'true' : 'false'
      }
      return value === 'true' ? 'true' : 'false'
    }
    if (typeInfo.primitive === 'number') {
      // Structural first — `numberLiteralRawGo` unwraps a leading unary minus
      // (#2168 math-methods: `createSignal(-7.6)`) off the literal's OWN
      // `raw` token (exact source spelling, never a re-stringified value).
      const numGo = preParsed ? numberLiteralRawGo(preParsed) : null
      if (numGo !== null) return numGo
      // Text fallback for a caller with no `preParsed`. Leading `-` handled
      // the same way (without it, a negative initial value never matches
      // either literal shape below and silently falls to the `0`
      // zero-value fallback, regardless of the field's Go type).
      if (/^-?\d+$/.test(value)) return value
      if (/^-?\d+\.\d+$/.test(value)) return value
      return '0'
    }
    if (typeInfo.primitive === 'string') {
      // Structural first: `JSON.stringify` re-quotes/escapes the literal's
      // unquoted `value` for Go — correct for any embedded quote/backslash,
      // unlike the text fallback's blind `'` → `"` swap below.
      if (preParsed?.kind === 'literal' && preParsed.literalType === 'string' && typeof preParsed.value === 'string') {
        return JSON.stringify(preParsed.value)
      }
      if (value.startsWith("'") && value.endsWith("'")) {
        return value.replace(/'/g, '"')
      }
      if (value.startsWith('"') && value.endsWith('"')) {
        return value
      }
      // A `.map(cb).join(sep)` chain (#2492): the analyzer's `.join()`
      // trailing-suffix rule (`inferTypeFromValue`) types a signal carrying
      // this shape `string`, so it lands HERE rather than the `array`
      // branch below — bake it the same way a memo's derived `.map().join()`
      // value bakes (`memoInitialFromParsedBody`'s sibling arm in
      // `memo-compute.ts`), through the runtime evaluator's `MapEval` +
      // `Join` composition, instead of falling to the `""` zero value.
      if (preParsed) {
        const chain = matchMapJoinChain(preParsed)
        if (chain) {
          const chainGo = mapJoinChainToGo(ctx, chain, [], propsParams ?? [], EMPTY_PROP_FALLBACK_VARS)
          if (chainGo !== null) return chainGo
        }
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
  propsParams: { name: string; sourceName?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar> = EMPTY_PROP_FALLBACK_VARS,
  signalType?: TypeInfo,
): string {
  const propRef = (param: { name: string; sourceName?: string }): string =>
    signalType
      ? nillableAwarePropRef(ctx, param, signalType)
      : `in.${capitalizeFieldName(param.sourceName ?? param.name)}`

  const directParam = propsParams.find(p => p.name === initialValue)
  if (directParam) {
    const hoisted = propFallbackVars.get(initialValue)
    if (hoisted) return hoisted.varName
    return propRef(directParam)
  }

  const propName = ctx.extractPropNameFromInitialValue(initialValue)
  const param = propName ? propsParams.find(p => p.name === propName) : undefined
  if (param) {
    const hoisted = propFallbackVars.get(propName!)
    if (hoisted) return hoisted.varName
    return propRef(param)
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

/**
 * A value-producing `.map(cb).join(sep)` chain — `<object>.map((param) =>
 * <body>).join(<sepExpr>)` — the constructor-Go-source analogue of the
 * template-position `bf_join (bf_map_eval …)` lowering (`emitMapEval`,
 * `go-emit.ts`). `.join(...)` folds to the `array-method` IR node at parse
 * time (`expression-parser.ts`); its `object` is recognised as a `.map(cb)`
 * callback call via `asCallbackMethodCall` (the same recognition
 * `matchFilterArmMemo`, `memo-compute.ts`, uses for `.filter`). Returns the
 * receiver array, the mapper arrow, and the join separator argument (absent
 * when `.join()` was called with no argument — JS defaults to `,`), or null
 * when `expr` isn't this shape.
 */
export function matchMapJoinChain(expr: ParsedExpr): {
  object: ParsedExpr
  arrow: Extract<ParsedExpr, { kind: 'arrow' }>
  sepArg?: ParsedExpr
} | null {
  if (expr.kind !== 'array-method' || expr.method !== 'join') return null
  const mapCb = asCallbackMethodCall(expr.object)
  if (!mapCb || mapCb.method !== 'map') return null
  return { object: mapCb.object, arrow: mapCb.arrow, sepArg: expr.args[0] }
}

/**
 * Resolve a `.map().join()` chain's receiver array to a Go expression — a
 * signal-backed field, a prop field, or an inline array literal.
 *
 * A SIGNAL receiver (`items()`) re-derives the signal's own initial value
 * from ITS OWN initializer (`convertInitialValue`, baked against the
 * synthesised element struct in `state.synthStructTypes` when one was
 * inferred for it) rather than referencing a struct field — this expression
 * is itself one field value inside the SAME `<Props>{ ... }` composite
 * literal the signal's own field is being built into, so it can't reference
 * a sibling field by name. Mirrors `resolveGetterValueAsGo` /
 * `getSignalInitialValueAsGo`'s existing convention of re-deriving a
 * referenced signal rather than pointing at a not-yet-assigned field.
 *
 * A PROP receiver (`props.X` / bare destructured `X`) resolves to a bare
 * `in.<Field>` reference, mirroring `matchFilterArmMemo`'s `itemsField` (no
 * nillable-scalar type assertion — the receiver is an array, never one of
 * the scalar kinds that assertion guards).
 *
 * An array-LITERAL receiver bakes element-by-element: an object element goes
 * through `objectLiteralToGoMap` (a plain `map[string]interface{}`, source-
 * cased keys) rather than `jsLiteralToGo`'s struct-backed baking, since this
 * nested literal is a `.map()` RECEIVER, not a signal's own typed value, and
 * so has no named struct synthesised for it.
 *
 * @returns the Go expression, or null when the receiver isn't one of the
 *   three shapes above, or an object-array-literal element doesn't bake.
 */
function resolveMapJoinBaseAsGo(
  ctx: GoEmitContext,
  object: ParsedExpr,
  signals: { getter: string; initialValue: string; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string }[],
): string | null {
  if (object.kind === 'call' && object.callee.kind === 'identifier' && object.args.length === 0) {
    const calleeName = object.callee.name
    const sig = signals.find(s => s.getter === calleeName)
    if (sig) {
      const bakeType = ctx.state.synthStructTypes.get(sig.getter) ?? sig.type ?? { kind: 'array', raw: 'unknown[]' }
      return convertInitialValue(ctx, sig.initialValue, bakeType, propsParams, sig.parsed)
    }
  }

  const propName =
    object.kind === 'member' && !object.computed && object.object.kind === 'identifier' && object.object.name === 'props'
      ? object.property
      : object.kind === 'identifier'
        ? object.name
        : null
  const param = propName ? propsParams.find(p => p.name === propName) : undefined
  if (param) {
    return `in.${capitalizeFieldName(param.sourceName ?? param.name)}`
  }

  if (object.kind === 'array-literal') {
    if (object.elements.length === 0) return '[]interface{}{}'
    const elems: string[] = []
    for (const el of object.elements) {
      const go = el.kind === 'object-literal' ? objectLiteralToGoMap(ctx, el) : parsedLiteralToGo(ctx, el)
      if (go === null) return null
      elems.push(go)
    }
    return `[]interface{}{${elems.join(', ')}}`
  }

  return null
}

/**
 * Lower a `.map(cb).join(sep)` chain (matched by {@link matchMapJoinChain})
 * to a `bf.Join(bf.MapEval(<items>, "<projJSON>", "<param>", <envMap>),
 * <sep>)` Go expression — the constructor-source analogue of
 * `matchFilterArmMemo`'s `bf.FilterEval` emit (`memo-compute.ts`), reusing
 * the SAME two runtime evaluator functions (`MapEval`, `eval.go`; `Join`,
 * `bf.go`) the template-position `bf_map_eval`/`bf_join` lowering already
 * calls. Shared by a memo's derived value (`memoInitialFromParsedBody`'s
 * concatenation-chain arm) and a SIGNAL's own initializer
 * (`convertInitialValue`'s `string` branch, #2492).
 *
 * @returns the Go expression, or null when the receiver doesn't resolve
 *   ({@link resolveMapJoinBaseAsGo}), the projection body isn't
 *   representable to the runtime evaluator (`serializeParsedExpr` refusal),
 *   a captured free variable doesn't resolve, or the separator isn't a
 *   string literal (a dynamic separator — out of scope for this arm).
 */
export function mapJoinChainToGo(
  ctx: GoEmitContext,
  chain: { object: ParsedExpr; arrow: Extract<ParsedExpr, { kind: 'arrow' }>; sepArg?: ParsedExpr },
  signals: { getter: string; initialValue: string; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  const itemsGo = resolveMapJoinBaseAsGo(ctx, chain.object, signals, propsParams)
  if (itemsGo === null) return null

  const knownGetterNames = new Set(signals.map(s => s.getter))
  const materialized = materializeGetterCalls(chain.arrow.body, knownGetterNames)
  const projJSON = serializeParsedExpr(materialized)
  if (projJSON === null) return null

  const paramName = chain.arrow.params[0] ?? '_'
  const freeVars = freeVarsInBody(materialized, new Set(chain.arrow.params))
  const envEntries: string[] = []
  for (const name of freeVars) {
    const sig = signals.find(s => s.getter === name)
    let goExpr: string | null = null
    const freeVarParam = propsParams.find(p => p.name === name)
    if (sig) {
      goExpr = getSignalInitialValueAsGo(ctx, sig.initialValue, propsParams, propFallbackVars, sig.type)
    } else if (freeVarParam) {
      const hoisted = propFallbackVars.get(name)
      goExpr = hoisted ? hoisted.varName : `in.${capitalizeFieldName(freeVarParam.sourceName ?? name)}`
    }
    if (goExpr === null) return null
    envEntries.push(`${JSON.stringify(name)}: ${goExpr}`)
  }
  const envMap = `map[string]any{${envEntries.join(', ')}}`

  let sepGo: string
  if (!chain.sepArg) {
    sepGo = JSON.stringify(',')
  } else if (chain.sepArg.kind === 'literal' && chain.sepArg.literalType === 'string') {
    sepGo = JSON.stringify(chain.sepArg.value)
  } else {
    return null
  }

  return `bf.Join(bf.MapEval(${itemsGo}, "${escapeGoString(projJSON)}", ${JSON.stringify(paramName)}, ${envMap}), ${sepGo})`
}
