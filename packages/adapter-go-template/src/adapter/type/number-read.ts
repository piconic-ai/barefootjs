/**
 * Which value reads hold a Go `float64`.
 *
 * A TS `number` is a JS double, so its Go field is a `float64` whatever
 * literal seeds it (`typeInfoToGo`). html/template prints a `float64` with
 * `fmt.Sprint`, which switches to exponent notation from `1e6` on
 * (`1.5e+06`) where JS prints `1500000`. The text and attribute sinks
 * route such a read through `bf_string`, whose `numberString` spells a
 * number as JS `String(n)` does. This module answers the "is it such a
 * read" half of that decision for a direct read: a prop, a signal or memo
 * getter, a `useContext` local, a loop row or a field of it, and a `??` /
 * `||` / `&&` over those.
 */

import { BindingScope, type ParsedExpr, type TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { collapseLiteralUnion, typeInfoToGo } from './type-codegen.ts'
import { inferMemoType, signalFieldGoType } from './state-fields.ts'

type RowSegment = { kind: 'field'; key: string; isIdent: boolean } | { kind: 'index'; index: number }

/** Array methods whose result holds the receiver's elements. */
const SAME_ELEMENT_METHODS: ReadonlySet<string> = new Set([
  'filter', 'slice', 'sort', 'toSorted', 'reverse', 'toReversed', 'concat',
])

/** Whether `expr` reads a value whose Go representation is a `float64`. */
export function readsGoFloat(
  ctx: GoEmitContext,
  expr: ParsedExpr,
  scope: BindingScope,
  seen: ReadonlySet<string> = new Set(),
): boolean {
  if (expr.kind === 'logical') return readsGoFloat(ctx, expr.left, scope, seen) || readsGoFloat(ctx, expr.right, scope, seen)
  // A declared `number` also covers a field that holds it boxed: a nillable
  // `interface{}` prop, or a getter whose name collides with a prop's field.
  // An undeclared getter is a number when its body or seed is one.
  const getter = getterRead(ctx, expr, scope)
  if (getter !== null) {
    if (isNumberType(getter.type) || getter.goType() === 'float64') return true
    return getter.type.kind === 'unknown' && getter.body !== undefined && !seen.has(getter.name) &&
      isNumberValued(ctx, getter.body, new Set([...seen, getter.name]))
  }
  // A `useContext` local whose context default is a number (a `float64` field).
  if (expr.kind === 'identifier' && !scope.isBound(expr.name) &&
      ctx.state.contextConsumers.some(c => c.localName === expr.name && typeof c.defaultValue === 'number')) {
    return true
  }
  const prop = propRead(ctx, expr, scope)
  if (prop !== null) {
    return isNumberType(prop.type) ||
      (ctx.state.propTypeOverrides.get(prop.name) ?? typeInfoToGo(ctx, prop.type, prop.defaultValue, prop.parsed)) === 'float64'
  }
  const type = valueType(ctx, expr, scope)
  return type !== null && isNumberType(type)
}

/**
 * Whether a getter's body or seed (component scope) computes a number: JS
 * arithmetic other than a string `+`, a unary sign, or a number read.
 */
function isNumberValued(ctx: GoEmitContext, expr: ParsedExpr, seen: ReadonlySet<string>): boolean {
  if (expr.kind === 'unary') return expr.op === '-' || expr.op === '+'
  if (expr.kind === 'binary') {
    if (['-', '*', '/', '%', '**'].includes(expr.op)) return true
    return expr.op === '+' && isNumberValued(ctx, expr.left, seen) && isNumberValued(ctx, expr.right, seen)
  }
  if (expr.kind === 'literal') return expr.literalType === 'number'
  if (expr.kind === 'conditional') return isNumberValued(ctx, expr.consequent, seen) && isNumberValued(ctx, expr.alternate, seen)
  return readsGoFloat(ctx, expr, BindingScope.EMPTY, seen)
}

/**
 * The element type of the array a loop ranges over, from the array
 * expression's declared type (a prop, a signal or memo, a row field, and a
 * `filter` / `slice` / `sort` chain over those). It types the loop's row
 * bindings (`LoopBindingSource.rowType`); the IR's `itemType` carries
 * scalar evidence only.
 */
export function loopRowType(
  ctx: GoEmitContext,
  loop: { arrayParsed?: ParsedExpr; iterationShape?: string; objectIteration?: unknown },
  scope: BindingScope,
): TypeInfo | null {
  // An `.entries()` / `Object.entries(…)` row is a tuple, not an element.
  if (loop.iterationShape !== undefined || loop.objectIteration) return null
  const type = loop.arrayParsed ? valueType(ctx, loop.arrayParsed, scope) : null
  return type?.kind === 'array' ? type.elementType ?? null : null
}

/** The declared TS type of a value expression; null when it can't be told. */
function valueType(ctx: GoEmitContext, expr: ParsedExpr, scope: BindingScope): TypeInfo | null {
  switch (expr.kind) {
    case 'identifier': {
      const row = scope.lookup(expr.name)?.binding.row
      // The scope carries the row's item type structurally (it stays free of
      // IR imports); this adapter enters a loop with an IR `TypeInfo`.
      if (row) return pathType(ctx, row.itemType as TypeInfo, row.segments)
      return propRead(ctx, expr, scope)?.type ?? null
    }
    case 'member': {
      if (expr.computed) return null
      const prop = propRead(ctx, expr, scope)
      if (prop !== null) return prop.type
      const object = valueType(ctx, expr.object, scope)
      return object && pathType(ctx, object, [{ kind: 'field', key: expr.property, isIdent: true }])
    }
    case 'index-access': {
      const object = valueType(ctx, expr.object, scope)
      return object?.kind === 'array' ? object.elementType ?? null : null
    }
    case 'call': {
      const getter = getterRead(ctx, expr, scope)
      if (getter !== null) return getter.type
      if (expr.callee.kind === 'member' && !expr.callee.computed && SAME_ELEMENT_METHODS.has(expr.callee.property)) {
        return valueType(ctx, expr.callee.object, scope)
      }
      return null
    }
    case 'array-method':
      return SAME_ELEMENT_METHODS.has(expr.method) ? valueType(ctx, expr.object, scope) : null
    default:
      return null
  }
}

/** A no-argument signal or memo getter call: its declared type and its Props field's Go type. */
function getterRead(
  ctx: GoEmitContext,
  expr: ParsedExpr,
  scope: BindingScope,
): { name: string; type: TypeInfo; body: ParsedExpr | undefined; goType: () => string } | null {
  if (expr.kind !== 'call' || expr.callee.kind !== 'identifier' || expr.args.length !== 0) return null
  if (scope.isBound(expr.callee.name)) return null
  const name = ctx.state.getterAliases.get(expr.callee.name) ?? expr.callee.name
  const propsParamMap = () => new Map(ctx.state.currentPropsParams.map(p => [p.name, p]))
  const signal = ctx.state.currentSignals.find(s => s.getter === name)
  if (signal) {
    return { name, type: signal.type, body: signal.parsed, goType: () => signalFieldGoType(ctx, signal, propsParamMap()) }
  }
  const memo = ctx.state.currentMemos.find(m => m.name === name)
  if (memo) {
    return { name, type: memo.type, body: memo.parsed, goType: () => inferMemoType(ctx, memo, ctx.state.currentSignals, propsParamMap()) }
  }
  return null
}

/** The prop `props.x` or a destructured, unshadowed `x` reads; null for anything else. */
function propRead(ctx: GoEmitContext, expr: ParsedExpr, scope: BindingScope) {
  let name: string | null = null
  if (expr.kind === 'identifier' && !scope.isBound(expr.name)) {
    name = expr.name
  } else if (
    expr.kind === 'member' &&
    !expr.computed &&
    expr.object.kind === 'identifier' &&
    expr.object.name === ctx.state.propsObjectName &&
    !scope.isBound(expr.object.name)
  ) {
    name = expr.property
  }
  if (name === null) return null
  return ctx.state.currentPropsParams.find(p => !p.isRest && p.name === name) ?? null
}

/** The TS type at `segments` below `type`, through object, named and array types; null when unknown. */
function pathType(ctx: GoEmitContext, type: TypeInfo, segments: readonly RowSegment[]): TypeInfo | null {
  let current: TypeInfo | undefined = type
  for (const segment of segments) {
    if (!current) return null
    if (segment.kind === 'index') {
      current = current.kind === 'array' ? current.elementType : undefined
      continue
    }
    const named = current.raw
    const properties = current.properties ??
      ctx.state.currentTypeDefinitions.find(td => td.name === named)?.properties
    current = properties?.find(p => p.name === segment.key)?.type
  }
  return current ?? null
}

/** A `number` (or a number literal union), possibly unioned with `null` / `undefined`. */
function isNumberType(type: TypeInfo): boolean {
  const members = type.kind === 'union' && type.unionTypes
    ? type.unionTypes.filter(m => !(m.kind === 'primitive' && (m.primitive === 'null' || m.primitive === 'undefined')))
    : [type]
  if (members.length === 0) return false
  const collapsed = collapseLiteralUnion(members.length === 1 ? members[0] : { ...type, unionTypes: members })
  return collapsed.kind === 'primitive' && collapsed.primitive === 'number'
}
