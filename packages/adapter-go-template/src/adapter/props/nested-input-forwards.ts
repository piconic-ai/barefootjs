/**
 * Which of a component's own props it forwards into a nested child
 * component's input, and the refusal lookup built on it (#3986).
 *
 * `New<Parent>Props` builds every nested child's Props once, at
 * construction, from the Input it is handed (`KidSlot0: NewKidProps(KidInput{
 * Seed: in.Children })`). A value the parent receives later, at template
 * execute time (JSX children or a JSX-valued prop rendered through a
 * companion define and set by `bf_with_children` / `bf_with_props`), never
 * reaches that construction, so a field the nested child derives from it
 * (a `createSignal` seed, a `createMemo` body) is computed as if the value
 * were absent. This is the one-level-removed twin of
 * `refuseTemplateTimeDeliveryToDerivedField` (`derived-field-delivery.ts`).
 *
 * Decided on the parent's IR only (the nested call's `parsed` prop values,
 * the body consts they name, and the loop rows that shadow a name), so a
 * cross-file sibling registered before its compile records the same facts.
 */

import {
  BindingScope,
  buildImportAliasMap,
  planComponentProps,
  resolveComponentPropKeys,
  type AttrValue,
  type ComponentIR,
  type IRComponent,
  type IRNode,
  type ParsedExpr,
} from '@barefootjs/jsx'
import { capitalizeFieldName } from '../lib/go-naming.ts'
import { collectPropsReadByCtorInit } from '../memo/memo-compute.ts'

/** One nested child prop whose value reads some of the parent's own props. */
export interface NestedInputForward {
  /** The nested child's declared component name (an import alias resolved). */
  readonly child: string
  /** The prop the parent writes on the nested child (the JSX attribute name). */
  readonly prop: string
  /** The parent's caller-facing Input fields the value reads (`Children`). */
  readonly reads: ReadonlySet<string>
  /**
   * Fields read only by the explicit writer a `{...props}` param overrides
   * when the parent's caller passes it (`seed={props.children} {...props}`
   * with `seed` optional): they reach the nested prop only when none of
   * `unlessPassed` (caller-facing keys) is passed.
   */
  readonly fallbackReads: ReadonlySet<string>
  readonly unlessPassed: ReadonlySet<string>
  /** The keys this call definitely passes to `child` ({@link callWrites}). */
  readonly writes: CallWrites
}

/** The keys a component call definitely passes. */
export type CallWrites = ReadonlySet<string>

/**
 * The keys `comp`'s call definitely passes to the component it calls, as
 * far as the compiler can tell: an explicit prop (or JSX children), and a
 * key a `{...props}` spread carries from a REQUIRED param of the calling
 * component (`callerProps`), which its own caller always passes. A key a
 * spread carries only when passed, and any key of a spread whose keys are
 * unknown, is not definite: a fallback that such a key would override still
 * counts (`reaches`).
 */
export function callWrites(
  comp: Pick<IRComponent, 'props' | 'children'>,
  callerProps: Pick<ComponentIR['metadata'], 'propsObjectName' | 'propsParams'>,
): CallWrites {
  const keys = new Set<string>()
  for (const p of comp.props) if (p.value.kind !== 'spread') keys.add(p.name)
  if (comp.children.length > 0) keys.add('children')
  if (!comp.props.some(p => p.value.kind === 'spread')) return keys
  const params = callerProps.propsParams ?? []
  const resolved = resolveComponentPropKeys(planComponentProps(
    { props: comp.props, children: comp.children, slotId: null },
    { propsObjectName: callerProps.propsObjectName ?? null, propsParams: params },
  ))
  for (const key of resolved ?? []) {
    if (key.base?.kind !== 'props-param') continue
    const baseName = key.base.name
    if (params.find(p => p.name === baseName)?.optional === false) keys.add(key.key)
  }
  return keys
}

/**
 * Where a forwarded prop ends up feeding a constructor-derived field: the
 * nested call the parent writes (`child`, `prop`) and the field (`owner`'s
 * `field`) computed from it, which is deeper than `child` when the value is
 * forwarded on again.
 */
export interface NestedDerivedReading {
  readonly child: string
  readonly prop: string
  readonly owner: string
  readonly field: string
}

type Meta = Pick<ComponentIR['metadata'], 'propsObjectName' | 'propsParams' | 'localConstants' | 'imports'>

/** Reads the caller-facing fields of a component's props a value reads, evaluated in a given scope. */
type PropReader = (value: ParsedExpr, scope: BindingScope) => Set<string>

/**
 * The nested child props in `ir`'s tree whose value reads one of `ir`'s own
 * props, after the shared props plan has decided which writer of each key
 * the constructor uses (`planComponentProps` / `resolveComponentPropKeys`,
 * as `planChildCallProps` does): an explicit prop a later writer replaces
 * is dropped, and a key a `{...props}` spread carries reads the parent's
 * param of that name (also when it only overrides the explicit writer when
 * passed). A value reads a prop directly (`seed={props.children}`,
 * `seed={props['children']}`, `seed={children}`) or through a body const
 * (`const c = props.children`, `const { children } = props`). A loop row's
 * binding shadows a name at the call; a `/* @client *\/` prop never reaches
 * the constructor and is skipped.
 */
export function collectNestedInputForwards(ir: { metadata: Meta; root: IRNode }): NestedInputForward[] {
  const meta = ir.metadata
  const reader = propReader(meta)
  const aliases = buildImportAliasMap(meta.imports ?? [])
  const forwards: NestedInputForward[] = []
  const visitComponent = (comp: IRComponent, scope: BindingScope): void => {
    const child = aliases.get(comp.name) ?? comp.name
    const writes = callWrites(comp, meta)
    for (const [prop, r] of callKeyReads(comp, meta, reader, scope)) {
      if (r.reads.size > 0 || r.fallbackReads.size > 0) forwards.push({ child, prop, writes, ...r })
    }
  }
  walkComponents(ir.root, BindingScope.EMPTY, visitComponent)
  return forwards
}

/**
 * Each key of `comp`'s call and the parent fields the value its constructor
 * writes for that key reads. A call that also spreads an object whose keys
 * are unknown reads every expression prop as written, the way the
 * constructor lowers it.
 */
interface KeyReads { reads: Set<string>; fallbackReads: Set<string>; unlessPassed: Set<string> }

function callKeyReads(comp: IRComponent, meta: Meta, reader: PropReader, scope: BindingScope): Map<string, KeyReads> {
  const out = new Map<string, KeyReads>()
  const at = (key: string): KeyReads => {
    let r = out.get(key)
    if (!r) out.set(key, (r = { reads: new Set(), fallbackReads: new Set(), unlessPassed: new Set() }))
    return r
  }
  const valueReads = (value: AttrValue): Set<string> => {
    const prop = comp.props.find(p => p.value === value)
    if (value.kind !== 'expression' || !value.parsed || prop?.clientOnly) return new Set()
    return reader(value.parsed, scope)
  }
  const plan = planComponentProps(
    { props: comp.props, children: comp.children, slotId: null },
    { propsObjectName: meta.propsObjectName ?? null, propsParams: meta.propsParams ?? [] },
  )
  const resolved = resolveComponentPropKeys(plan)
  if (resolved === null) {
    for (const prop of comp.props) for (const f of valueReads(prop.value)) at(prop.name).reads.add(f)
    return out
  }
  const spreadShadowed = !!meta.propsObjectName && scope.isBound(meta.propsObjectName)
  for (const key of resolved) {
    const r = at(key.key)
    const present = spreadShadowed ? [] : key.presentParams
    const baseReads = key.base?.kind === 'value' ? valueReads(key.base.value) : new Set<string>()
    if (key.base?.kind === 'props-param' && !spreadShadowed) baseReads.add(paramField(meta, key.base.name))
    for (const f of baseReads) (present.length > 0 ? r.fallbackReads : r.reads).add(f)
    for (const param of present) {
      r.reads.add(paramField(meta, param))
      r.unlessPassed.add(paramKey(meta, param))
    }
  }
  return out
}

/** The key the caller writes for `meta`'s param `name` (its local binding). */
function paramKey(meta: Meta, name: string): string {
  const param = (meta.propsParams ?? []).find(p => p.name === name)
  return param?.sourceName ?? name
}

/** The caller-facing Input field of `meta`'s param `name` (its local binding). */
function paramField(meta: Meta, name: string): string {
  return capitalizeFieldName(paramKey(meta, name))
}

/**
 * A {@link PropReader} for `meta`'s props, following body consts once each.
 * The value's own names are resolved in the use-site `scope` (a loop row
 * binding shadows them); a const's initializer is resolved where it is
 * declared, the component body, whatever loop rows enclose the use.
 */
function propReader(meta: Meta): PropReader {
  const propsObjectName = meta.propsObjectName ?? null
  const params = meta.propsParams ?? []
  const localNames = new Set(params.map(p => p.name))
  const sourceOf = new Map(params.map(p => [p.name, p.sourceName ?? p.name]))
  const consts = new Map<string, ParsedExpr>()
  for (const c of meta.localConstants ?? []) {
    if (!c.isModule && c.parsed) consts.set(c.name, c.parsed)
  }
  const constNames = new Set(consts.keys())
  const readsOf = (e: ParsedExpr, scope: BindingScope): Set<string> => {
    const found = new Set<string>()
    if (propsObjectName && scope.isBound(propsObjectName)) return found
    for (const read of collectPropsReadByCtorInit(e, propsObjectName, localNames, { staticBracketReads: true })) {
      if (propsObjectName || !scope.isBound(read)) found.add(capitalizeFieldName(sourceOf.get(read) ?? read))
    }
    return found
  }
  return (value, scope) => {
    const found = readsOf(value, scope)
    const seen = new Set<string>()
    const pending: Array<{ e: ParsedExpr; scope: BindingScope }> = [{ e: value, scope }]
    for (let item = pending.pop(); item; item = pending.pop()) {
      if (item.e !== value) for (const r of readsOf(item.e, item.scope)) found.add(r)
      for (const name of collectPropsReadByCtorInit(item.e, null, constNames)) {
        if (seen.has(name) || item.scope.isBound(name)) continue
        seen.add(name)
        pending.push({ e: consts.get(name)!, scope: BindingScope.EMPTY })
      }
    }
    return found
  }
}

/**
 * Visit every component node under `node` once, with the scope of the loop
 * rows enclosing it. Descends into a component's children and its
 * JSX-valued props: the instances those render are built by the same
 * constructor.
 */
function walkComponents(
  node: IRNode | null | undefined,
  scope: BindingScope,
  visit: (comp: IRComponent, scope: BindingScope) => void,
): void {
  if (!node) return
  switch (node.type) {
    case 'component':
      visit(node, scope)
      for (const child of node.children) walkComponents(child, scope, visit)
      for (const prop of node.props) {
        if (prop.value.kind !== 'jsx-children') continue
        for (const child of prop.value.children) walkComponents(child, scope, visit)
      }
      return
    case 'loop': {
      const rowScope = scope.enterLoopRow(node)
      for (const child of node.children) walkComponents(child, rowScope, visit)
      return
    }
    case 'element':
    case 'fragment':
    case 'provider':
    case 'async':
      for (const child of node.children) walkComponents(child, scope, visit)
      return
    case 'conditional':
      walkComponents(node.whenTrue, scope, visit)
      walkComponents(node.whenFalse, scope, visit)
      return
    case 'if-statement':
      walkComponents(node.consequent, scope, visit)
      walkComponents(node.alternate, scope, visit)
      return
    default:
      return
  }
}

/**
 * The first nested call through which `propName`, a prop of `parent`,
 * reaches a constructor-derived field, or undefined. `forwardsOf` gives a
 * component's {@link NestedInputForward}s, `derivedReading` the field of a
 * component that a prop it receives feeds directly
 * (`derivedFieldReading` over its late-delivery deps). A value forwarded on
 * again is followed through any number of components, each (component,
 * prop) pair once, so a cycle of forwards terminates.
 */
export function nestedDerivedReading(
  parent: string,
  propName: string,
  parentCallWrites: CallWrites,
  forwardsOf: (component: string) => readonly NestedInputForward[] | undefined,
  derivedReading: (component: string, prop: string) => string | undefined,
): NestedDerivedReading | undefined {
  const seen = new Set<string>()
  const follow = (component: string, prop: string, writes: CallWrites): NestedDerivedReading | undefined => {
    const field = capitalizeFieldName(prop)
    for (const f of forwardsOf(component) ?? []) {
      if (!reaches(f, field, writes)) continue
      const direct = derivedReading(f.child, f.prop)
      if (direct !== undefined) return { child: f.child, prop: f.prop, owner: f.child, field: direct }
      // Keyed by the keys the call passes too: whether a fallback of the
      // next component reaches depends on them, so the same (component,
      // prop) reached through two calls is followed for each.
      const key = `${f.child}\0${f.prop}\0${[...f.writes].sort().join('\0')}`
      if (seen.has(key)) continue
      seen.add(key)
      const deeper = follow(f.child, f.prop, f.writes)
      if (deeper) return { child: f.child, prop: f.prop, owner: deeper.owner, field: deeper.field }
    }
    return undefined
  }
  return follow(parent, propName, parentCallWrites)
}

/**
 * Whether `field` reaches `f`'s nested prop when the component holding `f`
 * is called with `writes`: always for a plain read, and for a fallback read
 * unless that call definitely passes one of the keys that override it.
 */
function reaches(f: NestedInputForward, field: string, writes: CallWrites): boolean {
  if (f.reads.has(field)) return true
  if (!f.fallbackReads.has(field)) return false
  return ![...f.unlessPassed].some(k => writes.has(k))
}
