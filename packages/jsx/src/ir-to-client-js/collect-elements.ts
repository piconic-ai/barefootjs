/**
 * IR tree traversal → collect elements into ClientJsContext.
 */

import { type IRNode, type IRElement, type IRProp, pickAttrMeta } from '../types'
import type { ClientJsContext, ConditionalBranchChildComponent, ConditionalBranchTextEffect, LoopChildEvent, LoopChildReactiveAttr } from './types'
import { attrValueToString, quotePropName, PROPS_PARAM } from './utils'
import { isReactiveExpression, collectEventHandlersFromIR, collectConditionalBranchEvents, collectConditionalBranchRefs, collectConditionalBranchChildComponents, collectLoopChildEvents, collectLoopChildReactiveAttrs } from './reactivity'
import { irToHtmlTemplate, irChildrenToJsExpr } from './html-template'
import { expandDynamicPropValue, expandConstantForReactivity } from './prop-handling'


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
        const whenTrueEvents = collectConditionalBranchEvents(node.whenTrue)
        const whenFalseEvents = collectConditionalBranchEvents(node.whenFalse)
        const whenTrueRefs = collectConditionalBranchRefs(node.whenTrue)
        const whenFalseRefs = collectConditionalBranchRefs(node.whenFalse)
        const whenTrueChildComponents = buildBranchChildComponents(collectConditionalBranchChildComponents(node.whenTrue), ctx)
        const whenFalseChildComponents = buildBranchChildComponents(collectConditionalBranchChildComponents(node.whenFalse), ctx)
        const restNames = buildRestSpreadNames(ctx)
        ctx.clientOnlyConditionals.push({
          slotId: node.slotId,
          condition: node.condition,
          whenTrueHtml: irToHtmlTemplate(node.whenTrue, restNames),
          whenFalseHtml: irToHtmlTemplate(node.whenFalse, restNames),
          whenTrueEvents,
          whenFalseEvents,
          whenTrueRefs,
          whenFalseRefs,
          whenTrueChildComponents,
          whenFalseChildComponents,
          whenTrueTextEffects: collectBranchTextEffects(node.whenTrue),
          whenFalseTextEffects: collectBranchTextEffects(node.whenFalse),
        })
      } else if (node.reactive && node.slotId) {
        const whenTrueEvents = collectConditionalBranchEvents(node.whenTrue)
        const whenFalseEvents = collectConditionalBranchEvents(node.whenFalse)
        const whenTrueRefs = collectConditionalBranchRefs(node.whenTrue)
        const whenFalseRefs = collectConditionalBranchRefs(node.whenFalse)
        const whenTrueChildComponents = buildBranchChildComponents(collectConditionalBranchChildComponents(node.whenTrue), ctx)
        const whenFalseChildComponents = buildBranchChildComponents(collectConditionalBranchChildComponents(node.whenFalse), ctx)
        const whenTrueTextEffects = collectBranchTextEffects(node.whenTrue)
        const whenFalseTextEffects = collectBranchTextEffects(node.whenFalse)

        const restNames = buildRestSpreadNames(ctx)
        ctx.conditionalElements.push({
          slotId: node.slotId,
          condition: node.condition,
          whenTrueHtml: irToHtmlTemplate(node.whenTrue, restNames),
          whenFalseHtml: irToHtmlTemplate(node.whenFalse, restNames),
          whenTrueEvents,
          whenFalseEvents,
          whenTrueRefs,
          whenFalseRefs,
          whenTrueChildComponents,
          whenFalseChildComponents,
          whenTrueTextEffects,
          whenFalseTextEffects,
        })
      }
      // Recurse into conditional branches with insideConditional = true
      // This is still needed for dynamic text elements inside conditionals
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
        for (const child of node.children) {
          childHandlers.push(...collectEventHandlersFromIR(child))
          childEvents.push(...collectLoopChildEvents(child))
          childReactiveAttrs.push(...collectLoopChildReactiveAttrs(child, ctx))
        }

        if (node.childComponent) {
          for (const prop of node.childComponent.props) {
            if (prop.isEventHandler) {
              childHandlers.push(prop.value)
            }
          }
        }

        ctx.loopElements.push({
          slotId: node.slotId,
          array: node.array,
          param: node.param,
          index: node.index,
          key: node.key,
          template: node.childComponent ? '' : (node.children[0] ? irToHtmlTemplate(node.children[0], buildRestSpreadNames(ctx)) : ''),
          childEventHandlers: childHandlers,
          childEvents,
          childReactiveAttrs,
          childComponent: node.childComponent,
          nestedComponents: node.nestedComponents,
          isStaticArray: node.isStaticArray,
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
          const hasReactiveExpr = isReactiveExpression(expandedValue, ctx)
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

        if (isReactiveExpression(expandedValueStr, ctx)) {
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
        for (const child of n.children) walk(child)
        break
    }
  }
  walk(node)
  return effects
}
