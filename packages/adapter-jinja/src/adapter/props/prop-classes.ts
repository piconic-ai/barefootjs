/**
 * Prop classification for the Jinja2 template adapter.
 *
 * Ported from `packages/adapter-xslate/src/adapter/props/prop-classes.ts`.
 * Pure functions over `ir.metadata` that derive the per-compile prop/name
 * sets the adapter consults during lowering. No adapter instance state.
 */

import type { ComponentIR } from '@barefootjs/jsx'
import { isStringTypeInfo, isBareStringLiteral } from '../value/parsed-literal.ts'

/**
 * Props whose declared TS type is boolean — a bare binding of one
 * (`data-active={props.isActive}`) must stringify as JS `String(boolean)`
 * ("true"/"false"), not Python's `str(bool)` ("True"/"False") (#1897,
 * pagination's data-active).
 */
export function collectBooleanTypedProps(ir: ComponentIR): Set<string> {
  return new Set(
    ir.metadata.propsParams
      .filter(prop => prop.type?.primitive === 'boolean' || prop.type?.raw === 'boolean')
      .map(prop => prop.name),
  )
}

/**
 * Bare references to presence-uncertain no-default props — non-primitive
 * or declared optional (#2259; pre-#2259 destructured optionals arrived as
 * `unknown` and the type test alone covered them) — (e.g.
 * textarea's `rows`) are `None` when omitted → guarded with
 * `is defined and is not none` in `emitExpression`. See the
 * `nullableOptionalProps` field docstring in `jinja-adapter.ts`.
 */
export function collectNullableOptionalProps(ir: ComponentIR): Set<string> {
  return new Set(
    ir.metadata.propsParams
      .filter(
        p =>
          p.defaultValue === undefined &&
          !p.isRest &&
          (p.type?.kind !== 'primitive' || p.optional),
      )
      .map(p => p.name),
  )
}

/**
 * String-typed signals and props. A signal is string-typed when its inferred
 * type is `string` (or, defensively, when its initial value is a bare string
 * literal); a prop when its annotated type is `string`. In the Mojo adapter
 * this drives `eq`/`ne` selection for string equality; neither the Kolon nor
 * the Jinja emitters consume the distinction (both languages' `==`/`!=`
 * compare strings and numbers correctly), so this set is carried for parity
 * with the Perl-family adapters, not because Jinja needs it today.
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
