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

import type { ParsedExpr } from '@barefootjs/jsx'

/**
 * Lower `arr[index]` to the runtime's polymorphic `bf->get` accessor
 * (`BarefootJS.pm`, adapter-perl) rather than guessing at compile time
 * whether `index` is a string key or a numeric index (#2491). Perl
 * distinguishes array (`->[$i]`) from hash (`->{$k}`) access, which
 * JS's single `[]` does not — the previous compile-time guess (string-
 * typed key → hash deref, else → array deref) FAILS FATALLY
 * ("Not an ARRAY reference") whenever a dynamic key of unknowable type
 * (e.g. a destructured `.map()` param used as a key, `tone[k]` — the
 * shared analyzer types it `{kind:'unknown'}`) is applied to a hash-
 * shaped row, because the guess defaults to the array branch. `bf->get`
 * dispatches on the receiver's RUNTIME `ref` instead, so it's a strict
 * superset of the two hand-picked deref forms this used to emit — the
 * common loop-index case (`selected()[index]`, #1897) keeps working
 * unchanged.
 */
export function emitIndexAccessPerl(
  object: ParsedExpr,
  index: ParsedExpr,
  emit: (e: ParsedExpr) => string,
  isStringName: (n: string) => boolean,
): string {
  return `bf->get(${emit(object)}, ${emit(index)})`
}
