/**
 * Prop classification for the Mojolicious EP template adapter.
 *
 * Extracted from `mojo-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over `ir.metadata` that derive the per-compile
 * prop/name sets the adapter consults during lowering. Mirror of the Go
 * adapter's `props/prop-types.ts`. No adapter instance state.
 */

import type { ComponentIR } from '@barefootjs/jsx'
import { isStringTypeInfo, isBareStringLiteral } from '../value/parsed-literal.ts'

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
 * No-destructure-default props → `undef` when the caller omits them → guard
 * their bare-reference attribute emission with Perl `defined` so the
 * attribute drops instead of rendering `attr=""` (Hono-style nullish
 * omission). A prop WITH a destructure default (`value = ''`) is never
 * `undef` in the body and must stay unconditional, so it is excluded. This
 * mirrors the Go adapter's nillable-field guard: there the witness is the
 * resolved `interface{}` field type; here it is the absence of a default (the
 * analyzer reports `rows` — a `TextareaHTMLAttributes` member destructured
 * without a default — as no-default, `type.kind: 'unknown'`).
 * Excludes concrete-primitive types (`string`/`number`/`boolean`) to match
 * the Go adapter's scope, which guards only `interface{}` (nillable) fields
 * and leaves concrete fields unconditional. So a required, no-default
 * `string` prop still emits `attr=""` like Hono, and only nillable
 * (`unknown`/object/array) no-default props guard.
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
 * String-typed signals, props, and same-file local consts, so equality
 * comparisons against them lower to `eq`/`ne` (#1672) and `+` concatenation
 * against them lowers to Perl's `.` instead of numeric `+` (#2163, #2212 —
 * `isStringConcatBinary`/`isStringTypedOperand` in `@barefootjs/jsx`, which
 * now also recognizes a bare identifier operand, not just a prop/getter/
 * literal). A signal is string-typed when its inferred type is `string`
 * (the analyzer infers this from a string-literal initial value) or,
 * defensively, when its initial value is a bare string literal; a prop or
 * local const when its annotated (or inferred) type is `string`.
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
  return names
}
