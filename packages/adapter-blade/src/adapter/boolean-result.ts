/**
 * Structural classifier for JS expressions whose result is a boolean value
 * (or unambiguously stringifies to "true"/"false" in JS).
 *
 * Ported from `packages/adapter-jinja/src/adapter/boolean-result.ts`
 * (itself ported from the Xslate/Mojo adapters' `bf->bool_str` classifier).
 * Used by the Blade adapter for TWO purposes:
 *
 * 1. **Attribute/text stringification**: route a boolean-shaped reactive
 *    binding through the runtime `bf.bool_str` helper so the serialised
 *    value matches JS `String(boolean)` ("true"/"false"). PHP has a real
 *    `bool` type, but PHP's own `(string) true` == `"1"` (not `"true"`) and
 *    `(string) false` == `""` — still wrong for HTML output — so the same
 *    explicit routing is required.
 * 2. **Condition-position truthy wrapping**: PHP truthiness diverges from JS
 *    specifically on the string `'0'` (falsy in PHP, truthy in JS) and empty
 *    arrays (`[]` — JS objects/arrays are unconditionally truthy; a PHP
 *    empty array is falsy). The Blade adapter's condition-emission call sites
 *    (see `blade-adapter.ts`'s `convertConditionToBlade`) reuse this SAME
 *    structural classifier: a condition that is already unambiguously
 *    boolean-shaped emits directly; everything else is wrapped in
 *    `bf.truthy(...)` (a JS-faithful `ToBoolean`) before being used as an
 *    `{% if %}` / ternary test.
 *
 * The classifier walks a `ParsedExpr` produced by
 * `@barefootjs/jsx::parseExpression` — same AST the filter / loop lowerings
 * already use — so detection is structural rather than regex-text-matching.
 * Wrapped expression text is left to the caller's existing
 * `convertExpressionToBlade` pipeline; this module only decides whether to
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
 * Exported so the condition-position truthy-wrapping call sites can reuse it
 * without a stringify → re-parse round-trip.
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
 * True when `expr`'s top-level shape is an explicit JS `String(x)` call
 * (the `EVAL_BUILTIN_IDENTS` builtin the compiler recognizes structurally —
 * `packages/jsx/src/expression-parser.ts`'s `EVAL_BUILTIN_IDENTS`; lowered
 * by this adapter's `String` template primitive to `bf.string(x)`, see
 * `lib/constants.ts`).
 *
 * Guards the `isAriaBooleanAttr`-driven `bf.bool_str(...)` override in
 * `blade-adapter.ts`'s `elementAttrEmitter`: `bf.string` and `bf.bool_str`
 * produce IDENTICAL text for a real PHP `bool` (both are `"true"` /
 * `"false"`), so applying `bf.bool_str` to `String(x)`'s ALREADY-STRINGIFIED
 * result is not a no-op — it is a PHP-truthiness test over that STRING
 * ("false" is a non-empty PHP string, hence truthy, so
 * `bf.bool_str(bf.string(false))` would wrongly render `"true"`). An author
 * who explicitly writes `String(...)` has already opted into JS `String()`
 * semantics — `bf.string(x)` alone (which DOES special-case booleans, see
 * the PHP runtime's `string()` helper) is the complete, correct lowering; no
 * attribute-name-driven override should run again on top of it.
 */
export function isExplicitStringCall(expr: string): boolean {
  const parsed = parseExpression(expr.trim())
  return (
    !!parsed &&
    parsed.kind === 'call' &&
    parsed.callee.kind === 'identifier' &&
    parsed.callee.name === 'String' &&
    parsed.args.length === 1
  )
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
