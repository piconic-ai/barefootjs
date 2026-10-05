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
 * The rows field of a loop over `<childName>` reading `loopArray`: the
 * plural (`Items` for `<Item>`), unless a props param already claims that
 * Go field name for different data — then `<childName>Rows` (numbered if
 * that is taken too). A loop that ranges over the very prop owning the
 * plural (`tags.map(t => <Tag …/>)`, #2627) keeps the plural: there the
 * field IS that prop's data, re-shaped into rows.
 */
export function nestedRowsFieldName(
  childName: string,
  loopArray: ParsedExpr | undefined,
  propsParams: readonly PropsParamLike[],
  propsObjectName: string | null | undefined,
): string {
  const plural = `${childName}s`
  const owner = propsParams.find(p => propFieldNames(p).includes(plural))
  if (!owner || loopDrivingProp(loopArray, propsParams, propsObjectName) === owner) return plural
  const taken = new Set(propsParams.flatMap(propFieldNames))
  let name = `${childName}Rows`
  for (let n = 2; taken.has(name); n++) name = `${childName}Rows${n}`
  return name
}
