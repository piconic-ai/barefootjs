/**
 * Prop classification for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over `ir.metadata` that derive the per-compile
 * prop/name sets the adapter consults during lowering. Mirror of the Go
 * adapter's `props/prop-types.ts`. No adapter instance state.
 */

import {
  collectLoopBoundNames,
  isBareStringLiteral,
  isStringTypeInfo,
  resolveBodyDestructuredPropAliases,
  type ComponentIR,
  type TypeInfo,
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
 * Excludes any name bound as a `.map()`/`.filter()` loop callback's item
 * or index parameter ANYWHERE in the component (Fable review, #2212): the
 * lookup below is a flat, scope-blind `Set<string>` with no notion of a
 * loop param shadowing an outer string-typed binding of the same name
 * (`items.map((name) => 1 + name)` inside a component that also has a
 * string `name` prop) — left unguarded, that shadowed `name` would be
 * misdetected as string-typed and `1 + name` would silently lower to `.`
 * instead of staying numeric `+`. Subtracting loop-bound names is coarse
 * (it also suppresses a genuinely non-shadowed same-named string
 * elsewhere in the component) but safe: the suppressed case just falls
 * back to today's numeric `+` — the same, already-accepted residual as an
 * unresolvable operand — never silently-wrong output.
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
  for (const bound of collectLoopBoundNames(ir)) names.delete(bound)
  return names
}

/**
 * Number-typed signals, memos, props and same-file local consts: a strict
 * equality against one of them keeps Perl's numeric `==` / `!=`, where an
 * operand of unknown type goes through the runtime's `strict_eq`
 * (`emitPerlEquality`). `names` holds the bare spellings (a getter, a
 * destructured prop, a const), `props` the caller-facing keys a
 * `props.<key>` member reads. Whether a binding shadows a name is the
 * caller's scope question.
 */
export function collectNumberValueNames(ir: ComponentIR): { names: Set<string>; props: Set<string> } {
  const isNumber = (type: TypeInfo | null | undefined): boolean =>
    type?.kind === 'primitive' && type.primitive === 'number'
  const names = new Set<string>()
  const props = new Set<string>()
  for (const s of ir.metadata.signals) {
    if (isNumber(s.type)) names.add(s.getter)
  }
  for (const m of ir.metadata.memos ?? []) {
    if (isNumber(m.type)) names.add(m.name)
  }
  for (const p of ir.metadata.propsParams) {
    if (!isNumber(p.type)) continue
    props.add(p.sourceName ?? p.name)
    if (!ir.metadata.propsObjectName) names.add(p.name)
  }
  for (const c of ir.metadata.localConstants) {
    if (isNumber(c.type)) names.add(c.name)
  }
  return { names, props }
}
