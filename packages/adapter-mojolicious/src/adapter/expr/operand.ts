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

import { isStringTypedOperand, type ParsedExpr, type StringNameTest } from '@barefootjs/jsx'

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

/** What the emitter knows about a name's declared type at this position. */
export interface EqualityOperandTyping {
  isStringName: StringNameTest
  isNumberName: (n: string, componentProperty?: boolean) => boolean
  isBooleanName?: (n: string, componentProperty?: boolean) => boolean
}

/**
 * Perl spelling of JS loose equality (`==` / `!=`) between two
 * already-emitted operands. Strict `===` / `!==` spell the primitive plan
 * instead (`spellPerlStrictEq`, #3824 step 8).
 *
 * - Either operand string-typed: `eq` / `ne`. Numeric `==` would coerce two
 *   non-numeric strings to 0 and read them as equal (#1672).
 * - Otherwise numeric `==` / `!=`.
 *
 * Returns null for any operator that is not a loose equality.
 */
export function emitPerlEquality(
  op: string,
  left: ParsedExpr,
  right: ParsedExpr,
  l: string,
  r: string,
  typing: EqualityOperandTyping,
): string | null {
  const negated = op === '!='
  if (!negated && op !== '==') return null
  if (isStringTypedOperand(left, typing.isStringName) || isStringTypedOperand(right, typing.isStringName)) {
    return `${l} ${negated ? 'ne' : 'eq'} ${r}`
  }
  return `${l} ${negated ? '!=' : '=='} ${r}`
}
