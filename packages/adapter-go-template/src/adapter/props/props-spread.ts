/**
 * `{...props}` onto a child component call (#3530), for the Go adapter.
 *
 * Which keys the spread carries, and in which order a key's writers win, is
 * the shared plan's decision (`planComponentProps`, `propsSpreadParam`). The
 * DSL adapters merge the planned hashes at render time; Go builds the
 * child's `<Child>Input{...}` literal at compile time, so it reads the plan
 * one key at a time (`resolveComponentPropKeys`) and spells a key the spread
 * carries only when passed as a nil test on the parent's own (nillable)
 * Input field.
 */

import {
  planComponentProps,
  resolveComponentPropKeys,
  type ComponentIR,
  type ComponentPropsOptions,
  type IRNode,
  type IRProp,
  type ResolvedComponentProp,
} from '@barefootjs/jsx'
import type { GoEmitContext } from '../emit-context.ts'

/** The shared plan's options for a component compiled by this adapter. */
function planOptions(ctx: GoEmitContext, ir: ComponentIR): ComponentPropsOptions {
  return { propsObjectName: ctx.state.propsObjectName, propsParams: ir.metadata.propsParams }
}

/** Whether `prop` spreads the component's own props object (`{...props}`). */
export function isPropsObjectSpread(prop: IRProp, propsObjectName: string | null): boolean {
  return propsObjectName !== null && prop.value.kind === 'spread' && prop.value.expr.trim() === propsObjectName
}

/** A child call's props resolved one key at a time by the shared plan. */
export type PropsSpreadCall =
  | { kind: 'resolved'; keys: ReadonlyMap<string, ResolvedComponentProp> }
  /** The call also spreads an object whose keys are unknown: only a render-time merge could resolve it. */
  | { kind: 'unresolved' }

/**
 * The shared plan for a child call that spreads the component's own props
 * object, or null when it does not (its props are then lowered as written).
 */
export function resolvePropsSpreadCall(
  ctx: GoEmitContext,
  ir: ComponentIR,
  props: readonly IRProp[],
): PropsSpreadCall | null {
  if (!props.some((p) => isPropsObjectSpread(p, ctx.state.propsObjectName))) return null
  // The slot id and the forwarded children are not props on Go's side: the
  // caller fills `ScopeID` / `Children` itself.
  const plan = planComponentProps({ props: [...props], children: [], slotId: null }, planOptions(ctx, ir))
  const resolved = resolveComponentPropKeys(plan)
  if (resolved === null) return { kind: 'unresolved' }
  return { kind: 'resolved', keys: new Map(resolved.map((r) => [r.key, r])) }
}

/**
 * Whether `prop` is the value its key ends up with, so it is lowered at all:
 * false for a prop a later `{...props}` param overrides
 * (`<Tag tone="first" {...props} />` with `tone` required) or a later
 * explicit prop of the same key replaces. A prop the plan does not carry (a
 * callback, `ref`, the reserved children) is left to the ordinary lowering.
 */
export function isFinalPropWriter(prop: IRProp, keys: ReadonlyMap<string, ResolvedComponentProp>): boolean {
  const resolved = keys.get(prop.name)
  if (!resolved) return true
  const base = resolved.base
  if (base?.kind === 'value') return base.value === prop.value
  if (base?.kind === 'named-slot') return prop.value.kind === 'jsx-children' && base.children === prop.value.children
  return base?.kind === 'children'
}

/** Every component call in `node`'s subtree, the root included. */
function forEachComponent(node: IRNode, visit: (props: readonly IRProp[]) => void): void {
  switch (node.type) {
    case 'component':
      visit(node.props)
      for (const prop of node.props) {
        if (prop.value.kind === 'jsx-children') prop.value.children.forEach((c) => forEachComponent(c, visit))
      }
      node.children.forEach((c) => forEachComponent(c, visit))
      return
    case 'conditional':
      forEachComponent(node.whenTrue, visit)
      forEachComponent(node.whenFalse, visit)
      return
    case 'if-statement':
      forEachComponent(node.consequent, visit)
      if (node.alternate) forEachComponent(node.alternate, visit)
      return
    default:
      if ('children' in node) node.children.forEach((c) => forEachComponent(c, visit))
  }
}

/**
 * The params a `{...props}` spread onto a child component in `ir` forwards.
 * Their Input field must be nillable: an omitted param has to reach the
 * child as nil (the child observes the omission, `data-size` left out), and
 * one the spread carries only when passed is tested for nil to keep the
 * value an earlier prop gives its key.
 */
export function collectPropsSpreadForwardedParams(ctx: GoEmitContext, ir: ComponentIR): Set<string> {
  const names = new Set<string>()
  const propsObjectName = ctx.state.propsObjectName
  if (propsObjectName === null) return names
  forEachComponent(ir.root, (props) => {
    if (!props.some((p) => isPropsObjectSpread(p, propsObjectName))) return
    for (const param of ir.metadata.propsParams) names.add(param.name)
  })
  return names
}
