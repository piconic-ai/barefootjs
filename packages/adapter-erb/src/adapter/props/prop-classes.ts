/**
 * Prop classification for the ERB template adapter.
 *
 * Ported from the Mojolicious adapter's `props/prop-classes.ts` (issue #2018
 * track D lineage). Pure functions over `ir.metadata` that derive the
 * per-compile prop/name sets the adapter consults during lowering. No
 * adapter instance state.
 */

import type { ComponentIR } from '@barefootjs/jsx'
import { isStringTypeInfo, isBareStringLiteral } from '../value/parsed-literal.ts'

/**
 * SSR-resolvable context-value names: props, signal getters, memos.
 * A `<Ctx.Provider value>` member NOT in this set is a client-only function
 * with no SSR value, lowered to `nil`.
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
 * ("true"/"false"), matching the `bf.bool_str` helper's output.
 */
export function collectBooleanTypedProps(ir: ComponentIR): Set<string> {
  return new Set(
    ir.metadata.propsParams
      .filter(prop => prop.type?.primitive === 'boolean' || prop.type?.raw === 'boolean')
      .map(prop => prop.name),
  )
}

/**
 * No-destructure-default props → `nil` when the caller omits them → guard
 * their bare-reference attribute emission with a Ruby nil-check so the
 * attribute drops instead of rendering `attr=""` (Hono-style nullish
 * omission). A prop WITH a destructure default (`value = ''`) is never
 * `nil` in the body and must stay unconditional, so it is excluded. Mirrors
 * the Go adapter's nillable-field guard: there the witness is the resolved
 * `interface{}` field type; here it is the absence of a default. Excludes
 * concrete-primitive types (`string`/`number`/`boolean`) to match the Go
 * adapter's scope, which guards only nillable fields and leaves concrete
 * fields unconditional.
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
 * String-typed signals and props. A signal is string-typed when its inferred
 * type is `string` (the analyzer infers this from a string-literal initial
 * value) or, defensively, when its initial value is a bare string literal; a
 * prop when its annotated type is `string`.
 *
 * Ruby's `==`/`!=` don't coerce operand types the way Perl's numeric `==`
 * does, so this set does NOT drive equality-operator selection in the ERB
 * adapter (unlike Mojo's `eq`/`ne` split). It still matters for **index
 * access**: `obj[index]` lowers a string-typed `index` to a Hash lookup
 * (`obj[index.to_sym]`, JSON-shaped Ruby hashes use symbol keys) and any
 * other type to an Array lookup (`obj[index]`) — see
 * `expr/operand.ts::isStringTypedOperand`.
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
