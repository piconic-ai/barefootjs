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
 * Unwrap a `T | undefined`/`T | null` union — the controlled-component
 * idiom's widened signal/prop type, e.g. `createSignal<string | undefined>
 * ('one')` — to its single non-nullish PRIMITIVE branch. The `| undefined`/
 * `| null` half is source-level documentation of nullability, not a
 * Go-representable branch or evidence about the INITIAL VALUE (#3061).
 *
 * Only fires for the EXACT shape "one nullish primitive member, one other
 * PRIMITIVE member" — every other two-member union is returned unchanged:
 * - `string | number` (no `undefined`/`null` at all) — picking a branch by
 *   declaration order would silently mistype whichever literal doesn't
 *   match it (e.g. a `number` initial value baked as the `""` string zero
 *   value because `string` happened to sort first in `unionTypes`), worse
 *   than the pre-existing `nil`/unhandled fallback for that genuinely
 *   ambiguous shape.
 * - `T[] | undefined` / `SomeInterface | undefined` — the non-nullish side
 *   isn't a primitive literal-baking decision at all; left on the
 *   pre-existing fallback rather than silently widening this fix's tested
 *   scope (string/number/boolean literals, #3061) to an untested one.
 */
function unwrapNullableUnion(typeInfo: TypeInfo): TypeInfo {
  if (typeInfo.kind !== 'union' || typeInfo.unionTypes?.length !== 2) return typeInfo
  const isNullish = (t: TypeInfo): boolean =>
    t.kind === 'primitive' && (t.primitive === 'undefined' || t.primitive === 'null')
  const isOtherPrimitive = (t: TypeInfo): boolean => t.kind === 'primitive' && !isNullish(t)
  const [a, b] = typeInfo.unionTypes
  if (isNullish(a) && isOtherPrimitive(b)) return b
  if (isNullish(b) && isOtherPrimitive(a)) return a
  return typeInfo
}

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
  const scalar = unwrapNullableUnion(expectedType)
  if (ctx.state.nillablePropNames.has(param.name) && scalar.kind === 'primitive') {
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
    // Module-const seed (#2794/#2815/#2862): a signal seeded from a bare
    // identifier that refers to a module-level const (`const PAYLOAD = 'x';
    // createSignal(PAYLOAD)`, or `const INITIAL: Row[] = [...];
    // createSignal(INITIAL)`) types `unknown` — the analyzer's type
    // inference is text-shaped and never chases an identifier to its
    // declaration — so none of the typed branches below ever see it and
    // this used to fall through to the final `nil`. Checked AFTER the
    // prop lookup so a destructured prop that happens to share the
    // const's name still wins (shadowing). Both resolvers return null
    // for anything that isn't a statically-inlinable module const
    // (a call-initialized const, a loop var, a component-scope const),
    // leaving that case on the pre-existing `nil` path unchanged.
    const inlinedStr = ctx.resolveModuleStringConst(value)
    if (inlinedStr !== null) return inlinedStr
    const inlinedConst = ctx.resolveModuleConstAsGo(value, { kind: 'go-source', bakeType: typeInfo })
    if (inlinedConst !== null) return inlinedConst
  }

  const propName = ctx.extractPropNameFromInitialValue(value, preParsed)
  const param = propName ? propsParams?.find(p => p.name === propName) : undefined
  if (param) {
    return propRef(param)
  }

  // A `T | undefined`/`T | null` union's literal initial value silently fell
  // through to `nil` before #3061: `collapseLiteralUnion` above
  // intentionally leaves this heterogeneous union alone (member families
  // differ: `string` vs `undefined`), so none of the primitive/array/
  // interface branches below ever matched. `unwrapNullableUnion` (above)
  // unwraps it to the union's single non-nullish branch for THIS
  // literal-baking decision only — the field itself keeps its `interface{}`
  // type from `typeInfoToGo`, which doesn't collapse this shape either — an
  // `interface{}` holding a baked Go string/bool/float64 still renders
  // correctly through `{{.Field}}`/`title="{{.Field}}"`, and the
  // `undefined` step of a toggling signal keeps its `nil` zero value on the
  // branches that don't match below.
  const literalTypeInfo = unwrapNullableUnion(typeInfo)

  if (literalTypeInfo.kind === 'primitive') {
    if (literalTypeInfo.primitive === 'boolean') {
      // Structural first: the SAME initial value, already parsed
      // (`SignalInfo.parsed`/module-const `parsed`) — text-matching
      // `value === 'true'` is the fallback for a caller with no `preParsed`
      // (an unsupported shape `tsNodeToParsedExpr` couldn't represent).
      if (preParsed?.kind === 'literal' && preParsed.literalType === 'boolean' && typeof preParsed.value === 'boolean') {
        return preParsed.value ? 'true' : 'false'
      }
      return value === 'true' ? 'true' : 'false'
    }
    if (literalTypeInfo.primitive === 'number') {
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
    if (literalTypeInfo.primitive === 'string') {
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

  if (literalTypeInfo.kind === 'array') {
    return jsLiteralToGo(ctx, literalTypeInfo, preParsed) ?? 'nil'
  }

  // A string type-alias keeps its string value instead of falling to nil.
  if (literalTypeInfo.kind === 'interface' && literalTypeInfo.raw) {
    const aliasBase = ctx.state.localTypeAliases.get(literalTypeInfo.raw)
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
    if (ctx.state.localStructFields.has(literalTypeInfo.raw)) {
      const baked = jsLiteralToGo(ctx, literalTypeInfo, preParsed)
      if (baked !== null) return baked
      // Baking failed (a non-literal initial value, or no `preParsed` tree)
      // — `nil` is STILL invalid Go for this non-pointer struct field, so
      // the same compile error would resurface for any such case (Copilot
      // review, #2201). The struct's own zero value (`User{}`) is the
      // correct fallback here — mirrors this function's own docstring
      // ("falls back to the type's zero value") for every other typed
      // branch above.
      return `${literalTypeInfo.raw}{}`
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
 * `objectLiteralToGoComposite`'s destination: either the historical
 * `map[string]interface{}` convention, or a synthesized/named Go struct
 * (`ChildComponentShape.structTypedObjectParams`, #2925) — the two are NOT
 * Go-interchangeable, so which one applies must be decided by the caller
 * against the actual destination field's registered shape, never guessed
 * from the literal's own contents.
 */
export type ObjectLiteralBakeTarget =
  | { kind: 'map' }
  | { kind: 'struct'; goType: string; fields: ReadonlyMap<string, string> }

/**
 * Bake a flat object literal (`{ align: 'start' }`) into a Go
 * `map[string]interface{}` (keyed by SOURCE property names, so it round-trips
 * through `bf_json` like `JSON.stringify`) or a named struct literal (keyed by
 * `target.fields`' Go field names) — see `ObjectLiteralBakeTarget`. Returns
 * null for a non-object / shorthand / nested / empty object, an unresolvable
 * property value, or (struct target only) a source key the struct doesn't
 * declare.
 *
 * `resolveIdentifier`, when given, is consulted for a property value that's a
 * bare identifier (`{ v: count }`) and `parsedLiteralToGo` alone can't bake
 * (it deliberately defers on identifier/call/member operands) — e.g. a local
 * signal/memo getter's own constructor-time seed (#2925). It returns ALREADY-
 * LOWERED Go source for the SAME destination this composite literal is being
 * built for (exactly what `parsedLiteralToGo` itself would have returned for
 * a literal), not a `ParsedExpr` to re-lower — a signal's seed is frequently
 * `in.Label` / a hoisted fallback-var name / an inlined module const, none of
 * which is itself a literal tree. Returning `null` means "can't resolve this
 * name," which defers the WHOLE object literal, same as any other
 * unresolvable property.
 */
export function objectLiteralToGoComposite(
  ctx: GoEmitContext,
  expr: ParsedExpr,
  target: ObjectLiteralBakeTarget,
  resolveIdentifier?: (name: string) => string | null,
): string | null {
  if (expr.kind !== 'object-literal') return null
  const entries: string[] = []
  for (const prop of expr.properties) {
    // A spread (`{ ...t }`, #2696 Step 2) has no static key to bake as a Go
    // field/map-entry — bail, same as any other unsupported shape.
    if (prop.kind === 'spread') return null
    if (prop.shorthand) return null
    let val = parsedLiteralToGo(ctx, prop.value)
    if (val === null && prop.value.kind === 'identifier' && resolveIdentifier) {
      val = resolveIdentifier(prop.value.name)
    }
    if (val === null) return null
    if (target.kind === 'map') {
      entries.push(`${JSON.stringify(prop.key)}: ${val}`)
    } else {
      const goField = target.fields.get(prop.key)
      if (!goField) return null
      entries.push(`${goField}: ${val}`)
    }
  }
  if (entries.length === 0) return null
  return target.kind === 'map'
    ? `map[string]interface{}{${entries.join(', ')}}`
    : `${target.goType}{${entries.join(', ')}}`
}

/**
 * Bake a flat object literal (`{ align: 'start' }`) into a Go
 * `map[string]interface{}` keyed by SOURCE property names, so it round-trips
 * through `bf_json` like `JSON.stringify` (only the supplied keys, no zero-filled
 * struct fields). Used for an inline object passed to a child's optional object
 * prop. Returns null for a non-object / shorthand / nested / empty object.
 * Thin wrapper over `objectLiteralToGoComposite` with a `'map'` target, kept
 * for this function's two other (map-only, no identifier resolution) callers.
 */
export function objectLiteralToGoMap(
  ctx: GoEmitContext,
  expr: ParsedExpr,
  resolveIdentifier?: (name: string) => string | null,
): string | null {
  return objectLiteralToGoComposite(ctx, expr, { kind: 'map' }, resolveIdentifier)
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

/** `.map`/`.filter` → the runtime evaluator function that composes it. Both
 *  take `items any` and return `[]any` (`eval.go`), so nesting one call's
 *  result straight into another's `items` argument is exactly `.a().b()`'s
 *  JS semantics — no expression-tree fusion needed (#2696 review). */
const CALLBACK_EVAL_FUNC: Record<string, string> = { map: 'bf.MapEval', filter: 'bf.FilterEval' }

/**
 * Lower ONE `.map(cb)`/`.filter(cb)` step to a runtime-evaluator call over an
 * already-resolved `itemsGo` Go expression: `bf.MapEval(<itemsGo>,
 * "<projJSON>", "<param>", <envMap>)` (or `bf.FilterEval` for `.filter`).
 * Shared by {@link resolveMapChainAsGo} (an intermediate step feeding the
 * NEXT step's `items`) and {@link mapJoinChainToGo} (the outermost step,
 * whose result feeds `bf.Join`).
 *
 * @returns the Go expression, or null when the callback body isn't
 *   representable to the runtime evaluator (`serializeParsedExpr` refusal)
 *   or a captured free variable doesn't resolve.
 */
function callbackStepToGo(
  ctx: GoEmitContext,
  method: string,
  itemsGo: string,
  arrow: Extract<ParsedExpr, { kind: 'arrow' }>,
  signals: { getter: string; initialValue: string; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  const evalFunc = CALLBACK_EVAL_FUNC[method]
  if (!evalFunc) return null

  const knownGetterNames = new Set(signals.map(s => s.getter))
  const materialized = materializeGetterCalls(arrow.body, knownGetterNames)
  const projJSON = serializeParsedExpr(materialized)
  if (projJSON === null) return null

  const paramName = arrow.params[0] ?? '_'
  const freeVars = freeVarsInBody(materialized, new Set(arrow.params))
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

  return `${evalFunc}(${itemsGo}, "${escapeGoString(projJSON)}", ${JSON.stringify(paramName)}, ${envMap})`
}

/**
 * Resolve a `.map()`/`.filter()` CHAIN of any depth to a Go expression:
 * peel off callback-method layers one at a time (`asCallbackMethodCall`),
 * composing a `bf.MapEval`/`bf.FilterEval` call around the PREVIOUS layer's
 * result for each one, down to the base receiver
 * ({@link resolveMapJoinBaseAsGo} — a signal call, prop field, or array
 * literal). `rows().map(t => ({ id: t.id, … })).map(r => r.id)` composes as
 * `bf.MapEval(bf.MapEval(<rows>, "{id:t.id,…}", "t", {}), "r.id", "r", {})`
 * — before this, only a chain whose FIRST layer already matched a base
 * shape resolved; a nested map/filter layer silently fell to `null` (#2696
 * review: `map-object-literal-body`'s two chained `.map()`s).
 *
 * @returns the Go expression, or null when the base receiver doesn't
 *   resolve or any layer's callback isn't representable
 *   ({@link callbackStepToGo}).
 */
function resolveMapChainAsGo(
  ctx: GoEmitContext,
  expr: ParsedExpr,
  signals: { getter: string; initialValue: string; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  const cb = asCallbackMethodCall(expr)
  if (cb && cb.method in CALLBACK_EVAL_FUNC) {
    const innerGo = resolveMapChainAsGo(ctx, cb.object, signals, propsParams, propFallbackVars)
    if (innerGo === null) return null
    return callbackStepToGo(ctx, cb.method, innerGo, cb.arrow, signals, propsParams, propFallbackVars)
  }
  return resolveMapJoinBaseAsGo(ctx, expr, signals, propsParams)
}

/**
 * Lower a `.map(cb).join(sep)` chain (matched by {@link matchMapJoinChain})
 * to a `bf.Join(<chain>, <sep>)` Go expression, where `<chain>` is the
 * chain's OWN `.map()` step composed by {@link callbackStepToGo} over
 * whatever {@link resolveMapChainAsGo} resolves its receiver to (a base
 * shape, or one or more nested `.map()`/`.filter()` layers) — the
 * constructor-source analogue of `matchFilterArmMemo`'s `bf.FilterEval`
 * emit (`memo-compute.ts`), reusing the SAME runtime evaluator functions
 * (`MapEval`/`FilterEval`, `eval.go`; `Join`, `bf.go`) the template-position
 * `bf_map_eval`/`bf_join` lowering already calls. Shared by a memo's
 * derived value (`memoInitialFromParsedBody`'s concatenation-chain arm and
 * bare-chain arm) and a SIGNAL's own initializer (`convertInitialValue`'s
 * `string` branch, #2492).
 *
 * @returns the Go expression, or null when the receiver doesn't resolve
 *   ({@link resolveMapChainAsGo}), the projection body isn't representable
 *   to the runtime evaluator (`serializeParsedExpr` refusal), a captured
 *   free variable doesn't resolve, or the separator isn't a string literal
 *   (a dynamic separator — out of scope for this arm).
 */
export function mapJoinChainToGo(
  ctx: GoEmitContext,
  chain: { object: ParsedExpr; arrow: Extract<ParsedExpr, { kind: 'arrow' }>; sepArg?: ParsedExpr },
  signals: { getter: string; initialValue: string; type?: TypeInfo; parsed?: ParsedExpr }[],
  propsParams: { name: string; sourceName?: string }[],
  propFallbackVars: ReadonlyMap<string, PropFallbackVar>,
): string | null {
  const itemsGo = resolveMapChainAsGo(ctx, chain.object, signals, propsParams, propFallbackVars)
  if (itemsGo === null) return null

  const mapGo = callbackStepToGo(ctx, 'map', itemsGo, chain.arrow, signals, propsParams, propFallbackVars)
  if (mapGo === null) return null

  let sepGo: string
  if (!chain.sepArg) {
    sepGo = JSON.stringify(',')
  } else if (chain.sepArg.kind === 'literal' && chain.sepArg.literalType === 'string') {
    sepGo = JSON.stringify(chain.sepArg.value)
  } else {
    return null
  }

  return `bf.Join(${mapGo}, ${sepGo})`
}
