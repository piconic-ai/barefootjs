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
import {
  isSameLoopValueType,
  loopValueTypeAt,
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
  /** The identifier the component reads its props object as (`props`); null for a destructured signature. */
  readonly propsObjectName: string | null
  readonly namedFields: NamedTypeFields
}

/** {@link DeclaredValueTypes} of a component. */
export function declaredValueTypes(ir: ComponentIR): DeclaredValueTypes {
  const { propsParams, signals, memos, typeDefinitions, propsObjectName } = ir.metadata
  return {
    propsParams,
    signals,
    memos,
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
  return type?.elementType ?? null
}

function valueType(types: DeclaredValueTypes, expr: ParsedExpr, scope: BindingScope): LoopValueType | null {
  switch (expr.kind) {
    case 'identifier': {
      const hit = scope.lookup(expr.name)
      if (!hit) return propType(types, expr.name)
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
      return object?.elementType ?? null
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
 * The type of `receiver.concat(...args)`: the receiver's array type when every
 * argument is an array of the same element type, or one such element (#3762
 * review). An argument of another or an unknown type (`extras: any[]`) can
 * put rows of any shape into the result, so the result is then still the
 * receiver's kind of array, but with no declared element type.
 */
export function concatType<T extends LoopValueType>(receiver: T | null, args: readonly (T | null)[]): T | null {
  const element = receiver?.elementType
  if (!receiver || !element) return receiver
  const sameElements = args.every(arg =>
    arg !== null && (arg.elementType ? isSameLoopValueType(arg.elementType, element) : isSameLoopValueType(arg, element)))
  return sameElements ? receiver : { ...receiver, elementType: undefined }
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

function propType(types: DeclaredValueTypes, name: string): LoopValueType | null {
  const param = types.propsParams.find(p => !p.isRest && p.name === name)
  if (!param) return null
  return param.type.kind === 'unknown' ? param.declaredType ?? null : param.type
}
