/**
 * Build `InnerLoopPlan[]` from the legacy `DepthLevel[]` walk.
 *
 * Mirrors the legacy `emitInnerLoopSetup` recursion exactly:
 *   - Skip levels with `insideConditional` (those are emitted by
 *     `stringifyBranchInnerLoops` inside an arm body).
 *   - Sibling levels at the same depth are flattened into the top-level
 *     list; deeper levels become `childLevels` of the immediately-preceding
 *     ancestor.
 *   - Choose `reactive` vs `static` mode by checking whether `inner.array`
 *     references the *current* outer loop param (the O-8 narrowing fix).
 *   - Recurse with `inner.param` as the new outerLoopParam so deeper
 *     levels see their immediate parent.
 */

import type {
  LoopChildEvent,
  NestedLoop,
} from '../../types.ts'
import type {
  AttrValue,
  IRLoopChildComponent,
  IRNode,
  LoopParamBinding,
} from '../../../types.ts'
import { AttrValueOf, pickAttrMeta } from '../../../types.ts'
import {
  wrapLoopParamAsAccessor,
  attrValueToString,
} from '../../utils.ts'
import { buildChildRefBindings, buildStaticChildRefBindings } from '../shared.ts'

/**
 * Mirror of the helper in `build-loop-child-arm.ts` — kept local to avoid
 * a cross-file import for what is structurally a two-line switch.
 */
function wrapAttrValueExpression(value: AttrValue, wrap: (s: string) => string): AttrValue {
  switch (value.kind) {
    case 'literal':
    case 'boolean-attr':
    case 'boolean-shorthand':
    case 'jsx-children':
      return value
    case 'expression':
      return AttrValueOf.expression(wrap(value.expr), {
        ...(value.templateExpr !== undefined && { templateExpr: wrap(value.templateExpr) }),
        ...(value.presenceOrUndefined !== undefined && { presenceOrUndefined: value.presenceOrUndefined }),
      })
    case 'template': {
      const flat = attrValueToString(value)
      return AttrValueOf.expression(wrap(flat ?? 'undefined'))
    }
    case 'spread':
      return AttrValueOf.spread(wrap(value.expr), value.templateExpr ? wrap(value.templateExpr) : undefined)
  }
}
import type { DepthLevel } from '../shared.ts'
import {
  destructureLoopParam,
  loopKeyFn,
  nestedLoopIndexAlias,
} from '../shared.ts'
import type {
  InnerLoopPlan,
  InnerLoopReactiveAttr,
  InnerLoopReactiveEmit,
  InnerLoopStaticEmit,
  InnerLoopText,
  InnerLoopsPlan,
} from './inner-loop.ts'

export interface BuildInnerLoopsArgs {
  levels: readonly DepthLevel[]
  parentElVar: string
  outerLoopParam: string | undefined
  outerLoopParamBindings?: readonly LoopParamBinding[]
}

/**
 * Walk `levels` (DFS-ordered), grouping each level's child levels and
 * recursing with a narrowed `outerLoopParam`. Inner loops that are inside a
 * conditional branch are skipped (they're emitted by `stringifyBranchInnerLoops`).
 */
export function buildInnerLoopsPlan(args: BuildInnerLoopsArgs): InnerLoopsPlan {
  const { levels, parentElVar, outerLoopParam, outerLoopParamBindings } = args
  const wrapOuter = outerLoopParam
    ? (expr: string) => wrapLoopParamAsAccessor(expr, outerLoopParam, outerLoopParamBindings)
    : (expr: string) => expr

  const plan: InnerLoopPlan[] = []
  let i = 0
  while (i < levels.length) {
    const level = levels[i]
    const inner = level.loopInfo
    if (!inner) { i++; continue }
    if (inner.insideConditional) { i++; continue }

    // Collect child levels (immediately following with depth > current).
    const childLevels: DepthLevel[] = []
    let j = i + 1
    while (j < levels.length && levels[j].loopInfo && levels[j].loopInfo!.depth > inner.depth) {
      childLevels.push(levels[j])
      j++
    }

    const uidSuffix = `${inner.depth}_${i}`
    const containerExpr = inner.containerSlotId
      ? `qsa(${parentElVar}, '[bf="${inner.containerSlotId}"]')`
      : parentElVar

    // O-8 narrowing: at depth 2+, `inner.array` may reference the *immediate*
    // parent loop's param. Check against whatever outerLoopParam our caller
    // narrowed to — the recursion passes `inner.param` for child levels.
    const refsParent = !!outerLoopParam && (inner.arrayFreeIdentifiers?.has(outerLoopParam) ?? false)
    const useReactive = refsParent && !!inner.template

    const emit: InnerLoopReactiveEmit | InnerLoopStaticEmit = useReactive
      ? buildReactiveEmit(inner, level, wrapOuter, uidSuffix)
      : buildStaticEmit(inner, level, uidSuffix)

    const arrayExpr = useReactive ? wrapOuter(inner.array) : inner.array

    const childLevelsPlan = childLevels.length > 0
      ? buildInnerLoopsPlan({
          levels: childLevels,
          parentElVar: `__innerEl${uidSuffix}`,
          outerLoopParam: inner.param,
          outerLoopParamBindings: inner.paramBindings,
        })
      : []

    plan.push({
      uidSuffix,
      markerId: inner.markerId,
      // The loop node shares its container element's slot (#1795 Phase 3).
      slotId: inner.containerSlotId ?? '?',
      containerExpr,
      arrayExpr,
      arraySrc: inner.array,
      param: inner.param,
      keyDepth: inner.depth,
      emit,
      childLevels: childLevelsPlan,
      outerLoopParam,
      outerLoopParamBindings,
    })

    i = j
  }
  return plan
}

function buildReactiveEmit(
  inner: NestedLoop,
  level: DepthLevel,
  wrapOuter: (expr: string) => string,
  uidSuffix: string,
): InnerLoopReactiveEmit {
  const wrapInner = (expr: string) => wrapLoopParamAsAccessor(expr, inner.param, inner.paramBindings)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(inner.param, inner.paramBindings)
  const wrappedKey = inner.key
    ? wrapLoopParamAsAccessor(inner.key, inner.param, inner.paramBindings)
    : null

  // Inner-wrap children IR recursively so nested component props (e.g.,
  // `<Select><SelectContent>{items.map(item => ...)}` deep) all see the
  // inner accessor form.
  const wrapIRNode = (node: IRNode): IRNode => {
    if (node.type === 'component') {
      return {
        ...node,
        props: node.props.map(p => ({ ...p, value: wrapAttrValueExpression(p.value, wrapInner) })),
        children: node.children?.map(wrapIRNode),
      }
    }
    if (node.type === 'expression' && node.expr) {
      return { ...node, expr: wrapInner(node.expr) }
    }
    if ('children' in node && Array.isArray((node as { children?: IRNode[] }).children)) {
      return {
        ...node,
        children: (node as { children: IRNode[] }).children.map(wrapIRNode),
      } as IRNode
    }
    return node
  }
  const components: IRLoopChildComponent[] = level.comps.map(comp => ({
    ...comp,
    props: comp.props.map(p => ({ ...p, value: wrapAttrValueExpression(p.value, wrapInner) })),
    children: comp.children?.map(wrapIRNode),
  }))
  const events: LoopChildEvent[] = level.events.map(ev => ({
    ...ev,
    handler: wrapInner(ev.handler),
  }))

  const reactiveTexts: InnerLoopText[] = inner.bindings.reactiveTexts.map(text => ({
    slotId: text.slotId,
    wrappedExpression: wrapLoopParamAsAccessor(wrapOuter(text.expression), inner.param, inner.paramBindings),
    insideConditional: !!text.insideConditional,
  }))

  const reactiveAttrs: InnerLoopReactiveAttr[] = inner.bindings.reactiveAttrs.map(attr => {
    const wrapped = wrapLoopParamAsAccessor(wrapOuter(attr.expression), inner.param, inner.paramBindings)
    return {
      slotId: attr.childSlotId,
      attrName: attr.attrName,
      wrappedExpression: wrapped,
      meta: pickAttrMeta(attr),
    }
  })

  // The inner `.map()` callback's block-body locals (e.g.
  // `const derivedClass = cell.flag ? 'on' : 'off'`) are baked into
  // `inner.template` at the outer-loop SSR level, but the `mapArray`
  // renderItem closure does not declare them — references inside the
  // cloned-template IIFE would throw `ReferenceError`. Re-emit the
  // preamble at the top of the renderItem with both inner and outer
  // loop param references rewritten to signal-accessor form (#1052).
  // The destructure unwrap (when `inner.param` is a binding pattern)
  // has to land before the preamble so the preamble's bare-binding
  // references resolve.
  //
  // The index alias (#2218) lands first — before both the unwrap and the
  // preamble — since either may reference the user's index name (e.g. a
  // `const rowTag = \`row-${i}\`` preamble line), and both run before the
  // cloned-template IIFE that may also reference it.
  const preludeStatements: string[] = []
  const indexAlias = nestedLoopIndexAlias(inner, `__innerIdx${uidSuffix}`, paramHead, level.comps, level.events)
  if (indexAlias) preludeStatements.push(indexAlias)
  if (paramUnwrap) preludeStatements.push(paramUnwrap)
  if (inner.mapPreamble) preludeStatements.push(wrapInner(wrapOuter(inner.mapPreamble)))

  const childRefs = buildChildRefBindings(inner.bindings.refs, inner.param, inner.paramBindings)

  return {
    mode: 'reactive',
    keyFn: loopKeyFn(inner),
    paramHead,
    preludeStatements,
    wrappedTemplate: inner.template!,
    bodyIsMultiRoot: inner.bodyIsMultiRoot ?? false,
    wrappedKey,
    components,
    events,
    reactiveTexts,
    reactiveAttrs,
    childRefs,
  }
}

function buildStaticEmit(inner: NestedLoop, level: DepthLevel, uidSuffix: string): InnerLoopStaticEmit {
  // Static `forEach` iterates with the literal item as its first param, so
  // no signal-accessor rewrite is needed — emit the preamble verbatim
  // before the component/event setup so prop getters and event handlers
  // can resolve the locals (#1064). Refs follow the same contract:
  // wrapping the callback would rewrite `s.x` to `s().x` and throw at
  // runtime when the callback closes over the static inner param (#1244,
  // PR #1352 Copilot review).
  //
  // The index alias (#2218) lands first, same rationale as the reactive
  // path: `forEach`'s second param is the synthetic `__innerIdx<uid>`, not
  // the user's index name, so a preamble/prop/event that reads it needs the
  // alias bound before anything else runs.
  const preludeStatements: string[] = []
  const indexAlias = nestedLoopIndexAlias(inner, `__innerIdx${uidSuffix}`, inner.param, level.comps, level.events)
  if (indexAlias) preludeStatements.push(indexAlias)
  if (inner.mapPreamble) preludeStatements.push(inner.mapPreamble)
  return {
    mode: 'static',
    rawKey: inner.key ?? null,
    preludeStatements,
    components: level.comps,
    events: level.events,
    childRefs: buildStaticChildRefBindings(inner.bindings.refs),
  }
}
