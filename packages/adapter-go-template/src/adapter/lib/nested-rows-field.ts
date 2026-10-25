/**
 * The one answer to "which Input/Props field holds a child-component loop's
 * rows?" — shared by the adapter's struct, constructor and template
 * emitters and by the conformance harness's route-handler seeding, so the
 * four can never name it differently.
 */

import type { ParsedExpr } from '@barefootjs/jsx'
import { capitalizeFieldName } from './go-naming.ts'

interface PropsParamLike {
  readonly name: string
  readonly sourceName?: string
}

/**
 * The props param a loop's array reads directly — a destructured prop
 * binding (`items.map(…)`) or a member of the whole props object
 * (`props.items.map(…)`) — or undefined for any other array source. With a
 * whole `props` object a bare identifier is a local alias, not a prop.
 */
export function loopDrivingProp<P extends PropsParamLike>(
  arr: ParsedExpr | undefined,
  propsParams: readonly P[],
  propsObjectName: string | null | undefined,
): P | undefined {
  if (!arr) return undefined
  if (arr.kind === 'identifier') {
    if (propsObjectName) return undefined
    return propsParams.find(p => p.name === arr.name)
  }
  if (arr.kind === 'member' && !arr.computed && arr.object.kind === 'identifier' && arr.object.name === propsObjectName) {
    return propsParams.find(p => (p.sourceName ?? p.name) === arr.property)
  }
  return undefined
}

function propFieldNames(p: PropsParamLike): string[] {
  return [capitalizeFieldName(p.name), capitalizeFieldName(p.sourceName ?? p.name)]
}

/**
 * The component's other generated Props fields a renamed rows field must
 * not land on: every child-component loop's plain plural (`<ItemRow>` →
 * `ItemRows`) and every signal / memo field. Computed once per component
 * from the same IR by the adapter and the conformance harness.
 */
export function reservedRowsFieldNames(
  loopChildNames: Iterable<string>,
  stateFieldNames: Iterable<string>,
): Set<string> {
  return new Set([
    ...[...loopChildNames].map(name => `${name}s`),
    ...[...stateFieldNames].map(name => capitalizeFieldName(name)),
  ])
}

/**
 * The rows field of a loop over `<childName>`: the plural (`Items` for
 * `<Item>`), unless a props param already claims that Go field name — then
 * `<childName>Rows`, numbered when a prop or another generated field
 * (`reserved`, `reservedRowsFieldNames`) already has that name. A loop that
 * ranges over the very prop owning the plural (`tags.map(t => <Tag …/>)`)
 * is renamed too, whether its row forwards children (#3603) or not (#3616):
 * the constructor builds the rows FROM the prop (`propArrayLoopRowSource`),
 * so the prop keeps its own field and type, and the rows go to `TagRows`.
 */
export function nestedRowsFieldName(
  childName: string,
  propsParams: readonly PropsParamLike[],
  reserved: ReadonlySet<string> = new Set(),
): string {
  const plural = `${childName}s`
  if (!propsParams.some(p => propFieldNames(p).includes(plural))) return plural
  return numberedRowsField(childName, new Set([...propsParams.flatMap(propFieldNames), ...reserved]))
}

/** `<childName>Rows`, numbered past every name in `taken`. */
function numberedRowsField(childName: string, taken: ReadonlySet<string>): string {
  let name = `${childName}Rows`
  for (let n = 2; taken.has(name); n++) name = `${childName}Rows${n}`
  return name
}

/** One child-component loop site, as `findNestedComponents` reports it. */
export interface RowsFieldSite {
  readonly name: string
  readonly loopMarkerId?: string
}

/** A loop site's rows field and the constructor local that builds it. */
export interface RowsFieldAllocation {
  readonly field: string
  readonly varName: string
}

/** The key `allocateRowsFields` files a loop site under. */
export function rowsFieldSiteKey(site: Pick<RowsFieldSite, 'name' | 'loopMarkerId'>): string {
  return site.loopMarkerId ?? site.name
}

function lowerFirst(name: string): string {
  return `${name.charAt(0).toLowerCase()}${name.slice(1)}`
}

/**
 * The rows field of every child-component loop site in one component,
 * decided once and read by the struct, constructor and template emitters
 * and by the conformance harness (#3599). Each loop site gets its own
 * field: the first loop over `<Chip>` keeps `nestedRowsFieldName`'s name
 * (`Chips`), and a later loop over the same component — which ranges over
 * other data and forwards other children — takes `ChipRows` (numbered past
 * every prop, state and already-allocated field). The constructor local
 * follows the field (`chips`, `chipRows`).
 */
export function allocateRowsFields(
  sites: readonly RowsFieldSite[],
  propsParams: readonly PropsParamLike[],
  stateFieldNames: Iterable<string>,
): Map<string, RowsFieldAllocation> {
  const reserved = reservedRowsFieldNames(
    sites.map(s => s.name),
    stateFieldNames,
  )
  const taken = new Set([...propsParams.flatMap(propFieldNames), ...reserved])
  const allocated = new Map<string, RowsFieldAllocation>()
  const seenChildren = new Set<string>()
  for (const site of sites) {
    const key = rowsFieldSiteKey(site)
    if (allocated.has(key)) continue
    const first = !seenChildren.has(site.name)
    seenChildren.add(site.name)
    const field = first
      ? nestedRowsFieldName(site.name, propsParams, reserved)
      : numberedRowsField(site.name, taken)
    taken.add(field)
    allocated.set(key, { field, varName: first ? lowerFirst(`${site.name}s`) : lowerFirst(field) })
  }
  return allocated
}
