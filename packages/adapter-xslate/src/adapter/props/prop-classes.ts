/**
 * Prop classification for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over `ir.metadata` that derive the per-compile
 * prop/name sets the adapter consults during lowering. Mirror of the Go
 * adapter's `props/prop-types.ts`. No adapter instance state.
 */

import { collectLoopBoundNames, type ComponentIR } from '@barefootjs/jsx'
import { isStringTypeInfo, isBareStringLiteral } from '../value/parsed-literal.ts'

/**
 * Props whose declared TS type is boolean — a bare binding of one
 * (`data-active={props.isActive}`) must stringify as JS `String(boolean)`
 * ("true"/"false"), not Perl's native `1`/`''` (#1897, pagination's
 * data-active).
 */
export function collectBooleanTypedProps(ir: ComponentIR): Set<string> {
  return new Set(
    ir.metadata.propsParams
      .filter(prop => prop.type?.primitive === 'boolean' || prop.type?.raw === 'boolean')
      .map(prop => prop.name),
  )
}

/**
 * Bare references to optional, no-default, non-primitive props (e.g.
 * textarea's `rows`) are `undef` when omitted → `defined`-guarded in
 * `emitExpression`. See the `nullableOptionalProps` field docstring.
 */
export function collectNullableOptionalProps(ir: ComponentIR): Set<string> {
  return new Set(
    ir.metadata.propsParams
      .filter(
        p =>
          p.defaultValue === undefined &&
          !p.isRest &&
          p.type?.kind !== 'primitive',
      )
      .map(p => p.name),
  )
}

/**
 * String-typed signals, props, and same-file local consts (#2212). A
 * signal is string-typed when its inferred type is `string` (or,
 * defensively, when its initial value is a bare string literal); a prop
 * when its annotated type is `string`; a local const the same way. Consumed
 * by `isStringConcatBinary`/`isStringTypedOperand` (`@barefootjs/jsx`) to
 * pick Kolon's `~` over JS `+`'s numeric fallback (#2163, #2212) —
 * including now for a bare identifier operand, not just a prop/getter/
 * literal. In the Mojo adapter this ALSO drives `eq`/`ne` selection for
 * string equality; the Kolon emitters don't consume that distinction
 * (Kolon's `==`/`!=` compare strings and numbers correctly), so that half
 * of this set is carried only for parity with the Mojo adapter.
 *
 * Excludes any name bound as a `.map()`/`.filter()` loop callback's item
 * or index parameter ANYWHERE in the component (Fable review, #2212): the
 * lookup below is a flat, scope-blind `Set<string>` with no notion of a
 * loop param shadowing an outer string-typed binding of the same name
 * (`items.map((name) => 1 + name)` inside a component that also has a
 * string `name` prop) — left unguarded, that shadowed `name` would be
 * misdetected as string-typed and `1 + name` would silently lower to `~`
 * instead of staying numeric `+`. Subtracting loop-bound names is coarse
 * (it also suppresses a genuinely non-shadowed same-named string
 * elsewhere in the component) but safe: the suppressed case just falls
 * back to today's numeric `+` — the same, already-accepted residual as an
 * unresolvable operand — never silently-wrong output.
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
    if (isStringTypeInfo(c.type ?? undefined) || isBareStringLiteral(c.value)) names.add(c.name)
  }
  for (const bound of collectLoopBoundNames(ir)) names.delete(bound)
  return names
}
