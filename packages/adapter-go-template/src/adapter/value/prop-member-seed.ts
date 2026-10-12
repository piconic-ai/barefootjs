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
 * own type and optionality through `propertyInfoToGo`, which is exactly how
 * `structFieldsFor` typed that struct field. No second prop-type → Go
 * decision is made here.
 */

import type { IRMetadata, ParsedExpr, PropertyInfo, TypeInfo } from '@barefootjs/jsx'
import { isBooleanAttr, isNullableSignal } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { resolvePropGoType } from '../props/prop-types.ts'
import { collapseLiteralUnion, literalNumberValue, propertyInfoToGo } from '../type/type-codegen.ts'
import { unwrapNullableUnion } from './value-lowering.ts'
import { planSynthPropStructs } from '../type/synth-prop-structs.ts'

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
    goType = propertyInfoToGo(ctx, propInfo, goType)
    owner = `'${property}'`
  }
  return { kind: 'resolved', propName, path, goRef, goType }
}

/**
 * The first prop-rooted member chain (`propMemberChain`) read somewhere
 * INSIDE `preParsed` — an operand of `initial?.label ?? 'none'`,
 * `initial.count + 1`, a template literal, … — or null when there is none
 * (or `preParsed` is itself such a chain, which `resolvePropMemberSeed`
 * answers). The seed bakers lower only a bare chain to its Input field
 * path; a chain embedded in a larger expression would otherwise fall
 * through to literal baking and silently bake a zero value. Arrow bodies
 * are not searched: their parameters can shadow a prop name.
 */
export function embeddedPropMemberChain(
  ctx: GoEmitContext,
  preParsed: ParsedExpr | undefined,
  propsParams: readonly { name: string; sourceName?: string }[] | undefined,
): { propName: string; path: string[] } | null {
  if (!preParsed || propMemberChain(ctx, preParsed, propsParams)) return null
  const visit = (node: ParsedExpr): { propName: string; path: string[] } | null => {
    const chain = propMemberChain(ctx, node, propsParams)
    if (chain) return chain
    for (const child of operands(node)) {
      const found = visit(child)
      if (found) return found
    }
    return null
  }
  return visit(preParsed)
}

/** The direct sub-expressions of `node` a seed value is computed from. */
function operands(node: ParsedExpr): ParsedExpr[] {
  switch (node.kind) {
    case 'identifier':
    case 'literal':
    case 'regex':
    case 'unsupported':
    case 'arrow':
      return []
    case 'member':
      return [node.object]
    case 'index-access':
      return [node.object, node.index]
    case 'binary':
    case 'logical':
      return [node.left, node.right]
    case 'unary':
      return [node.argument]
    case 'conditional':
      return [node.test, node.consequent, node.alternate]
    case 'call':
      return [node.callee, ...node.args]
    case 'template-literal':
      return node.parts.flatMap(part => (part.type === 'expression' ? [part.expr] : []))
    case 'array-literal':
      return node.elements
    case 'object-literal':
      return node.properties.map(p => (p.kind === 'prop' ? p.value : p.expr))
    case 'array-method':
      return [node.object, ...node.args, ...(node.method === 'flat' && node.depthExpr ? [node.depthExpr] : [])]
  }
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

/**
 * The Go struct a `TypeInfo` is emitted as, with its properties: a named
 * type definition, or an anonymous object type the synth-struct pre-pass
 * names. Null for any other type.
 */
export function structOwnerResolver(
  metadata: Pick<IRMetadata, 'propsParams' | 'typeDefinitions' | 'componentName'>,
): (type: TypeInfo) => { name: string; properties: PropertyInfo[] } | null {
  const propsParams = metadata.propsParams ?? []
  const typeDefinitions = metadata.typeDefinitions ?? []
  let synthNames: Map<TypeInfo, string> | null = null
  return (type) => {
    if (type.kind === 'object') {
      synthNames ??= new Map(
        planSynthPropStructs({ typeDefinitions, propsParams }, metadata.componentName).map(e => [e.typeInfo, e.name]),
      )
      const name = synthNames.get(type)
      return name && type.properties ? { name, properties: type.properties } : null
    }
    const td = type.raw ? typeDefinitions.find(t => t.name === type.raw) : undefined
    return td?.properties ? { name: td.name, properties: td.properties } : null
  }
}

/**
 * `Struct.field` keys of `number` struct fields a signal seed gives a
 * fractional literal (`createSignal<User>({ age: 2.5 })`, #3438), walking
 * nested object and array literals through the declared types.
 * `propertyInfoToGo` types them `float64`: the `number` default is `int`,
 * which can't hold the seed. A later `set` never reaches the Go struct,
 * which only carries SSR state, so seeds are the whole evidence.
 */
export function collectFractionalSeedStructFields(
  metadata: Pick<IRMetadata, 'signals' | 'propsParams' | 'typeDefinitions' | 'componentName'>,
): Set<string> {
  const keys = new Set<string>()
  const ownerOf = structOwnerResolver(metadata)
  const visit = (value: ParsedExpr, type: TypeInfo | undefined): void => {
    if (!type) return
    const scalar = unwrapNullableUnion(collapseLiteralUnion(type))
    if (value.kind === 'array-literal') {
      if (scalar.kind !== 'array') return
      for (const element of value.elements) visit(element, scalar.elementType)
      return
    }
    if (value.kind !== 'object-literal') return
    const owner = ownerOf(scalar)
    if (!owner) return
    for (const prop of value.properties) {
      if (prop.kind === 'spread') continue
      const property = owner.properties.find(p => p.name === prop.key)
      if (!property) continue
      const fieldType = unwrapNullableUnion(collapseLiteralUnion(property.type))
      const n = literalNumberValue(prop.value)
      if (fieldType.kind === 'primitive' && fieldType.primitive === 'number' && n !== null && !Number.isInteger(n)) {
        keys.add(`${owner.name}.${property.name}`)
      } else {
        visit(prop.value, property.type)
      }
    }
  }
  for (const signal of metadata.signals ?? []) {
    if (signal.parsed) visit(signal.parsed, signal.type)
  }
  return keys
}

/**
 * `Struct.field` keys of OPTIONAL scalar struct fields that a nullable
 * signal seeds from whole (`createSignal<string | undefined>(initial.label)`)
 * — #3323. Such a field must hold `nil` for a member the caller left out:
 * the signal's SSR value is `undefined` then, and a concrete `string` /
 * `float64` field reads the absence as `""` / `0`, which the attribute nil
 * guard can't tell from a supplied value. `propertyInfoToGo` flips these
 * fields to `interface{}`.
 *
 * Walked over the TS types alone (named type definitions, plus the
 * `planSynthPropStructs` name of an anonymous object type), so it runs
 * before any Go type table exists — including at
 * `registerChildComponentShape` time, which is how every component sharing
 * a named type in one file sees the same flip.
 */
export function collectNullableSeedStructFields(
  metadata: Pick<IRMetadata, 'signals' | 'propsParams' | 'typeDefinitions' | 'propsObjectName' | 'componentName'>,
  root?: unknown,
): Set<string> {
  const keys = new Set<string>()
  const propsParams = metadata.propsParams ?? []
  const ownerOf = structOwnerResolver(metadata)
  for (const signal of metadata.signals ?? []) {
    if (!isNullableSignal(signal)) continue
    const chain = tsPropMemberChain(signal.parsed, propsParams, metadata.propsObjectName ?? null)
    if (!chain) continue
    let type: TypeInfo | undefined = propsParams.find(p => p.name === chain.propName)?.type
    let owner: { name: string; properties: PropertyInfo[] } | null = null
    let property: PropertyInfo | undefined
    for (const hop of chain.path) {
      owner = type ? ownerOf(type) : null
      property = owner?.properties.find(p => p.name === hop)
      if (!property) break
      type = property.type
    }
    if (owner && property && isNullableScalarField(property)) {
      keys.add(`${owner.name}.${property.name}`)
    }
  }
  // An object signal's optional field read where `undefined` is observable
  // (#3421): `data-name={user()?.name}` omits the attribute and
  // `user().name ?? 'x'` falls back only for a missing field, which a
  // concrete `string` / `float64` field can't tell from `''` / `0`.
  if (root !== undefined) {
    const signalTypes = new Map((metadata.signals ?? []).map(sig => [sig.getter, sig.type]))
    for (const { getter, field } of collectNullableSignalFieldReads(root, new Set(signalTypes.keys()))) {
      const type = signalTypes.get(getter)
      const owner = type ? ownerOf(type) : null
      const property = owner?.properties.find(p => p.name === field)
      if (owner && property && isNullableScalarField(property)) keys.add(`${owner.name}.${property.name}`)
    }
  }
  return keys
}

function isNullableScalarField(property: PropertyInfo): boolean {
  return property.optional && property.type.kind === 'primitive' &&
    NULLABLE_SEED_PRIMITIVES.has(property.type.primitive ?? '')
}

/**
 * Single-hop field reads off a signal getter call (`user().name`,
 * `user()?.name`) in a position where a missing field is observable: the
 * whole value of a non-class/style, non-boolean attribute, the left operand
 * of `??`, or the receiver of a further `?.` hop (`user().name?.length`).
 */
function collectNullableSignalFieldReads(
  root: unknown,
  getters: ReadonlySet<string>,
): Array<{ getter: string; field: string }> {
  const reads: Array<{ getter: string; field: string }> = []
  const fieldRead = (expr: unknown): void => {
    const e = expr as ParsedExpr | undefined
    if (!e || e.kind !== 'member' || e.computed) return
    const call = e.object
    if (call.kind !== 'call' || call.args.length !== 0 || call.callee.kind !== 'identifier') return
    if (getters.has(call.callee.name)) reads.push({ getter: call.callee.name, field: e.property })
  }
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const rec = node as Record<string, unknown>
    if (rec.type === 'element' && Array.isArray(rec.attrs)) {
      for (const attr of rec.attrs as Array<{ name: string; value: { kind?: string; parsed?: unknown } }>) {
        if (attr.name === 'class' || attr.name === 'className' || attr.name === 'style') continue
        if (isBooleanAttr(attr.name) || attr.value?.kind !== 'expression') continue
        fieldRead(attr.value.parsed)
      }
    }
    if (rec.kind === 'logical' && rec.op === '??') fieldRead(rec.left)
    if (rec.kind === 'member' && rec.optional === true) fieldRead(rec.object)
    for (const value of Object.values(rec)) walk(value)
  }
  walk(root)
  return reads
}

const NULLABLE_SEED_PRIMITIVES = new Set(['string', 'number', 'boolean'])

/** `propMemberChain` without a `GoEmitContext`: the props-object name comes from the metadata. */
function tsPropMemberChain(
  preParsed: ParsedExpr | undefined,
  propsParams: readonly { name: string }[],
  propsObjectName: string | null,
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
  if (propsParams.some(p => p.name === node.name)) return { propName: node.name, path }
  if (propsObjectName !== null && node.name === propsObjectName && path.length >= 2 &&
      propsParams.some(p => p.name === path[0])) {
    return { propName: path[0], path: path.slice(1) }
  }
  return null
}

/**
 * `Child.prop` keys of child component props a caller in this component
 * passes a value that can be fractional (#3459): a fractional literal
 * (`age={2.5}`), a signal seeded with one (`age={n()}`), a field of an
 * object signal a seed gives a fraction (`fractionalStructFields`, #3438),
 * a prop whose default is one, a division, or a memo / arithmetic over
 * these. A child's `number` prop otherwise defaults to `int`, which can't
 * hold the value: a literal fails `go run` and an evaluated one truncates.
 * Keyed by the name written at the call site; a child imported from
 * another file is typed by its own compile, which this pass doesn't reach.
 */
export function collectFractionalChildProps(
  metadata: Pick<IRMetadata, 'signals' | 'memos' | 'propsParams' | 'typeDefinitions' | 'componentName' | 'propsObjectName'>,
  root: unknown,
  fractionalStructFields: ReadonlySet<string>,
  /** `Component.prop` keys already known fractional, so a component that
   *  forwards its own fractional prop (`<Price value={value} />`) passes
   *  the fraction on; the caller iterates to a fixed point. */
  fractionalProps: ReadonlySet<string> = new Set(),
): Set<string> {
  const keys = new Set<string>()
  const ownerOf = structOwnerResolver(metadata)
  const isFraction = (e: ParsedExpr | undefined): boolean => {
    const n = e ? literalNumberValue(e) : null
    return n !== null && !Number.isInteger(n)
  }
  // One of this component's own props: fractional by its default or by a
  // caller passing it a fraction.
  const isFractionalOwnProp = (key: string): boolean => {
    const param = (metadata.propsParams ?? []).find(p => (p.sourceName ?? p.name) === key || p.name === key)
    if (!param) return false
    return isFraction(param.parsed) || fractionalProps.has(`${metadata.componentName}.${param.sourceName ?? param.name}`)
  }
  // The declared type an expression's value has, for following a member
  // chain off an object signal (`u().address.zip`); null when untracked.
  const typeOf = (e: ParsedExpr, rows: ReadonlyMap<string, TypeInfo>): TypeInfo | null => {
    if (e.kind === 'identifier') return rows.get(e.name) ?? null
    if (e.kind === 'call' && e.callee.kind === 'identifier' && e.args.length === 0) {
      return (metadata.signals ?? []).find(s => s.getter === (e.callee as { name: string }).name)?.type ?? null
    }
    if (e.kind === 'member' && !e.computed) {
      const objType = typeOf(e.object, rows)
      const owner = objType ? ownerOf(unwrapNullableUnion(collapseLiteralUnion(objType))) : null
      return owner?.properties.find(p => p.name === e.property)?.type ?? null
    }
    return null
  }
  const mayBeFractional = (e: ParsedExpr, seen: ReadonlySet<string>, rows: ReadonlyMap<string, TypeInfo>): boolean => {
    switch (e.kind) {
      case 'literal':
        return isFraction(e)
      case 'unary':
        return isFraction(e) || mayBeFractional(e.argument, seen, rows)
      case 'binary':
        return e.op === '/' || (['+', '-', '*', '%'].includes(e.op) && (mayBeFractional(e.left, seen, rows) || mayBeFractional(e.right, seen, rows)))
      case 'logical':
        return mayBeFractional(e.left, seen, rows) || mayBeFractional(e.right, seen, rows)
      case 'conditional':
        return mayBeFractional(e.consequent, seen, rows) || mayBeFractional(e.alternate, seen, rows)
      case 'call': {
        if (e.callee.kind !== 'identifier' || e.args.length !== 0) return false
        const name = e.callee.name
        const signal = (metadata.signals ?? []).find(s => s.getter === name)
        if (signal) return isFraction(signal.parsed)
        const memo = (metadata.memos ?? []).find(m => m.name === name)
        if (!memo?.parsed || seen.has(name)) return false
        return mayBeFractional(memo.parsed, new Set([...seen, name]), new Map())
      }
      case 'member': {
        if (e.computed) return false
        if (metadata.propsObjectName && e.object.kind === 'identifier' && e.object.name === metadata.propsObjectName) {
          return isFractionalOwnProp(e.property)
        }
        const objType = typeOf(e.object, rows)
        const owner = objType ? ownerOf(unwrapNullableUnion(collapseLiteralUnion(objType))) : null
        return !!owner && fractionalStructFields.has(`${owner.name}.${e.property}`)
      }
      case 'identifier':
        return !rows.has(e.name) && (metadata.propsParams ?? []).some(p => p.name === e.name) && isFractionalOwnProp(e.name)
      default:
        return false
    }
  }
  // `rows` maps a loop's item binding to its element type, so a row
  // field (`items().map(i => <Price value={i.price} />)`) resolves too.
  const visit = (node: unknown, rows: ReadonlyMap<string, TypeInfo>): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child, rows)
      return
    }
    if (node === null || typeof node !== 'object') return
    const n = node as { type?: unknown; name?: unknown; props?: unknown; param?: unknown; arrayParsed?: ParsedExpr; itemType?: TypeInfo | null }
    let inner = rows
    if (n.type === 'loop' && typeof n.param === 'string') {
      const arrayType = n.arrayParsed ? typeOf(n.arrayParsed, rows) : null
      const element = arrayType?.kind === 'array' ? arrayType.elementType : n.itemType ?? undefined
      if (element) inner = new Map([...rows, [n.param, element]])
    }
    if (n.type === 'component' && typeof n.name === 'string' && Array.isArray(n.props)) {
      for (const prop of n.props as Array<{ name: string; value: { kind: string; parsed?: ParsedExpr } }>) {
        const parsed = prop.value.kind === 'expression' ? prop.value.parsed : undefined
        if (parsed && mayBeFractional(parsed, new Set(), inner)) keys.add(`${n.name}.${prop.name}`)
      }
    }
    for (const value of Object.values(node)) visit(value, inner)
  }
  visit(root, new Map())
  return keys
}
