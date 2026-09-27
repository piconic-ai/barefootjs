/**
 * A signal seeded from a member of an object-typed prop —
 * `createSignal(initial.items)` (destructured component) or
 * `createSignal(props.initial.items)` (SolidJS-style `propsObjectName`
 * component), at any member depth. The ONE decision of "which Go value and
 * which Go type does such a seed have", shared by the constructor's seed
 * baking (`convertInitialValue` / `getSignalInitialValueAsGo`), the Props
 * struct's signal field type (`emitPropsDataFields`), and memo type
 * inference, so the field type and the value baked into it can't disagree.
 *
 * The seed is a field path on the Input struct (`in.Initial.Items`), walked
 * through the SAME Go types the Input struct and the generated structs
 * declare: the prop's field type is `resolvePropGoType` (what
 * `generateInputStruct` emits), and each hop's field name and type come from
 * the struct that type names — `localStructFields` (named same-file types and
 * #2674's synthesized anonymous-object structs alike) plus the hop property's
 * own `TypeInfo` through `typeInfoToGo`, which is exactly how
 * `structFieldsFor` typed that struct field. No second prop-type → Go
 * decision is made here.
 */

import type { ParsedExpr, PropertyInfo } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { resolvePropGoType } from '../props/prop-types.ts'
import { typeInfoToGo } from '../type/type-codegen.ts'

export type PropMemberSeed =
  | {
      kind: 'resolved'
      propName: string
      path: string[]
      /** The Input-struct field path, e.g. `in.Initial.Items`. */
      goRef: string
      /** The Go type of the last field on that path, e.g. `[]Item`. */
      goType: string
    }
  | {
      kind: 'unresolved'
      propName: string
      path: string[]
      /** Why no Go field path exists, for the BF101 message. */
      reason: string
    }

/**
 * The prop-rooted, non-computed member chain `preParsed` reads, or null when
 * it isn't one: `initial.label` / `initial.address.city` (a destructured
 * prop) or `props.initial.label` (a `propsObjectName` component; `props.x`
 * alone is a flat prop, resolved elsewhere). A computed hop (`initial[key]`)
 * is not a chain.
 */
function propMemberChain(
  ctx: GoEmitContext,
  preParsed: ParsedExpr | undefined,
  propsParams: readonly { name: string; sourceName?: string }[] | undefined,
): { propName: string; path: string[] } | null {
  if (!preParsed || preParsed.kind !== 'member') return null
  const path: string[] = []
  let node: ParsedExpr = preParsed
  while (node.kind === 'member') {
    if (node.computed) return null
    path.unshift(node.property)
    node = node.object
  }
  if (node.kind !== 'identifier') return null
  const rootName = node.name
  if (propsParams?.some(p => p.name === rootName)) {
    return { propName: rootName, path }
  }
  if (ctx.state.propsObjectName !== null && rootName === ctx.state.propsObjectName && path.length >= 2) {
    const propName = path[0]
    if (!propsParams?.some(p => p.name === propName)) return null
    return { propName, path: path.slice(1) }
  }
  return null
}

/** The properties of the generated Go struct named `goType`, or null when `goType` isn't one. */
function structProperties(ctx: GoEmitContext, goType: string): { fields: Map<string, string>; properties: PropertyInfo[] } | null {
  const fields = ctx.state.localStructFields.get(goType)
  if (!fields) return null
  const td = ctx.state.currentTypeDefinitions.find(t => t.name === goType)
  if (!td?.properties) return null
  return { fields, properties: td.properties }
}

/**
 * Resolve a prop-member signal seed (see the module docstring), or null when
 * `preParsed` isn't one. `propsParams` is the caller's in-scope prop list
 * (a shadowing local drops a name from it); the prop's full `ParamInfo` is
 * read from `state.currentPropsParams`.
 */
export function resolvePropMemberSeed(
  ctx: GoEmitContext,
  preParsed: ParsedExpr | undefined,
  propsParams: readonly { name: string; sourceName?: string }[] | undefined,
): PropMemberSeed | null {
  const chain = propMemberChain(ctx, preParsed, propsParams)
  if (!chain) return null
  const { propName, path } = chain
  const unresolved = (reason: string): PropMemberSeed => ({ kind: 'unresolved', propName, path, reason })

  const param = ctx.state.currentPropsParams.find(p => p.name === propName)
  if (!param) return unresolved(`prop '${propName}' has no declared type`)

  let goRef = `in.${capitalizeFieldName(param.sourceName ?? param.name)}`
  let goType = resolvePropGoType(ctx, param, ctx.state.propTypeOverrides)
  let owner = `prop '${propName}'`
  for (const property of path) {
    const struct = structProperties(ctx, goType)
    if (!struct) {
      return unresolved(`${owner} lowers to Go type '${goType}', not a generated struct with a '${property}' field`)
    }
    const goName = struct.fields.get(property)
    const propInfo = struct.properties.find(p => p.name === property)
    if (!goName || !propInfo) {
      return unresolved(`Go struct '${goType}' has no field for '${property}'`)
    }
    goRef = `${goRef}.${goName}`
    goType = typeInfoToGo(ctx, propInfo.type)
    owner = `'${property}'`
  }
  return { kind: 'resolved', propName, path, goRef, goType }
}

/**
 * The Go type a prop-member-seeded signal's own Props field takes — the
 * type of the Input field path its seed reads (`resolvePropMemberSeed`), so
 * the baked `in.Initial.Items` is always assignable to it. Null when the
 * signal isn't such a seed, or its path doesn't resolve (the seed then
 * refuses with BF101 in `convertInitialValue`).
 */
export function propMemberSeedGoType(
  ctx: GoEmitContext,
  signal: { parsed?: ParsedExpr },
): string | null {
  const seed = resolvePropMemberSeed(ctx, signal.parsed, ctx.state.currentPropsParams)
  return seed?.kind === 'resolved' ? seed.goType : null
}
