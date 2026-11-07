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

/**
 * The `bf-p` key (`BfCallerProps`) of the param a later `{...props}` spread
 * in `props` carries over the explicit `name` prop when the caller passed
 * it, or null when no spread can carry `name` (spec/js-undefined-value.md
 * §3: the spread carries the key, whatever it holds).
 */
export function spreadCarriedCallerKey(ctx: GoEmitContext, props: readonly IRProp[], name: string): string | null {
  const ir = { metadata: { propsParams: ctx.state.currentPropsParams } } as unknown as ComponentIR
  const call = resolvePropsSpreadCall(ctx, ir, props)
  if (call?.kind !== 'resolved') return null
  const resolved = call.keys.get(name)
  const param = resolved?.presentParams.length ? ctx.state.currentPropsParams.find(p => p.name === resolved.key) : undefined
  if (!param) return null
  const key = param.sourceName ?? param.name
  return key.charAt(0).toLowerCase() + key.slice(1)
}

/**
 * The props of a call without `{...props}` that are the values their keys
 * end up with, per the shared plan: a prop a later one of the same key
 * replaces (`<Chip {...rest} tone="x" />`, whose closed rest spread is
 * expanded to a `tone={rest.tone}` before `tone="x"`) is dropped, so the
 * child's Input literal sets each field once and the later writer wins, as
 * in JSX. A call that also spreads an object whose keys are unknown is
 * returned whole.
 */
export function finalPropWriters(ctx: GoEmitContext, ir: ComponentIR, props: readonly IRProp[]): readonly IRProp[] {
  const resolved = resolveComponentPropKeys(planComponentProps({ props: [...props], children: [], slotId: null }, planOptions(ctx, ir)))
  if (resolved === null) return props
  const keys = new Map(resolved.map((r) => [r.key, r]))
  return props.filter((p) => isFinalPropWriter(p, keys))
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
 * BF101 for each spread of an arbitrary object onto a child component in
 * `ir` (`<Chip {...row} />`, a loop row's `{...r}`, #3861): a spread that is
 * not one of the caller's own prop bags (`SpreadAttr.callerBag`). Go builds
 * the child's `<Child>Input{...}` literal at compile time, one field per
 * key, and an object spread names no key, so the child would render
 * without any of them. A call under a `/* @client *\/` conditional or loop
 * renders on the client only, and a dynamic tag (`IRComponent.dynamicTag`)
 * is lowered to a children passthrough; both are left alone.
 */
export function refuseObjectSpreadsOntoChildren(ctx: GoEmitContext, ir: ComponentIR): void {
  const visit = (node: IRNode): void => {
    switch (node.type) {
      case 'component':
        for (const prop of node.props) {
          if (prop.value.kind === 'spread' && prop.value.callerBag === undefined && !node.dynamicTag) refuseObjectSpread(ctx, node.name, prop)
          if (prop.value.kind === 'jsx-children') prop.value.children.forEach(visit)
        }
        node.children.forEach(visit)
        return
      case 'conditional':
        if (node.clientOnly) return
        visit(node.whenTrue)
        visit(node.whenFalse)
        return
      case 'if-statement':
        visit(node.consequent)
        if (node.alternate) visit(node.alternate)
        return
      case 'loop':
        if (node.clientOnly) return
        node.children.forEach(visit)
        return
      default:
        if ('children' in node) node.children.forEach(visit)
    }
  }
  visit(ir.root)
}

function refuseObjectSpread(ctx: GoEmitContext, childName: string, prop: IRProp): void {
  if (prop.value.kind !== 'spread') return
  ctx.state.errors.push({
    code: 'BF101',
    severity: 'error',
    message: `'{...${prop.value.expr}}' on <${childName}> spreads an object whose keys the Go template adapter can't name at compile time, so it can't build <${childName}>'s input from it`,
    loc: prop.loc,
    suggestion: {
      message: `Pass the object's keys to <${childName}> one by one.`,
    },
  })
}
