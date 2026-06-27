/**
 * Operand-type classification for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure function over `ParsedExpr` taking an `isStringName`
 * predicate rather than reading adapter instance state.
 *
 * NOTE: unlike the Mojo adapter, Kolon's `==`/`!=` are value-equality
 * operators that compare strings and numbers correctly, so the Kolon
 * emitters never need to steer string comparisons onto `eq`/`ne`. This
 * helper is therefore not consumed by the Kolon lowering today — it is kept
 * as the parallel of the Mojo adapter's `expr/operand.ts` (groundwork for a
 * future shared Perl-evaluator surface, issue #2018 track D).
 */

import type { ParsedExpr } from '@barefootjs/jsx'

/**
 * Whether a comparison operand is string-typed, so JS `===`/`!==` against it
 * must lower to Perl `eq`/`ne` instead of numeric `==`/`!=`.
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
