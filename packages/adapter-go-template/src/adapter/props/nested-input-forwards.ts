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

/** How many nested hops a forwarded value is followed through. */
const MAX_FORWARD_DEPTH = 8

type Meta = Pick<ComponentIR['metadata'], 'propsObjectName' | 'propsParams' | 'localConstants' | 'imports'>

/**
 * The nested child props in `ir`'s tree whose expression value reads one of
 * `ir`'s own props, directly (`seed={props.children}`, `seed={children}`)
 * or through a body const (`const c = props.children`, `const { children } =
 * props`). A loop row's binding shadows a prop of the same name; a
 * `/* @client *\/` prop never reaches the constructor and is skipped.
 */
export function collectNestedInputForwards(ir: { metadata: Meta; root: IRNode }): NestedInputForward[] {
  const meta = ir.metadata
  const reader = propReader(meta)
  const aliases = buildImportAliasMap(meta.imports ?? [])
  const forwards: NestedInputForward[] = []
  const visitComponent = (comp: IRComponent, scope: BindingScope): void => {
    const child = aliases.get(comp.name) ?? comp.name
    for (const prop of comp.props) {
      if (prop.value.kind !== 'expression' || prop.clientOnly || !prop.value.parsed) continue
      const reads = reader(prop.value.parsed, scope)
      if (reads.size > 0) forwards.push({ child, prop: prop.name, reads })
    }
  }
  walkComponents(ir.root, BindingScope.EMPTY, visitComponent)
  return forwards
}

/**
 * A function from a nested prop's value to the caller-facing fields of
 * `meta`'s props it reads, following body consts once each.
 */
function propReader(meta: Meta): (value: ParsedExpr, scope: BindingScope) => Set<string> {
  const propsObjectName = meta.propsObjectName ?? null
  const params = meta.propsParams ?? []
  const localNames = new Set(params.map(p => p.name))
  const sourceOf = new Map(params.map(p => [p.name, p.sourceName ?? p.name]))
  const consts = new Map<string, ParsedExpr>()
  for (const c of meta.localConstants ?? []) {
    if (!c.isModule && c.parsed) consts.set(c.name, c.parsed)
  }
  const constNames = new Set(consts.keys())
  return (value, scope) => {
    const found = new Set<string>()
    const seen = new Set<string>()
    const pending: ParsedExpr[] = [value]
    for (let e = pending.pop(); e; e = pending.pop()) {
      for (const read of collectPropsReadByCtorInit(e, propsObjectName, localNames)) {
        if (propsObjectName || !scope.isBound(read)) found.add(capitalizeFieldName(sourceOf.get(read) ?? read))
      }
      for (const name of collectPropsReadByCtorInit(e, null, constNames)) {
        if (seen.has(name) || scope.isBound(name)) continue
        seen.add(name)
        pending.push(consts.get(name)!)
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
 * again is followed up to {@link MAX_FORWARD_DEPTH} hops, each
 * (component, prop) pair once.
 */
export function nestedDerivedReading(
  parent: string,
  propName: string,
  forwardsOf: (component: string) => readonly NestedInputForward[] | undefined,
  derivedReading: (component: string, prop: string) => string | undefined,
): NestedDerivedReading | undefined {
  const seen = new Set<string>()
  const follow = (component: string, prop: string, depth: number): NestedDerivedReading | undefined => {
    const field = capitalizeFieldName(prop)
    for (const f of forwardsOf(component) ?? []) {
      if (!f.reads.has(field)) continue
      const direct = derivedReading(f.child, f.prop)
      if (direct !== undefined) return { child: f.child, prop: f.prop, owner: f.child, field: direct }
      const key = `${f.child}\0${f.prop}`
      if (depth >= MAX_FORWARD_DEPTH || seen.has(key)) continue
      seen.add(key)
      const deeper = follow(f.child, f.prop, depth + 1)
      if (deeper) return { child: f.child, prop: f.prop, owner: deeper.owner, field: deeper.field }
    }
    return undefined
  }
  return follow(parent, propName, 0)
}
