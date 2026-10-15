/**
 * Prop classification for the ERB template adapter.
 *
 * Ported from the Mojolicious adapter's `props/prop-classes.ts` (issue #2018
 * track D lineage). Pure functions over `ir.metadata` that derive the
 * per-compile prop/name sets the adapter consults during lowering. No
 * adapter instance state.
 */

import { isBareStringLiteral, isStringTypeInfo, type ComponentIR } from '@barefootjs/jsx'

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
