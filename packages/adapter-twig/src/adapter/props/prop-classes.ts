/**
 * Prop classification for the Twig template adapter.
 *
 * Ported from `packages/adapter-jinja/src/adapter/props/prop-classes.ts`.
 * Pure functions over `ir.metadata` that derive the per-compile prop/name
 * sets the adapter consults during lowering. No adapter instance state.
 */

import type { ComponentIR } from '@barefootjs/jsx'
import { isStringTypeInfo, isBareStringLiteral } from '../value/parsed-literal.ts'

/**
 * Props whose declared TS type is boolean — a bare binding of one
 * (`data-active={props.isActive}`) must stringify as JS `String(boolean)`
 * ("true"/"false"), not PHP's `(string) bool` ("1"/"") (#1897, pagination's
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
 * textarea's `rows`) are `null` when omitted → guarded with
 * `is defined and is not null` in `emitExpression`. See the
 * `nullableOptionalProps` field docstring in `twig-adapter.ts`.
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
 * String-typed signals, props, and same-file local consts (#2212). A
 * signal is string-typed when its inferred type is `string` (or,
 * defensively, when its initial value is a bare string literal); a prop
 * when its annotated type is `string`; a local const the same way. Consumed
 * by `isStringConcatBinary`/`isStringTypedOperand` (`@barefootjs/jsx`) to
 * pick `~` over JS `+`'s numeric fallback (#2163, #2212) — including now
 * for a bare identifier operand, not just a prop/getter/literal. In the
 * Mojo adapter this ALSO drives `eq`/`ne` selection for string equality;
 * the Twig emitters don't consume the distinction there — `===`/`!==`
 * ALWAYS route through `bf.eq`/`bf.neq` regardless of operand type (see
 * `expr/emitters.ts`'s file header, divergence 4) — so that half of this
 * set is carried only for parity with the Perl-family adapters.
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
