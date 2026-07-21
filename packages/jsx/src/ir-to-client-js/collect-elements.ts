/**
 * IR tree traversal → collect elements into ClientJsContext.
 */

import { type IRNode, type IRElement, type IRComponent, type IRLoop, type IRProp, pickAttrMetaFromIR } from '../types.ts'
import type { ClientJsContext, ConditionalBranchChildComponent, ConditionalBranchReactiveAttr, BranchLoop, ConditionalBranchTextEffect, ConditionalElement, LoopChildBindings, LoopChildBranchSummary, LoopChildConditional, LoopOffset, NestedLoop } from './types.ts'
import { attrValueToString, freeIdsFromRefs, quotePropName, PROPS_PARAM } from './utils.ts'
import { classifyReactivity, decideWrapForAttr, decideWrapForChildProp, decideWrapFromAstFlags, collectEventHandlersFromIR, collectConditionalBranchEvents, collectConditionalBranchRefs, collectConditionalBranchChildComponents, collectLoopChildEventsWithNesting, collectLoopChildReactiveAttrs, collectLoopChildReactiveTexts, collectLoopChildRefs, emptyLoopChildBindings } from './reactivity.ts'
import { irToHtmlTemplate, irToPlaceholderTemplate, irChildrenToJsExpr, buildLoopSkeletonTemplate, computeSkeletonSlotPaths, type SkeletonSlotPaths } from './html-template.ts'
import { templateRootIsSvg } from './control-flow/stringify/template-parse.ts'
import { expandDynamicPropValue, expandConstantForReactivity } from './prop-handling.ts'
import { walkIR, stopAt } from './walker.ts'
import { buildLoopChainExpr } from '../loop-chain.ts'

/** Expressions that render nothing (0 DOM nodes) — `&&` / `?:` empty branches. */
const EMPTY_RENDER_EXPRS = new Set(['null', 'undefined', 'false', "''", '""', '``'])

/**
 * Number of *element* children a node contributes to its parent's `.children`
 * run — the collection that `container.children[idx]` indexes and that event
 * delegation's `Array.from(container.children).indexOf(...)` walks. `.children`
 * is element-only, so text / comment nodes never count.
 *
 * Returns a folded integer when the count is statically known, a JS expression
 * string when it depends on runtime state, or `null` when the element count is
 * statically undecidable (the caller then falls back to the legacy count):
 *   - element / component / provider / async → `1` (one root element)
 *   - text / empty-render expression (`null`/`false`/…) → `0`
 *   - plain loop → `(arr).length`; per-item-conditional / flatMap loop → `null`
 *     (renders a runtime-variable count, not `array.length`) (#1693)
 *   - conditional → fold to a number when both branches match, else
 *     `(cond ? t : f)`; `null` when a branch is undecidable (e.g. the `??`/`||`
 *     left operand, a bare expression that may render an element OR text)
 *   - fragment → sum of its children (transparent wrapper)
 *   - bare expression / slot / everything else → `null` (undecidable)
 */
function domElementCount(node: IRNode): number | string | null {
  switch (node.type) {
    case 'element':
    case 'component':
    case 'provider':
    case 'async':
      return 1
    case 'text':
      return 0
    case 'expression':
      // `&&` / `?:` empty branches (`null`, `false`, …) render nothing; any
      // other expression may resolve to an element or to text — undecidable.
      return EMPTY_RENDER_EXPRS.has(node.expr.trim()) ? 0 : null
    case 'loop':
      // A per-item-conditional body (#1665) or flatMap renders a
      // runtime-variable element count per item, not `array.length`.
      if (node.bodyIsItemConditional || node.method === 'flatMap') return null
      return `(${buildLoopChainExpr({
        base: node.array,
        sortComparator: node.sortComparator,
        filterPredicate: node.filterPredicate,
        chainOrder: node.chainOrder,
      })}).length`
    case 'conditional': {
      const t = domElementCount(node.whenTrue)
      const f = domElementCount(node.whenFalse)
      if (t === null || f === null) return null
      if (typeof t === 'number' && typeof f === 'number' && t === f) return t
      // Active branch chosen at runtime — reuse the raw `condition`, the exact
      // form `insert()` evaluates in the same init scope.
      return `(${node.condition} ? ${t} : ${f})`
    }
    case 'fragment':
      return sumElementCounts(node.children)
    default:
      // slot / if-statement: element count not statically known.
      return null
  }
}

/**
 * Sum `domElementCount` over a run of nodes, folding the static part. Returns
 * `null` if any child's count is undecidable — the whole run is then unknown.
 */
function sumElementCounts(nodes: readonly IRNode[]): number | string | null {
  let staticCount = 0
  const dynamic: string[] = []
  for (const n of nodes) {
    const c = domElementCount(n)
    if (c === null) return null
    if (typeof c === 'number') staticCount += c
    else dynamic.push(c)
  }
  if (dynamic.length === 0) return staticCount
  const parts = staticCount > 0 ? [String(staticCount), ...dynamic] : dynamic
  return parts.length === 1 ? parts[0] : `(${parts.join(' + ')})`
}

/**
 * Pre-#1693 element-count heuristic, used as the fallback for nodes whose count
 * `domElementCount` cannot decide. Mirrors the old `producesDomChild` exactly,
 * so an undecidable sibling contributes precisely what it did before this fix —
 * guaranteeing no regression on shapes the new counting can't improve (a bare
 * expression, a `??`/`||` fallback, a per-item-conditional loop).
 */
function legacyElementCount(node: IRNode): number {
  return node.type === 'element' || node.type === 'component' || node.type === 'provider'
    || node.type === 'async'
    || node.type === 'text' || (node.type === 'expression' && !node.reactive)
    || node.type === 'conditional'
    ? 1
    : 0
}

/**
 * Pre-pass: for every loop node in the IR tree, record the sibling nodes that
 * appear before it in its parent container. Read when constructing
 * TopLevelLoop and NestedLoop so the client JS can offset children[idx]
 * access past everything rendered ahead of the loop's items.
 *
 * Counting must happen for every container whose children render as a
 * contiguous run of DOM siblings into the same parent — not just `element`.
 * A loop nested directly inside a component (`<Wrapper><span/>{xs.map(...)}`
 * </Wrapper>`), fragment, provider, or async boundary has its preceding
 * siblings rendered as siblings of the loop's items too, so `children[idx]`
 * access is shifted exactly as it is under an element parent (#1688).
 *
 * Transparent containers (fragment / provider / async) render no DOM element
 * wrapper, so their children are siblings in the nearest ancestor element —
 * not in a container of their own. `recordRun` therefore threads ONE
 * preceding-sibling accumulator through them, so a loop inside a fragment sees
 * the parent element's earlier siblings too, not just the fragment's own
 * children (#1699). `<Box><hr/><hr/><>{xs.map(...)}</></Box>` must offset the
 * items past both `<hr/>`s.
 *
 * The siblings are stored raw; `resolveLoopOffset` turns each into its element
 * count via `domElementCount`. That generalisation closes the #1688 follow-up
 * (#1693): a preceding `.map()` contributes `array.length` and a preceding
 * conditional contributes a `(cond ? … : …)` term, both resolved at runtime —
 * a static-only count resolved later groups' nested children against the wrong
 * `children[idx]`, leaving them inert after hydration.
 *
 * Computed once up front (instead of during collection) so the offset data
 * lives in an explicit value rather than a module-level WeakMap mutated by
 * two separate traversals.
 */
export function computeLoopSiblingOffsets(root: IRNode): Map<IRLoop, IRNode[]> {
  const offsets = new Map<IRLoop, IRNode[]>()
  // Walk a flat DOM run, flattening transparent containers inline so their
  // children join the same preceding-sibling accumulator.
  const recordRun = (children: IRNode[], preceding: IRNode[]): void => {
    for (const child of children) {
      if (child.type === 'loop') {
        // Record the preceding run only when something precedes this loop (a
        // leading loop keeps bare `children[idx]`). `!offsets.has`: the
        // enclosing run records the loop first, in pre-order, with the full
        // preceding context; a later standalone visit of the transparent
        // wrapper (still descended for loops that sit *directly* in a root /
        // loop-body / branch fragment) must not overwrite it with a shorter
        // run.
        if (preceding.length > 0 && !offsets.has(child)) {
          offsets.set(child, [...preceding])
        }
        preceding.push(child)
      } else if (child.type === 'fragment' || child.type === 'provider' || child.type === 'async') {
        // Transparent: no element wrapper — its children render into this run.
        recordRun(child.children, preceding)
      } else {
        preceding.push(child)
      }
    }
  }
  const containerVisit = ({ node, descend }: { node: { children: IRNode[] }; descend: () => void }): void => {
    recordRun(node.children, [])
    descend()
  }
  walkIR(root, null, {
    element: containerVisit,
    component: containerVisit,
    fragment: containerVisit,
    provider: containerVisit,
    async: containerVisit,
    // `loop` / `conditional` / `if-statement` are not flat sibling
    // containers (their children are item bodies / branches), and leaves
    // (text / expression / slot) have no children — all rely on walkIR's
    // default descent with the same scope.
  })
  return offsets
}

/**
 * Resolve a loop's preceding-sibling run into the `LoopOffset` value object
 * stored on `TopLevelLoop` / `NestedLoop`: the folded static element count
 * plus one dynamic term (`(arr).length`, `(cond ? … : …)`) per sibling whose
 * count is only known at runtime. Siblings whose count is statically
 * undecidable fall back to `legacyElementCount` (the pre-#1693 behaviour).
 * Returns `undefined` when nothing precedes the loop (or only non-element
 * nodes do), so the loop keeps bare `children[idx]`.
 */
function resolveLoopOffset(preceding: IRNode[] | undefined): LoopOffset | undefined {
  if (!preceding || preceding.length === 0) return undefined
  let staticCount = 0
  const dynamicTerms: string[] = []
  for (const node of preceding) {
    const c = domElementCount(node)
    if (c === null) staticCount += legacyElementCount(node)
    else if (typeof c === 'number') staticCount += c
    else dynamicTerms.push(c)
  }
  if (staticCount === 0 && dynamicTerms.length === 0) return undefined
  return { staticCount, dynamicTerms }
}

/**
 * Options controlling `collectInnerLoops` traversal and payload collection.
 *
 * The "general" traversal (default) descends into every subtree finding
 * every inner loop, tracking depth; the "branch" traversal (all three
 * options set, produced by `branchInnerLoopOptions()`) is used by
 * `collectLoopChildConditionals` to gather 1-level inner loops within a
 * conditional branch, where deeper loops and nested conditionals are
 * handled by the caller's separate collection paths (avoiding the
 * double-initialization bug fixed in #929).
 */
export interface CollectInnerLoopsOptions {
  /**
   * Collect per-item `childComponents` / `childEvents` / `childConditionals`
   * on each emitted NestedLoop. Used by branch callers whose `insert()`
   * bindEvents must wire each inner-loop item's event handlers, components,
   * and nested conditionals at runtime.
   */
  collectItemBindings?: boolean
  /**
   * Fixed template placeholder depth. When set, `irToPlaceholderTemplate`
   * uses this value instead of the tracked depth counter. Branch callers
   * always operate at depth 1 (loops inside a conditional inside a loop
   * item), independent of the general counter.
   */
  templateDepth?: number
  /**
   * Flat traversal: do NOT recurse into loop-body children or into
   * conditional branches. Branch callers need this because nested loops
   * have their own mapArray reconciliation and nested conditionals are
   * collected via `childConditionals` in the enclosing
   * `collectLoopChildConditionals` walk — descending here would
   * double-emit their metadata.
   */
  flatBranchMode?: boolean
}

/** Options preset for the "branch inner loops" use case. */
export const branchInnerLoopOptions: CollectInnerLoopsOptions = {
  collectItemBindings: true,
  templateDepth: 1,
  flatBranchMode: true,
}

/**
 * Collect inner-loop metadata from an IR subtree. Returns one `NestedLoop`
 * per `IRLoop` node found in the tree, using the nearest ancestor element's
 * slot id as the mapArray container.
 *
 * This is the unified collector shared by:
 *   - `collectElements` case 'loop' (via `decideLoopRendering`)
 *   - `collectBranchLoops` (via `decideLoopRendering`, branch-of-conditional loops)
 *   - `collectLoopChildConditionals` (with `branchInnerLoopOptions`, inner loops
 *     inside a conditional branch of a loop item — #830 Path A)
 *
 * Before Phase 2 (#1001), the third call site lived in `reactivity.ts` as
 * `collectBranchInnerLoops`; see that history for why the option preset
 * hard-codes `templateDepth: 1` and `flatBranchMode: true`.
 */
export function collectInnerLoops(
  nodes: IRNode[],
  siblingOffsets: Map<IRLoop, IRNode[]>,
  outerLoopParam?: string,
  ctx?: ClientJsContext,
  options?: CollectInnerLoopsOptions,
): NestedLoop[] {
  type Scope = {
    parentSlotId: string | null
    depth: number
    insideCond: boolean
  }
  const result: NestedLoop[] = []
  const flat = options?.flatBranchMode === true
  const fixedDepth = options?.templateDepth
  const collectBindings = options?.collectItemBindings === true
  const initialScope: Scope = { parentSlotId: null, depth: 0, insideCond: false }

  for (const root of nodes) {
    walkIR<Scope>(root, initialScope, {
      element: ({ node: el, scope, descend }) => {
        descend({ ...scope, parentSlotId: el.slotId ?? scope.parentSlotId })
      },
      component: ({ node: c, scope, descend }) => {
        // Use the component's own slotId as the container for inner loops,
        // so loops inside child components (e.g., SelectContent) use that
        // component's element as the mapArray container instead of __branchScope.
        descend({ ...scope, parentSlotId: c.slotId ?? scope.parentSlotId })
      },
      conditional: ({ scope, descend }) => {
        if (flat) return
        descend({ ...scope, insideCond: true })
      },
      loop: ({ node: n, scope, descend }) => {
        const emitDepth = fixedDepth ?? scope.depth + 1
        // Generate item template for CSR rendering in mapArray.
        // Pass loopParams so expressions are wrapped at generation time (not post-hoc regex).
        // Forward destructured bindings (#951) so inner-loop template
        // references to the destructured locals are rewritten.
        const loopParamsForTemplate = outerLoopParam
          ? [outerLoopParam, { param: n.param, bindings: n.paramBindings }]
          : undefined
        const template = n.children.map(c => irToPlaceholderTemplate(c, undefined, emitDepth, loopParamsForTemplate)).join('')
        // Check if array expression references the outer loop param
        const refsOuter = outerLoopParam
          ? new RegExp(`\\b${outerLoopParam}\\b`).test(n.array)
          : false
        // Per-item bindings for inner loop body, collected uniformly when
        // ctx is available: reactiveTexts / reactiveAttrs / refs are each
        // classified against the loop's OWN param via `classifyReactivity`,
        // which already filters out non-reactive reads — a `refsOuter` gate
        // on texts alone (removed, #2264) wrongly used the FIXED top-level
        // loop param at every nesting depth, so an innermost loop whose
        // array only referenced its immediate parent (not the outermost
        // param) silently dropped its text-child update effect while the
        // sibling attribute effect (ungated) still fired. Refs need to fire
        // on every renderItem invocation (#1244).
        //   - events / conditionals: only in `collectBindings` (branch)
        //     mode; the legacy non-branch path didn't wire them on
        //     `NestedLoop` because event delegation handles them through
        //     the parent's bindings instead.
        const bindings: LoopChildBindings = emptyLoopChildBindings()
        if (ctx) {
          for (const child of n.children) {
            bindings.reactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, n.param, n.paramBindings))
            bindings.reactiveAttrs.push(...collectLoopChildReactiveAttrs(child, ctx, n.param, n.paramBindings))
            bindings.refs.push(...collectLoopChildRefs(child))
          }
        }

        // Per-item bindings for branch-mode callers (child components,
        // events, nested conditionals) — matches the pre-Phase 2
        // `collectBranchInnerLoops` behaviour.
        let childComponents: import('../types.ts').IRLoopChildComponent[] | undefined
        if (collectBindings) {
          // skipConditionals=true: components inside conditional branches
          // are collected separately via `childConditionals[i].whenTrue.childComponents`
          // (below). Including them here would double-init event handlers.
          const rawComps: Array<{ name: string; slotId: string | null; props: import('../types.ts').IRProp[]; children: IRNode[] }> = []
          for (const child of n.children) {
            rawComps.push(...collectConditionalBranchChildComponents(child, true))
          }
          if (rawComps.length > 0) {
            childComponents = rawComps.map(c => ({
              name: c.name,
              slotId: c.slotId,
              props: c.props.map(p => ({
                name: p.name,
                value: p.value,
                isEventHandler: p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase(),
              })),
              children: c.children,
              loopDepth: emitDepth,
            }))
          }

          for (const child of n.children) {
            bindings.events.push(...collectLoopChildEventsWithNesting(child))
          }

          if (ctx) {
            bindings.conditionals.push(...collectLoopChildConditionals(
              { type: 'fragment', children: n.children, loc: n.loc } as unknown as IRNode,
              ctx,
              siblingOffsets,
              n.param,
              n.paramBindings,
            ))
          }
        }

        result.push({
          kind: 'nested',
          depth: emitDepth,
          array: n.array,
          arrayFreeIdentifiers: n.arrayFreeIdentifiers,
          param: n.param,
          paramBindings: n.paramBindings,
          index: n.index,
          key: n.key,
          markerId: n.markerId,
          bodyIsMultiRoot: n.bodyIsMultiRoot,
          bodyIsItemConditional: n.bodyIsItemConditional,
          iterationShape: n.iterationShape,
          objectIteration: n.objectIteration,
          containerSlotId: scope.parentSlotId,
          template,
          mapPreamble: n.mapPreamble,
          refsOuterParam: refsOuter,
          childComponents,
          insideConditional: !flat && scope.insideCond ? true : undefined,
          offset: flat ? undefined : resolveLoopOffset(siblingOffsets.get(n)),
          bindings,
        })
        // Branch-mode callers handle deeper nesting via their own collection paths.
        if (!flat) {
          descend({ ...scope, depth: scope.depth + 1 })
        }
      },
      // fragment / provider / async auto-descend with the same scope.
    })
  }
  return result
}


/**
 * Decide whether a loop's runtime rendering needs element reconciliation
 * (reconcileElements + composite item rendering) rather than the simple
 * template-per-item path, and collect inner-loop metadata for its body.
 *
 * Used by both the top-level `case 'loop'` in `collectElements` and the
 * branch-loop collector in `collectBranchLoops`. Each call site applies
 * its own final-emission rule over `innerLoops` (top-level also emits
 * them on `isStaticArray && innerLoops.length`, branch only on
 * `useElementReconciliation`).
 */
function decideLoopRendering(
  loop: IRLoop,
  siblingOffsets: Map<IRLoop, IRNode[]>,
  ctx: ClientJsContext | undefined,
): { useElementReconciliation: boolean; innerLoops: NestedLoop[] | undefined } {
  const hasNestedComps = (loop.nestedComponents?.length ?? 0) > 0
  // Collect inner loops even when the outer item is a child component
  // (#1725): a `.map()` of components living inside the child component's
  // JSX children (e.g. `<SelectGroup>{items.map(...)}</SelectGroup>`) needs
  // its own `initChild` pass. `loop.children` is the single child-component
  // node; `collectInnerLoops` descends into its children to find the nested
  // loop. These only surface for static arrays (gated at the call site via
  // `isStaticArray && innerLoops.length`) so dynamic child-component loops —
  // which render through `createComponent` — are unaffected.
  const innerLoops = collectInnerLoops(loop.children, siblingOffsets, loop.param, ctx)
  const hasInnerLoops = (innerLoops?.length ?? 0) > 0
  const useElementReconciliation =
    !loop.childComponent && !loop.isStaticArray && (hasNestedComps || hasInnerLoops)
  return { useElementReconciliation, innerLoops }
}

/** Check whether an array of IR nodes contains any component nodes (recursively). */
function jsxChildrenContainComponent(nodes: IRNode[]): boolean {
  for (const node of nodes) {
    if (node.type === 'component') return true
    if (node.type === 'element' && jsxChildrenContainComponent(node.children)) return true
    if (node.type === 'fragment' && jsxChildrenContainComponent(node.children)) return true
    if (node.type === 'conditional') {
      if (jsxChildrenContainComponent([node.whenTrue, node.whenFalse])) return true
    }
  }
  return false
}

/** Build rest spread names from context (rest/props spreads handled by applyRestAttrs, not spreadAttrs). */
function buildRestSpreadNames(ctx: ClientJsContext): Set<string> {
  const names = new Set<string>()
  if (ctx.restPropsName) names.add(ctx.restPropsName)
  if (ctx.propsObjectName) names.add(ctx.propsObjectName)
  return names
}

/** Build propsExpr for a child component from its IR props. */
function buildComponentPropsExpr(props: IRProp[], ctx: ClientJsContext): string {
  const restName = ctx.restPropsName
  const propsObjName = ctx.propsObjectName
  const knownSpreadProp = props.find(p => {
    if (p.name !== '...' && !p.name.startsWith('...')) return false
    if (p.value.kind !== 'spread' && p.value.kind !== 'expression') return false
    const expr = p.value.kind === 'spread' ? p.value.expr : p.value.expr
    return expr === restName || expr === propsObjName
  })
  const spreadSource = knownSpreadProp ? PROPS_PARAM : null

  const propsForInit: string[] = []
  const explicitPropNames: string[] = []
  for (const prop of props) {
    if (prop.name === '...' || prop.name.startsWith('...')) continue
    explicitPropNames.push(prop.name)
    const isEventHandler =
      prop.name.startsWith('on') &&
      prop.name.length > 2 &&
      prop.name[2] === prop.name[2].toUpperCase()
    if (isEventHandler) {
      // Event handlers reach here only as `expression` variants.
      propsForInit.push(`${quotePropName(prop.name)}: ${attrValueToString(prop.value) ?? prop.name}`)
      continue
    }
    switch (prop.value.kind) {
      case 'jsx-children': {
        const jsxExpr = irChildrenToJsExpr(prop.value.children)
        if (jsxChildrenContainComponent(prop.value.children)) {
          propsForInit.push(`get ${quotePropName(prop.name)}() { return __slot(() => ${jsxExpr}) }`)
        } else {
          propsForInit.push(`get ${quotePropName(prop.name)}() { return ${jsxExpr} }`)
        }
        break
      }
      case 'expression':
      case 'template':
      case 'spread': {
        const valueExpr = attrValueToString(prop.value)!
        const expandedValue = expandDynamicPropValue(valueExpr, ctx)
        propsForInit.push(`get ${quotePropName(prop.name)}() { return ${expandedValue} }`)
        break
      }
      case 'literal':
        propsForInit.push(`${quotePropName(prop.name)}: ${JSON.stringify(prop.value.value)}`)
        break
      case 'boolean-shorthand':
        propsForInit.push(`${quotePropName(prop.name)}: true`)
        break
      case 'boolean-attr':
        // Should not reach here for component props (processComponentProps
        // promotes to boolean-shorthand), but handle defensively.
        propsForInit.push(`${quotePropName(prop.name)}: true`)
        break
    }
  }

  if (spreadSource) {
    const overrides = propsForInit.length > 0 ? `{ ${propsForInit.join(', ')} }` : '{}'
    const excludeKeys = JSON.stringify(explicitPropNames)
    return `forwardProps(${spreadSource}, ${overrides}, ${excludeKeys})`
  }
  return propsForInit.length > 0 ? `{ ${propsForInit.join(', ')} }` : '{}'
}

/**
 * Push reactive child-prop entries for a component node into `ctx.reactiveChildProps`.
 * Mirrors the wrap-decision pass done during propsExpr construction; kept as a dedicated
 * side-effect helper so `buildComponentPropsExpr` stays a pure function.
 */
function collectReactiveChildProps(node: IRComponent, ctx: ClientJsContext): void {
  for (const prop of node.props) {
    if (prop.name === '...' || prop.name.startsWith('...')) continue
    if (prop.value.kind === 'jsx-children') continue
    const isEventHandler =
      prop.name.startsWith('on') &&
      prop.name.length > 2 &&
      prop.name[2] === prop.name[2].toUpperCase()
    if (isEventHandler) continue
    // Only `expression` / `template` variants drive reactive prop forwarding.
    if (prop.value.kind !== 'expression' && prop.value.kind !== 'template') continue
    const valueExpr = attrValueToString(prop.value)!
    const expandedValue = expandDynamicPropValue(valueExpr, ctx)
    if (!decideWrapForChildProp(expandedValue, ctx, prop).wrap) continue
    const attrName = prop.name === 'className' ? 'class' : prop.name
    ctx.reactiveChildProps.push({
      componentName: node.name,
      slotId: node.slotId,
      propName: prop.name,
      attrName,
      expression: expandedValue,
      ...pickAttrMetaFromIR(prop),
    })
  }
}

/** Convert raw component info from IR traversal to ConditionalBranchChildComponent with built propsExpr. */
function buildBranchChildComponents(
  rawComponents: Array<{ name: string; slotId: string | null; props: IRProp[] }>,
  ctx: ClientJsContext,
): ConditionalBranchChildComponent[] {
  return rawComponents.map(comp => ({
    name: comp.name,
    slotId: comp.slotId,
    propsExpr: buildComponentPropsExpr(comp.props, ctx),
  }))
}

/**
 * Walk the IR tree and populate `ctx` with every interactive / dynamic /
 * loop / conditional element that needs client-side wiring. Implemented
 * on top of `walkIR` — the per-kind visitor directly encodes this pass's
 * stop rules (loops are terminal because their body uses loop-scoped
 * variables; conditional branches flip the `insideConditional` scope flag
 * so text effects and conditional pushes gate correctly).
 */
export function collectElements(
  node: IRNode,
  ctx: ClientJsContext,
  siblingOffsets: Map<IRLoop, IRNode[]>,
  insideConditional = false,
): void {
  walkIR<boolean>(node, insideConditional, {
    element: ({ node: el, scope: inCond, descend }) => {
      collectFromElement(el, ctx, inCond)
      descend()
    },
    expression: ({ node: ex, scope: inCond }) => {
      if (ex.clientOnly && ex.slotId) {
        ctx.clientOnlyElements.push({ slotId: ex.slotId, expression: ex.expr })
        return
      }
      if (!ex.slotId || inCond) return
      // Solid-style wrap-by-default fallback (#937): wrap in createEffect not
      // only for statically-proven-reactive expressions, but also for any
      // expression the analyzer can't prove non-reactive — i.e. anything
      // that contains a function call or a signal-getter call. Pure static
      // literals and bare identifiers (no calls) stay un-wrapped because
      // their SSR value is already in the DOM.
      //
      // False positive (extra createEffect that subscribes to nothing) is
      // harmless; false negative (silent drop of a reactive read) is the
      // bug class this gate closes — see #931, #932.
      //
      // Only collect as a top-level dynamic element when NOT inside a
      // conditional. Conditional text effects are collected per-branch and
      // emitted inside bindEvents.
      if (decideWrapFromAstFlags(ex).wrap) {
        ctx.dynamicElements.push({
          slotId: ex.slotId,
          expression: ex.expr,
          insideConditional: false,
        })
      }
    },
    conditional: ({ node: c, scope: inCond, descend }) => {
      if (c.clientOnly && c.slotId) {
        ctx.clientOnlyConditionals.push(buildConditionalMetadata(c, ctx, siblingOffsets))
      } else if (c.slotId) {
        // Solid-style wrap-by-default fallback (#941, follow-up to #937/#939).
        // Wrap not only statically-proven-reactive conditions, but also any
        // condition containing a function call — otherwise the silent-drop
        // failure class freezes the branch at its SSR-time value.
        if (decideWrapFromAstFlags(c).wrap && !inCond) {
          // Top-level reactive conditional. Nested conditionals (inCond=true)
          // are collected by the enclosing conditional via `collectBranchConditionals`
          // and emitted inside that conditional's bindEvents.
          ctx.conditionalElements.push(buildConditionalMetadata(c, ctx, siblingOffsets))
        }
      }
      // Recurse into both branches with insideConditional = true so
      // nested conditionals / events / refs / child components / reactive
      // attrs get collected under the parent's bindEvents path.
      descend(true)
    },
    loop: ({ node: l, scope: inCond }) => {
      // Loops inside conditionals are handled by the conditional template's inline
      // .map() expression. Don't collect them separately — insert() re-renders the
      // branch when template output changes (tracked via signal reads in the template
      // function). Loop body is also never descended into from this pass: loop-scoped
      // variables are only available inside the iteration. Event handler identifiers
      // are extracted explicitly below for the closure capture set.
      if (!l.slotId || inCond) return

      const childHandlers: string[] = []
      const bindings = collectLoopChildBindings(l.children, ctx, siblingOffsets, l.param, l.paramBindings)
      for (const child of l.children) {
        childHandlers.push(...collectEventHandlersFromIR(child))
      }

      if (l.childComponent) {
        for (const prop of l.childComponent.props) {
          if (prop.isEventHandler) {
            const handler = attrValueToString(prop.value)
            if (handler) childHandlers.push(handler)
          }
        }
      }

      // Determine rendering strategy for dynamic arrays:
      // Use element reconciliation when the loop body has nested components,
      // or when inner loops need their own mapArray for events/reactive text.
      const { useElementReconciliation, innerLoops } = decideLoopRendering(l, siblingOffsets, ctx)

      let template = ''
      let staticItemTemplate: string | undefined
      let skeletonTemplate: string | undefined
      let skeletonPaths: SkeletonSlotPaths | undefined
      if (l.childComponent) {
        template = '' // childComponent path uses createComponent directly
        // CSR materialize fallback (#1268): when the loop array references an
        // init-scope local the CSR template substitutes `[]`, so the
        // container is empty on a `createComponent` mount. The materialize
        // forEach in `stringifyStaticLoop` evaluates this per-iteration
        // template (a single `${renderChild('Name', ...)}` expression) so the
        // rendered child HTML lands inside the container; the
        // `static-array-child-inits` phase then wires it via `initChild`.
        // Loop-param refs use the raw destructured binding (no loopParams
        // passed), matching the plain-element path's `staticItemTemplate`.
        if (l.isStaticArray && l.children[0]) {
          // `insideLoop=true` so the component-emit drops the parent's slot
          // suffix — each iteration owns a distinct scope identified by
          // `data-key`, mirroring the SSR template's renderChild emit.
          staticItemTemplate = irToHtmlTemplate(l.children[0], buildRestSpreadNames(ctx), 0, undefined, undefined, /* insideLoop */ true)
        }
      } else if (l.children[0]) {
        // Pass loopParams so expressions are wrapped at generation time,
        // avoiding post-hoc regex wrapping that corrupts literal attribute values.
        // Forward destructured bindings (#951) so references like `cfg.color`
        // in the emitted template literal are rewritten to `__bfItem()[1].color`.
        const loopParamSpec = [{ param: l.param, bindings: l.paramBindings }]
        template = useElementReconciliation
          ? irToPlaceholderTemplate(l.children[0], buildRestSpreadNames(ctx), 0, loopParamSpec)
          : irToHtmlTemplate(l.children[0], buildRestSpreadNames(ctx), 0, loopParamSpec)
        // Static-array loops emit a `forEach((param, idx) => ...)` whose body
        // references the destructured param directly — `__bfItem()` is not in
        // scope there. Build a second template that skips the loop-param
        // accessor wrap so the CSR materialize fallback (#1247) can clone
        // items inside the forEach body without rewriting the template.
        if (l.isStaticArray) {
          // Plain-element body: leave `insideLoop=false` so any nested
          // component nodes keep their parent-slot context in the
          // per-iteration renderChild call. Per #1249, the
          // `outer-nested` static-array-child-init plan addresses
          // children by the (bf-h, bf-m) pair against the enclosing
          // parent's __scopeId — both SSR and CSR mounts stamp these
          // markers, so SSR's parent-anchored shape and CSR's random-id
          // shape both resolve through the same lookup.
          staticItemTemplate = useElementReconciliation
            ? irToPlaceholderTemplate(l.children[0], buildRestSpreadNames(ctx), 0)
            : irToHtmlTemplate(l.children[0], buildRestSpreadNames(ctx), 0)
        } else if (!useElementReconciliation && !l.bodyIsMultiRoot && !l.bodyIsItemConditional) {
          // Hoisted shared-template fast path (perf): only for the plain
          // `mapArray` shape — single-root, dynamic array, no element
          // reconciliation. `buildLoopSkeletonTemplate` re-derives safety
          // from the raw IR (spread attrs, conditionals, unslotted dynamic
          // expressions, …) and returns `null` for anything it can't prove
          // safe; the plan builder (`build-loop.ts`) falls back to the
          // per-row `template` above whenever this stays `undefined`.
          const skeletonSafeSlots = {
            reactiveAttrKeys: new Set(bindings.reactiveAttrs.map(a => `${a.childSlotId}::${a.attrName}`)),
            reactiveTextSlotIds: new Set(bindings.reactiveTexts.map(t => t.slotId)),
          }
          skeletonTemplate = buildLoopSkeletonTemplate(l.children[0], skeletonSafeSlots) ?? undefined
          // Direct child-index paths (perf, #2143): only attempted when the
          // skeleton itself hoisted, and skipped for SVG roots for now (the
          // `<svg>`-wrap namespace fix-up is orthogonal and untested against
          // this path model — safe fallback to qsa/$t for those loops).
          if (skeletonTemplate && !templateRootIsSvg(skeletonTemplate)) {
            skeletonPaths = computeSkeletonSlotPaths(l.children[0], skeletonSafeSlots) ?? undefined
          }
        }
      }

      ctx.loopElements.push({
        kind: 'top-level',
        slotId: l.slotId,
        array: l.array,
        arrayFreeIdentifiers: l.arrayFreeIdentifiers,
        param: l.param,
        paramBindings: l.paramBindings,
        index: l.index,
        key: l.key,
        markerId: l.markerId,
        bodyIsMultiRoot: l.bodyIsMultiRoot,
        bodyIsItemConditional: l.bodyIsItemConditional,
        iterationShape: l.iterationShape,
        objectIteration: l.objectIteration,
        template,
        staticItemTemplate,
        skeletonTemplate,
        skeletonPaths,
        childEventHandlers: childHandlers,
        bindings,
        childComponent: l.childComponent,
        nestedComponents: l.nestedComponents,
        isStaticArray: l.isStaticArray,
        useElementReconciliation,
        innerLoops: (useElementReconciliation || (l.isStaticArray && innerLoops?.length)) ? innerLoops : undefined,
        offset: resolveLoopOffset(siblingOffsets.get(l)),
        filterPredicate: l.filterPredicate ? {
          param: l.filterPredicate.param,
          raw: l.filterPredicate.raw,
        } : undefined,
        sortComparator: l.sortComparator ? {
          paramA: l.sortComparator.paramA,
          paramB: l.sortComparator.paramB,
          raw: l.sortComparator.raw,
        } : undefined,
        chainOrder: l.chainOrder,
        mapPreamble: l.mapPreamble,
      })
      // Don't descend — loop-scoped variables are only available inside the iteration.
    },
    component: ({ node: c, descend, descendJsxChildren }) => {
      if (c.slotId) {
        // Reactive props need effects to update the element when values change.
        for (const prop of c.props) {
          if (prop.value.kind === 'jsx-children') continue
          if (prop.name.startsWith('on') && prop.name.length > 2) continue
          // Only `expression` variants reach the signal/memo getter heuristic
          // — literal / template / spread / boolean forms don't have a single
          // bare-identifier shape to lookup.
          if (prop.value.kind !== 'expression') continue
          const value = prop.value.expr
          if (value.endsWith('()')) {
            const fnName = value.slice(0, -2)
            const isMemo = ctx.memos.some((m) => m.name === fnName)
            const isSignalGetter = ctx.signals.some((s) => s.getter === fnName)
            if (isMemo || isSignalGetter) {
              ctx.reactiveProps.push({
                slotId: c.slotId,
                propName: prop.name,
                expression: fnName,
                componentName: c.name,
              })
            }
          }
        }
      }

      collectReactiveChildProps(c, ctx)

      ctx.childInits.push({
        name: c.name,
        slotId: c.slotId,
        propsExpr: buildComponentPropsExpr(c.props, ctx),
      })

      descend()
      // Traverse JSX prop children so events, reactive expressions, and nested
      // components inside JSX props are collected.
      descendJsxChildren()
    },
    provider: ({ node: p, descend }) => {
      // Literal `<Ctx.Provider value="dark">` must emit `"dark"` (a
      // quoted JS string) at the `provideContext(...)` call site, not
      // the bare identifier `dark` that `attrValueToString` returns for
      // the literal kind. The other AttrValue kinds already serialise to
      // valid JS expressions (`expr` for expression / spread, the
      // template parts for `template`), so they pass through unchanged.
      // Mirrors the Hono adapter's `emitProvider` (`hono-adapter.ts`)
      // which JSON-stringifies the literal value for the same reason.
      const v = p.valueProp.value
      const valueExpr = v.kind === 'literal'
        ? JSON.stringify(v.value)
        : (attrValueToString(v) ?? '')
      ctx.providerSetups.push({
        contextName: p.contextName,
        valueExpr,
      })
      descend()
    },
    // fragment / if-statement / async use the walker's default auto-descent
    // with the same scope (insideConditional flag unchanged).
  })
}

/**
 * Extract events, refs, and reactive attributes from a single IR element into ctx.
 *
 * `insideConditional` gates the push to `ctx.reactiveAttrs`: when the element
 * lives inside a conditional branch, the binding is collected separately by
 * `collectBranchReactiveAttrs` and emitted inside the branch's `bindEvents`
 * so it re-attaches on every DOM swap (#1071). Events, refs and rest-attr
 * elements are unaffected — they have their own per-branch collection paths.
 */
function collectFromElement(element: IRElement, ctx: ClientJsContext, insideConditional = false): void {
  if (element.events.length > 0 && element.slotId) {
    ctx.interactiveElements.push({
      slotId: element.slotId,
      events: element.events,
    })
  }

  if (element.ref && element.slotId) {
    ctx.refElements.push({
      slotId: element.slotId,
      callback: element.ref,
    })
  }

  if (element.slotId) {
    for (const attr of element.attrs) {
      // Track unresolved spread attrs for runtime application.
      // Only handle spreads whose source matches the component's rest/props parameter name.
      // Other identifiers or complex expressions may not exist in the compiled init scope.
      // Always use PROPS_PARAM as the source since the init function parameter is PROPS_PARAM.
      if (attr.name === '...' && attr.value) {
        const spreadVal = attrValueToString(attr.value) ?? ''
        const elemRestName = ctx.restPropsName
        const elemPropsObjName = ctx.propsObjectName
        if (spreadVal && (spreadVal === elemRestName || spreadVal === elemPropsObjName)) {
          // `applyRestAttrs(_el, _p, exclude)` is handed the FULL props
          // object (`PROPS_PARAM`), not a computed JS rest binding, and the
          // runtime filters by SOURCE KEY (`source[key]`). So `exclude` must
          // list every prop the component already consumed, keyed the way it
          // arrives on `_p`. For the destructured `...rest` form that set is
          // exactly the destructured param names (the JS rest-exclusion set):
          // it covers every statically/reactively bound attr AND the
          // separately-wired event/ref handlers. Without it, applyRestAttrs
          // re-binds those events (double-fire) and re-emits consumed-but-
          // unbound props under their raw key (e.g. `error` → `error="…"`,
          // `describedBy` → `describedBy="…"`). The element-attr-name list
          // alone was wrong on both counts — it keys on HTML attr names
          // (`aria-invalid` ≠ source key `error`) and omits event handlers.
          // (#1467)
          const consumedKeys =
            spreadVal === elemRestName ? ctx.propsParams.map(p => p.name) : []
          const staticAttrKeys = element.attrs
            .filter(a => a.name !== '...')
            .map(a => a.name)
          const excludeKeys = [...new Set([...consumedKeys, ...staticAttrKeys])]
          ctx.restAttrElements.push({
            slotId: element.slotId,
            source: PROPS_PARAM,
            excludeKeys,
          })
        }
        continue
      }

      // Literal / boolean variants need no reactive binding — they're
      // already in the SSR DOM and never change. Only `expression` /
      // `template` / `spread` reach the wrap decision.
      if (attr.value.kind === 'expression' || attr.value.kind === 'template' || attr.value.kind === 'spread') {
        const valueStr = attrValueToString(attr.value)
        if (!valueStr) continue

        // Expand local constant references to detect transitive prop dependencies.
        // e.g., `classes` → `` `${baseClasses} ${variantClasses[variant]} ${className}` ``
        const expandedResult = expandConstantForReactivity(valueStr, ctx, attr.freeIdentifiers)
        const expandedValueStr = expandedResult.expr

        // Solid-style wrap-by-default fallback (#940, DRY-consolidated
        // with #939/#941/#942/#943 via IRAttribute AST flags). Wrap
        // attribute bindings in createEffect not only for
        // statically-proven reactive expressions, but also for any
        // expression the analyzer can't prove non-reactive — AST flags
        // carry that signal from Phase 1. Pure literals and bare
        // identifiers (no calls) stay un-wrapped because their SSR value
        // is already in the DOM.
        //
        // `needsEffectWrapper(expandedValueStr, ctx)` stays as a
        // string-level check because it recognises known signal getters,
        // memos, and prop names inside expanded local-const references
        // (e.g. `const classes = \`btn \${count()}\`; <div class={classes}>`).
        // `attr.callsReactiveGetters` / `attr.hasFunctionCalls` are
        // computed structurally from the AST of the source expression, so
        // they can't false-match call-like substrings inside string
        // literals (e.g. `style={{ color: 'hsl(221 83% 53%)' }}`) and
        // don't depend on the expansion order of local constants.
        // `/* @client */` forces the attribute through the
        // `reactiveAttrs` path regardless of the wrap heuristic —
        // the SSR template won't emit the attribute (see
        // html-template.ts), so init's `createEffect` is the only
        // authority that ever sets it. Without this push the
        // attribute would be silently dropped.
        if (attr.clientOnly || decideWrapForAttr(expandedValueStr, ctx, attr).wrap) {
          // Slots inside a conditional branch are collected per-branch by
          // `collectBranchReactiveAttrs` and emitted inside `insert()`
          // bindEvents — keeping them out of init-level `ctx.reactiveAttrs`
          // avoids binding to a stale node reference after a branch swap (#1071).
          if (insideConditional) continue
          ctx.reactiveAttrs.push({
            slotId: element.slotId,
            attrName: attr.name,
            expression: expandedValueStr,
            ...pickAttrMetaFromIR(attr),
            ...(expandedResult.freeIds !== undefined && { freeIdentifiers: expandedResult.freeIds }),
          })
        }
      }
    }
  }
}

/**
 * Collect reactive attribute bindings from a conditional branch IR subtree (#1071).
 * Walks the branch tree to find dynamic attributes that need a `createEffect`
 * update on the live element — emitted inside `insert()` bindEvents so the
 * binding re-resolves its target on every DOM swap.
 *
 * Does NOT recurse into nested conditionals (they get their own insert() call)
 * or loops (whose body uses loop-scoped variables and is handled by the
 * loop's own reconciliation path).
 */
function collectBranchReactiveAttrs(node: IRNode, ctx: ClientJsContext): ConditionalBranchReactiveAttr[] {
  const attrs: ConditionalBranchReactiveAttr[] = []
  walkIR(node, null, {
    ...stopAt<null>('conditional', 'ifStatement', 'loop'),
    element: ({ node: el, descend }) => {
      if (!el.slotId) {
        descend()
        return
      }
      for (const attr of el.attrs) {
        if (attr.name === '...') continue
        // Only `expression` / `template` / `spread` carry a reactive expression.
        if (attr.value.kind !== 'expression' && attr.value.kind !== 'template' && attr.value.kind !== 'spread') continue
        const valueStr = attrValueToString(attr.value)
        if (!valueStr) continue
        const expanded = expandConstantForReactivity(valueStr, ctx, attr.freeIdentifiers)
        // Mirror the main-path gate (collectElements.element handler):
        // `/* @client */` always defers via createEffect regardless of
        // the wrap heuristic — without this carve-out, a clientOnly
        // attr inside a conditional branch would be skipped at SSR
        // (html-template strips it) AND never get a hydrate-time
        // binding emitted, leaving the attribute permanently unset.
        if (!attr.clientOnly && !decideWrapForAttr(expanded.expr, ctx, attr).wrap) continue
        attrs.push({
          slotId: el.slotId,
          attrName: attr.name,
          expression: expanded.expr,
          ...pickAttrMetaFromIR(attr),
          ...(expanded.freeIds !== undefined && { freeIdentifiers: expanded.freeIds }),
        })
      }
      descend()
    },
  })
  return attrs
}

/**
 * Collect reactive text expressions from a conditional branch IR subtree.
 * Walks the branch tree to find expression nodes that need createEffect updates.
 * Does NOT recurse into nested conditionals (they get their own insert() call).
 */
function collectBranchTextEffects(node: IRNode): ConditionalBranchTextEffect[] {
  const effects: ConditionalBranchTextEffect[] = []
  walkIR(node, null, {
    // Do NOT recurse into nested conditionals / if-statements — they have
    // their own insert(). Loops are not inspected either; the legacy
    // walker's switch omitted the 'loop' case entirely.
    // element / fragment / component / provider / async use default descent.
    ...stopAt<null>('conditional', 'ifStatement', 'loop'),
    expression: ({ node: n }) => {
      if (n.reactive && n.slotId && !n.clientOnly) {
        effects.push({ slotId: n.slotId, expression: n.expr })
      }
    },
  })
  return effects
}

/**
 * Collect loop info from a conditional branch for reactive reconciliation.
 * Finds IRLoop nodes in the branch and extracts their metadata.
 * Only collects top-level loops (not nested loops inside other loops).
 * Detects composite loops (with child components) and collects extra metadata.
 */
function collectBranchLoops(
  node: IRNode,
  ctx: ClientJsContext | undefined,
  siblingOffsets: Map<IRLoop, IRNode[]>,
): BranchLoop[] {
  const loops: BranchLoop[] = []
  const restNames = ctx ? buildRestSpreadNames(ctx) : undefined

  walkIR<string | null>(node, null, {
    // Don't recurse into nested conditionals / if-statements.
    // fragment / component / provider / async auto-descend carrying parentSlotId.
    ...stopAt<string | null>('conditional', 'ifStatement'),
    element: ({ node: el, scope: parentSlotId, descend }) => {
      descend(el.slotId ?? parentSlotId)
    },
    loop: ({ node: n, scope: parentSlotId }) => {
      // parentSlotId comes from an enclosing element inside this branch;
      // fall back to the loop's own slotId, which jsx-to-ir propagates from
      // the nearest ancestor element when the branch itself is a fragment.
      const containerSlot = parentSlotId ?? n.slotId
      if (!containerSlot) return

      // Detect composite: native element root + nested components, OR a loop
      // with inner loops that need their own mapArray reconciliation. Mirrors
      // the top-level `useElementReconciliation` rule so a `.map()` directly
      // inside an outer `.map()` gets its own reactive mapArray even when
      // the outer loop lives inside a conditional branch.
      // Pass `undefined` for ctx to preserve the legacy branch behaviour:
      // reactive-text collection on inner loops reached from this call path
      // is handled at the enclosing branch-loop level below (`if (ctx)` block
      // around `collectLoopChildReactiveTexts`), not per inner loop.
      const { useElementReconciliation, innerLoops: innerLoopsCollected } =
        decideLoopRendering(n, siblingOffsets, undefined)

      // Build the item template from loop children.
      // Use loopDepth=0: this loop gets its own reconcileElements (independent
      // from the conditional's template), so items use data-key (not data-key-1).
      // Pass loopParams so expressions reference the per-item signal accessor,
      // keeping the template consistent with reactive effect expressions that
      // use `param()` to read the current item value.
      let childTemplate: string
      const branchLoopParamSpec = [{ param: n.param, bindings: n.paramBindings }]
      if (useElementReconciliation && n.children[0]) {
        childTemplate = irToPlaceholderTemplate(n.children[0], restNames, 0, branchLoopParamSpec)
      } else {
        childTemplate = n.children.map(c => irToHtmlTemplate(c, undefined, 0, branchLoopParamSpec)).join('')
      }

      // Collect per-item bindings (events, reactive attrs/texts, refs,
      // conditionals) for ALL branch loops — simple loops also need
      // reactive wiring when their item body reads non-item signals (e.g.,
      // memos). Previously these were only collected for composite loops,
      // which caused reactive reads inside simple loop bodies to silently
      // no-op for existing items.
      const branchBindings = ctx
        ? collectLoopChildBindings(n.children, ctx, siblingOffsets, n.param, n.paramBindings)
        : emptyLoopChildBindings()

      loops.push({
        kind: 'branch',
        array: n.array,
        arrayFreeIdentifiers: n.arrayFreeIdentifiers,
        param: n.param,
        paramBindings: n.paramBindings,
        index: n.index,
        key: n.key,
        markerId: n.markerId,
        bodyIsMultiRoot: n.bodyIsMultiRoot,
        bodyIsItemConditional: n.bodyIsItemConditional,
        iterationShape: n.iterationShape,
        objectIteration: n.objectIteration,
        template: childTemplate,
        containerSlotId: containerSlot,
        mapPreamble: n.mapPreamble ?? null,
        nestedComponents: useElementReconciliation ? n.nestedComponents : undefined,
        bindings: branchBindings,
        innerLoops: useElementReconciliation ? innerLoopsCollected : undefined,
        useElementReconciliation: useElementReconciliation || undefined,
        filterPredicate: n.filterPredicate ? {
          param: n.filterPredicate.param,
          raw: n.filterPredicate.raw,
        } : undefined,
        sortComparator: n.sortComparator ? {
          paramA: n.sortComparator.paramA,
          paramB: n.sortComparator.paramB,
          raw: n.sortComparator.raw,
        } : undefined,
        chainOrder: n.chainOrder,
      })
      // Don't recurse into the loop — nested loops are handled by the loop's own reconciliation.
    },
  })

  return loops
}

/**
 * Build full conditional metadata for a reactive conditional node.
 * Shared by top-level conditionals and nested branch conditionals.
 */
function buildConditionalMetadata(
  node: IRNode & { type: 'conditional' },
  ctx: ClientJsContext,
  siblingOffsets: Map<IRLoop, IRNode[]>,
): ConditionalElement {
  const restNames = buildRestSpreadNames(ctx)
  // Use loopDepth=-1 so the first loop encountered inside the branch emits
  // data-key (depth 0) for its items, matching the mapArray item template
  // and event dispatcher convention. Matches irToComponentTemplate/generateCsrTemplate.
  // `__slots` is the closure-scoped accumulator emitted by
  // `stringifyInsert` for each branch's `template()` body (#1213).
  // Forwarding it here makes Child-position expression interpolations
  // route Element/Node returns through `__bfSlot` instead of being
  // stringified by the surrounding template literal.
  return {
    slotId: node.slotId!,
    condition: node.condition,
    whenTrueHtml: irToHtmlTemplate(node.whenTrue, restNames, -1, undefined, '__slots'),
    whenFalseHtml: irToHtmlTemplate(node.whenFalse, restNames, -1, undefined, '__slots'),
    whenTrue: summarizeBranch(node.whenTrue, ctx, siblingOffsets),
    whenFalse: summarizeBranch(node.whenFalse, ctx, siblingOffsets),
  }
}

/**
 * Bundle every reactive entity collected from a single conditional branch
 * subtree into a `BranchSummary`. One call replaces the six parallel
 * `collectBranch*` calls that used to populate the flat `whenTrueXxx` /
 * `whenFalseXxx` fields on `ConditionalElement`.
 */
function summarizeBranch(
  node: IRNode,
  ctx: ClientJsContext,
  siblingOffsets: Map<IRLoop, IRNode[]>,
): import('./types.ts').BranchSummary {
  return {
    events: collectConditionalBranchEvents(node),
    refs: collectConditionalBranchRefs(node),
    childComponents: buildBranchChildComponents(collectConditionalBranchChildComponents(node), ctx),
    textEffects: collectBranchTextEffects(node),
    reactiveAttrs: collectBranchReactiveAttrs(node, ctx),
    loops: collectBranchLoops(node, ctx, siblingOffsets),
    conditionals: collectBranchConditionals(node, ctx, siblingOffsets),
  }
}

/**
 * Collect nested reactive conditionals from a branch for emission inside bindEvents.
 * Finds reactive conditional nodes within a branch subtree (not recursing into loops).
 */
function collectBranchConditionals(
  node: IRNode,
  ctx: ClientJsContext,
  siblingOffsets: Map<IRLoop, IRNode[]>,
): ConditionalElement[] {
  const result: ConditionalElement[] = []
  walkIR(node, null, {
    // Don't recurse into loops / if-statements — they have their own reconciliation paths.
    ...stopAt<null>('loop', 'ifStatement'),
    conditional: ({ node: n }) => {
      // Wrap-by-default fallback (#941) — mirror the top-level gate in
      // `case 'conditional'` at collectElements().
      if (n.slotId && decideWrapFromAstFlags(n).wrap) {
        result.push(buildConditionalMetadata(n, ctx, siblingOffsets))
      }
      // Don't recurse further — the nested conditional handles its own branches.
    },
  })
  return result
}

/**
 * Collect reactive conditionals from loop children.
 * These are conditional nodes with a slotId that have reactive conditions,
 * needing insert() calls for fine-grained conditional switching.
 *
 * Lives in collect-elements.ts (not reactivity.ts) because it composes
 * `collectInnerLoops` and `irToHtmlTemplate` to build per-branch metadata
 * — a branch-summary concern rather than a reactivity-classification one.
 * Placement here eliminates the former lazy-`require()` cycle between
 * reactivity.ts and collect-elements.ts.
 */

/**
 * Unified per-item bindings collector for a loop body (#1244 §B).
 *
 * Replaces the four pre-#1244 site-local collectors
 * (`collectLoopChildEventsWithNesting` + `collectLoopChildReactiveAttrs`
 * + `collectLoopChildReactiveTexts` + `collectLoopChildConditionals`)
 * with one function that returns the full `LoopChildBindings` struct
 * including refs. Every loop variant (`TopLevelLoop`, `BranchLoop`,
 * `NestedLoop`) goes through this entry point so a new per-item concept
 * is added in one place instead of replicated across three.
 *
 * Sibling offsets are required for `collectLoopChildConditionals` to
 * resolve child slot ids inside nested loops; the rest of the per-item
 * collectors don't read them but pass them through for symmetry.
 */
export function collectLoopChildBindings(
  children: readonly IRNode[],
  ctx: ClientJsContext,
  siblingOffsets: Map<IRLoop, IRNode[]>,
  loopParam: string,
  loopParamBindings: readonly import('../types.ts').LoopParamBinding[] | undefined,
): LoopChildBindings {
  const bindings = emptyLoopChildBindings()
  for (const child of children) {
    bindings.events.push(...collectLoopChildEventsWithNesting(child))
    // stopAtReactiveConditionals=true (#2347): this function always also
    // collects nested reactive conditionals below via
    // `collectLoopChildConditionals`, which gives each its own insert() +
    // arm-scoped attrs/texts (`LoopChildBranchSummary.reactiveAttrs` /
    // `.reactiveTexts`) — descending into them here too would double-bind.
    bindings.reactiveAttrs.push(...collectLoopChildReactiveAttrs(child, ctx, loopParam, loopParamBindings, true))
    bindings.reactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, loopParam, loopParamBindings, true))
    bindings.refs.push(...collectLoopChildRefs(child))
    bindings.conditionals.push(...collectLoopChildConditionals(child, ctx, siblingOffsets, loopParam, loopParamBindings))
  }
  return bindings
}

export function collectLoopChildConditionals(
  node: IRNode,
  ctx: ClientJsContext,
  siblingOffsets: Map<IRLoop, IRNode[]>,
  loopParam?: string,
  loopParamBindings?: readonly import('../types.ts').LoopParamBinding[],
): LoopChildConditional[] {
  const conditionals: LoopChildConditional[] = []

  // Widen the source-level "references loop param" check so destructured
  // callbacks fire too — the pattern text `[, cfg]` never word-matches on
  // bare `cfg` but individual binding names do (#951). Consumes a
  // pre-computed `Set<string>` of free identifiers (#1267) rather than
  // running word-boundary regex on the expression text.
  const refsAnyBindingViaFreeIds = (freeIds: ReadonlySet<string>): boolean => {
    if (loopParamBindings && loopParamBindings.length > 0) {
      for (const b of loopParamBindings) {
        if (freeIds.has(b.name)) return true
      }
      return false
    }
    return loopParam ? freeIds.has(loopParam) : false
  }

  walkIR(node, null, {
    // element / fragment / component / provider auto-descend with same scope.
    // loop / async / if-statement skipped — nested loops have their own
    // mapArray, async + if-statement don't appear in loop-body conditionals.
    ...stopAt<null>('loop', 'async', 'ifStatement'),
    conditional: ({ node: n }) => {
      // Don't recurse into conditional branches — nested conditionals
      // inside branches will be handled by insert()'s own bindEvents.
      // Non-reactive, non-loop-param conditionals are ignored entirely.
      if (!n.slotId) return
      const sourceFreeIds = freeIdsFromRefs(n.origin?.freeRefs)
      const refsLoopParamInSource = refsAnyBindingViaFreeIds(sourceFreeIds)
      // Pre-gate using AST `reactive` flag on the source condition before
      // paying for constant expansion — matches the legacy short-circuit.
      if (!n.reactive && !refsLoopParamInSource) return
      const expanded = expandConstantForReactivity(n.condition, ctx, sourceFreeIds)
      // Loop-param conditionals are reactive via per-item signal accessors;
      // classifyReactivity sees both paths (signal/memo/prop + loop-param).
      if (classifyReactivity(expanded.expr, ctx, loopParam, loopParamBindings, expanded.freeIds).kind === 'none') return

      const loopParamsForCond = loopParam
        ? [{ param: loopParam, bindings: loopParamBindings }]
        : undefined
      // `__slots` matches the closure variable emitted by
      // `stringifyLoopChildConditional` — Child-position interpolations
      // get wrapped in `__bfSlot(EXPR, __slots)` so live `Node` returns
      // survive the splice (#1213).
      const whenTrueHtml = irToHtmlTemplate(n.whenTrue, undefined, 0, loopParamsForCond, '__slots')
      const whenFalseHtml = irToHtmlTemplate(n.whenFalse, undefined, 0, loopParamsForCond, '__slots')
      conditionals.push({
        slotId: n.slotId,
        condition: expanded.expr,
        whenTrueHtml,
        whenFalseHtml,
        whenTrue: summarizeLoopChildBranch(n.whenTrue, ctx, siblingOffsets, loopParam, loopParamBindings),
        whenFalse: summarizeLoopChildBranch(n.whenFalse, ctx, siblingOffsets, loopParam, loopParamBindings),
        ...(expanded.freeIds !== undefined && { conditionFreeIdentifiers: expanded.freeIds }),
      })
    },
  })

  return conditionals
}

/**
 * Bundle every reactive entity collected from one branch of a
 * `LoopChildConditional` into a `LoopChildBranchSummary`. Mirrors the
 * top-level `summarizeBranch` helper (#1009): one call replaces the four
 * parallel `whenTrueXxx` / `whenFalseXxx` collection calls that used to
 * sit inline in `collectLoopChildConditionals`.
 */
function summarizeLoopChildBranch(
  node: IRNode,
  ctx: ClientJsContext,
  siblingOffsets: Map<IRLoop, IRNode[]>,
  loopParam?: string,
  loopParamBindings?: readonly import('../types.ts').LoopParamBinding[],
): LoopChildBranchSummary {
  const inner = collectInnerLoops([node], siblingOffsets, loopParam, ctx, branchInnerLoopOptions)
  return {
    childComponents: collectConditionalBranchChildComponents(node),
    innerLoops: inner.length > 0 ? inner : undefined,
    conditionals: collectLoopChildConditionals(node, ctx, siblingOffsets, loopParam, loopParamBindings),
    events: collectConditionalBranchEvents(node),
    // Loop-param-aware — reuses the flat loop-item collectors scoped to just
    // this branch's subtree. Both already stop descending into any further
    // nested reactive conditional (own insert()/arm), so calling them here
    // on the branch root yields exactly this branch's direct bindings
    // without re-collecting what a nested arm already owns (#2347).
    reactiveAttrs: collectLoopChildReactiveAttrs(node, ctx, loopParam, loopParamBindings, true),
    reactiveTexts: collectLoopChildReactiveTexts(node, ctx, loopParam, loopParamBindings, true),
  }
}
