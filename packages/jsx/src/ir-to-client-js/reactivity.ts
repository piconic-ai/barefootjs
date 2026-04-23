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
  NestedLoop,
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
/**
 * Decision about whether an expression should be wrapped in `createEffect`
 * for client-side reactivity. The `reason` field surfaces *why* the wrap
 * was chosen (proven reactive vs Solid-style fallback) so the wrap-by-default
 * gates (#937 / #939–#943) stay debuggable rather than collapsing into a
 * single boolean.
 */
export type WrapDecision =
  | { wrap: false }
  | { wrap: true; reason: WrapReason }

export type WrapReason =
  /** Phase 1 analyzer proved the expression reads a signal/memo/prop. */
  | 'proven-reactive'
  /** Expression contains a call that looks like a signal getter / memo (AST flag). */
  | 'fallback-getter-calls'
  /** Expression contains an arbitrary `identifier()` call (AST flag — Solid-style fallback). */
  | 'fallback-function-calls'
  /** String-level `needsEffectWrapper` matched (signal getter / memo / prop name in expanded value). */
  | 'string-reactive'
  /** Expanded child-component prop value contains a `props.xxx` reference. */
  | 'props-access'

/**
 * AST-flag based wrap decision for IRExpression / IRConditional / nested
 * IRConditional nodes. Replaces the duplicated
 * `node.reactive || node.callsReactiveGetters || node.hasFunctionCalls`
 * predicate (#937 / #941). Pure literals and bare identifiers (no calls)
 * stay un-wrapped because their SSR value is already in the DOM.
 */
export function decideWrapFromAstFlags(node: {
  reactive?: boolean
  callsReactiveGetters?: boolean
  hasFunctionCalls?: boolean
}): WrapDecision {
  if (node.reactive) return { wrap: true, reason: 'proven-reactive' }
  if (node.callsReactiveGetters) return { wrap: true, reason: 'fallback-getter-calls' }
  if (node.hasFunctionCalls) return { wrap: true, reason: 'fallback-function-calls' }
  return { wrap: false }
}

/**
 * Wrap decision for native-element reactive attributes (#940). Combines the
 * string-level `needsEffectWrapper` check (recognises signal getters / memos /
 * prop names inside expanded local-const references) with the AST flags from
 * the source attribute expression.
 */
export function decideWrapForAttr(
  expandedValue: string,
  ctx: ClientJsContext,
  attr: { callsReactiveGetters?: boolean; hasFunctionCalls?: boolean },
): WrapDecision {
  if (needsEffectWrapper(expandedValue, ctx)) return { wrap: true, reason: 'string-reactive' }
  if (attr.callsReactiveGetters) return { wrap: true, reason: 'fallback-getter-calls' }
  if (attr.hasFunctionCalls) return { wrap: true, reason: 'fallback-function-calls' }
  return { wrap: false }
}

/**
 * Wrap decision for child-component reactive props (#942). Adds a `props.xxx`
 * substring check on top of the attr decision: when the parent's prop is
 * forwarded into a child component, the child needs to re-read it through
 * createEffect so parent re-renders propagate.
 */
export function decideWrapForChildProp(
  expandedValue: string,
  ctx: ClientJsContext,
  prop: { callsReactiveGetters?: boolean; hasFunctionCalls?: boolean },
): WrapDecision {
  if (expandedValue.includes('props.')) return { wrap: true, reason: 'props-access' }
  return decideWrapForAttr(expandedValue, ctx, prop)
}

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

  // Fallback: detect props.xxx pattern directly when propsObjectName is known.
  // Catches cases where extractPropsFromType couldn't resolve inherited props
  // (e.g., CheckboxProps extends ButtonHTMLAttributes → 'disabled' not in propsParams).
  if (ctx.propsObjectName) {
    const propsAccess = new RegExp(`\\b${ctx.propsObjectName}\\.(?!children\\b)\\w+`)
    if (propsAccess.test(expr)) return true
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
    case 'async':
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
    case 'async':
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
 * Recursively descends into nested IRLoop nodes, building NestedLoop
 * for multi-level event delegation (data-key-N resolution).
 */
export function collectLoopChildEventsWithNesting(
  node: IRNode,
  nestingStack: NestedLoop[] = [],
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
          kind: 'nested',
          depth: nestingStack.length + 1,
          array: n.array,
          param: n.param,
          key: n.key,
          containerSlotId: lastElementSlotId,
        })
        for (const child of n.children) walk(child, domDepth)
        nestingStack.pop()
        break
      case 'fragment':
      case 'component':
      case 'provider':
      case 'async':
        for (const child of n.children) walk(child, domDepth)
        break
      case 'conditional':
        // Reactive conditionals (slotId set) are managed by insert() + bindEvents.
        // Their events are collected into LoopChildConditional.whenTrue/FalseEvents
        // and emitted inside bindEvents — not via delegation (#839).
        if (!n.slotId) {
          walk(n.whenTrue, domDepth)
          walk(n.whenFalse, domDepth)
        }
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
 *
 * @param node - The root IR node to traverse.
 * @param skipConditionals - When true, do not descend into nested `conditional`
 *   branches. Used when the caller collects those conditionals separately
 *   (e.g., inner-loop direct children vs. `childConditionals`), avoiding the
 *   double-initialization bug where the same component is emitted by both the
 *   outer path and the `insert()` bindEvents path (#929).
 */
export function collectConditionalBranchChildComponents(
  node: IRNode,
  skipConditionals = false,
): Array<{ name: string; slotId: string | null; props: IRProp[]; children: IRNode[] }> {
  const components: Array<{ name: string; slotId: string | null; props: IRProp[]; children: IRNode[] }> = []
  traverseForComponents(node, components, skipConditionals)
  return components
}

function traverseForComponents(
  node: IRNode,
  components: Array<{ name: string; slotId: string | null; props: IRProp[]; children: IRNode[] }>,
  skipConditionals = false,
): void {
  switch (node.type) {
    case 'element':
    case 'fragment':
    case 'provider':
    case 'async':
      for (const child of node.children) {
        traverseForComponents(child, components, skipConditionals)
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
        traverseForComponents(child, components, skipConditionals)
      }
      break
    case 'conditional':
      if (skipConditionals) return
      traverseForComponents(node.whenTrue, components, skipConditionals)
      traverseForComponents(node.whenFalse, components, skipConditionals)
      break
    case 'if-statement':
      if (skipConditionals) return
      traverseForComponents(node.consequent, components, skipConditionals)
      if (node.alternate) {
        traverseForComponents(node.alternate, components, skipConditionals)
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

  function walk(n: IRNode, insideConditional = false): void {
    if (n.type === 'expression' && n.slotId) {
      const expanded = expandConstantForReactivity(n.expr, ctx)
      // Include if expression reads signals OR references the loop parameter
      // (loop param becomes a signal accessor via per-item signals)
      const isReactive = needsEffectWrapper(expanded, ctx)
      const refsLoopParam = loopParam ? exprReferencesIdent(expanded, loopParam) : false
      if (isReactive || refsLoopParam) {
        texts.push({ slotId: n.slotId, expression: expanded, insideConditional: insideConditional || undefined })
      }
    }
    if (n.type === 'element') {
      for (const child of n.children) walk(child, insideConditional)
    }
    if (n.type === 'fragment' || n.type === 'component' || n.type === 'provider') {
      for (const child of n.children) walk(child, insideConditional)
    }
    if (n.type === 'conditional') {
      walk(n.whenTrue, true)
      walk(n.whenFalse, true)
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
  siblingOffsets: Map<import('../types').IRLoop, number>,
  loopParam?: string,
): LoopChildConditional[] {
  const conditionals: LoopChildConditional[] = []
  const { irToHtmlTemplate } = require('./html-template')
  // Lazy require avoids the collect-elements.ts ↔ reactivity.ts import
  // cycle; same pattern as irToHtmlTemplate / irToPlaceholderTemplate above.
  const { collectInnerLoops, branchInnerLoopOptions } = require('./collect-elements')

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
        const trueInner = collectInnerLoops([n.whenTrue], siblingOffsets, loopParam, ctx, branchInnerLoopOptions)
        const falseInner = collectInnerLoops([n.whenFalse], siblingOffsets, loopParam, ctx, branchInnerLoopOptions)
        conditionals.push({
          slotId: n.slotId,
          condition: expanded,
          whenTrueHtml,
          whenFalseHtml,
          whenTrueComponents: collectConditionalBranchChildComponents(n.whenTrue),
          whenFalseComponents: collectConditionalBranchChildComponents(n.whenFalse),
          whenTrueInnerLoops: trueInner.length > 0 ? trueInner : undefined,
          whenFalseInnerLoops: falseInner.length > 0 ? falseInner : undefined,
          whenTrueConditionals: collectLoopChildConditionals(n.whenTrue, ctx, siblingOffsets, loopParam),
          whenFalseConditionals: collectLoopChildConditionals(n.whenFalse, ctx, siblingOffsets, loopParam),
          whenTrueEvents: collectConditionalBranchEvents(n.whenTrue),
          whenFalseEvents: collectConditionalBranchEvents(n.whenFalse),
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
