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

import type { TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'

/**
 * Convert a `TypeInfo` to a Go type string.
 *
 * @param defaultValue used to infer the type when `typeInfo.kind` is `unknown`
 * @returns the Go type, falling back to `interface{}` when unresolvable
 */
export function typeInfoToGo(
  ctx: GoEmitContext,
  typeInfo: TypeInfo,
  defaultValue?: string,
): string {
  switch (typeInfo.kind) {
    case 'primitive':
      switch (typeInfo.primitive) {
        case 'string':
          return 'string'
        case 'number':
          return 'int'
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
      // Resolve a raw type string pattern (e.g. `Array<Todo>`).
      if (typeInfo.raw) {
        const resolved = tsTypeStringToGo(ctx, typeInfo.raw)
        if (resolved !== 'interface{}') return resolved
      }
      return 'interface{}'
    case 'unknown':
      if (defaultValue !== undefined) {
        return inferTypeFromValue(defaultValue)
      }
      return 'interface{}'
    default:
      return 'interface{}'
  }
}

/**
 * Convert a raw TypeScript type string to a Go type string. Handles primitives,
 * `T[]` / `Array<T>` arrays, and known local types; else `interface{}`.
 */
export function tsTypeStringToGo(ctx: GoEmitContext, tsType: string): string {
  const t = tsType.trim()
  if (t === 'number') return 'int'
  if (t === 'string') return 'string'
  if (t === 'boolean' || t === 'bool') return 'bool'
  if (t.endsWith('[]')) {
    const elem = t.slice(0, -2)
    return `[]${tsTypeStringToGo(ctx, elem)}`
  }
  const arrayMatch = t.match(/^Array<(.+)>$/)
  if (arrayMatch) return `[]${tsTypeStringToGo(ctx, arrayMatch[1])}`
  // Same backing gate as `typeInfoToGo`'s 'interface' case above — an
  // unbacked local type name (a tuple alias with no struct fields) must not
  // be returned bare, or the generated code references an undeclared type.
  if (ctx.state.localStructFields.has(t) || ctx.state.localTypeAliases.has(t)) return t
  return 'interface{}'
}

/** Infer a Go type from a JS value literal; `interface{}` when unrecognized. */
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
