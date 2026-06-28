/**
 * Prop classification for the Text::Xslate (Kolon) template adapter.
 *
 * Extracted from `xslate-adapter.ts` (domain-module refactor, issue #2018
 * track D). Pure functions over `ir.metadata` that derive the per-compile
 * prop/name sets the adapter consults during lowering. Mirror of the Go
 * adapter's `props/prop-types.ts`. No adapter instance state.
 */

import type { ComponentIR } from '@barefootjs/jsx'
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
 * String-typed signals and props. A signal is string-typed when its inferred
 * type is `string` (or, defensively, when its initial value is a bare string
 * literal); a prop when its annotated type is `string`. In the Mojo adapter
 * this drives `eq`/`ne` selection for string equality; the Kolon emitters
 * don't consume the distinction (Kolon's `==`/`!=` compare strings and numbers
 * correctly), so this set is carried for parity with the Mojo adapter.
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
