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
} from '../../types'
import type {
  IRLoopChildComponent,
  IRNode,
  LoopParamBinding,
} from '../../../types'
import {
  exprReferencesIdent,
  wrapLoopParamAsAccessor,
} from '../../utils'
import type { DepthLevel } from '../legacy-helpers'
import {
  destructureLoopParam,
  loopKeyFn,
} from '../legacy-helpers'
import type {
  InnerLoopPlan,
  InnerLoopReactiveEmit,
  InnerLoopStaticEmit,
  InnerLoopText,
  InnerLoopsPlan,
} from './inner-loop'

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
    const refsParent = !!outerLoopParam && exprReferencesIdent(inner.array, outerLoopParam)
    const useReactive = refsParent && !!inner.template

    const emit: InnerLoopReactiveEmit | InnerLoopStaticEmit = useReactive
      ? buildReactiveEmit(inner, level, wrapOuter)
      : buildStaticEmit(inner, level)

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
        props: node.props.map(p => p.isLiteral ? p : ({ ...p, value: wrapInner(p.value) })),
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
    props: comp.props.map(p => p.isLiteral ? p : ({ ...p, value: wrapInner(p.value) })),
    children: comp.children?.map(wrapIRNode),
  }))
  const events: LoopChildEvent[] = level.events.map(ev => ({
    ...ev,
    handler: wrapInner(ev.handler),
  }))

  const reactiveTexts: InnerLoopText[] = (inner.childReactiveTexts ?? []).map(text => ({
    slotId: text.slotId,
    wrappedExpression: wrapLoopParamAsAccessor(wrapOuter(text.expression), inner.param, inner.paramBindings),
    insideConditional: !!text.insideConditional,
  }))

  return {
    mode: 'reactive',
    keyFn: loopKeyFn(inner),
    paramHead,
    paramUnwrap,
    wrappedTemplate: inner.template!,
    wrappedKey,
    components,
    events,
    reactiveTexts,
  }
}

function buildStaticEmit(inner: NestedLoop, level: DepthLevel): InnerLoopStaticEmit {
  return {
    mode: 'static',
    rawKey: inner.key ?? null,
    components: level.comps,
    events: level.events,
  }
}
