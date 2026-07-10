/**
 * Prop classification for the Go template adapter.
 *
 * Ported from `packages/adapter-blade/src/adapter/props/prop-classes.ts` (itself
 * ported from Jinja) — ONE function: string-typed signal/prop names, needed to
 * decide `+` string-concat vs numeric addition (#2168 string-concat-plus). Pure
 * function over `ir.metadata`; no adapter instance state.
 */

import type { ComponentIR, TypeInfo } from '@barefootjs/jsx'

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
 * String-typed signals and props. A signal is string-typed when its inferred
 * type is `string` (or, defensively, when its initial value is a bare string
 * literal); a prop when its annotated type is `string`. Drives `isStringName`
 * for `isStringConcatBinary` — the shared helper (`@barefootjs/jsx`) that
 * decides whether a JS `+` is string concatenation rather than numeric
 * addition (Go's `html/template` has no native `+` at all; `binary()` always
 * emits a runtime call, `bf_add` for addition or `bf_concat_str` for
 * concatenation — see `go-template-adapter.ts`'s `binary()`).
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
  return names
}
