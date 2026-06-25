/**
 * Type codegen: render TypeScript types as Go type strings.
 *
 * Pure free functions over a {@link GoEmitContext}. They resolve a prop /
 * signal / const's TypeScript type (`TypeInfo`, a raw type string, or — as a
 * last resort — an inferred shape from a literal value) into the Go type used
 * for its struct field. They read only the context's `state.localTypeNames`
 * table; `inferTypeFromValue` is fully pure (no context needed).
 */

import type { TypeInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'

/**
 * Convert TypeInfo to Go type string.
 * If type is unknown, tries to infer from defaultValue.
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
      // Check if raw type name matches a locally-defined type
      if (typeInfo.raw && ctx.state.localTypeNames.has(typeInfo.raw)) {
        return typeInfo.raw
      }
      // Try to parse raw type string as a known pattern (e.g., Array<Todo>)
      if (typeInfo.raw) {
        const resolved = tsTypeStringToGo(ctx, typeInfo.raw)
        if (resolved !== 'interface{}') return resolved
      }
      return 'interface{}'
    case 'unknown':
      // Try to infer type from default value
      if (defaultValue !== undefined) {
        return inferTypeFromValue(defaultValue)
      }
      return 'interface{}'
    default:
      return 'interface{}'
  }
}

/**
 * Convert a raw TypeScript type string to a Go type string.
 * Handles primitives (number, string, boolean) and basic arrays.
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
  // Check if it's a known local type
  if (ctx.state.localTypeNames.has(t)) return t
  return 'interface{}'
}

/**
 * Infer Go type from a JavaScript value literal.
 */
export function inferTypeFromValue(value: string): string {
  // Boolean literals
  if (value === 'true' || value === 'false') return 'bool'
  // Number literals (int)
  if (/^-?\d+$/.test(value)) return 'int'
  // Number literals (float)
  if (/^-?\d+\.\d+$/.test(value)) return 'float64'
  // String literals
  if ((value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))) {
    return 'string'
  }
  // Empty string
  if (value === '""' || value === "''") return 'string'
  // Array literals
  if (value.startsWith('[')) return '[]interface{}'
  // Default
  return 'interface{}'
}
