/**
 * Structural classifier for JS expressions whose result is a boolean
 * value (or unambiguously stringifies to "true"/"false" in JS).
 *
 * Used by the ERB adapter's `emitExpression` to decide whether to
 * route a reactive attribute binding through the `bf.bool_str` Ruby
 * runtime helper (mirrors the Mojo/Xslate adapters' `bool_str` use).
 * Ruby has no bare-comparison-to-string coercion either: `(count > 0)`
 * evaluates to `true`/`false` objects, which `to_s` would render as
 * the literal strings `"true"`/`"false"` — that part already matches
 * JS `String(boolean)`. The wrapper still exists for parity with the
 * Perl/Kolon family and for the cases below where the source
 * expression is *opaque* (a bare call) but the attribute name
 * witnesses a boolean value.
 *
 * The classifier walks a `ParsedExpr` produced by
 * `@barefootjs/jsx::parseExpression` — same AST the filter / loop
 * lowerings already use — so detection is structural rather than
 * regex-text-matching. Wrapped expression text is left to the
 * caller's existing `convertExpressionToRuby` pipeline; this module
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
 * carry their own (Ruby-coerced) value through unchanged, which
 * stays correct for non-boolean shapes.
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
 * boolean-shaped. Routing these through `bf.bool_str` produces the
 * spec-canonical `"true"` / `"false"` even when the expression is
 * opaque.
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
  // true | false | undefined (absent) — selection / disclosure state.
  'aria-selected',
  'aria-expanded',
  // Tri-state (true | false | mixed). The `bool_str` helper only maps
  // Ruby truthy / falsy to true / false — a fixture that wants the
  // literal `"mixed"` binds a string-valued JSX attr
  // (`aria-checked="mixed"`), which lowers through the `literal` emit
  // path and never touches this code.
  'aria-checked',
  'aria-pressed',
])

export function isAriaBooleanAttr(name: string): boolean {
  return ARIA_BOOLEAN_ATTRS.has(name)
}

/**
 * True when `expr` is (structurally) a top-level `String(...)` call — the
 * one JS shape that has ALREADY fully stringified its argument per JS
 * `String(boolean)` semantics before the attribute emitter's `bool_str`
 * wrap decision runs. `convertExpressionToRuby` lowers `String(x)` through
 * the `ERB_TEMPLATE_PRIMITIVES` registry to `bf.string(x)`, which for a
 * real Ruby `true`/`false` already returns the JS-correct `"true"` /
 * `"false"` text (`Context#string`'s `TrueClass`/`FalseClass` branch).
 * Piping that STRING through `bf.bool_str` again is a bug, not a harmless
 * no-op: Ruby has no falsy-string (only `nil`/`false` are falsy), so
 * `bf.bool_str("false")` unconditionally returns `"true"` — every
 * `aria-checked={String(props.checked ?? false)}`-shaped binding would
 * render `"true"` regardless of the underlying value. Perl doesn't share
 * this bug (`"0"` — what `JSON::PP::false` stringifies to — IS Perl-falsy),
 * which is why the Mojo/Xslate emitters don't need this guard; ERB's
 * truthiness model requires it. Detected structurally off the parsed
 * expression (not a text scan), so a user-defined helper merely NAMED
 * `String` elsewhere can't false-positive: the aria-attr / boolean-result
 * detectors already need real parse trees, and a bespoke `String` lookalike
 * would need to be a genuinely zero-ambiguity call-to-`String` shape to
 * match here in the first place.
 */
export function isExplicitStringCall(expr: string): boolean {
  const parsed = parseExpression(expr.trim())
  if (!parsed) return false
  return parsed.kind === 'call' && parsed.callee.kind === 'identifier' && parsed.callee.name === 'String'
}
