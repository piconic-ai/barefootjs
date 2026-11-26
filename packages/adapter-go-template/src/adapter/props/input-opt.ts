/**
 * The `bf.Opt[T]` fields of a generated `<Name>Input` (spec/js-undefined-value.md
 * §3 "Go: `bf.Opt[T]`", rollout step U8): which props take one, what `T` is,
 * and how the props constructor reads one back as the JS value.
 *
 * A prop whose type admits absence or `null` (an optional prop, a `| null` /
 * `| undefined` union) is a `bf.Opt[T]` on the Input, so a host tells the four
 * JS states apart (absent, a present `undefined`, `null`, a value); a
 * required, non-nullable prop keeps its plain Go type. The constructor first
 * reads every Opt into the field type the rest of the generated code works
 * with (the `bf<Name>In` mirror of the Input): `V()` (`bf.Undefined`, nil for
 * `null`, or the value) into an `interface{}` field, `Value()` into a
 * concrete one.
 */

import { isChildrenPropParam, type IRMetadata, type TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { typeInfoToGo, withoutNilMembers } from '../type/type-codegen.ts'

type PropParam = IRMetadata['propsParams'][number]

/** Whether `t` is the `null` or `undefined` type. */
function isNilMember(t: TypeInfo): boolean {
  return t.kind === 'primitive' && (t.primitive === 'null' || t.primitive === 'undefined')
}

/**
 * Whether `t` admits `null` or `undefined`: a union with a `null` /
 * `undefined` member, or a type Phase 1 does not narrow (`any`, `unknown`).
 */
export function typeAdmitsNil(t: TypeInfo | undefined): boolean {
  if (!t) return false
  if (t.kind === 'unknown' || isNilMember(t)) return true
  return t.kind === 'union' && (t.unionTypes ?? []).some(isNilMember)
}

/**
 * Whether `param`'s Input field is a `bf.Opt[T]`: a prop that may be absent
 * or `null`. Never the rest bag or the children slot.
 */
export function isOptInputParam(param: PropParam): boolean {
  if (param.isRest || isChildrenPropParam(param)) return false
  return !!param.optional || typeAdmitsNil(param.type)
}

/** Whether a field type holds any JS value (`bf.Undefined` and nil included). */
function isAnyGoType(goType: string): boolean {
  return goType === 'interface{}' || goType === 'any'
}

/**
 * The `T` of `param`'s `bf.Opt[T]` Input field, given `internalType`, the Go
 * type the constructor works with (`resolvePropGoType`): that type itself
 * when it is concrete, else the prop's declared type without its `null` /
 * `undefined` members (`any` when that has no Go type of its own).
 */
export function optElemGoType(ctx: GoEmitContext, param: PropParam, internalType: string): string {
  if (!isAnyGoType(internalType)) return internalType
  const override = ctx.state.propTypeOverrides.get(param.name)
  const elem = override && !isAnyGoType(override) ? override : typeInfoToGo(ctx, withoutNilMembers(param.type), param.defaultValue, param.parsed)
  // An optional object-typed prop takes a map, as its typed field did: only
  // the keys the caller supplies (`resolvePropGoType`).
  if (param.optional && ctx.state.localStructFields.has(elem)) return 'map[string]interface{}'
  return isAnyGoType(elem) || elem.includes('interface{}') ? 'any' : elem
}

/** `bf.Opt[T]`. */
export function goOptType(elem: string): string {
  return `bf.Opt[${isAnyGoType(elem) ? 'any' : elem}]`
}

/**
 * The constructor's read of an Opt Input field `input.<field>` as a value of
 * `internalType`: the JS value (`V()`) into an `interface{}` field, the held
 * value (`Value()`, the zero value when there is none) into a concrete one.
 */
export function optInputRead(field: string, internalType: string): string {
  return isAnyGoType(internalType) ? `input.${field}.V()` : `input.${field}.Value()`
}

/**
 * The Go value a parent writes into a child's Input field: as it is when the
 * child's field is known to be plain, else through `bf.Coerce`, which takes
 * the field's own type from `<Child>Input{}.<field>` (a `bf.Opt[T]` or a plain
 * type, whichever the child declares) and converts the JS value into it.
 */
export function childInputFieldValue(declaredName: string, goField: string, goValue: string, knownPlain: boolean): string {
  return knownPlain ? goValue : `bf.Coerce(${declaredName}Input{}.${goField}, ${goValue})`
}
