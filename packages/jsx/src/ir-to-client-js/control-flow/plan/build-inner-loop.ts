/**
 * Build `InnerLoopPlan[]` from the legacy `DepthLevel[]` walk.
 *
 * Mirrors the legacy `emitInnerLoopSetup` recursion exactly:
 *   - Skip levels with `insideConditional` (those are emitted by
 *     `stringifyBranchInnerLoops` inside an arm body).
 *   - Sibling levels at the same depth are flattened into the top-level
 *     list; deeper levels become `childLevels` of the immediately-preceding
 *     ancestor.
 *   - Every level gets the full reactive `mapArray` emission (#2865 —
 *     the former "static forEach, setup-only" shortcut for a nested
 *     `.map()` whose array didn't textually mention the outer loop's item
 *     silently froze any OTHER reactivity the inner array or its rows
 *     depended on: a signal, a memo, a prop, an imported function call, a
 *     preamble local, a destructured outer param, an outer-index-derived
 *     array — none of those are "the outer item", so `refsParent` missed
 *     all of them, and the static emitter never wired a single
 *     `createEffect` for the row's own reactiveTexts/reactiveAttrs/
 *     conditionals either. A `mapArray` over a genuinely non-reactive
 *     array just subscribes to nothing and runs once — a strict superset
 *     of what the deleted static path did).
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
import { buildChildRefBindings } from '../shared.ts'
import { renderPreamble, irToHtmlTemplate } from '../../html-template.ts'
import { buildLoopChildConditionalsPlan } from './build-loop-child-arm.ts'
import type { LoopChildConditionalPlan } from './loop-child-arm.ts'

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

    // #2865: every nested loop gets the full reactive `mapArray` emission,
    // regardless of whether its array references the outer loop's item —
    // see the module docstring for why the old `refsParent`-gated static
    // shortcut was unsound.
    const emit: InnerLoopReactiveEmit = buildReactiveEmit(inner, level, wrapOuter, uidSuffix, outerLoopParam, outerLoopParamBindings)

    const arrayExpr = wrapOuter(inner.array)

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
  outerLoopParam?: string,
  outerLoopParamBindings?: readonly LoopParamBinding[],
): InnerLoopReactiveEmit {
  const wrapInner = (expr: string) => wrapLoopParamAsAccessor(expr, inner.param, inner.paramBindings, inner.index)
  const wrapBoth = (expr: string) => wrapLoopParamAsAccessor(wrapOuter(expr), inner.param, inner.paramBindings, inner.index)
  const { head: paramHead, unwrap: paramUnwrap } = destructureLoopParam(inner.param, inner.paramBindings)
  const wrappedKey = inner.key
    ? wrapLoopParamAsAccessor(inner.key, inner.param, inner.paramBindings, inner.index)
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
    wrappedExpression: wrapLoopParamAsAccessor(wrapOuter(text.expression), inner.param, inner.paramBindings, inner.index),
    insideConditional: !!text.insideConditional,
  }))

  const reactiveAttrs: InnerLoopReactiveAttr[] = inner.bindings.reactiveAttrs.map(attr => {
    const wrapped = wrapLoopParamAsAccessor(wrapOuter(attr.expression), inner.param, inner.paramBindings, inner.index)
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
  if (inner.preamble) {
    // Leaf JSX renders under both param contexts, mirroring the
    // wrapInner(wrapOuter(...)) applied to the js text.
    const leafLoopParams = outerLoopParam
      ? [
          { param: outerLoopParam, bindings: outerLoopParamBindings },
          { param: inner.param, bindings: inner.paramBindings, index: inner.index },
        ]
      : [{ param: inner.param, bindings: inner.paramBindings, index: inner.index }]
    preludeStatements.push(renderPreamble(inner.preamble, {
      transformJs: (t) => wrapInner(wrapOuter(t)),
      renderLeaf: (ir) => irToHtmlTemplate(ir, undefined, 1, leafLoopParams, undefined),
    }))
  }

  const childRefs = buildChildRefBindings(inner.bindings.refs, inner.param, inner.paramBindings, inner.index)

  // Per-item conditionals inside THIS loop's own row (#2706) — same
  // insert()-parity treatment the top-level loop's row conditionals
  // already get (`buildLoopReactiveEffectsPlan`), now extended to a
  // NESTED loop's row too. `scopeVar` is the row's own element
  // (`__innerEl<uidSuffix>`, matching `stringifyInnerLoops`'s emission),
  // and `wrapBoth` matches every other per-item expression in this emit
  // (outer accessor, then inner accessor).
  const conditionals: LoopChildConditionalPlan[] = buildLoopChildConditionalsPlan({
    conditionals: inner.bindings.conditionals,
    scopeVar: `__innerEl${uidSuffix}`,
    wrap: wrapBoth,
    loopParam: inner.param,
    loopParamBindings: inner.paramBindings,
  })

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
    conditionals,
    childRefs,
  }
}
