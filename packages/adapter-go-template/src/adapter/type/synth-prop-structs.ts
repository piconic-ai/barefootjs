/**
 * #2674/#2925: decide which anonymous (`kind: 'object'`) types reachable from
 * a component's type surface get a synthesized, deterministically-named Go
 * struct — pure planning, no emission, no `GoEmitContext`.
 *
 * `emitSynthPropStructs` (the actual struct emitter, `go-template-adapter.ts`)
 * needs this decision to emit the struct. `registerChildComponentShape` (a
 * PARENT's cross-component-shape registry, built for every child/sibling
 * BEFORE any component's `generateTypes` runs — see its own docstring) needs
 * the SAME decision for the SAME anonymous type, to know whether a required
 * object-shaped prop it bakes an inline object literal into targets a
 * synthesized struct or the `map[string]interface{}` fallback (#2925). This
 * is the one place that decision is made, so the two callers can't drift
 * (CLAUDE.md's "one decision, two implementations" rule) — `TypeInfo` object
 * IDENTITY is the join key both sides use, since the two callers always run
 * against the SAME `ComponentIR` object (no serialization round-trip between
 * them for a given component — see `test-render.ts`/`jsx-runner.ts`/
 * `compat/engine.ts`, which call `registerChildComponentShape(ir)` then later
 * `generateTypes(ir)` on that identical object).
 */

import type { IRMetadata, PropertyInfo, TypeInfo } from '@barefootjs/jsx'

import { goFieldNameForKey } from '../lib/go-naming.ts'

export interface SynthPropStructPlanEntry {
  typeInfo: TypeInfo
  name: string
  properties: PropertyInfo[]
}

/**
 * Named-type identifiers `buildLocalTypeTables` seeds into `localTypeNames`
 * before `emitSynthPropStructs` ever runs — the Props/`*Props` skip rule the
 * struct emitter's own two walk roots also apply. Seeding
 * `planSynthPropStructs`'s collision set from this (rather than from
 * `CompileState`, which isn't populated yet for a not-yet-compiled child at
 * `registerChildComponentShape` time) is what keeps the two callers' name
 * decisions identical.
 */
export function localTypeDefinitionNames(
  typeDefinitions: IRMetadata['typeDefinitions'],
  componentName: string,
): string[] {
  return typeDefinitions
    .filter(td => td.name !== 'Props' && td.name !== `${componentName}Props` && !td.name.endsWith('Props'))
    .map(td => td.name)
}

/**
 * Pure port of `emitSynthPropStructs`'s visit/visitObject/visitArrayElem walk
 * (both roots: named types' own properties, then inline prop types with no
 * backing `TypeDefinition`). Claims a deterministic name for each anonymous
 * object type PRE-order (a type's own desired name is claimed before its
 * nested properties are visited, matching the collision ORDER the real
 * emitter uses) and declines a type whose desired name collides with an
 * already-claimed one — same graceful per-type fallback to the
 * `map[string]interface{}` convention `typeInfoToGo` documents. Returns
 * entries in POST-order (children before parents), matching
 * `structFieldsFor`'s requirement that a nested synthesized field type
 * already have its name resolved when the parent's own fields are built.
 */
export function planSynthPropStructs(
  metadata: Pick<IRMetadata, 'typeDefinitions' | 'propsParams'>,
  componentName: string,
): SynthPropStructPlanEntry[] {
  const taken = new Set(localTypeDefinitionNames(metadata.typeDefinitions, componentName))
  const claimed = new Map<TypeInfo, string>()
  const order: SynthPropStructPlanEntry[] = []

  const visitObject = (typeInfo: TypeInfo, desiredName: string): void => {
    if (claimed.has(typeInfo)) return
    if (taken.has(desiredName)) return
    taken.add(desiredName)
    claimed.set(typeInfo, desiredName)
    for (const prop of typeInfo.properties ?? []) {
      visit(prop.type, desiredName, prop.name)
    }
    order.push({ typeInfo, name: desiredName, properties: typeInfo.properties ?? [] })
  }

  const visitArrayElem = (elemType: TypeInfo | undefined, parentName: string, propName: string): void => {
    if (!elemType) return
    if (elemType.kind === 'array') {
      visitArrayElem(elemType.elementType, parentName, propName)
    } else if (elemType.kind === 'object') {
      visitObject(elemType, `${parentName}${goFieldNameForKey(propName)}Item`)
    }
  }

  const visit = (typeInfo: TypeInfo, parentName: string, propName: string): void => {
    if (typeInfo.kind === 'array') {
      visitArrayElem(typeInfo.elementType, parentName, propName)
    } else if (typeInfo.kind === 'object') {
      visitObject(typeInfo, `${parentName}${goFieldNameForKey(propName)}`)
    }
  }

  // Walk root 1: named types' own properties (closes `Row.user`).
  for (const td of metadata.typeDefinitions) {
    if (td.name === 'Props' || td.name === `${componentName}Props`) continue
    if (td.name.endsWith('Props')) continue
    for (const prop of td.properties ?? []) {
      visit(prop.type, td.name, prop.name)
    }
  }

  // Walk root 2: inline prop types with no backing TypeDefinition (closes
  // `items: { id: number; tags: string[] }[]`, and #2925's plain
  // `value: { v: () => number }` required-object prop).
  for (const param of metadata.propsParams) {
    visit(param.type, componentName, param.name)
  }

  return order
}
