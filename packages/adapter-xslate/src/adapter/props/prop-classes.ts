/**
 * Prop classification for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over `ir.metadata` that derive the per-compile
 * prop/name sets the adapter consults during lowering. Mirror of the Go
 * adapter's `props/prop-types.ts`. No adapter instance state.
 */

import {
  isBareStringLiteral,
  isStringTypeInfo,
  resolveBodyDestructuredPropAliases,
  type ComponentIR,
} from '@barefootjs/jsx'

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
 * The set is scope-blind on purpose: the adapter reads it through the
 * shared `BindingScope` (`isStringValueName`), where a loop row, filter
 * predicate or preamble binding of the same name takes precedence.
 *
 * A bare-props-form component's BODY-destructured, RENAMED prop (`const {
 * fallbackLabel: skipLabel } = props`, the #2788 alias family) has no
 * `propsParams` entry of its own — `propsParams` only carries the TYPE-level,
 * caller-facing names, and the local alias never appears there. Without the
 * alias resolved here too, a string-typed prop referenced only under its
 * local rename in a `+` concat (`greeting + skipLabel`) is invisible to this
 * witness, so `isStringConcatBinary` falls through to numeric `+` instead of
 * Kolon's `~` (#2894 sibling gap, surfaced by the `string-concat-plus-
 * renamed-prop` fixture — same bug class as #2883/go-template's fix).
 * `resolveBodyDestructuredPropAliases` already recognizes this exact
 * destructuring shape; reusing it here keeps this one witness the single
 * source of truth `_isStringValueName` reads, rather than growing a second,
 * adapter-local alias lookup.
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
  for (const [local, callerKey] of resolveBodyDestructuredPropAliases(
    ir.metadata.localConstants ?? [],
    ir.metadata.propsObjectName,
  )) {
    if (names.has(callerKey)) names.add(local)
  }
  for (const c of ir.metadata.localConstants) {
    if (isStringTypeInfo(c.type ?? undefined) || isBareStringLiteral(c.value)) names.add(c.name)
  }
  return names
}
