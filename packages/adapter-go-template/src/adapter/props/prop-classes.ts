/**
 * Prop classification for the Go template adapter.
 *
 * Ported from `packages/adapter-blade/src/adapter/props/prop-classes.ts` (itself
 * ported from Jinja) — ONE function: string-typed signal/prop names, needed to
 * decide `+` string-concat vs numeric addition (#2168 string-concat-plus). Pure
 * function over `ir.metadata`; no adapter instance state.
 */

import { resolveBodyDestructuredPropAliases, type ComponentIR, type TypeInfo } from '@barefootjs/jsx'
import type { JsSourceText } from '@barefootjs/jsx'

/** True when `type` is the `string` primitive. */
function isStringTypeInfo(type: TypeInfo): boolean {
  return type.kind === 'primitive' && type.primitive === 'string'
}

/** True when `initialValue` is a bare string-literal expression. */
function isBareStringLiteral(initialValue: JsSourceText | undefined): boolean {
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
 * `go-template-adapter.ts`'s `binary()`). A local const counts the same
 * way: `{label + suffix}` (where `suffix = '!'`) classifies as string
 * concat through either operand, where `bf_add` would render `0`.
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
 * witness, so `isStringConcatBinary` falls through to numeric `bf_add`
 * instead of `bf_concat_str` (#2894, the go-template sibling of #2883's
 * Mojolicious fix). `resolveBodyDestructuredPropAliases` already recognizes
 * this exact destructuring shape; reusing it here keeps this one witness the
 * single source of truth `_isStringValueName` reads, rather than growing a
 * second, adapter-local alias lookup.
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
    if ((c.type !== null && isStringTypeInfo(c.type)) || isBareStringLiteral(c.value)) {
      names.add(c.name)
    }
  }
  return names
}
