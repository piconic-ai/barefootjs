/**
 * Prop classification for the Go template adapter.
 *
 * Ported from `packages/adapter-blade/src/adapter/props/prop-classes.ts` (itself
 * ported from Jinja) — ONE function: string-typed signal/prop names, needed to
 * decide `+` string-concat vs numeric addition (#2168 string-concat-plus). Pure
 * function over `ir.metadata`; no adapter instance state.
 */

import { collectLoopBoundNames, type ComponentIR, type TypeInfo } from '@barefootjs/jsx'

/** True when `type` is the `string` primitive. */
function isStringTypeInfo(type: TypeInfo): boolean {
  return type.kind === 'primitive' && type.primitive === 'string'
}

/** True when `initialValue` is a bare string-literal expression. */
function isBareStringLiteral(initialValue: string | undefined): boolean {
  if (!initialValue) return false
  const v = initialValue.trim()
  return (v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))
}

/**
 * String-typed signals, props, and same-file local consts (#2212, ported
 * here for #2236). A signal is string-typed when its inferred type is
 * `string` (or, defensively, when its initial value is a bare string
 * literal); a prop when its annotated type is `string`; a local const the
 * same way. Drives `isStringName` for `isStringConcatBinary` — the shared
 * helper (`@barefootjs/jsx`) that decides whether a JS `+` is string
 * concatenation rather than numeric addition (Go's `html/template` has no
 * native `+` at all; `binary()` always emits a runtime call, `bf_add` for
 * addition or `bf_concat_str` for concatenation — see
 * `go-template-adapter.ts`'s `binary()`). Local consts matter for exactly
 * the shadowing shape this exclusion exists for: with a loop-bound `label`
 * subtracted, an outer `{label + suffix}` (where `suffix = '!'`) must
 * still classify as string concat via its OTHER operand, or it would fall
 * back to `bf_add` and render `0`.
 *
 * Excludes any name bound as a `.map()`/`.filter()` loop callback's item or
 * index parameter ANYWHERE in the component (#2212, ported here for #2236):
 * this lookup is a flat, scope-blind `Set<string>` with no notion of a loop
 * param shadowing an outer string-typed binding of the same name
 * (`values.map((label) => 1 + label)` inside a component that also has a
 * string `label` prop) — left unguarded, that shadowed `label` would be
 * misdetected as string-typed and `1 + label` would silently lower to
 * `bf_concat_str` instead of staying numeric `bf_add`. Subtracting loop-bound
 * names is coarse (it also suppresses a genuinely non-shadowed same-named
 * string elsewhere in the component) but safe: the suppressed case just
 * falls back to today's numeric `bf_add` — the same, already-accepted
 * residual as an unresolvable operand — never silently-wrong output.
 */
export function collectStringValueNames(ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  for (const s of ir.metadata.signals) {
    if (isStringTypeInfo(s.type) || isBareStringLiteral(s.initialValue)) {
      names.add(s.getter)
    }
  }
  for (const p of ir.metadata.propsParams) {
    if (isStringTypeInfo(p.type)) names.add(p.name)
  }
  for (const c of ir.metadata.localConstants) {
    if ((c.type !== null && isStringTypeInfo(c.type)) || isBareStringLiteral(c.value)) {
      names.add(c.name)
    }
  }
  for (const bound of collectLoopBoundNames(ir)) names.delete(bound)
  return names
}
