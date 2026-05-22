/**
 * Structural classifier for JS expressions whose result is a boolean
 * value (or unambiguously stringifies to "true"/"false" in JS).
 *
 * Used by the Mojo adapter's `emitExpression` to decide whether to
 * route a reactive attribute binding through the `bf->bool_str` Perl
 * runtime helper (#1466 follow-up). Perl has no native boolean type;
 * `($count > 0)` evaluates to `''` / `1`, not `"false"` / `"true"`,
 * so the literal stringification diverges from Hono / Go. Wrapping
 * the value with `bool_str` realigns the serialised attribute with
 * JS `String(boolean)` semantics.
 *
 * The classifier walks a `ParsedExpr` produced by
 * `@barefootjs/jsx::parseExpression` — same AST the filter / loop
 * lowerings already use — so detection is structural rather than
 * regex-text-matching. Wrapped expression text is left to the
 * caller's existing `convertExpressionToPerl` pipeline; this module
 * only decides whether to wrap.
 *
 * Detected shapes:
 *   - `binary` with a comparison operator (`<`, `>`, `<=`, `>=`,
 *     `==`, `===`, `!=`, `!==`)
 *   - `unary` with logical `!`
 *   - `literal` with `literalType: 'boolean'`
 *   - `logical` (`&&` / `||` / `??`) when both sides are themselves
 *     boolean-result (catches `x > 0 && y < 10`; intentionally does
 *     NOT catch `x() || 'fallback'` whose right side stringifies as
 *     a regular value)
 *   - `conditional` (`?:`) when both branches are themselves
 *     boolean-result
 *
 * Anything else returns `false` — including bare identifiers
 * (`accepted`) and call expressions (`accepted()`) whose return type
 * the adapter has no way to infer from source text alone. Those
 * carry their own (Perl-coerced) value through unchanged, which
 * stays correct for non-boolean shapes and is handled by
 * `normalizeHTML`'s `aria-*="0"` rule for the specific Mojo-Perl
 * `aria-*={booleanFn()}` divergence.
 */

import { parseExpression, type ParsedExpr } from '@barefootjs/jsx'

const COMPARISON_OPS = new Set([
  '<',
  '>',
  '<=',
  '>=',
  '==',
  '===',
  '!=',
  '!==',
])

function isBooleanResultParsed(node: ParsedExpr): boolean {
  switch (node.kind) {
    case 'literal':
      return node.literalType === 'boolean'
    case 'binary':
      return COMPARISON_OPS.has(node.op)
    case 'unary':
      return node.op === '!'
    case 'logical':
      // `x > 0 && y < 10` is boolean; `x() || 'fallback'` is not.
      // Only both-sides-boolean qualifies.
      return (
        isBooleanResultParsed(node.left) && isBooleanResultParsed(node.right)
      )
    case 'conditional':
      // `cond ? bool : bool` is boolean; `cond ? 'a' : 'b'` is not.
      return (
        isBooleanResultParsed(node.consequent) &&
        isBooleanResultParsed(node.alternate)
      )
    default:
      return false
  }
}

export function isBooleanResultExpr(expr: string): boolean {
  const parsed = parseExpression(expr.trim())
  if (!parsed) return false
  return isBooleanResultParsed(parsed)
}
