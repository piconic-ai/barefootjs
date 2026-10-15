/**
 * Literal-value predicates shared by the DSL template adapters (#3475).
 *
 * Pure functions over analyzer type info and parsed expressions. Every DSL
 * adapter classifies string-typed signals, props and constants with
 * {@link isStringTypeInfo} / {@link isBareStringLiteral}, and tells a
 * literal index from a variable one with {@link isLiteralIndex}.
 */

import type { ParsedExpr } from '../expression-parser.ts'
import type { TypeInfo } from '../types.ts'

/** True when `type` is the `string` primitive. */
export function isStringTypeInfo(type: TypeInfo | undefined): boolean {
  return type?.kind === 'primitive' && type.primitive === 'string'
}

/** True when `initialValue` is a bare string-literal expression. */
export function isBareStringLiteral(initialValue: string | undefined): boolean {
  if (!initialValue) return false
  const v = initialValue.trim()
  return (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))
}

/**
 * True when a parsed index is a numeric or string literal (`arr[0]`,
 * `m['k']`). The spread lowerings refuse (BF101) an indexed spread value
 * they could not inline only when its index is NOT a literal: a
 * variable-index record access (`sizeMap[size]`) has no static answer.
 */
export function isLiteralIndex(index: ParsedExpr): boolean {
  return (
    index.kind === 'literal' &&
    (index.literalType === 'number' || index.literalType === 'string')
  )
}
