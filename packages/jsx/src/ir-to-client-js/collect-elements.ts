/**
 * IR tree traversal → collect elements into ClientJsContext.
 */

import { type IRNode, type IRElement, type IRComponent, type IRLoop, type IRProp, pickAttrMeta } from '../types'
import type { ClientJsContext, ConditionalBranchChildComponent, ConditionalBranchConditional, BranchLoop, ConditionalBranchTextEffect, ConditionalElement, LoopChildEvent, LoopChildReactiveAttr, NestedLoop } from './types'
import { attrValueToString, quotePropName, PROPS_PARAM } from './utils'
import { decideWrapForAttr, decideWrapForChildProp, decideWrapFromAstFlags, collectEventHandlersFromIR, collectConditionalBranchEvents, collectConditionalBranchRefs, collectConditionalBranchChildComponents, collectLoopChildEvents, collectLoopChildEventsWithNesting, collectLoopChildReactiveAttrs, collectLoopChildReactiveTexts, collectLoopChildConditionals } from './reactivity'
import { irToHtmlTemplate, irToPlaceholderTemplate, irChildrenToJsExpr } from './html-template'
import { expandDynamicPropValue, expandConstantForReactivity } from './prop-handling'

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

  function walk(n: IRNode): void {
    switch (n.type) {
      case 'element': {
        let nonLoopCount = 0
        for (const child of n.children) {
          if (child.type === 'loop') {
            if (nonLoopCount > 0) offsets.set(child, nonLoopCount)
          } else if (producesDomChild(child)) {
            nonLoopCount++
          }
        }
        for (const child of n.children) walk(child)
        break
      }
      case 'fragment':
      case 'component':
      case 'provider':
      case 'async':
      case 'loop':
        for (const child of n.children) walk(child)
        break
      case 'conditional':
        walk(n.whenTrue)
        walk(n.whenFalse)
        break
      case 'if-statement':
        walk(n.consequent)
        if (n.alternate) walk(n.alternate)
        break
    }
  }

  walk(root)
  return offsets
}

/**
 * Collect inner loop metadata from an IR subtree.
 * Returns NestedLoop for each loop node found within the tree,
 * tracking the nearest ancestor element's slotId as container.
 */
function collectInnerLoops(
  nodes: IRNode[],
  siblingOffsets: Map<IRLoop, number>,
  outerLoopParam?: string,
  ctx?: ClientJsContext,
): NestedLoop[] {
  const result: NestedLoop[] = []
  let depth = 0
  let insideCond = false

  function walk(n: IRNode, parentSlotId: string | null): void {
    switch (n.type) {
      case 'element': {
        const mySlotId = n.slotId ?? parentSlotId
        for (const child of n.children) walk(child, mySlotId)
        break
      }
      case 'loop': {
        depth++
        // Generate item template for CSR rendering in mapArray.
        // Pass loopParams so expressions are wrapped at generation time (not post-hoc regex).
        const loopParamsForTemplate = outerLoopParam ? [outerLoopParam, n.param] : undefined
        const template = n.children.map(c => irToPlaceholderTemplate(c, undefined, depth, loopParamsForTemplate)).join('')
        // Check if array expression references the outer loop param
        const refsOuter = outerLoopParam
          ? new RegExp(`\\b${outerLoopParam}\\b`).test(n.array)
          : false
        // Collect reactive text expressions inside inner loop items
        const innerReactiveTexts: Array<{ slotId: string; expression: string }> = []
        if (refsOuter && ctx) {
          for (const child of n.children) {
            innerReactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, n.param))
          }
        }
        result.push({
          kind: 'nested',
          depth,
          array: n.array,
          param: n.param,
          key: n.key,
          containerSlotId: parentSlotId,
          template,
          refsOuterParam: refsOuter,
          childReactiveTexts: innerReactiveTexts.length > 0 ? innerReactiveTexts : undefined,
          insideConditional: insideCond || undefined,
          siblingOffset: siblingOffsets.get(n) || undefined,
        })
        for (const child of n.children) walk(child, parentSlotId)
        depth--
        break
      }
      case 'fragment':
      case 'provider':
      case 'async':
        for (const child of n.children) walk(child, parentSlotId)
        break
      case 'component': {
        // Use the component's own slotId as the container for inner loops,
        // so loops inside child components (e.g., SelectContent) use that
        // component's element as the mapArray container instead of __branchScope.
        const mySlotId = n.slotId ?? parentSlotId
        for (const child of n.children) walk(child, mySlotId)
        break
      }
      case 'conditional': {
        const prev = insideCond
        insideCond = true
        walk(n.whenTrue, parentSlotId)
        walk(n.whenFalse, parentSlotId)
        insideCond = prev
        break
      }
    }
  }

  nodes.forEach(n => walk(n, null))
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

/** Recursively walk the IR tree and populate ctx with interactive/dynamic/loop/conditional elements. */
export function collectElements(
  node: IRNode,
  ctx: ClientJsContext,
  siblingOffsets: Map<IRLoop, number>,
  insideConditional = false,
): void {
  switch (node.type) {
    case 'element':
      collectFromElement(node, ctx, insideConditional)
      for (const child of node.children) {
        collectElements(child, ctx, siblingOffsets, insideConditional)
      }
      break

    case 'expression':
      if (node.clientOnly && node.slotId) {
        ctx.clientOnlyElements.push({
          slotId: node.slotId,
          expression: node.expr,
        })
      } else if (node.slotId && !insideConditional) {
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
        if (decideWrapFromAstFlags(node).wrap) {
          ctx.dynamicElements.push({
            slotId: node.slotId,
            expression: node.expr,
            insideConditional: false,
          })
        }
      }
      break

    case 'conditional':
      if (node.clientOnly && node.slotId) {
        ctx.clientOnlyConditionals.push(buildConditionalMetadata(node, ctx, siblingOffsets))
      } else if (node.slotId) {
        // Solid-style wrap-by-default fallback (#941, follow-up to #937/#939).
        // Wrap not only statically-proven-reactive conditions, but also any
        // condition containing a function call — otherwise the silent-drop
        // failure class freezes the branch at its SSR-time value.
        if (decideWrapFromAstFlags(node).wrap) {
          if (insideConditional) {
            // Nested conditionals are collected by the parent via collectBranchConditionals.
            // Don't push to ctx.conditionalElements — they'll be emitted inside the parent's bindEvents.
          } else {
            ctx.conditionalElements.push(buildConditionalMetadata(node, ctx, siblingOffsets))
          }
        }
      }
      // Recurse into conditional branches with insideConditional = true
      // to collect nested conditionals, events, refs, child components, and reactive attrs
      collectElements(node.whenTrue, ctx, siblingOffsets, true)
      collectElements(node.whenFalse, ctx, siblingOffsets, true)
      break

    case 'loop':
      // Loops inside conditionals are handled by the conditional template's inline .map()
      // expression. Don't collect them separately — insert() re-renders the branch when
      // template output changes (tracked via signal reads in the template function).
      if (node.slotId && !insideConditional) {
        const childHandlers: string[] = []
        const childEvents: LoopChildEvent[] = []
        const childReactiveAttrs: LoopChildReactiveAttr[] = []
        const childReactiveTexts: import('./types').LoopChildReactiveText[] = []
        const childConditionals: import('./types').LoopChildConditional[] = []
        for (const child of node.children) {
          childHandlers.push(...collectEventHandlersFromIR(child))
          childEvents.push(...collectLoopChildEventsWithNesting(child))
          childReactiveAttrs.push(...collectLoopChildReactiveAttrs(child, ctx, node.param))
          childReactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, node.param))
          childConditionals.push(...collectLoopChildConditionals(child, ctx, node.param))
        }

        if (node.childComponent) {
          for (const prop of node.childComponent.props) {
            if (prop.isEventHandler) {
              childHandlers.push(prop.value)
            }
          }
        }

        // Determine rendering strategy for dynamic arrays:
        // Use element reconciliation when the loop body has nested components,
        // or when inner loops need their own mapArray for events/reactive text.
        const { useElementReconciliation, innerLoops } = decideLoopRendering(node, siblingOffsets, ctx)

        let template = ''
        if (node.childComponent) {
          template = '' // childComponent path uses createComponent directly
        } else if (node.children[0]) {
          // Pass loopParams so expressions are wrapped at generation time,
          // avoiding post-hoc regex wrapping that corrupts literal attribute values.
          template = useElementReconciliation
            ? irToPlaceholderTemplate(node.children[0], buildRestSpreadNames(ctx), 0, [node.param])
            : irToHtmlTemplate(node.children[0], buildRestSpreadNames(ctx), 0, [node.param])
        }

        ctx.loopElements.push({
          kind: 'top-level',
          slotId: node.slotId,
          array: node.array,
          param: node.param,
          index: node.index,
          key: node.key,
          template,
          childEventHandlers: childHandlers,
          childEvents,
          childReactiveAttrs,
          childReactiveTexts,
          childConditionals,
          childComponent: node.childComponent,
          nestedComponents: node.nestedComponents,
          isStaticArray: node.isStaticArray,
          useElementReconciliation,
          innerLoops: (useElementReconciliation || (node.isStaticArray && innerLoops?.length)) ? innerLoops : undefined,
          siblingOffset: siblingOffsets.get(node) || undefined,
          filterPredicate: node.filterPredicate ? {
            param: node.filterPredicate.param,
            raw: node.filterPredicate.raw,
          } : undefined,
          sortComparator: node.sortComparator ? {
            paramA: node.sortComparator.paramA,
            paramB: node.sortComparator.paramB,
            raw: node.sortComparator.raw,
          } : undefined,
          chainOrder: node.chainOrder,
          mapPreamble: node.mapPreamble,
        })
      }
      // Don't traverse into loop children for interactive elements collection
      // (they use loop variables that are only available inside the loop iteration).
      // But we DO extract event handler identifiers above for function inclusion.
      break

    case 'component':
      if (node.slotId) {
        // Reactive props need effects to update the element when values change
        for (const prop of node.props) {
          if (prop.jsxChildren) continue
          if (prop.name.startsWith('on') && prop.name.length > 2) continue
          const value = prop.value
          if (value.endsWith('()')) {
            const fnName = value.slice(0, -2)
            const isMemo = ctx.memos.some((m) => m.name === fnName)
            const isSignalGetter = ctx.signals.some((s) => s.getter === fnName)
            if (isMemo || isSignalGetter) {
              ctx.reactiveProps.push({
                slotId: node.slotId,
                propName: prop.name,
                expression: fnName,
                componentName: node.name,
              })
            }
          }
        }
      }

      collectReactiveChildProps(node, ctx)

      ctx.childInits.push({
        name: node.name,
        slotId: node.slotId,
        propsExpr: buildComponentPropsExpr(node.props, ctx),
      })
      for (const child of node.children) {
        collectElements(child, ctx, siblingOffsets, insideConditional)
      }
      // Traverse JSX prop children so events, reactive expressions,
      // and nested components inside JSX props are collected
      for (const prop of node.props) {
        if (prop.jsxChildren) {
          for (const child of prop.jsxChildren) {
            collectElements(child, ctx, siblingOffsets, insideConditional)
          }
        }
      }
      break

    case 'fragment':
      for (const child of node.children) {
        collectElements(child, ctx, siblingOffsets, insideConditional)
      }
      break

    case 'if-statement':
      collectElements(node.consequent, ctx, siblingOffsets, insideConditional)
      if (node.alternate) {
        collectElements(node.alternate, ctx, siblingOffsets, insideConditional)
      }
      break

    case 'provider':
      ctx.providerSetups.push({
        contextName: node.contextName,
        valueExpr: node.valueProp.value,
      })
      for (const child of node.children) {
        collectElements(child, ctx, siblingOffsets, insideConditional)
      }
      break

    case 'async':
      // Async boundaries are transparent for client JS — just traverse children
      for (const child of node.children) {
        collectElements(child, ctx, siblingOffsets, insideConditional)
      }
      break
  }
}

/** Extract events, refs, and reactive attributes from a single IR element into ctx. */
function collectFromElement(element: IRElement, ctx: ClientJsContext, _insideConditional = false): void {
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
 * Collect reactive text expressions from a conditional branch IR subtree.
 * Walks the branch tree to find expression nodes that need createEffect updates.
 * Does NOT recurse into nested conditionals (they get their own insert() call).
 */
function collectBranchTextEffects(node: IRNode): ConditionalBranchTextEffect[] {
  const effects: ConditionalBranchTextEffect[] = []
  function walk(n: IRNode): void {
    switch (n.type) {
      case 'expression':
        if (n.reactive && n.slotId && !n.clientOnly) {
          effects.push({ slotId: n.slotId, expression: n.expr })
        }
        break
      case 'element':
        for (const child of n.children) walk(child)
        break
      case 'component':
        for (const child of n.children) walk(child)
        break
      case 'fragment':
        for (const child of n.children) walk(child)
        break
      // Do NOT recurse into nested conditionals — they have their own insert()
      case 'conditional':
        break
      case 'if-statement':
        break
      case 'provider':
      case 'async':
        for (const child of n.children) walk(child)
        break
    }
  }
  walk(node)
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
  let parentSlotId: string | null = null
  const restNames = ctx ? buildRestSpreadNames(ctx) : undefined

  function walk(n: IRNode): void {
    switch (n.type) {
      case 'element':
        const prevSlot = parentSlotId
        if (n.slotId) parentSlotId = n.slotId
        for (const child of n.children) walk(child)
        parentSlotId = prevSlot
        break
      case 'loop': {
        // parentSlotId comes from an enclosing element inside this branch;
        // fall back to the loop's own slotId, which jsx-to-ir propagates from
        // the nearest ancestor element when the branch itself is a fragment.
        const containerSlot = parentSlotId ?? n.slotId
        if (!containerSlot) break

        // Detect composite: native element root + nested components, OR a loop
        // with inner loops that need their own mapArray reconciliation. Mirrors
        // the top-level `useElementReconciliation` rule so a `.map()` directly
        // inside an outer `.map()` gets its own reactive mapArray even when
        // the outer loop lives inside a conditional branch.
        // Pass `undefined` for ctx to match the pre-existing branch behavior:
        // inner-loop reactive-text collection is handled by the separate
        // `collectBranchInnerLoops` path in reactivity.ts, not here. Phase 2
        // unifies those two collectors; until then preserve the split.
        const { useElementReconciliation, innerLoops: innerLoopsCollected } =
          decideLoopRendering(n, siblingOffsets, undefined)

        // Build the item template from loop children.
        // Use loopDepth=0: this loop gets its own reconcileElements (independent
        // from the conditional's template), so items use data-key (not data-key-1).
        // Pass loopParams so expressions reference the per-item signal accessor,
        // keeping the template consistent with reactive effect expressions that
        // use `param()` to read the current item value.
        let childTemplate: string
        if (useElementReconciliation && n.children[0]) {
          childTemplate = irToPlaceholderTemplate(n.children[0], restNames, 0, [n.param])
        } else {
          childTemplate = n.children.map(c => irToHtmlTemplate(c, undefined, 0, [n.param])).join('')
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
            childReactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, n.param))
            childReactiveAttrs.push(...collectLoopChildReactiveAttrs(child, ctx, n.param))
            childConditionals.push(...collectLoopChildConditionals(child, ctx, n.param))
          }
        }

        loops.push({
          kind: 'branch',
          array: n.array,
          param: n.param,
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
        // Don't recurse into the loop — nested loops are handled by the loop's own reconciliation
        break
      }
      case 'fragment':
      case 'component':
      case 'provider':
      case 'async':
        for (const child of n.children) walk(child)
        break
      // Don't recurse into nested conditionals
      case 'conditional':
      case 'if-statement':
        break
    }
  }
  walk(node)
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
    whenTrueEvents: collectConditionalBranchEvents(node.whenTrue),
    whenFalseEvents: collectConditionalBranchEvents(node.whenFalse),
    whenTrueRefs: collectConditionalBranchRefs(node.whenTrue),
    whenFalseRefs: collectConditionalBranchRefs(node.whenFalse),
    whenTrueChildComponents: buildBranchChildComponents(collectConditionalBranchChildComponents(node.whenTrue), ctx),
    whenFalseChildComponents: buildBranchChildComponents(collectConditionalBranchChildComponents(node.whenFalse), ctx),
    whenTrueTextEffects: collectBranchTextEffects(node.whenTrue),
    whenFalseTextEffects: collectBranchTextEffects(node.whenFalse),
    whenTrueLoops: collectBranchLoops(node.whenTrue, ctx, siblingOffsets),
    whenFalseLoops: collectBranchLoops(node.whenFalse, ctx, siblingOffsets),
    whenTrueConditionals: collectBranchConditionals(node.whenTrue, ctx, siblingOffsets),
    whenFalseConditionals: collectBranchConditionals(node.whenFalse, ctx, siblingOffsets),
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

  function walk(n: IRNode): void {
    switch (n.type) {
      case 'conditional':
        // Wrap-by-default fallback (#941) — mirror the top-level gate in
        // `case 'conditional'` at collectElements().
        if (n.slotId && decideWrapFromAstFlags(n).wrap) {
          result.push(buildConditionalMetadata(n, ctx, siblingOffsets))
        }
        // Don't recurse further — the nested conditional handles its own branches
        break
      case 'element':
      case 'fragment':
      case 'component':
      case 'provider':
      case 'async':
        for (const child of n.children) walk(child)
        break
      // Don't recurse into loops (they handle their own reconciliation)
      case 'loop':
      case 'if-statement':
        break
    }
  }
  walk(node)
  return result
}
