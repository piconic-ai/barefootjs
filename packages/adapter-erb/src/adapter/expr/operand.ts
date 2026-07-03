/**
 * Operand-type classification + index-access lowering for the ERB template
 * adapter.
 *
 * Ported from the Mojolicious adapter's `expr/operand.ts` (issue #2018
 * track D lineage). Pure functions over `ParsedExpr` — they take an
 * `isStringName` predicate (supplied by the emitter from adapter state)
 * rather than reading adapter instance state directly.
 *
 * `isStringTypedOperand` is byte-identical to the Mojo/Xslate adapters'
 * copy. `emitIndexAccessRuby` is ERB-specific: Ruby's `[]` operator is
 * syntactically the same for Array and Hash access (unlike Perl's
 * `->[]`/`->{}` split), but this runtime's object values are JSON-shaped
 * Ruby Hashes with SYMBOL keys — so a string-typed index still needs a
 * `.to_sym` conversion to become a valid Hash key, while a non-string
 * (numeric / loop-index) index passes straight through as an Array index.
 */

import type { ParsedExpr } from '@barefootjs/jsx'

/**
 * Whether a comparison/index operand is string-typed. Covers a string
 * literal, a string-signal getter call (`sel()`), and a string prop access
 * (`props.x`). `isStringName` reports whether a getter/prop name is
 * known-string. Loop-element fields (`t.id`) on untyped arrays have no known
 * type and stay undetected — a separate, narrower gap.
 */
export function isStringTypedOperand(expr: ParsedExpr, isStringName: (n: string) => boolean): boolean {
  if (expr.kind === 'literal' && expr.literalType === 'string') return true
  if (expr.kind === 'call' && expr.callee.kind === 'identifier' && expr.args.length === 0) {
    return isStringName(expr.callee.name)
  }
  if (expr.kind === 'member' && expr.object.kind === 'identifier' && expr.object.name === 'props') {
    return isStringName(expr.property)
  }
  return false
}

/**
 * Lower `arr[index]` to a Ruby `[]` access. A string-typed index reads a
 * JSON-shaped Hash by symbol key (`.to_sym`); any other index (the common
 * loop-index / arithmetic case, e.g. `selected()[index]`) reads an Array by
 * its (already-numeric) value.
 */
export function emitIndexAccessRuby(
  object: ParsedExpr,
  index: ParsedExpr,
  emit: (e: ParsedExpr) => string,
  isStringName: (n: string) => boolean,
): string {
  const i = emit(index)
  return isStringTypedOperand(index, isStringName)
    ? `${emit(object)}[(${i}).to_sym]`
    : `${emit(object)}[${i}]`
}
