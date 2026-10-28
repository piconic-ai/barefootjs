/**
 * Props a component forwards, as they are, into a child component's
 * nillable Input field (`<Show value={props.count} />` where `Show` reads
 * `value` with `??`).
 *
 * JS hands the child the caller's `undefined` when the prop is omitted, so
 * the child's `??` takes its fallback. The child's field is `interface{}`
 * for exactly that reason (`ChildComponentShape.nillableParamNames`), but a
 * forwarding component whose own field stayed a concrete scalar has already
 * lost the omission: its zero value (`0`, `''`, `false`) reaches the child
 * as a real value. Such a prop takes `resolvePropGoType`'s nillable flip, so
 * the nil travels through to the child unchanged.
 */

import { BindingScope, buildImportAliasMap, inlineComputedConsts, type ComponentIR, type IRNode, type IRProp, type ParsedExpr } from '@barefootjs/jsx'

import type { GoEmitContext } from '../emit-context.ts'
import { propsObjectKeyRead } from '../lib/compile-state.ts'
import type { ChildComponentShape } from '../lib/types.ts'

/** Bound on relay chains (a const of a memo of a const …), a guard against a malformed cycle. */
const MAX_RELAY_DEPTH = 16

/**
 * The params of `ir` passed as they are (`props.x`, `props['x']`, a
 * destructured `x` no enclosing loop rebinds, or a const / identity memo
 * holding one of those) into a child component prop whose field is
 * nillable in that child's registered shape.
 */
export function collectNillableForwardedPropNames(
  ctx: GoEmitContext,
  ir: ComponentIR,
  childShape: (name: string) => ChildComponentShape | undefined,
): Set<string> {
  const names = new Set<string>()
  // A param with a destructure default (`{ count = 0 }`) is never
  // `undefined` once destructured: the child receives the default, `0` /
  // `false` / `''` included, so forwarding it needs no nil.
  const params = ir.metadata.propsParams.filter(p => !p.isRest && p.defaultValue == null)
  if (params.length === 0) return names
  const propsObject = ctx.state.propsObjectName
  // A relay of the value as it is: a computed const (`const c = props.x`,
  // inlined by the shared `inlineComputedConsts`) or an identity memo
  // (`createMemo(() => props.x)` read as `relayed()`), neither rebound
  // here. Their initializer / body is read in the component scope.
  const unrelay = (expr: ParsedExpr, scope: BindingScope, depth = 0): { expr: ParsedExpr; scope: BindingScope } => {
    if (depth >= MAX_RELAY_DEPTH) return { expr, scope }
    if (expr.kind === 'identifier' && !scope.isBound(expr.name)) {
      const inlined = inlineComputedConsts(expr, ctx.state.computedConsts)
      if (inlined !== expr) return unrelay(inlined, BindingScope.EMPTY, depth + 1)
    }
    if (expr.kind === 'call' && expr.args.length === 0 && expr.callee.kind === 'identifier' && !scope.isBound(expr.callee.name)) {
      const getter = expr.callee.name
      const memo = ir.metadata.memos.find(m => m.name === getter)
      if (memo?.parsed && !memo.bodyExprIsCall) return unrelay(memo.parsed, BindingScope.EMPTY, depth + 1)
    }
    return { expr, scope }
  }
  const forwardedParam = (value: ParsedExpr, valueScope: BindingScope): string | null => {
    const { expr, scope } = unrelay(value, valueScope)
    if (propsObject !== null) {
      if (scope.isBound(propsObject)) return null
      const key = propsObjectKeyRead(propsObject, expr)
      return key !== null && params.some(p => p.name === key) ? key : null
    }
    if (expr.kind !== 'identifier' || scope.isBound(expr.name)) return null
    return params.some(p => p.name === expr.name) ? expr.name : null
  }
  const visitCall = (childName: string, props: readonly IRProp[], scope: BindingScope): void => {
    const nillable = childShape(childName)?.nillableParamNames
    if (!nillable || nillable.size === 0) return
    for (const prop of props) {
      if (prop.value.kind !== 'expression' || !prop.value.parsed || !nillable.has(prop.name)) continue
      const param = forwardedParam(prop.value.parsed, scope)
      if (param !== null) names.add(param)
    }
  }
  walk(ir.root, BindingScope.EMPTY, visitCall)
  return names
}

/**
 * Whether `ir` calls the component declared as `childName` anywhere in its
 * tree, under its own name or an import alias of it.
 */
export function callsComponent(ir: Pick<ComponentIR, 'metadata' | 'root'>, childName: string): boolean {
  const aliases = buildImportAliasMap(ir.metadata.imports ?? [])
  let found = false
  walk(ir.root, BindingScope.EMPTY, (name) => {
    if ((aliases.get(name) ?? name) === childName) found = true
  })
  return found
}

/** Every component call in `node`'s subtree with the loop scope enclosing it. */
function walk(
  node: IRNode,
  scope: BindingScope,
  visitCall: (childName: string, props: readonly IRProp[], scope: BindingScope) => void,
): void {
  switch (node.type) {
    case 'component':
      visitCall(node.name, node.props, scope)
      for (const prop of node.props) {
        if (prop.value.kind === 'jsx-children') prop.value.children.forEach(c => walk(c, scope, visitCall))
      }
      node.children.forEach(c => walk(c, scope, visitCall))
      return
    case 'loop': {
      const rowScope = scope.enterLoopRow(node)
      node.children.forEach(c => walk(c, rowScope, visitCall))
      return
    }
    case 'conditional':
      walk(node.whenTrue, scope, visitCall)
      walk(node.whenFalse, scope, visitCall)
      return
    case 'if-statement':
      walk(node.consequent, scope, visitCall)
      if (node.alternate) walk(node.alternate, scope, visitCall)
      return
    case 'async':
      walk(node.fallback, scope, visitCall)
      node.children.forEach(c => walk(c, scope, visitCall))
      return
    default:
      if ('children' in node) node.children.forEach(c => walk(c, scope, visitCall))
  }
}
