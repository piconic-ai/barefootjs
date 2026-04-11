/**
 * Reactivity detection: reactive expression checking, event/ref collection.
 */

import { type IRNode, type IRElement, type IRProp, pickAttrMeta } from '../types'
import type {
  ClientJsContext,
  ConditionalBranchEvent,
  ConditionalBranchRef,
  LoopChildEvent,
  LoopChildReactiveAttr,
  LoopChildReactiveText,
  LoopChildConditional,
  NestedLoopInfo,
} from './types'
import { attrValueToString, exprReferencesIdent } from './utils'
import { expandConstantForReactivity } from './prop-handling'

/**
 * Phase 2 reactivity detection: determines if a code expression needs `createEffect`
 * wrapping during IR → Client JS generation.
 *
 * This operates on string expressions (already extracted from IR), using regex matching
 * against known signal getters, memo names, and prop parameter names.
 *
 * Unlike Phase 1's `isReactiveExpression` (in jsx-to-ir.ts), this function:
 * - Has NO access to TypeChecker or AST — works purely on expression strings
 * - Does NOT follow local constants (constant taint analysis is Phase 1's job)
 * - Skips `children` props because children are server-rendered and should not
 *   trigger `createEffect` wrapping on the client
 */
export function needsEffectWrapper(expr: string, ctx: ClientJsContext): boolean {
  for (const signal of ctx.signals) {
    if (new RegExp(`\\b${signal.getter}\\s*\\(`).test(expr)) {
      return true
    }
  }

  for (const memo of ctx.memos) {
    if (new RegExp(`\\b${memo.name}\\s*\\(`).test(expr)) {
      return true
    }
  }

  // Check individual prop names (excluding children which is server-rendered
  // and should not trigger effect wrapping on the client)
  for (const prop of ctx.propsParams) {
    if (prop.name === 'children') continue
    if (exprReferencesIdent(expr, prop.name)) {
      return true
    }
  }

  return false
}

/**
 * Recursively collect all event handler expressions from an IR node tree.
 * Used to extract function identifiers from loop children.
 */
export function collectEventHandlersFromIR(node: IRNode): string[] {
  const handlers: string[] = []

  switch (node.type) {
    case 'element':
      for (const event of node.events) {
        handlers.push(event.handler)
      }
      for (const child of node.children) {
        handlers.push(...collectEventHandlersFromIR(child))
      }
      break
    case 'fragment':
      for (const child of node.children) {
        handlers.push(...collectEventHandlersFromIR(child))
      }
      break
    case 'conditional':
      handlers.push(...collectEventHandlersFromIR(node.whenTrue))
      handlers.push(...collectEventHandlersFromIR(node.whenFalse))
      break
    case 'component':
      for (const prop of node.props) {
        if (prop.name.startsWith('on') && prop.name.length > 2) {
          handlers.push(prop.value)
        }
      }
      for (const child of node.children) {
        handlers.push(...collectEventHandlersFromIR(child))
      }
      break
    case 'if-statement':
      handlers.push(...collectEventHandlersFromIR(node.consequent))
      if (node.alternate) {
        handlers.push(...collectEventHandlersFromIR(node.alternate))
      }
      break
    case 'provider':
      for (const child of node.children) {
        handlers.push(...collectEventHandlersFromIR(child))
      }
      break
    case 'loop':
      for (const child of node.children) {
        handlers.push(...collectEventHandlersFromIR(child))
      }
      break
  }

  return handlers
}

/**
 * Traverse an IR tree depth-first, calling visitor for each element node.
 * Shared by collectConditionalBranchEvents, collectConditionalBranchRefs,
 * and collectLoopChildEvents to avoid duplicating the traversal logic.
 */
function traverseElements(node: IRNode, visitor: (el: IRElement, domDepth: number) => void, domDepth = 0): void {
  switch (node.type) {
    case 'element':
      visitor(node, domDepth)
      for (const child of node.children) {
        traverseElements(child, visitor, domDepth + 1)
      }
      break
    case 'fragment':
    case 'component':
    case 'provider':
      for (const child of node.children) {
        traverseElements(child, visitor, domDepth)
      }
      break
    case 'conditional':
      traverseElements(node.whenTrue, visitor, domDepth)
      traverseElements(node.whenFalse, visitor, domDepth)
      break
    case 'if-statement':
      traverseElements(node.consequent, visitor, domDepth)
      if (node.alternate) {
        traverseElements(node.alternate, visitor, domDepth)
      }
      break
    // Note: 'loop' case is intentionally omitted. Nested .map() event delegation
    // requires a different approach (nested data-key lookup + inner loop variable
    // resolution) that isn't implemented yet. See memory: compiler-reconcile-templates-events.md
  }
}

/**
 * Collect events from a conditional branch for use with insert().
 * These events will be bound via the branch's bindEvents function.
 */
export function collectConditionalBranchEvents(node: IRNode): ConditionalBranchEvent[] {
  const events: ConditionalBranchEvent[] = []
  traverseElements(node, (el) => {
    if (el.slotId && el.events.length > 0) {
      for (const event of el.events) {
        events.push({
          slotId: el.slotId,
          eventName: event.name,
          handler: event.handler,
        })
      }
    }
  })
  return events
}

/**
 * Collect refs from a conditional branch for use with insert().
 * These refs will be called via the branch's bindEvents function.
 */
export function collectConditionalBranchRefs(node: IRNode): ConditionalBranchRef[] {
  const refs: ConditionalBranchRef[] = []
  traverseElements(node, (el) => {
    if (el.slotId && el.ref) {
      refs.push({
        slotId: el.slotId,
        callback: el.ref,
      })
    }
  })
  return refs
}

/**
 * Collect detailed event info from loop children for event delegation.
 */
export function collectLoopChildEvents(node: IRNode): LoopChildEvent[] {
  const events: LoopChildEvent[] = []
  traverseElements(node, (el, domDepth) => {
    if (el.slotId) {
      for (const event of el.events) {
        events.push({
          eventName: event.name,
          childSlotId: el.slotId,
          handler: event.handler,
          nestedLoops: [],
          domDepth,
        })
      }
    }
  })
  return events
}

/**
 * Collect events from loop children INCLUDING nested inner loops.
 * Recursively descends into nested IRLoop nodes, building NestedLoopInfo
 * for multi-level event delegation (data-key-N resolution).
 */
export function collectLoopChildEventsWithNesting(
  node: IRNode,
  nestingStack: NestedLoopInfo[] = [],
): LoopChildEvent[] {
  const events: LoopChildEvent[] = []

  let lastElementSlotId: string | null = null

  function walk(n: IRNode, domDepth = 0): void {
    switch (n.type) {
      case 'element': {
        const prevSlotId = lastElementSlotId
        if (n.slotId) lastElementSlotId = n.slotId
        if (n.slotId) {
          for (const event of n.events) {
            events.push({
              eventName: event.name,
              childSlotId: n.slotId,
              handler: event.handler,
              nestedLoops: [...nestingStack],
              domDepth,
            })
          }
        }
        for (const child of n.children) walk(child, domDepth + 1)
        lastElementSlotId = prevSlotId
        break
      }
      case 'loop':
        // Enter nested loop — push nesting info with container element's slotId
        nestingStack.push({
          depth: nestingStack.length + 1,
          array: n.array,
          param: n.param,
          key: n.key ?? '',
          containerSlotId: lastElementSlotId,
        })
        for (const child of n.children) walk(child, domDepth)
        nestingStack.pop()
        break
      case 'fragment':
      case 'component':
      case 'provider':
        for (const child of n.children) walk(child, domDepth)
        break
      case 'conditional':
        walk(n.whenTrue, domDepth)
        walk(n.whenFalse, domDepth)
        break
      case 'if-statement':
        walk(n.consequent, domDepth)
        if (n.alternate) walk(n.alternate, domDepth)
        break
    }
  }

  walk(node)
  return events
}

/**
 * Collect child component nodes from a conditional branch for use with insert().
 * These components will be re-initialized via initChild() in the branch's bindEvents callback.
 */
export function collectConditionalBranchChildComponents(
  node: IRNode,
): Array<{ name: string; slotId: string | null; props: IRProp[]; children: IRNode[] }> {
  const components: Array<{ name: string; slotId: string | null; props: IRProp[]; children: IRNode[] }> = []
  traverseForComponents(node, components)
  return components
}

function traverseForComponents(
  node: IRNode,
  components: Array<{ name: string; slotId: string | null; props: IRProp[]; children: IRNode[] }>,
): void {
  switch (node.type) {
    case 'element':
    case 'fragment':
    case 'provider':
      for (const child of node.children) {
        traverseForComponents(child, components)
      }
      break
    case 'component':
      components.push({
        name: node.name,
        slotId: node.slotId,
        props: node.props,
        children: node.children,
      })
      // Recurse into JSX children passed to this component
      for (const child of node.children) {
        traverseForComponents(child, components)
      }
      break
    case 'conditional':
      traverseForComponents(node.whenTrue, components)
      traverseForComponents(node.whenFalse, components)
      break
    case 'if-statement':
      traverseForComponents(node.consequent, components)
      if (node.alternate) {
        traverseForComponents(node.alternate, components)
      }
      break
  }
}

/**
 * Collect reactive text interpolations from loop children.
 * Includes expressions that read signals OR reference the loop parameter.
 * With per-item signals, loop param access (item().text) is reactive
 * because item is a signal accessor.
 */
export function collectLoopChildReactiveTexts(
  node: IRNode,
  ctx: ClientJsContext,
  loopParam?: string,
): LoopChildReactiveText[] {
  const texts: LoopChildReactiveText[] = []

  function walk(n: IRNode): void {
    if (n.type === 'expression' && n.slotId) {
      const expanded = expandConstantForReactivity(n.expr, ctx)
      // Include if expression reads signals OR references the loop parameter
      // (loop param becomes a signal accessor via per-item signals)
      const isReactive = needsEffectWrapper(expanded, ctx)
      const refsLoopParam = loopParam ? exprReferencesIdent(expanded, loopParam) : false
      if (isReactive || refsLoopParam) {
        texts.push({ slotId: n.slotId, expression: expanded })
      }
    }
    if (n.type === 'element') {
      for (const child of n.children) walk(child)
    }
    if (n.type === 'fragment' || n.type === 'component' || n.type === 'provider') {
      for (const child of n.children) walk(child)
    }
    if (n.type === 'conditional') {
      walk(n.whenTrue)
      walk(n.whenFalse)
    }
  }

  walk(node)
  return texts
}

/**
 * Collect reactive conditionals from loop children.
 * These are conditional nodes with a slotId that have reactive conditions,
 * needing insert() calls for fine-grained conditional switching.
 */
export function collectLoopChildConditionals(
  node: IRNode,
  ctx: ClientJsContext,
  loopParam?: string,
): LoopChildConditional[] {
  const conditionals: LoopChildConditional[] = []
  const { irToHtmlTemplate } = require('./html-template')

  function walk(n: IRNode): void {
    if (n.type === 'conditional' && n.slotId) {
      // Include conditionals that are reactive OR reference the loop param
      const isReactive = n.reactive
      const refsLoopParam = loopParam ? exprReferencesIdent(n.condition, loopParam) : false
      if (!isReactive && !refsLoopParam) return
      const expanded = expandConstantForReactivity(n.condition, ctx)
      // Loop-param conditionals are reactive via per-item signal accessors;
      // needsEffectWrapper only knows about signals/memos/props, not loop params.
      if (!refsLoopParam && !needsEffectWrapper(expanded, ctx)) return
      {
        const loopParamsForCond = loopParam ? [loopParam] : undefined
        const whenTrueHtml = irToHtmlTemplate(n.whenTrue, undefined, 0, loopParamsForCond)
        const whenFalseHtml = irToHtmlTemplate(n.whenFalse, undefined, 0, loopParamsForCond)
        conditionals.push({
          slotId: n.slotId,
          condition: expanded,
          whenTrueHtml,
          whenFalseHtml,
          whenTrueComponents: collectConditionalBranchChildComponents(n.whenTrue),
          whenFalseComponents: collectConditionalBranchChildComponents(n.whenFalse),
          whenTrueInnerLoops: collectBranchInnerLoops(n.whenTrue, loopParam, ctx),
          whenFalseInnerLoops: collectBranchInnerLoops(n.whenFalse, loopParam, ctx),
        })
      }
      // Don't recurse into conditional branches — nested conditionals
      // inside branches will be handled by insert()'s own bindEvents
      return
    }
    if (n.type === 'element') {
      for (const child of n.children) walk(child)
    }
    if (n.type === 'fragment' || n.type === 'component' || n.type === 'provider') {
      for (const child of n.children) walk(child)
    }
    // Don't recurse into nested loops — they have their own mapArray
  }

  walk(node)
  return conditionals
}

/**
 * Collect inner loop info from a conditional branch IR node.
 * Used to set up mapArray inside insert() bindEvents for loops
 * that are inside conditional branches of loop items.
 */
function collectBranchInnerLoops(
  node: IRNode,
  outerLoopParam?: string,
  ctx?: ClientJsContext,
): LoopChildConditional['whenTrueInnerLoops'] {
  const { irToPlaceholderTemplate } = require('./html-template')
  const loops: import('./types').NestedLoopInfo[] = []
  let lastSlotId: string | null = null

  function walk(n: IRNode): void {
    if (n.type === 'element') {
      if (n.slotId) lastSlotId = n.slotId
      for (const child of n.children) walk(child)
    } else if (n.type === 'loop') {
      const loopParamsForTemplate = outerLoopParam ? [outerLoopParam, n.param] : undefined
      const itemTemplate = n.children.map((c: IRNode) => irToPlaceholderTemplate(c, undefined, 1, loopParamsForTemplate)).join('')
      const refsOuter = outerLoopParam
        ? new RegExp(`\\b${outerLoopParam}\\b`).test(n.array)
        : false
      const reactiveTexts: Array<{ slotId: string; expression: string }> = []
      if (refsOuter && ctx) {
        for (const child of n.children) {
          reactiveTexts.push(...collectLoopChildReactiveTexts(child, ctx, n.param))
        }
      }
      // Collect child components and events inside inner loop items
      // Walk loop body children (not the loop node itself, which traverseForComponents skips)
      const rawComps: Array<{ name: string; slotId: string | null; props: import('../types').IRProp[] }> = []
      for (const child of n.children) {
        rawComps.push(...collectConditionalBranchChildComponents(child))
      }
      const childComponents = rawComps.map(c => ({
        name: c.name,
        slotId: c.slotId,
        props: c.props.map(p => ({
          name: p.name,
          value: p.value,
          dynamic: p.dynamic ?? false,
          isLiteral: p.isLiteral ?? false,
          isEventHandler: p.name.startsWith('on') && p.name.length > 2 && p.name[2] === p.name[2].toUpperCase(),
        })),
        children: [] as import('../types').IRNode[],
        loopDepth: 1,
      }))
      const childEvents: import('./types').LoopChildEvent[] = []
      for (const child of n.children) {
        childEvents.push(...collectLoopChildEventsWithNesting(child))
      }
      loops.push({
        depth: 1,
        array: n.array,
        param: n.param,
        key: n.key ?? '',
        containerSlotId: lastSlotId,
        itemTemplate,
        refsOuterParam: refsOuter,
        reactiveTexts: reactiveTexts.length > 0 ? reactiveTexts : undefined,
        childComponents: childComponents.length > 0 ? childComponents : undefined,
        childEvents: childEvents.length > 0 ? childEvents : undefined,
      })
    } else if (n.type === 'fragment' || n.type === 'component' || n.type === 'provider') {
      for (const child of n.children) walk(child)
    }
  }

  walk(node)
  return loops.length > 0 ? loops : undefined
}

/**
 * Collect reactive attributes from loop children.
 * These are dynamic attributes that read signals and need createEffect
 * to update the DOM when signals change.
 */
export function collectLoopChildReactiveAttrs(
  node: IRNode,
  ctx: ClientJsContext,
  loopParam?: string,
): LoopChildReactiveAttr[] {
  const attrs: LoopChildReactiveAttr[] = []
  traverseElements(node, (el) => {
    if (el.slotId) {
      for (const attr of el.attrs) {
        if (attr.name === '...' || !attr.dynamic || !attr.value) continue
        const valueStr = attrValueToString(attr.value)
        if (!valueStr) continue
        const expanded = expandConstantForReactivity(valueStr, ctx)
        const isReactive = needsEffectWrapper(expanded, ctx)
        const refsLoopParam = loopParam ? exprReferencesIdent(expanded, loopParam) : false
        if (isReactive || refsLoopParam) {
          attrs.push({
            childSlotId: el.slotId,
            attrName: attr.name,
            expression: expanded,
            ...pickAttrMeta(attr),
          })
        }
      }
    }
  })
  return attrs
}
