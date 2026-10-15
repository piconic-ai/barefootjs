/**
 * ERB's own `String(...)` detector. The boolean-result classifier and the
 * ARIA boolean attribute set the ERB adapter uses are the shared ones in
 * `@barefootjs/jsx` (`isBooleanResultExpr`, `isAriaBooleanAttr`, #3475).
 *
 * This predicate stays here because it is not the shared
 * `isExplicitStringCall`: it matches a `String` call of ANY arity, where the
 * shared one requires exactly one argument. Unifying them is a behaviour
 * change for `String()` / `String(a, b)` on ERB, not a dedupe.
 */

import { parseExpression } from '@barefootjs/jsx'

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
