/**
 * Prop classification for the Pebble template adapter.
 *
 * Ported from `packages/adapter-twig/src/adapter/props/prop-classes.ts`
 * (Twig's version, not Jinja's — Twig's copy is the one this adapter's
 * `isStringConcatBinary` gate actually consumes; Jinja's is parity-only
 * dead weight there, see `expr/operand.ts`'s file header). Pure functions
 * over `ir.metadata` that derive the per-compile prop/name sets the adapter
 * consults during lowering. No adapter instance state.
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
 * pick `~` over JS `+`'s numeric fallback (#2163, #2212) — including now
 * for a bare identifier operand, not just a prop/getter/literal. In the
 * Mojo adapter this ALSO drives `eq`/`ne` selection for string equality;
 * the Pebble emitters don't consume the distinction there — `===`/`!==`
 * ALWAYS route through `bf.eq`/`bf.neq` regardless of operand type (see
 * `expr/emitters.ts`'s file header, divergence 4) — so that half of this
 * set is carried only for parity with the Perl-family adapters, not because
 * Pebble's binary emitter reads it for equality.
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
 * Pebble's `~` (#2894 sibling gap, surfaced by the `string-concat-plus-
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
