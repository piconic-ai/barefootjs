/**
 * Type codegen: render TypeScript types as Go type strings.
 *
 * Free functions over a {@link GoEmitContext}. They resolve a prop/signal/const's
 * type (`TypeInfo`, a raw type string, or — as a last resort — an inferred shape
 * from a literal value) into the Go type used for its struct field. They read
 * `state.localStructFields` / `state.localTypeAliases` (an ACTUAL Go-backed
 * local type — a generated struct or a string-union alias) rather than the
 * broader `state.localTypeNames` (every type definition, including a tuple
 * alias no struct was ever emitted for — #2087); `inferTypeFromValue` is fully
 * pure.
 */

import type { ParsedExpr, TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'

/**
 * Collapse a homogeneous LITERAL union (`'a' | 'b'`, `1 | 2`, `true | false`)
 * to the primitive that backs it, so a variant-typed signal or prop
 * (`createSignal<'a' | 'b'>('a')`, the `{ variant?: 'a' | 'b' }` prop shape)
 * gets a real Go type instead of `interface{}` — and, downstream in
 * `convertInitialValue`, a real seed instead of `nil`. #2477's Go leg: the
 * analyzer maps an explicit literal-union type argument to
 * `{kind:'union'}` of literal members, and with no
 * `union` arm here OR in `convertInitialValue` the field fell to
 * `interface{}` and the seed to `nil` — which the child's `string` field
 * then rejected at `go run` time (`cannot use nil as string value`).
 *
 * Only a union whose EVERY member is a literal of ONE primitive family
 * (string / number / boolean; a same-family primitive keyword member like
 * `'a' | string` also counts) collapses. Anything else — mixed families,
 * `null` / `undefined` members, object members — returns the input
 * unchanged and keeps today's `interface{}` fallback, so the collapse can
 * never widen what Go accepts, only type what it already receives.
 */
export function collapseLiteralUnion(typeInfo: TypeInfo): TypeInfo {
  if (typeInfo.kind !== 'union' || !typeInfo.unionTypes || typeInfo.unionTypes.length === 0) {
    return typeInfo
  }
  // Purely structural: `typeNodeToTypeInfo` lowers a literal member to
  // `kind: 'primitive'` + `literalValue`, so the member's family is just
  // its `primitive` — no re-parsing of `raw` (the first cut of this
  // helper regexed the member text because the analyzer had no literal
  // arm; that gap is closed at the source).
  const familyOf = (m: TypeInfo): 'string' | 'number' | 'boolean' | null => {
    if (m.kind !== 'primitive') return null
    return m.primitive === 'string' || m.primitive === 'number' || m.primitive === 'boolean'
      ? m.primitive
      : null
  }
  const first = familyOf(typeInfo.unionTypes[0])
  if (!first) return typeInfo
  for (const m of typeInfo.unionTypes) {
    if (familyOf(m) !== first) return typeInfo
  }
  return { kind: 'primitive', raw: typeInfo.raw, primitive: first }
}

/**
 * A literal number's numeric value, unwrapping a leading unary minus (`-7.6`
 * parses as `{kind:'unary', op:'-', argument:{literalType:'number', value:7.6}}`
 * — the same shape `parsedLiteralToGo`'s own unary-minus arm unwraps,
 * `value-lowering.ts`/`parsed-literal-to-go.ts`). Returns `null` for anything
 * that isn't (possibly negated) a number literal.
 */
function literalNumberValue(expr: ParsedExpr): number | null {
  if (expr.kind === 'literal' && expr.literalType === 'number' && typeof expr.value === 'number') {
    return expr.value
  }
  if (
    expr.kind === 'unary' &&
    expr.op === '-' &&
    expr.argument.kind === 'literal' &&
    expr.argument.literalType === 'number' &&
    typeof expr.argument.value === 'number'
  ) {
    return -expr.argument.value
  }
  return null
}

/**
 * Structural counterpart to {@link inferTypeFromValue}: classify a parsed
 * literal's Go type from its `ParsedExpr` shape instead of its source text.
 * Returns `null` for anything not covered here (identifier/call/member,
 * object-literal — same scope `inferTypeFromValue`'s text scan covers, so a
 * caller falling back to the text path for those sees identical results).
 */
function inferGoTypeFromParsed(expr: ParsedExpr): string | null {
  const n = literalNumberValue(expr)
  if (n !== null) return Number.isInteger(n) ? 'int' : 'float64'
  if (expr.kind === 'literal') {
    if (expr.literalType === 'boolean') return 'bool'
    if (expr.literalType === 'string') return 'string'
    return null
  }
  if (expr.kind === 'array-literal') return '[]interface{}'
  return null
}

/**
 * Convert a `TypeInfo` to a Go type string.
 *
 * @param defaultValue used to infer the type when `typeInfo.kind` is
 *   `unknown`, and to distinguish `int` vs `float64` when `kind` is
 *   `primitive`/`number` (#2168 math-methods/number-tofixed — a bare TS
 *   `number` blindly mapped to Go `int`, so a fractional signal initial
 *   value like `-7.6` silently truncated to the Go zero value)
 * @param preParsed the SAME default/initial value as `defaultValue`, already
 *   parsed to structure (`SignalInfo.parsed` / `ParamInfo.parsed`) — preferred
 *   over regexing `defaultValue`'s text when present. Callers with no
 *   structural counterpart (a shape `tsNodeToParsedExpr` doesn't support) pass
 *   nothing and fall through to the text path.
 * @returns the Go type, falling back to `interface{}` when unresolvable
 */
export function typeInfoToGo(
  ctx: GoEmitContext,
  _typeInfo: TypeInfo,
  defaultValue?: string,
  preParsed?: ParsedExpr,
): string {
  const typeInfo = collapseLiteralUnion(_typeInfo)
  switch (typeInfo.kind) {
    case 'primitive':
      switch (typeInfo.primitive) {
        case 'string':
          return 'string'
        case 'number': {
          const n = preParsed ? literalNumberValue(preParsed) : null
          if (n !== null) return Number.isInteger(n) ? 'int' : 'float64'
          return defaultValue !== undefined ? numberPrimitiveGoType(defaultValue) : 'int'
        }
        case 'boolean':
          return 'bool'
        default:
          return 'interface{}'
      }
    case 'array':
      if (typeInfo.elementType) {
        return `[]${typeInfoToGo(ctx, typeInfo.elementType)}`
      }
      return '[]interface{}'
    case 'object':
      return 'map[string]interface{}'
    case 'interface':
      // Gate on an ACTUAL backing (a generated struct — `localStructFields` —
      // or a string-union alias — `localTypeAliases`, which emits `type X =
      // string`), not mere presence in `localTypeNames`: the latter registers
      // EVERY type definition unconditionally (#2087), including a tuple alias
      // (`type Row = readonly [string, string]`) that `typeDefinitionToGo`
      // can't turn into a struct (no object properties) and so never actually
      // emits. Returning the bare name for one of those would reference an
      // undeclared Go type (`[]Row`) and fail to compile — fall through to the
      // generic-array/interface{} handling below instead, so a tuple-typed
      // signal bakes as `[]interface{}` (each item itself an `interface{}`
      // holding a `[]interface{}`) and the destructure `index`/`bf_slice`
      // lowering still works via reflection regardless of the static type.
      if (typeInfo.raw && (ctx.state.localStructFields.has(typeInfo.raw) || ctx.state.localTypeAliases.has(typeInfo.raw))) {
        return typeInfo.raw
      }
      // A named type with no backing struct/alias — an external/unresolved
      // reference. `typeNodeToTypeInfo` already normalises every ARRAY spelling
      // (`T[]`, `Array<T>`, `ReadonlyArray<T>`) to `kind: 'array'` before a
      // `TypeInfo` ever reaches here (#2480's structural literal-type pass did
      // the same for literal unions), so `typeInfo.raw` at this point is never
      // an array shape — `tsTypeStringToGo` is a plain lookup, not a parser.
      if (typeInfo.raw) {
        const resolved = tsTypeStringToGo(ctx, typeInfo.raw)
        if (resolved !== 'interface{}') return resolved
      }
      return 'interface{}'
    case 'unknown': {
      const inferred = preParsed ? inferGoTypeFromParsed(preParsed) : null
      if (inferred) return inferred
      if (defaultValue !== undefined) {
        return inferTypeFromValue(defaultValue)
      }
      return 'interface{}'
    }
    default:
      return 'interface{}'
  }
}

/**
 * Look up a raw TypeScript type-reference name against the component's own
 * Go-backed local types. NOT a parser: by the time a `TypeInfo` reaches here
 * (`typeInfoToGo`'s `'interface'` case, its one caller) `typeNodeToTypeInfo`
 * has already normalised every array spelling to `kind: 'array'` and every
 * primitive keyword to `kind: 'primitive'` — `tsType` is always a bare named
 * reference (a struct, a string-union alias, or an unbacked/external name),
 * never `T[]` / `Array<T>` / `'number'` text to re-parse. (#2484: this used to
 * carry `t.endsWith('[]')` / `Array<(.+)>` regex branches as a fallback for
 * that dead case — unreachable given the analyzer's normalisation, deleted.)
 */
export function tsTypeStringToGo(ctx: GoEmitContext, tsType: string): string {
  const t = tsType.trim()
  if (ctx.state.localStructFields.has(t) || ctx.state.localTypeAliases.has(t)) return t
  return 'interface{}'
}

/**
 * Distinguish Go `int` vs `float64` for a `number`-typed field from the
 * literal source text of its default/initial value. TEXT FALLBACK: used only
 * when `typeInfoToGo`'s caller has no structural `ParsedExpr` for the same
 * value to pass as `preParsed` (see `inferGoTypeFromParsed`/`literalNumberValue`
 * above, which this mirrors on parsed structure). Falls back to `int` when
 * `value` isn't recognizably a bare numeric literal (e.g. a destructured
 * default that's itself an expression, `props.initial ?? 0`) — `int` remains
 * the blind fallback for `kind: 'primitive'`; only a literal fractional value
 * (`-7.6`) is positive enough evidence to widen to `float64`.
 */
function numberPrimitiveGoType(value: string): string {
  return /^-?\d+\.\d+$/.test(value) ? 'float64' : 'int'
}

/**
 * Infer a Go type from a JS value literal's source TEXT; `interface{}` when
 * unrecognized. TEXT FALLBACK: mirrors `inferGoTypeFromParsed` above on raw
 * text, used only when `typeInfoToGo`'s caller has no structural `ParsedExpr`
 * for the same value to pass as `preParsed`.
 */
export function inferTypeFromValue(value: string): string {
  if (value === 'true' || value === 'false') return 'bool'
  if (/^-?\d+$/.test(value)) return 'int'
  if (/^-?\d+\.\d+$/.test(value)) return 'float64'
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return 'string'
  }
  if (value === '""' || value === "''") return 'string'
  if (value.startsWith('[')) return '[]interface{}'
  return 'interface{}'
}
