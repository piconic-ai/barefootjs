/**
 * Structural classifier for JS expressions whose result is a boolean value
 * (or unambiguously stringifies to "true"/"false" in JS).
 *
 * Ported from `packages/adapter-xslate/src/adapter/boolean-result.ts`
 * (itself ported from the Mojo adapter's `bf->bool_str` classifier). Used by
 * the Jinja adapter for TWO purposes — one inherited from Xslate, one new:
 *
 * 1. **Attribute/text stringification** (inherited): route a boolean-shaped
 *    reactive binding through the runtime `bf.bool_str` helper so the
 *    serialised value matches JS `String(boolean)` ("true"/"false"). Python
 *    has a real `bool` type (unlike Perl's `1`/`''`), but Python's own
 *    `str(True)` == `"True"` (capitalised) — still wrong for HTML output —
 *    so the same explicit routing is required.
 * 2. **Condition-position truthy wrapping** (new — `isBooleanResultParsed` is
 *    exported, not just the string-based `isBooleanResultExpr`): Python
 *    truthiness diverges from JS specifically on empty containers (`[]` /
 *    `{}` are JS-truthy, Python-falsy). Perl doesn't have this problem — a
 *    Perl array/hash REFERENCE is always true, matching JS objects/arrays
 *    being unconditionally truthy — which is why Xslate never needed a
 *    truthy-routing layer for `if`/ternary/`&&`/`||` conditions. The Jinja
 *    adapter's condition-emission call sites (see `jinja-adapter.ts`'s
 *    `convertConditionToJinja`) reuse this SAME structural classifier: a
 *    condition that is already unambiguously boolean-shaped emits directly;
 *    everything else is wrapped in `bf.truthy(...)` (a JS-faithful
 *    `ToBoolean`) before being used as an `{% if %}` / ternary test.
 *
 * The classifier walks a `ParsedExpr` produced by
 * `@barefootjs/jsx::parseExpression` — same AST the filter / loop lowerings
 * already use — so detection is structural rather than regex-text-matching.
 * Wrapped expression text is left to the caller's existing
 * `convertExpressionToJinja` pipeline; this module only decides whether to
 * wrap.
 *
 * Detected shapes:
 *   - `binary` with a comparison operator (`<`, `>`, `<=`, `>=`, `==`, `===`,
 *     `!=`, `!==`)
 *   - `unary` with logical `!`
 *   - `literal` with `literalType: 'boolean'`
 *   - `logical` (`&&` / `||` / `??`) when both sides are themselves
 *     boolean-result (catches `x > 0 && y < 10`; intentionally does NOT
 *     catch `x() || 'fallback'` whose right side stringifies as a regular
 *     value)
 *   - `conditional` (`?:`) when both branches are themselves boolean-result
 *
 * Anything else returns `false` — including bare identifiers (`accepted`)
 * and call expressions (`accepted()`) whose return type the adapter has no
 * way to infer from source text alone.
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

/**
 * Structural boolean-result check over an already-parsed `ParsedExpr` tree.
 * Exported (unlike Xslate's private equivalent) so the condition-position
 * truthy-wrapping call sites can reuse it without a stringify → re-parse
 * round-trip.
 */
export function isBooleanResultParsed(node: ParsedExpr): boolean {
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
 * tri-state members) `"mixed"`. When a fixture binds one of these to an
 * arbitrary JS expression (`aria-checked={accepted()}`), the expression's
 * actual type isn't recoverable from source text — but the attribute name
 * itself witnesses that the binding is boolean-shaped. Routing these through
 * `bf.bool_str` produces the spec-canonical `"true"` / `"false"` even when
 * the expression is opaque.
 *
 * Deliberately conservative — only includes ARIA attributes whose spec value
 * set is exactly `true | false` or `true | false | mixed`. Tokenised ARIA
 * attributes (`aria-current` is `page | step | …`, `aria-sort` is
 * `ascending | descending | …`) are intentionally excluded so a
 * string-valued binding doesn't get coerced to `"true"` / `"false"`.
 */
const ARIA_BOOLEAN_ATTRS = new Set([
  // Strict boolean state (true | false; some allow `undefined` = attribute
  // absent, which the runtime emits as no-attr regardless).
  'aria-atomic',
  'aria-busy',
  'aria-disabled',
  'aria-hidden',
  'aria-modal',
  'aria-multiline',
  'aria-multiselectable',
  'aria-readonly',
  'aria-required',
  // true | false | undefined (absent) — selection / disclosure state.
  'aria-selected',
  'aria-expanded',
  // Tri-state (true | false | mixed). The `bool_str` helper only maps
  // truthy / falsy to true / false — a fixture that wants the literal
  // "mixed" would bind a string-valued JSX attr (`aria-checked="mixed"`),
  // which lowers through the `literal` emit path and never touches this
  // code.
  'aria-checked',
  'aria-pressed',
])

export function isAriaBooleanAttr(name: string): boolean {
  return ARIA_BOOLEAN_ATTRS.has(name)
}
