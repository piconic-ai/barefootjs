/**
 * IR tree traversal → collect elements into ClientJsContext.
 */

import type { IRNode, IRElement } from '../types'
import type { ClientJsContext, LoopChildEvent } from './types'
import { attrValueToString, quotePropName } from './utils'
import { isReactiveExpression, collectEventHandlersFromIR, collectConditionalBranchEvents, collectConditionalBranchRefs, collectLoopChildEvents } from './reactivity'
import { irToHtmlTemplate, irChildrenToJsExpr } from './html-template'
import { expandDynamicPropValue } from './prop-handling'


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
      } else if (node.reactive && node.slotId) {
        ctx.dynamicElements.push({
          slotId: node.slotId,
          expression: node.expr,
          insideConditional,
        })
      }
      break

    case 'conditional':
      if (node.clientOnly && node.slotId) {
        const whenTrueEvents = collectConditionalBranchEvents(node.whenTrue)
        const whenFalseEvents = collectConditionalBranchEvents(node.whenFalse)
        const whenTrueRefs = collectConditionalBranchRefs(node.whenTrue)
        const whenFalseRefs = collectConditionalBranchRefs(node.whenFalse)
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
        })
      } else if (node.reactive && node.slotId) {
        const whenTrueEvents = collectConditionalBranchEvents(node.whenTrue)
        const whenFalseEvents = collectConditionalBranchEvents(node.whenFalse)
        const whenTrueRefs = collectConditionalBranchRefs(node.whenTrue)
        const whenFalseRefs = collectConditionalBranchRefs(node.whenFalse)

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
        for (const child of node.children) {
          childHandlers.push(...collectEventHandlersFromIR(child))
          childEvents.push(...collectLoopChildEvents(child))
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
      // Always use 'props' as the actual source since the init function parameter is always 'props'.
      const spreadProp = node.props.find(p => p.name === '...' || p.name.startsWith('...'))
      const restName = ctx.restPropsName
      const propsObjName = ctx.propsObjectName
      const isKnownSource = spreadProp && (spreadProp.value === restName || spreadProp.value === propsObjName)
      const spreadSource = isKnownSource ? 'props' : null

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
        collectElements(child, ctx)
      }
      // Traverse JSX prop children so events, reactive expressions,
      // and nested components inside JSX props are collected
      for (const prop of node.props) {
        if (prop.jsxChildren) {
          for (const child of prop.jsxChildren) {
            collectElements(child, ctx)
          }
        }
      }
      break

    case 'fragment':
      for (const child of node.children) {
        collectElements(child, ctx)
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
        collectElements(child, ctx)
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
      // Always use 'props' as the source since the init function parameter is always 'props'.
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
            source: 'props',
            excludeKeys,
          })
        }
        continue
      }

      if (attr.dynamic && attr.value) {
        const valueStr = attrValueToString(attr.value)
        if (!valueStr) continue

        if (isReactiveExpression(valueStr, ctx)) {
          ctx.reactiveAttrs.push({
            slotId: element.slotId,
            attrName: attr.name,
            expression: valueStr,
            presenceOrUndefined: attr.presenceOrUndefined,
          })
        }
      }
    }
  }
}
