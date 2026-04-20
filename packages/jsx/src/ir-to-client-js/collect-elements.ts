/**
 * IR tree traversal → collect elements into ClientJsContext.
 */

import { type IRNode, type IRElement, type IRProp, pickAttrMeta } from '../types'
import type { ClientJsContext, ConditionalBranchChildComponent, ConditionalBranchConditional, ConditionalBranchLoop, ConditionalBranchTextEffect, ConditionalElement, LoopChildEvent, LoopChildReactiveAttr, NestedLoopInfo } from './types'
import { attrValueToString, quotePropName, PROPS_PARAM } from './utils'
import { needsEffectWrapper, collectEventHandlersFromIR, collectConditionalBranchEvents, collectConditionalBranchRefs, collectConditionalBranchChildComponents, collectLoopChildEvents, collectLoopChildEventsWithNesting, collectLoopChildReactiveAttrs, collectLoopChildReactiveTexts, collectLoopChildConditionals } from './reactivity'
import { irToHtmlTemplate, irToPlaceholderTemplate, irChildrenToJsExpr } from './html-template'
import { expandDynamicPropValue, expandConstantForReactivity } from './prop-handling'

/**
 * WeakMap to store the number of non-loop DOM siblings before each loop node
 * in its parent element. Populated during collectElements element traversal,
 * read when constructing LoopElements.
 */
const loopSiblingOffsets = new WeakMap<IRNode, number>()

/** Check if an IR node produces a DOM child element (for sibling offset counting). */
function producesDomChild(node: IRNode): boolean {
  return node.type === 'element' || node.type === 'component' || node.type === 'provider'
    || node.type === 'async'
    || node.type === 'text' || (node.type === 'expression' && !node.reactive)
    || node.type === 'conditional'
}

/**
 * Collect inner loop metadata from an IR subtree.
 * Returns NestedLoopInfo for each loop node found within the tree,
 * tracking the nearest ancestor element's slotId as container.
 */
function collectInnerLoops(nodes: IRNode[], outerLoopParam?: string, ctx?: ClientJsContext): NestedLoopInfo[] {
  const result: NestedLoopInfo[] = []
  let depth = 0
  let insideCond = false

  function walk(n: IRNode, parentSlotId: string | null): void {
    switch (n.type) {
      case 'element': {
        const mySlotId = n.slotId ?? parentSlotId
        // Count non-loop siblings for inner loop offset
        let nonLoopCount = 0
        for (const child of n.children) {
          if (child.type === 'loop') {
            if (nonLoopCount > 0) loopSiblingOffsets.set(child, nonLoopCount)
          } else if (producesDomChild(child)) {
            nonLoopCount++
          }
        }
        for (const child of n.children) walk(child, mySlotId)
        break
      }
      case 'loop': {
        depth++
        // Generate item template for CSR rendering in mapArray.
        // Pass loopParams so expressions are wrapped at generation time (not post-hoc regex).
        const loopParamsForTemplate = outerLoopParam ? [outerLoopParam, n.param] : undefined
        const itemTemplate = n.children.map(c => irToPlaceholderTemplate(c, undefined, depth, loopParamsForTemplate)).join('')
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
          depth,
          array: n.array,
          param: n.param,
          key: n.key ?? '',
          containerSlotId: parentSlotId,
          itemTemplate,
          refsOuterParam: refsOuter,
          reactiveTexts: innerReactiveTexts.length > 0 ? innerReactiveTexts : undefined,
          insideConditional: insideCond || undefined,
          siblingOffset: loopSiblingOffsets.get(n) || undefined,
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
export function collectElements(node: IRNode, ctx: ClientJsContext, insideConditional = false): void {
  switch (node.type) {
    case 'element':
      collectFromElement(node, ctx, insideConditional)
      // Pre-compute sibling offsets for any loop children in this element
      {
        let nonLoopCount = 0
        for (const child of node.children) {
          if (child.type === 'loop') {
            if (nonLoopCount > 0) loopSiblingOffsets.set(child, nonLoopCount)
          } else if (producesDomChild(child)) {
            nonLoopCount++
          }
        }
      }
      for (const child of node.children) {
        collectElements(child, ctx, insideConditional)
      }
      break

    case 'expression':
      if (node.clientOnly && node.slotId) {
        ctx.clientOnlyElements.push({
          slotId: node.slotId,
          expression: node.expr,
        })
      } else if (node.reactive && node.slotId && !insideConditional) {
        // Only collect as top-level dynamic element if NOT inside a conditional.
        // Conditional text effects are collected per-branch and emitted inside bindEvents.
        ctx.dynamicElements.push({
          slotId: node.slotId,
          expression: node.expr,
          insideConditional: false,
        })
      }
      break

    case 'conditional':
      if (node.clientOnly && node.slotId) {
        ctx.clientOnlyConditionals.push(buildConditionalMetadata(node, ctx))
      } else if (node.reactive && node.slotId) {
        if (insideConditional) {
          // Nested conditionals are collected by the parent via collectBranchConditionals.
          // Don't push to ctx.conditionalElements — they'll be emitted inside the parent's bindEvents.
        } else {
          ctx.conditionalElements.push(buildConditionalMetadata(node, ctx))
        }
      }
      // Recurse into conditional branches with insideConditional = true
      // to collect nested conditionals, events, refs, child components, and reactive attrs
      collectElements(node.whenTrue, ctx, true)
      collectElements(node.whenFalse, ctx, true)
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
        const hasNestedComps = (node.nestedComponents?.length ?? 0) > 0
        const innerLoops = !node.childComponent
          ? collectInnerLoops(node.children, node.param, ctx)
          : undefined
        const hasInnerLoops = (innerLoops?.length ?? 0) > 0
        const useElementReconciliation = !node.childComponent
          && !node.isStaticArray
          && (hasNestedComps || hasInnerLoops)

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
          siblingOffset: loopSiblingOffsets.get(node) || undefined,
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

      // Detect unexpanded spread props (open type — Phase 1 couldn't resolve keys)
      // Only handle spreads whose source matches the component's rest/props parameter name.
      // Other identifiers (e.g., local variables) may not exist in the compiled init scope.
      // Always use PROPS_PARAM as the actual source since the init function parameter is PROPS_PARAM.
      // Find the spread prop matching the component's rest/props parameter.
      // A component may have multiple spreads (e.g., <Tag {...childProps} {...props}>).
      // We need to find the one that matches, not just the first spread.
      const restName = ctx.restPropsName
      const propsObjName = ctx.propsObjectName
      const knownSpreadProp = node.props.find(p =>
        (p.name === '...' || p.name.startsWith('...')) &&
        (p.value === restName || p.value === propsObjName)
      )
      const spreadSource = knownSpreadProp ? PROPS_PARAM : null

      const propsForInit: string[] = []
      const explicitPropNames: string[] = []
      for (const prop of node.props) {
        if (prop.name === '...' || prop.name.startsWith('...')) continue
        explicitPropNames.push(prop.name)
        const isEventHandler =
          prop.name.startsWith('on') &&
          prop.name.length > 2 &&
          prop.name[2] === prop.name[2].toUpperCase()
        if (isEventHandler) {
          propsForInit.push(`${quotePropName(prop.name)}: ${prop.value}`)
        } else if (prop.jsxChildren) {
          // JSX prop: generate getter using IR children → JS expression
          const jsxExpr = irChildrenToJsExpr(prop.jsxChildren)
          if (jsxChildrenContainComponent(prop.jsxChildren)) {
            // Wrap with __slot() so callee text effects skip nodeValue update,
            // preserving server-rendered component DOM for hydration.
            propsForInit.push(`get ${quotePropName(prop.name)}() { return __slot(() => ${jsxExpr}) }`)
          } else {
            propsForInit.push(`get ${quotePropName(prop.name)}() { return ${jsxExpr} }`)
          }
        } else if (prop.dynamic) {
          const expandedValue = expandDynamicPropValue(prop.value, ctx)
          propsForInit.push(`get ${quotePropName(prop.name)}() { return ${expandedValue} }`)

          const hasPropsRef = expandedValue.includes('props.')
          const hasReactiveExpr = needsEffectWrapper(expandedValue, ctx)
          if (hasPropsRef || hasReactiveExpr) {
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
        } else if (prop.isLiteral) {
          propsForInit.push(`${quotePropName(prop.name)}: ${JSON.stringify(prop.value)}`)
        } else {
          propsForInit.push(`${quotePropName(prop.name)}: ${prop.value}`)
        }
      }

      let propsExpr: string
      if (spreadSource) {
        // Use forwardProps() to merge spread source with explicit overrides
        const overrides = propsForInit.length > 0 ? `{ ${propsForInit.join(', ')} }` : '{}'
        const excludeKeys = JSON.stringify(explicitPropNames)
        propsExpr = `forwardProps(${spreadSource}, ${overrides}, ${excludeKeys})`
      } else {
        propsExpr = propsForInit.length > 0 ? `{ ${propsForInit.join(', ')} }` : '{}'
      }

      ctx.childInits.push({
        name: node.name,
        slotId: node.slotId,
        propsExpr,
      })
      for (const child of node.children) {
        collectElements(child, ctx, insideConditional)
      }
      // Traverse JSX prop children so events, reactive expressions,
      // and nested components inside JSX props are collected
      for (const prop of node.props) {
        if (prop.jsxChildren) {
          for (const child of prop.jsxChildren) {
            collectElements(child, ctx, insideConditional)
          }
        }
      }
      break

    case 'fragment':
      for (const child of node.children) {
        collectElements(child, ctx, insideConditional)
      }
      break

    case 'if-statement':
      collectElements(node.consequent, ctx, insideConditional)
      if (node.alternate) {
        collectElements(node.alternate, ctx, insideConditional)
      }
      break

    case 'provider':
      ctx.providerSetups.push({
        contextName: node.contextName,
        valueExpr: node.valueProp.value,
      })
      for (const child of node.children) {
        collectElements(child, ctx, insideConditional)
      }
      break

    case 'async':
      // Async boundaries are transparent for client JS — just traverse children
      for (const child of node.children) {
        collectElements(child, ctx, insideConditional)
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

        if (needsEffectWrapper(expandedValueStr, ctx)) {
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
function collectBranchLoops(node: IRNode, ctx?: ClientJsContext): ConditionalBranchLoop[] {
  const loops: ConditionalBranchLoop[] = []
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

        // Detect composite: native element root + nested components
        const hasNestedComps = (n.nestedComponents?.length ?? 0) > 0
        const useElementReconciliation = !n.childComponent && !n.isStaticArray && hasNestedComps

        // Build the item template from loop children.
        // Use loopDepth=0: this loop gets its own reconcileElements (independent
        // from the conditional's template), so items use data-key (not data-key-1).
        let childTemplate: string
        if (useElementReconciliation && n.children[0]) {
          childTemplate = irToPlaceholderTemplate(n.children[0], restNames, 0)
        } else {
          childTemplate = n.children.map(c => irToHtmlTemplate(c, undefined, 0)).join('')
        }

        // Collect child events for ALL loops (needed for event delegation).
        // Reactive fields (texts, attrs, conditionals) are composite-only.
        const childEvents: LoopChildEvent[] = []
        const childReactiveTexts: import('./types').LoopChildReactiveText[] = []
        const childReactiveAttrs: import('./types').LoopChildReactiveAttr[] = []
        const childConditionals: import('./types').LoopChildConditional[] = []
        if (ctx) {
          for (const child of n.children) {
            childEvents.push(...collectLoopChildEventsWithNesting(child))
          }
        }
        if (useElementReconciliation && ctx) {
          for (const child of n.children) {
            childReactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, n.param))
            childReactiveAttrs.push(...collectLoopChildReactiveAttrs(child, ctx, n.param))
            childConditionals.push(...collectLoopChildConditionals(child, ctx, n.param))
          }
        }

        loops.push({
          array: n.array,
          param: n.param,
          index: n.index,
          key: n.key,
          template: childTemplate,
          containerSlotId: containerSlot,
          mapPreamble: n.mapPreamble ?? null,
          nestedComponents: useElementReconciliation ? n.nestedComponents : undefined,
          childEvents,
          childReactiveTexts: useElementReconciliation ? childReactiveTexts : undefined,
          childReactiveAttrs: useElementReconciliation ? childReactiveAttrs : undefined,
          childConditionals: useElementReconciliation ? childConditionals : undefined,
          innerLoops: useElementReconciliation ? collectInnerLoops(n.children, n.param) : undefined,
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
function buildConditionalMetadata(node: IRNode & { type: 'conditional' }, ctx: ClientJsContext): ConditionalElement {
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
    whenTrueLoops: collectBranchLoops(node.whenTrue, ctx),
    whenFalseLoops: collectBranchLoops(node.whenFalse, ctx),
    whenTrueConditionals: collectBranchConditionals(node.whenTrue, ctx),
    whenFalseConditionals: collectBranchConditionals(node.whenFalse, ctx),
  }
}

/**
 * Collect nested reactive conditionals from a branch for emission inside bindEvents.
 * Finds reactive conditional nodes within a branch subtree (not recursing into loops).
 */
function collectBranchConditionals(node: IRNode, ctx: ClientJsContext): ConditionalElement[] {
  const result: ConditionalElement[] = []

  function walk(n: IRNode): void {
    switch (n.type) {
      case 'conditional':
        if (n.reactive && n.slotId) {
          result.push(buildConditionalMetadata(n, ctx))
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
