/**
 * Which text and attribute values can be a Go `float64`.
 *
 * A TS `number` is a JS double, so its Go field is a `float64` whatever
 * literal seeds it (`typeInfoToGo`). html/template prints a `float64` with
 * `fmt.Sprint`, which switches to exponent notation from `1e6` on
 * (`1.5e+06`) where JS prints `1500000`. A number reaches a sink through
 * many shapes — a prop, a signal or memo (a synthesized row struct's field
 * included), a loop row, a `.map()` preamble local (`const id = row.id`),
 * a `useContext` local, a child's own prop — so the sink does not try to
 * prove that a value IS a number. It routes every value read through the
 * runtime's `bf_text` (a float64 spelled as JS does, anything else passed
 * through unchanged) unless the value is provably NOT a number: a literal,
 * a comparison, a string method, or a read whose declared type is a
 * string, a boolean, an array or an object. This module answers that
 * "provably not a number" half.
 */

import { isChildrenPropParam, type BindingScope, type ParsedExpr, type TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { collapseLiteralUnion } from './type-codegen.ts'

type RowSegment = { kind: 'field'; key: string; isIdent: boolean } | { kind: 'index'; index: number }

/** Array methods whose result holds the receiver's elements. */
const SAME_ELEMENT_METHODS: ReadonlySet<string> = new Set([
  'filter', 'slice', 'sort', 'toSorted', 'reverse', 'toReversed', 'concat',
])

/** Methods whose result is a string or a boolean, never a number. */
const NON_NUMBER_METHODS: ReadonlySet<string> = new Set([
  'join', 'toUpperCase', 'toLowerCase', 'trim', 'trimStart', 'trimEnd', 'padStart', 'padEnd',
  'repeat', 'replace', 'replaceAll', 'toFixed', 'toString', 'charAt',
  'includes', 'startsWith', 'endsWith', 'some', 'every', 'isArray',
])

/** Binary operators whose result is a boolean. */
const BOOLEAN_OPS: ReadonlySet<string> = new Set([
  '===', '!==', '==', '!=', '<', '<=', '>', '>=', 'in', 'instanceof',
])

/**
 * Whether `expr` provably holds no number, so its sink can print it bare.
 * False (wrap it in `bf_text`) whenever the type can't be told.
 */
export function isKnownNonNumber(ctx: GoEmitContext, expr: ParsedExpr, scope: BindingScope): boolean {
  switch (expr.kind) {
    case 'literal':
      // A literal prints as Go's constant does; only a computed float can
      // take `fmt`'s exponent form.
      return true
    case 'template-literal':
      return true
    case 'binary':
      return BOOLEAN_OPS.has(expr.op)
    case 'unary':
      return expr.op === '!'
    case 'logical':
      return isKnownNonNumber(ctx, expr.left, scope) && isKnownNonNumber(ctx, expr.right, scope)
    case 'conditional':
      return isKnownNonNumber(ctx, expr.consequent, scope) && isKnownNonNumber(ctx, expr.alternate, scope)
    case 'array-method':
      if (NON_NUMBER_METHODS.has(expr.method)) return true
      break
    case 'call':
      if (expr.callee.kind === 'member' && !expr.callee.computed && NON_NUMBER_METHODS.has(expr.callee.property)) {
        return true
      }
      break
    case 'member':
      if (!expr.computed && expr.property === 'length') return isIntLength(ctx, expr, scope)
      break
  }
  // The component's own `children` is rendered markup (a `template.HTML`
  // field), never a number, whatever its declared type.
  const prop = propRead(ctx, expr, scope)
  if (prop !== null && isChildrenPropParam(prop)) return true
  const type = valueType(ctx, expr, scope)
  return type !== null && isNonNumberType(type)
}

/**
 * A `.length` read is the int `bf_len` / `len` returns, except on a field
 * that is itself named `length` (`props: { length: number }`): when the
 * member's own declared type is known, that type decides as for any other
 * read. Only an untyped `.length` is taken for the int length.
 */
function isIntLength(ctx: GoEmitContext, expr: Extract<ParsedExpr, { kind: 'member' }>, scope: BindingScope): boolean {
  const own = valueType(ctx, expr, scope)
  return own === null || isNonNumberType(own)
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

/**
 * Whether `expr` is provably an array: its declared type is one (possibly
 * unioned with `null` / `undefined`), it is an array literal, or it is a
 * `??` / `||` of two such operands. Its JS `.length` is then the element
 * count Go's `len` gives. A string, an unknown type or anything else is
 * false: a string's `.length` counts UTF-16 code units, which only
 * `bf_length` does (#3609).
 */
export function isKnownArray(ctx: GoEmitContext, expr: ParsedExpr, scope: BindingScope): boolean {
  if (expr.kind === 'array-literal') return true
  // `(todos() ?? []).length`: either operand is the value, so both must be arrays.
  if (expr.kind === 'logical' && expr.op !== '&&') {
    return isKnownArray(ctx, expr.left, scope) && isKnownArray(ctx, expr.right, scope)
  }
  const type = valueType(ctx, expr, scope)
  if (type === null) return false
  const members = type.kind === 'union' && type.unionTypes
    ? type.unionTypes.filter(m => !(m.kind === 'primitive' && (m.primitive === 'null' || m.primitive === 'undefined')))
    : [type]
  return members.length > 0 && members.every(m => m.kind === 'array')
}

/** The declared TS type of a value expression; null when it can't be told. */
function valueType(ctx: GoEmitContext, expr: ParsedExpr, scope: BindingScope): TypeInfo | null {
  switch (expr.kind) {
    case 'identifier':
      return identifierType(ctx, expr, scope)
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
    case 'call':
      return callType(ctx, expr, scope)
    case 'array-method':
      return SAME_ELEMENT_METHODS.has(expr.method) ? valueType(ctx, expr.object, scope) : null
    default:
      return null
  }
}

/** A loop row binding's type along its path, or a destructured prop's type. */
function identifierType(ctx: GoEmitContext, expr: Extract<ParsedExpr, { kind: 'identifier' }>, scope: BindingScope): TypeInfo | null {
  const hit = scope.lookup(expr.name)
  if (!hit) return propRead(ctx, expr, scope)?.type ?? null
  const row = hit.binding.row
  // The scope carries the row's item type structurally (it stays free of
  // IR imports); this adapter enters a loop with an IR `TypeInfo`.
  return row ? pathType(ctx, row.itemType as TypeInfo, row.segments) : null
}

/** A signal or memo getter's type, or the receiver's type through a same-element array method. */
function callType(ctx: GoEmitContext, expr: Extract<ParsedExpr, { kind: 'call' }>, scope: BindingScope): TypeInfo | null {
  const callee = expr.callee
  if (callee.kind === 'identifier' && expr.args.length === 0 && !scope.isBound(callee.name)) {
    const name = ctx.state.getterAliases.get(callee.name) ?? callee.name
    const getter = ctx.state.currentSignals.find(s => s.getter === name) ?? ctx.state.currentMemos.find(m => m.name === name)
    return getter ? declaredGetterType(ctx, name, getter.type) : null
  }
  if (callee.kind === 'member' && !callee.computed && SAME_ELEMENT_METHODS.has(callee.property)) {
    return valueType(ctx, callee.object, scope)
  }
  return null
}

/**
 * A getter's type: the struct synthesized for an untyped object-literal
 * signal (`createSignal([{ id: 1 }])`, whose analyzer type carries no field
 * shape) when there is one, else its declared type.
 */
function declaredGetterType(ctx: GoEmitContext, name: string, declared: TypeInfo): TypeInfo {
  return ctx.state.synthStructTypes.get(name) ?? declared
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

/**
 * A string, a boolean (or a literal union of one of them), an array or an
 * object, possibly unioned with `null` / `undefined`: a type no Go `float64`
 * field can hold. A named type counts only when the file defines it as a
 * struct or a string union.
 */
function isNonNumberType(type: TypeInfo): boolean {
  const members = type.kind === 'union' && type.unionTypes
    ? type.unionTypes.filter(m => !(m.kind === 'primitive' && (m.primitive === 'null' || m.primitive === 'undefined')))
    : [type]
  if (members.length === 0) return false
  const collapsed = collapseLiteralUnion(members.length === 1 ? members[0] : { ...type, unionTypes: members })
  if (collapsed.kind === 'primitive') return collapsed.primitive === 'string' || collapsed.primitive === 'boolean'
  return collapsed.kind === 'array' || collapsed.kind === 'object'
}
