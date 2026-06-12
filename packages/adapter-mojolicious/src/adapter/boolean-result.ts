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

/**
 * ARIA attributes whose spec values are `"true"`, `"false"`, and (for
 * tri-state members) `"mixed"`. When a fixture binds one of these to
 * an arbitrary JS expression (`aria-checked={accepted()}`), the
 * expression's actual type isn't recoverable from source text — but
 * the attribute name itself witnesses that the binding is
 * boolean-shaped. Routing these through `bf->bool_str` produces the
 * spec-canonical `"true"` / `"false"` even when the expression is
 * opaque, eliminating the Mojo-only `aria-*="0"` divergence at the
 * source rather than papering it over in `normalizeHTML`.
 *
 * Deliberately conservative — only includes ARIA attributes whose
 * spec value set is exactly `true | false` or `true | false | mixed`.
 * Tokenised ARIA attributes (`aria-current` is `page | step | …`,
 * `aria-sort` is `ascending | descending | …`) are intentionally
 * excluded so a string-valued binding doesn't get coerced to
 * `"true"` / `"false"`.
 */
const ARIA_BOOLEAN_ATTRS = new Set([
  // Strict boolean state (true | false; some allow `undefined` =
  // attribute absent, which the runtime emits as no-attr regardless).
  'aria-atomic',
  'aria-busy',
  'aria-disabled',
  'aria-hidden',
  'aria-modal',
  'aria-multiline',
  'aria-multiselectable',
  'aria-readonly',
  'aria-required',
  // true | false | undefined (absent) — selection / disclosure state
  // (#1897: tabs' `aria-selected={props.selected ?? false}` rendered the
  // Perl-native `1`/`0` without this).
  'aria-selected',
  'aria-expanded',
  // Tri-state (true | false | mixed). The `bool_str` helper only
  // maps Perl truthy / falsy to true / false — a fixture that wants
  // the literal `"mixed"` would bind a string-valued JSX attr
  // (`aria-checked="mixed"`), which lowers through the `literal` emit
  // path and never touches this code.
  'aria-checked',
  'aria-pressed',
])

export function isAriaBooleanAttr(name: string): boolean {
  return ARIA_BOOLEAN_ATTRS.has(name)
}
