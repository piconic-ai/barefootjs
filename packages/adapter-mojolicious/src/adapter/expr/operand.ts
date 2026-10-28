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

import { isBooleanResultParsed, isNumericArithmeticResult, isStringTypedOperand, type ParsedExpr } from '@barefootjs/jsx'

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
  isStringName: (n: string, componentProperty?: boolean) => boolean
  isNumberName: (n: string, componentProperty?: boolean) => boolean
  isBooleanName?: (n: string, componentProperty?: boolean) => boolean
}

/** A getter call, `props.<key>` member or bare identifier whose name `is` accepts. */
function isTypedName(expr: ParsedExpr, is: (n: string, componentProperty?: boolean) => boolean): boolean {
  if (expr.kind === 'call') return expr.callee.kind === 'identifier' && expr.args.length === 0 && is(expr.callee.name)
  if (expr.kind === 'member') {
    return !expr.computed && expr.object.kind === 'identifier' && expr.object.name === 'props' && is(expr.property, true)
  }
  return expr.kind === 'identifier' && is(expr.name)
}

/** An operand the source shows to be a number or a boolean. */
function isNumberOrBooleanOperand(expr: ParsedExpr, typing: EqualityOperandTyping): boolean {
  if (expr.kind === 'literal') return expr.literalType === 'number' || expr.literalType === 'boolean'
  return isNumericArithmeticResult(expr, typing.isStringName) ||
    isBooleanResultParsed(expr, typing.isBooleanName) ||
    isTypedName(expr, typing.isNumberName)
}

/**
 * Perl spelling of JS equality between two already-emitted operands.
 *
 * - Either operand string-typed: `eq` / `ne`. Numeric `==` would coerce two
 *   non-numeric strings to 0 and read them as equal (#1672).
 * - Strict `===` / `!==` where neither operand is known to be a number or a
 *   boolean: the runtime's `strict_eq`, which compares by the values' JS
 *   types. A `.at()` result, an array element or a union-typed prop may
 *   hold a string, and `==` would read `'p' == 'q'` as true.
 * - Otherwise numeric `==` / `!=`: a number literal, arithmetic result or
 *   number-typed name, or a boolean (spelled `1` / `0` in Perl, which a JSON
 *   boolean equals numerically but not by `strict_eq`).
 *
 * Returns null for any operator that is not an equality.
 */
export function emitPerlEquality(
  op: string,
  left: ParsedExpr,
  right: ParsedExpr,
  l: string,
  r: string,
  typing: EqualityOperandTyping,
): string | null {
  const negated = op === '!==' || op === '!='
  if (!negated && op !== '===' && op !== '==') return null
  if (isStringTypedOperand(left, typing.isStringName) || isStringTypedOperand(right, typing.isStringName)) {
    return `${l} ${negated ? 'ne' : 'eq'} ${r}`
  }
  const strict = op === '===' || op === '!=='
  if (strict && !isNumberOrBooleanOperand(left, typing) && !isNumberOrBooleanOperand(right, typing)) {
    return `${negated ? '!' : ''}bf->strict_eq(${l}, ${r})`
  }
  return `${l} ${negated ? '!=' : '=='} ${r}`
}
