/**
 * Operand-type classification + index-access lowering for the Mojolicious
 * EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over `ParsedExpr` — they take an `isStringName`
 * predicate (supplied by the emitter from adapter state) rather than reading
 * adapter instance state directly.
 */

import type { ParsedExpr } from '@barefootjs/jsx'

/**
 * Whether a comparison operand is string-typed, so JS `===`/`!==` against it
 * must lower to Perl `eq`/`ne` instead of numeric `==`/`!=` (#1672). Covers a
 * string literal, a string-signal getter call (`sel()`), and a string prop
 * access (`props.x`). `isStringName` reports whether a getter/prop name is
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
 * Lower `arr[index]` to a Perl deref. Perl distinguishes array
 * (`->[$i]`) from hash (`->{$k}`) access, which JS's single `[]` does
 * not — so we pick by the index expression's type: a string-typed key
 * derefs the hash, anything else (the common loop-index / arithmetic
 * case, e.g. `selected()[index]`) derefs the array. #1897.
 */
export function emitIndexAccessPerl(
  object: ParsedExpr,
  index: ParsedExpr,
  emit: (e: ParsedExpr) => string,
  isStringName: (n: string) => boolean,
): string {
  const i = emit(index)
  return isStringTypedOperand(index, isStringName)
    ? `${emit(object)}->{${i}}`
    : `${emit(object)}->[${i}]`
}
