/**
 * Index-access lowering for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure function over `ParsedExpr` — it takes an `isStringName`
 * predicate (supplied by the emitter from adapter state) rather than reading
 * adapter instance state directly.
 *
 * The string-typed-operand classifier that used to live here (marked
 * SHARED CANDIDATE) was promoted to `@barefootjs/jsx` as
 * `isStringTypedOperand` (#2176); `emitIndexAccessPerl` stays Mojo-specific
 * (Perl's `->[]` vs `->{}` split has no Kolon equivalent).
 */

import { isStringTypedOperand, type ParsedExpr } from '@barefootjs/jsx'

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
