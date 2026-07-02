/**
 * Operand-type classification for the Jinja2 template adapter.
 *
 * Ported from `packages/adapter-xslate/src/adapter/expr/operand.ts`. Pure
 * function over `ParsedExpr` taking an `isStringName` predicate rather than
 * reading adapter instance state.
 *
 * NOTE: like Kolon's `==`/`!=`, Jinja/Python's `==`/`!=` are value-equality
 * operators that compare strings and numbers correctly, so the Jinja
 * emitters never need to steer string comparisons onto a different operator
 * family. This helper is therefore not consumed by the Jinja lowering
 * today either — kept only as the parallel of the Xslate/Mojo adapters'
 * `expr/operand.ts` (groundwork for a future shared codegen surface).
 */

import type { ParsedExpr } from '@barefootjs/jsx'

/**
 * Whether a comparison operand is string-typed. In the Mojo adapter this
 * selects Perl `eq`/`ne` over numeric `==`/`!=` for a `===`/`!==` against a
 * string operand. Neither the Kolon nor the Jinja emitters consume it —
 * both languages' `==`/`!=` compare strings and numbers correctly, so
 * `===`/`!==` always map to `==`/`!=`. Kept only as the parallel of the
 * Xslate/Mojo helper.
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
