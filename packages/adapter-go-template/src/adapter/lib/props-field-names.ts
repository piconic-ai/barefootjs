/**
 * The Props struct field each props param is held in (#3572). One
 * allocation, read by every site that names a prop's Props field: the
 * struct and constructor emitters, the template's field reads
 * (`propDestructureAliases`, `propKeyFields`), and the signal/prop
 * shared-field checks (`state-fields.ts`).
 */

import { isChildrenPropParam, type ComponentIR } from '@barefootjs/jsx'
import { capitalizeFieldName } from './go-naming.ts'

export type PropsFieldMeta = Pick<ComponentIR['metadata'], 'propsParams' | 'signals' | 'memos'>

/** The field name `Children`, which only the children prop may hold. */
const CHILDREN_FIELD = capitalizeFieldName('children')

/**
 * The Props struct field each props param is held in, by local binding.
 *
 * - The children prop is always `Children`, renamed or not
 *   (`{ children: kids }`, #3572): that is the field the parent's children
 *   reach it through (`bf_with_children` sets `Children` by name, and
 *   `New<Comp>Props` copies the caller's `Input.Children`).
 * - Any other param is held in its LOCAL binding's field (`{ n: count }` →
 *   `Count`), what the template reads, unless that field is `Children`
 *   (`{ label: children }`): `Children` is reserved for the children
 *   payload, so the binding takes its caller-facing key's field instead
 *   (`Label`), with `_` appended while another prop, signal or memo field
 *   already has that name.
 *
 * The template's reads of a binding whose field is not its local's resolve
 * through `propDestructureAliases` (`propFieldAliases`).
 */
export function propsFieldNames(meta: PropsFieldMeta): ReadonlyMap<string, string> {
  const fields = new Map<string, string>()
  const displaced: { name: string; sourceName?: string }[] = []
  const taken = new Set<string>([
    ...(meta.signals ?? []).map(sig => capitalizeFieldName(sig.getter)),
    ...(meta.memos ?? []).map(m => capitalizeFieldName(m.name)),
  ])
  for (const param of meta.propsParams ?? []) {
    const field = isChildrenPropParam(param) ? CHILDREN_FIELD : capitalizeFieldName(param.name)
    if (field === CHILDREN_FIELD && !isChildrenPropParam(param)) {
      displaced.push(param)
      continue
    }
    fields.set(param.name, field)
    taken.add(field)
  }
  taken.add(CHILDREN_FIELD)
  for (const param of displaced) {
    let field = capitalizeFieldName(param.sourceName ?? param.name)
    while (taken.has(field)) field = `${field}_`
    fields.set(param.name, field)
    taken.add(field)
  }
  return fields
}

/** The Props struct field `param` is held in (`propsFieldNames`). */
export function propsFieldName(param: { name: string; sourceName?: string }, meta: PropsFieldMeta): string {
  return propsFieldNames(meta).get(param.name) ?? capitalizeFieldName(param.name)
}
