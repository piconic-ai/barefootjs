/**
 * IR tree traversal → collect elements into ClientJsContext.
 */

import { type IRNode, type IRElement, type IRComponent, type IRLoop, type IRProp, pickAttrMeta } from '../types'
import type { ClientJsContext, ConditionalBranchChildComponent, ConditionalBranchReactiveAttr, BranchLoop, ConditionalBranchTextEffect, ConditionalElement, LoopChildBranchSummary, LoopChildConditional, LoopChildEvent, LoopChildReactiveAttr, NestedLoop } from './types'
import { attrValueToString, exprReferencesIdent, quotePropName, PROPS_PARAM } from './utils'
import { classifyReactivity, decideWrapForAttr, decideWrapForChildProp, decideWrapFromAstFlags, collectEventHandlersFromIR, collectConditionalBranchEvents, collectConditionalBranchRefs, collectConditionalBranchChildComponents, collectLoopChildEventsWithNesting, collectLoopChildReactiveAttrs, collectLoopChildReactiveTexts } from './reactivity'
import { irToHtmlTemplate, irToPlaceholderTemplate, irChildrenToJsExpr } from './html-template'
import { expandDynamicPropValue, expandConstantForReactivity } from './prop-handling'
import { walkIR, stopAt } from './walker'

/** Check if an IR node produces a DOM child element (for sibling offset counting). */
function producesDomChild(node: IRNode): boolean {
  return node.type === 'element' || node.type === 'component' || node.type === 'provider'
    || node.type === 'async'
    || node.type === 'text' || (node.type === 'expression' && !node.reactive)
    || node.type === 'conditional'
}

/**
 * Pre-pass: for every loop node in the IR tree, record the number of non-loop
 * DOM siblings that appear before it in its parent element. Read when
 * constructing TopLevelLoop and NestedLoop so the client JS can offset
 * children[idx] access past statically-rendered siblings.
 *
 * Computed once up front (instead of during collection) so the offset data
 * lives in an explicit value rather than a module-level WeakMap mutated by
 * two separate traversals.
 */
export function computeLoopSiblingOffsets(root: IRNode): Map<IRLoop, number> {
  const offsets = new Map<IRLoop, number>()
  walkIR(root, null, {
    element: ({ node: el, descend }) => {
      let nonLoopCount = 0
      for (const child of el.children) {
        if (child.type === 'loop') {
          if (nonLoopCount > 0) offsets.set(child, nonLoopCount)
        } else if (producesDomChild(child)) {
          nonLoopCount++
        }
      }
      descend()
    },
    // All container kinds (fragment / component / provider / async / loop /
    // conditional / if-statement) rely on walkIR's default descent with the
    // same scope. Leaves (text / expression / slot) are no-ops.
  })
  return offsets
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
  siblingOffsets: Map<IRLoop, number>,
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
        // Collect reactive text expressions inside inner loop items.
        const innerReactiveTexts: Array<{ slotId: string; expression: string }> = []
        if (refsOuter && ctx) {
          for (const child of n.children) {
            innerReactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, n.param, n.paramBindings))
          }
        }

        // Per-item bindings for branch-mode callers (child components,
        // events, nested conditionals) — matches the pre-Phase 2
        // `collectBranchInnerLoops` behaviour.
        let childComponents: import('../types').IRLoopChildComponent[] | undefined
        let childEvents: LoopChildEvent[] | undefined
        let childConditionals: import('./types').LoopChildConditional[] | undefined
        if (collectBindings) {
          // skipConditionals=true: components inside conditional branches
          // are collected separately via `childConditionals[i].whenTrue.childComponents`
          // (below). Including them here would double-init event handlers.
          const rawComps: Array<{ name: string; slotId: string | null; props: import('../types').IRProp[]; children: IRNode[] }> = []
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
                dynamic: p.dynamic ?? false,
                isLiteral: p.isLiteral ?? false,
                isEventHandler: p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase(),
              })),
              children: c.children,
              loopDepth: emitDepth,
            }))
          }

          const evs: LoopChildEvent[] = []
          for (const child of n.children) {
            evs.push(...collectLoopChildEventsWithNesting(child))
          }
          if (evs.length > 0) childEvents = evs

          if (ctx) {
            const conds = collectLoopChildConditionals(
              { type: 'fragment', children: n.children, loc: n.loc } as unknown as IRNode,
              ctx,
              siblingOffsets,
              n.param,
              n.paramBindings,
            )
            if (conds.length > 0) childConditionals = conds
          }
        }

        result.push({
          kind: 'nested',
          depth: emitDepth,
          array: n.array,
          param: n.param,
          paramBindings: n.paramBindings,
          key: n.key,
          containerSlotId: scope.parentSlotId,
          template,
          mapPreamble: n.mapPreamble,
          refsOuterParam: refsOuter,
          childReactiveTexts: innerReactiveTexts.length > 0 ? innerReactiveTexts : undefined,
          childComponents,
          childEvents,
          childConditionals,
          insideConditional: !flat && scope.insideCond ? true : undefined,
          siblingOffset: flat ? undefined : (siblingOffsets.get(n) || undefined),
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
  siblingOffsets: Map<IRLoop, number>,
  ctx: ClientJsContext | undefined,
): { useElementReconciliation: boolean; innerLoops: NestedLoop[] | undefined } {
  const hasNestedComps = (loop.nestedComponents?.length ?? 0) > 0
  const innerLoops = !loop.childComponent
    ? collectInnerLoops(loop.children, siblingOffsets, loop.param, ctx)
    : undefined
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
  const knownSpreadProp = props.find(p =>
    (p.name === '...' || p.name.startsWith('...')) &&
    (p.value === restName || p.value === propsObjName)
  )
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
      propsForInit.push(`${quotePropName(prop.name)}: ${prop.value}`)
    } else if (prop.jsxChildren) {
      const jsxExpr = irChildrenToJsExpr(prop.jsxChildren)
      if (jsxChildrenContainComponent(prop.jsxChildren)) {
        propsForInit.push(`get ${quotePropName(prop.name)}() { return __slot(() => ${jsxExpr}) }`)
      } else {
        propsForInit.push(`get ${quotePropName(prop.name)}() { return ${jsxExpr} }`)
      }
    } else if (prop.dynamic) {
      const expandedValue = expandDynamicPropValue(prop.value, ctx)
      propsForInit.push(`get ${quotePropName(prop.name)}() { return ${expandedValue} }`)
    } else if (prop.isLiteral) {
      propsForInit.push(`${quotePropName(prop.name)}: ${JSON.stringify(prop.value)}`)
    } else {
      propsForInit.push(`${quotePropName(prop.name)}: ${prop.value}`)
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
    if (prop.jsxChildren) continue
    const isEventHandler =
      prop.name.startsWith('on') &&
      prop.name.length > 2 &&
      prop.name[2] === prop.name[2].toUpperCase()
    if (isEventHandler) continue
    if (!prop.dynamic) continue
    const expandedValue = expandDynamicPropValue(prop.value, ctx)
    if (!decideWrapForChildProp(expandedValue, ctx, prop).wrap) continue
    const attrName = prop.name === 'className' ? 'class' : prop.name
    ctx.reactiveChildProps.push({
      componentName: node.name,
      slotId: node.slotId,
      propName: prop.name,
      attrName,
      expression: expandedValue,
      ...pickAttrMeta(prop),
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
  siblingOffsets: Map<IRLoop, number>,
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
      const childEvents: LoopChildEvent[] = []
      const childReactiveAttrs: LoopChildReactiveAttr[] = []
      const childReactiveTexts: import('./types').LoopChildReactiveText[] = []
      const childConditionals: import('./types').LoopChildConditional[] = []
      for (const child of l.children) {
        childHandlers.push(...collectEventHandlersFromIR(child))
        childEvents.push(...collectLoopChildEventsWithNesting(child))
        childReactiveAttrs.push(...collectLoopChildReactiveAttrs(child, ctx, l.param, l.paramBindings))
        childReactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, l.param, l.paramBindings))
        childConditionals.push(...collectLoopChildConditionals(child, ctx, siblingOffsets, l.param, l.paramBindings))
      }

      if (l.childComponent) {
        for (const prop of l.childComponent.props) {
          if (prop.isEventHandler) childHandlers.push(prop.value)
        }
      }

      // Determine rendering strategy for dynamic arrays:
      // Use element reconciliation when the loop body has nested components,
      // or when inner loops need their own mapArray for events/reactive text.
      const { useElementReconciliation, innerLoops } = decideLoopRendering(l, siblingOffsets, ctx)

      let template = ''
      if (l.childComponent) {
        template = '' // childComponent path uses createComponent directly
      } else if (l.children[0]) {
        // Pass loopParams so expressions are wrapped at generation time,
        // avoiding post-hoc regex wrapping that corrupts literal attribute values.
        // Forward destructured bindings (#951) so references like `cfg.color`
        // in the emitted template literal are rewritten to `__bfItem()[1].color`.
        const loopParamSpec = [{ param: l.param, bindings: l.paramBindings }]
        template = useElementReconciliation
          ? irToPlaceholderTemplate(l.children[0], buildRestSpreadNames(ctx), 0, loopParamSpec)
          : irToHtmlTemplate(l.children[0], buildRestSpreadNames(ctx), 0, loopParamSpec)
      }

      ctx.loopElements.push({
        kind: 'top-level',
        slotId: l.slotId,
        array: l.array,
        param: l.param,
        paramBindings: l.paramBindings,
        index: l.index,
        key: l.key,
        template,
        childEventHandlers: childHandlers,
        childEvents,
        childReactiveAttrs,
        childReactiveTexts,
        childConditionals,
        childComponent: l.childComponent,
        nestedComponents: l.nestedComponents,
        isStaticArray: l.isStaticArray,
        useElementReconciliation,
        innerLoops: (useElementReconciliation || (l.isStaticArray && innerLoops?.length)) ? innerLoops : undefined,
        siblingOffset: siblingOffsets.get(l) || undefined,
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
          if (prop.jsxChildren) continue
          if (prop.name.startsWith('on') && prop.name.length > 2) continue
          const value = prop.value
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
      ctx.providerSetups.push({
        contextName: p.contextName,
        valueExpr: p.valueProp.value,
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
          const excludeKeys = element.attrs
            .filter(a => a.name !== '...')
            .map(a => a.name)
          ctx.restAttrElements.push({
            slotId: element.slotId,
            source: PROPS_PARAM,
            excludeKeys,
          })
        }
        continue
      }

      if (attr.dynamic && attr.value) {
        const valueStr = attrValueToString(attr.value)
        if (!valueStr) continue

        // Expand local constant references to detect transitive prop dependencies.
        // e.g., `classes` → `` `${baseClasses} ${variantClasses[variant]} ${className}` ``
        const expandedValueStr = expandConstantForReactivity(valueStr, ctx)

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
        if (decideWrapForAttr(expandedValueStr, ctx, attr).wrap) {
          // Slots inside a conditional branch are collected per-branch by
          // `collectBranchReactiveAttrs` and emitted inside `insert()`
          // bindEvents — keeping them out of init-level `ctx.reactiveAttrs`
          // avoids binding to a stale node reference after a branch swap (#1071).
          if (insideConditional) continue
          ctx.reactiveAttrs.push({
            slotId: element.slotId,
            attrName: attr.name,
            expression: expandedValueStr,
            ...pickAttrMeta(attr),
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
        if (attr.name === '...' || !attr.dynamic || !attr.value) continue
        const valueStr = attrValueToString(attr.value)
        if (!valueStr) continue
        const expanded = expandConstantForReactivity(valueStr, ctx)
        if (!decideWrapForAttr(expanded, ctx, attr).wrap) continue
        attrs.push({
          slotId: el.slotId,
          attrName: attr.name,
          expression: expanded,
          ...pickAttrMeta(attr),
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
  siblingOffsets: Map<IRLoop, number>,
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

      // Collect child events, reactive texts/attrs, and conditionals for ALL
      // branch loops — simple loops also need reactive wiring when their
      // item body reads non-item signals (e.g., memos). Previously these
      // were only collected for composite loops, which caused reactive
      // reads inside simple loop bodies to silently no-op for existing items.
      const childEvents: LoopChildEvent[] = []
      const childReactiveTexts: import('./types').LoopChildReactiveText[] = []
      const childReactiveAttrs: import('./types').LoopChildReactiveAttr[] = []
      const childConditionals: import('./types').LoopChildConditional[] = []
      if (ctx) {
        for (const child of n.children) {
          childEvents.push(...collectLoopChildEventsWithNesting(child))
          childReactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, n.param, n.paramBindings))
          childReactiveAttrs.push(...collectLoopChildReactiveAttrs(child, ctx, n.param, n.paramBindings))
          childConditionals.push(...collectLoopChildConditionals(child, ctx, siblingOffsets, n.param, n.paramBindings))
        }
      }

      loops.push({
        kind: 'branch',
        array: n.array,
        param: n.param,
        paramBindings: n.paramBindings,
        index: n.index,
        key: n.key,
        template: childTemplate,
        containerSlotId: containerSlot,
        mapPreamble: n.mapPreamble ?? null,
        nestedComponents: useElementReconciliation ? n.nestedComponents : undefined,
        childEvents,
        childReactiveTexts: childReactiveTexts.length > 0 ? childReactiveTexts : undefined,
        childReactiveAttrs: childReactiveAttrs.length > 0 ? childReactiveAttrs : undefined,
        childConditionals: childConditionals.length > 0 ? childConditionals : undefined,
        innerLoops: useElementReconciliation ? innerLoopsCollected : undefined,
        useElementReconciliation: useElementReconciliation || undefined,
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
  siblingOffsets: Map<IRLoop, number>,
): ConditionalElement {
  const restNames = buildRestSpreadNames(ctx)
  // Use loopDepth=-1 so the first loop encountered inside the branch emits
  // data-key (depth 0) for its items, matching the mapArray item template
  // and event dispatcher convention. Matches irToComponentTemplate/generateCsrTemplate.
  return {
    slotId: node.slotId!,
    condition: node.condition,
    whenTrueHtml: irToHtmlTemplate(node.whenTrue, restNames, -1),
    whenFalseHtml: irToHtmlTemplate(node.whenFalse, restNames, -1),
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
  siblingOffsets: Map<IRLoop, number>,
): import('./types').BranchSummary {
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
  siblingOffsets: Map<IRLoop, number>,
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
export function collectLoopChildConditionals(
  node: IRNode,
  ctx: ClientJsContext,
  siblingOffsets: Map<IRLoop, number>,
  loopParam?: string,
  loopParamBindings?: readonly import('../types').LoopParamBinding[],
): LoopChildConditional[] {
  const conditionals: LoopChildConditional[] = []

  // Widen the source-level "references loop param" check so destructured
  // callbacks fire too — the pattern text `[, cfg]` never word-matches on
  // bare `cfg` but individual binding names do (#951).
  const refsAnyBinding = (expr: string): boolean => {
    if (loopParamBindings && loopParamBindings.length > 0) {
      for (const b of loopParamBindings) {
        if (exprReferencesIdent(expr, b.name)) return true
      }
      return false
    }
    return loopParam ? exprReferencesIdent(expr, loopParam) : false
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
      const refsLoopParamInSource = refsAnyBinding(n.condition)
      // Pre-gate using AST `reactive` flag on the source condition before
      // paying for constant expansion — matches the legacy short-circuit.
      if (!n.reactive && !refsLoopParamInSource) return
      const expanded = expandConstantForReactivity(n.condition, ctx)
      // Loop-param conditionals are reactive via per-item signal accessors;
      // classifyReactivity sees both paths (signal/memo/prop + loop-param).
      if (classifyReactivity(expanded, ctx, loopParam, loopParamBindings).kind === 'none') return

      const loopParamsForCond = loopParam
        ? [{ param: loopParam, bindings: loopParamBindings }]
        : undefined
      const whenTrueHtml = irToHtmlTemplate(n.whenTrue, undefined, 0, loopParamsForCond)
      const whenFalseHtml = irToHtmlTemplate(n.whenFalse, undefined, 0, loopParamsForCond)
      conditionals.push({
        slotId: n.slotId,
        condition: expanded,
        whenTrueHtml,
        whenFalseHtml,
        whenTrue: summarizeLoopChildBranch(n.whenTrue, ctx, siblingOffsets, loopParam, loopParamBindings),
        whenFalse: summarizeLoopChildBranch(n.whenFalse, ctx, siblingOffsets, loopParam, loopParamBindings),
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
  siblingOffsets: Map<IRLoop, number>,
  loopParam?: string,
  loopParamBindings?: readonly import('../types').LoopParamBinding[],
): LoopChildBranchSummary {
  const inner = collectInnerLoops([node], siblingOffsets, loopParam, ctx, branchInnerLoopOptions)
  return {
    childComponents: collectConditionalBranchChildComponents(node),
    innerLoops: inner.length > 0 ? inner : undefined,
    conditionals: collectLoopChildConditionals(node, ctx, siblingOffsets, loopParam, loopParamBindings),
    events: collectConditionalBranchEvents(node),
  }
}
