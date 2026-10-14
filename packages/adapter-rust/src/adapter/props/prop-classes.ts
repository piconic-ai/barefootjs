/**
 * Prop classification for the minijinja template adapter.
 *
 * Ported from `packages/adapter-xslate/src/adapter/props/prop-classes.ts`.
 * Pure functions over `ir.metadata` that derive the per-compile prop/name
 * sets the adapter consults during lowering. No adapter instance state.
 */

import { isBareStringLiteral, isStringTypeInfo, type ComponentIR } from '@barefootjs/jsx'

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
