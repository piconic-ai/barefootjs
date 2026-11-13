/**
 * The declared element type of the array a loop ranges over, read from the
 * component's IR: a prop (`props.rows`, a destructured `rows`), a signal or
 * memo getter (`items()`), a row field of an enclosing loop (`r.tags`), an
 * index into one of those, and a `filter` / `slice` / `sort` chain over them.
 * A template adapter enters a loop row with it as
 * `LoopBindingSource.rowType`, so the row's bindings resolve their field types
 * at the read (`row.id`, a destructured `id`) through the shared
 * `BindingScope` (#3762). The IR's `itemType` carries scalar evidence only.
 */

import type { ParsedExpr } from '../expression-parser.ts'
import type { ComponentIR, TypeInfo } from '../types.ts'
import { factsOfType } from './operand-typing.ts'
import {
  arrayElementType,
  loopValueTypeAt,
  unionOfLoopValueTypes,
  type BindingScope,
  type LoopValueType,
  type NamedTypeFields,
} from '../scope/binding-scope.ts'

/**
 * Array methods whose result has the receiver's element type. `concat` is
 * not one: its result also holds its arguments' elements ({@link concatType}).
 */
const SAME_ELEMENT_METHODS: ReadonlySet<string> = new Set([
  'filter', 'slice', 'sort', 'toSorted', 'reverse', 'toReversed',
])

/** What a component declares about the types of the values it reads. */
export interface DeclaredValueTypes {
  readonly propsParams: readonly {
    readonly name: string
    readonly type: TypeInfo
    readonly declaredType?: TypeInfo
    readonly isRest?: boolean
  }[]
  readonly signals: readonly { readonly getter: string; readonly type: TypeInfo }[]
  readonly memos: readonly { readonly name: string; readonly type: TypeInfo }[]
  /**
   * The component's module- and function-scope consts with their declared
   * types (`const ROWS: Row[] = […]`), read when no prop or loop binding
   * holds the name (#3728). Optional: a view without them types no const.
   */
  readonly constants?: readonly { readonly name: string; readonly type: TypeInfo | null; readonly parsed?: ParsedExpr }[]
  /** The identifier the component reads its props object as (`props`); null for a destructured signature. */
  readonly propsObjectName: string | null
  readonly namedFields: NamedTypeFields
}

/** {@link DeclaredValueTypes} of a component. */
export function declaredValueTypes(ir: ComponentIR): DeclaredValueTypes {
  const { propsParams, signals, memos, typeDefinitions, propsObjectName, localConstants } = ir.metadata
  return {
    propsParams,
    signals,
    memos,
    constants: localConstants,
    propsObjectName: propsObjectName ?? null,
    namedFields: name => typeDefinitions.find(td => td.name === name)?.properties,
  }
}

/** The element type of the array `loop` ranges over; null when it is not declared. */
export function loopRowType(
  types: DeclaredValueTypes,
  loop: { readonly arrayParsed?: ParsedExpr; readonly iterationShape?: string; readonly objectIteration?: unknown },
  scope: BindingScope,
): LoopValueType | null {
  // An `.entries()` / `Object.entries(…)` row is a tuple, not an element.
  if (loop.iterationShape !== undefined || loop.objectIteration || !loop.arrayParsed) return null
  const type = valueType(types, loop.arrayParsed, scope)
  return arrayElementType(type) ?? null
}

/**
 * The declared type of the value `expr` reads in `scope` (a prop, a member
 * path below one, a loop row, a signal or memo getter), or null when the
 * declarations do not say. An optional field below the root admits
 * `undefined` (`loopValueTypeAt`).
 */
export function declaredValueType(types: DeclaredValueTypes, expr: ParsedExpr, scope: BindingScope): LoopValueType | null {
  return valueType(types, expr, scope)
}

/**
 * Whether the value `expr` reads in `scope` is declared to admit `undefined`
 * or `null` (#3728): a loop row's optional field (`r.tone` with
 * `tone?: string`), a destructured one, or a nullable union. The one answer
 * every template adapter's nullish-attribute guard reads
 * (`NullishAttrContext.declaredNil`). An undeclared value answers false.
 */
export function declaredValueMayBeNil(types: DeclaredValueTypes, expr: ParsedExpr, scope: BindingScope): boolean {
  return factsOfType(valueType(types, expr, scope)).types.has('nil')
}

function valueType(types: DeclaredValueTypes, expr: ParsedExpr, scope: BindingScope): LoopValueType | null {
  switch (expr.kind) {
    case 'identifier': {
      const hit = scope.lookup(expr.name)
      if (!hit) return propType(types, expr.name) ?? constType(types, expr.name)
      const row = hit.binding.row
      return row ? loopValueTypeAt(row.itemType, row.segments, types.namedFields) : null
    }
    case 'member': {
      if (expr.computed) return null
      if (expr.object.kind === 'identifier' && expr.object.name === types.propsObjectName && !scope.isBound(expr.object.name)) {
        return propType(types, expr.property)
      }
      const object = valueType(types, expr.object, scope)
      return object && loopValueTypeAt(object, [{ kind: 'field', key: expr.property, isIdent: true }], types.namedFields)
    }
    case 'index-access': {
      const object = valueType(types, expr.object, scope)
      return arrayElementType(object) ?? null
    }
    case 'call':
      return callType(types, expr, scope)
    case 'array-method':
      if (expr.method === 'concat') {
        return concatType(valueType(types, expr.object, scope), expr.args.map(arg => valueType(types, arg, scope)))
      }
      return SAME_ELEMENT_METHODS.has(expr.method) ? valueType(types, expr.object, scope) : null
    default:
      return null
  }
}

/**
 * The type of `receiver.concat(...args)`: an array whose element type is the
 * union of the receiver's element type and each argument's (an array
 * argument's elements, or the argument itself). A field read on a row of it
 * is then a definite string only when it is one in every member
 * (`loopValueTypeAt`), so an `any[]` argument or a field one member lacks
 * types nothing (#3762 review). An argument of unknown type leaves the
 * result with no element type.
 */
export function concatType<T extends LoopValueType>(receiver: T | null, args: readonly (T | null)[]): T | null {
  const element = arrayElementType(receiver)
  if (!receiver || !element) return receiver
  const asArray = (elementType: T | undefined): T => ({ ...receiver, kind: 'array', unionTypes: undefined, elementType })
  if (args.some(arg => arg === null)) return asArray(undefined)
  const members = [element, ...(args as T[]).map(arg => arrayElementType(arg) ?? arg)]
  return asArray(unionOfLoopValueTypes(members))
}

/** A prop's declared type; a destructured prop whose type stays `unknown` carries it as `declaredType`. */
/** A signal or memo getter's type, or the receiver's type through an element-keeping array method. */
function callType(types: DeclaredValueTypes, expr: Extract<ParsedExpr, { kind: 'call' }>, scope: BindingScope): LoopValueType | null {
  const callee = expr.callee
  if (callee.kind === 'identifier' && expr.args.length === 0 && !scope.isBound(callee.name)) {
    return types.signals.find(s => s.getter === callee.name)?.type ??
      types.memos.find(m => m.name === callee.name)?.type ?? null
  }
  if (callee.kind !== 'member' || callee.computed) return null
  if (callee.property === 'concat') {
    return concatType(valueType(types, callee.object, scope), expr.args.map(arg => valueType(types, arg, scope)))
  }
  return SAME_ELEMENT_METHODS.has(callee.property) ? valueType(types, callee.object, scope) : null
}

/**
 * A const's type: its declared one (`const ROWS: Row[] = […]`), or, for an
 * untyped array of object literals (`unknown[]` carries no field types), the
 * row shape the literal spells (`literalRowsType`).
 */
function constType(types: DeclaredValueTypes, name: string): LoopValueType | null {
  const constant = types.constants?.find(c => c.name === name)
  if (!constant) return null
  const type = constant.type
  if (type && type.kind !== 'unknown' && !(type.kind === 'array' && !type.elementType)) return type
  return constant.parsed ? literalRowsType(constant.parsed) : null
}

/**
 * The array type an array literal of plain object literals spells
 * (`[{ id: 1, tone: 'k' }, { id: 2 }]`): one object row whose fields are
 * every key a row has, typed by the literal values the rows hold, and
 * optional when some row omits the key, as TypeScript infers it (#3728).
 * A value that is not a scalar literal types its field `unknown`. Null for
 * any other shape (a spread, a non-object element, an empty array).
 */
function literalRowsType(parsed: ParsedExpr): LoopValueType | null {
  if (parsed.kind !== 'array-literal' || parsed.elements.length === 0) return null
  const rows: Map<string, LoopValueType>[] = []
  for (const element of parsed.elements) {
    if (element.kind !== 'object-literal') return null
    const row = new Map<string, LoopValueType>()
    for (const p of element.properties) {
      if (p.kind !== 'prop') return null
      row.set(p.key, literalValueType(p.value))
    }
    rows.push(row)
  }
  const keys = [...new Set(rows.flatMap(row => [...row.keys()]))]
  const properties = keys.map(key => {
    const present = rows.flatMap(row => (row.has(key) ? [row.get(key)!] : []))
    return { name: key, type: unionOfLoopValueTypes(present), optional: present.length < rows.length }
  })
  return { kind: 'array', elementType: { kind: 'object', properties } }
}

/** The type of a scalar literal (`'k'`, `1`, `true`, `null`, `undefined`); `unknown` otherwise. */
function literalValueType(value: ParsedExpr): LoopValueType {
  if (value.kind === 'literal') return { kind: 'primitive', primitive: value.literalType, raw: value.literalType }
  if (value.kind === 'identifier' && value.name === 'undefined') return { kind: 'primitive', primitive: 'undefined', raw: 'undefined' }
  return { kind: 'unknown' }
}

function propType(types: DeclaredValueTypes, name: string): LoopValueType | null {
  const param = types.propsParams.find(p => !p.isRest && p.name === name)
  if (!param) return null
  return param.type.kind === 'unknown' ? param.declaredType ?? null : param.type
}
