/**
 * Prop classification for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
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
 * (#1971) SSR-resolvable context-value names: props, signal getters, memos.
 * A `<Ctx.Provider value>` member NOT in this set is a client-only function
 * with no SSR value, lowered to `undef`.
 */
export function collectProviderDataNames(ir: ComponentIR): Set<string> {
  return new Set<string>([
    ...ir.metadata.propsParams.map(p => p.name),
    ...(ir.metadata.signals ?? []).map(s => s.getter),
    ...(ir.metadata.memos ?? []).map(m => m.name),
  ])
}

/**
 * String-typed signals, props, and same-file local consts, so equality
 * comparisons against them lower to `eq`/`ne` (#1672) and `+` concatenation
 * against them lowers to Perl's `.` instead of numeric `+` (#2163, #2212 —
 * `isStringConcatBinary`/`isStringTypedOperand` in `@barefootjs/jsx`, which
 * now also recognizes a bare identifier operand, not just a prop/getter/
 * literal). A signal is string-typed when its inferred type is `string`
 * (the analyzer infers this from a string-literal initial value) or,
 * defensively, when its initial value is a bare string literal; a prop or
 * local const when its annotated (or inferred) type is `string`.
 *
 * The set is scope-blind on purpose: the adapter reads it through the
 * shared `BindingScope` (`isStringValueName`), where a loop row, filter
 * predicate or preamble binding of the same name takes precedence.
 *
 * A bare-props-form component's BODY-destructured, RENAMED prop
 * (`const { fallbackLabel: skipLabel } = props`, the #2788 alias family)
 * has no `propsParams` entry of its own — `propsParams` only carries the
 * TYPE-level, caller-facing names, and the local alias never appears
 * there. Without the alias resolved here too, a string-typed prop
 * referenced only under its local rename inside a filter predicate
 * (`t => t.label !== skipLabel`) is invisible to this witness, so its
 * equality lowers to numeric `!=` instead of `ne` — every row is
 * dropped, since `'Alpha' != 'Alpha'` and `'Beta' != 'Alpha'` both
 * numify to `0 != 0` (#2883). `resolveBodyDestructuredPropAliases`
 * already recognizes this exact destructuring shape (built for #2788's
 * top-level splice path); reusing it here keeps this one witness the
 * single source of truth `MojoFilterEmitter`/`MojoTopLevelEmitter` both
 * read via `_isStringValueName`, rather than growing a second, adapter-
 * emitter-local alias lookup.
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
