/**
 * Used identifier extraction and keyword filtering.
 */

import type { IRNode, IRLoopChildComponent } from '../types'
import { attrValueToString } from './utils'
import type { ClientJsContext } from './types'

/** JavaScript keywords and common globals to skip during identifier extraction. */
const KEYWORDS_AND_GLOBALS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'this',
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'new',
  'typeof',
  'instanceof',
  'void',
  'delete',
  'console',
  'window',
  'document',
  'Math',
  'String',
  'Number',
  'Array',
  'Object',
  'Boolean',
  'Date',
  'JSON',
  'Promise',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
])

/**
 * Collect local function names used as event handlers.
 */
export function collectUsedFunctions(ctx: ClientJsContext): Set<string> {
  const used = new Set<string>()

  for (const elem of ctx.interactiveElements) {
    for (const event of elem.events) {
      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(event.handler)) {
        used.add(event.handler)
      }
    }
  }

  return used
}

/**
 * Collect all identifiers used in client-side reactive code.
 * This includes identifiers in event handlers, dynamic expressions,
 * conditionals, loops, signals, memos, effects, refs, and constants.
 */
export function collectUsedIdentifiers(ctx: ClientJsContext): Set<string> {
  const used = new Set<string>()

  for (const elem of ctx.interactiveElements) {
    for (const event of elem.events) {
      extractIdentifiers(event.handler, used)
    }
  }

  for (const elem of ctx.dynamicElements) {
    extractIdentifiers(elem.expression, used)
  }

  for (const elem of ctx.conditionalElements) {
    extractIdentifiers(elem.condition, used)
    extractTemplateIdentifiers(elem.whenTrueHtml, used)
    extractTemplateIdentifiers(elem.whenFalseHtml, used)
  }

  for (const elem of ctx.clientOnlyConditionals) {
    extractIdentifiers(elem.condition, used)
    extractTemplateIdentifiers(elem.whenTrueHtml, used)
    extractTemplateIdentifiers(elem.whenFalseHtml, used)
    for (const event of elem.whenTrueEvents) {
      extractIdentifiers(event.handler, used)
    }
    for (const event of elem.whenFalseEvents) {
      extractIdentifiers(event.handler, used)
    }
  }

  for (const elem of ctx.loopElements) {
    extractIdentifiers(elem.array, used)
    extractTemplateIdentifiers(elem.template, used)
    for (const handler of elem.childEventHandlers) {
      extractIdentifiers(handler, used)
    }
    // Extract from child component props (non-event values like variant={statusMap[x]})
    if (elem.childComponent) {
      for (const prop of elem.childComponent.props) {
        extractIdentifiers(prop.value, used)
      }
    }
    // Extract from nested component props
    if (elem.nestedComponents) {
      for (const comp of elem.nestedComponents) {
        for (const prop of comp.props) {
          extractIdentifiers(prop.value, used)
        }
      }
    }
    // Extract from filter/sort/preamble expressions
    if (elem.filterPredicate) extractIdentifiers(elem.filterPredicate.raw, used)
    if (elem.sortComparator) extractIdentifiers(elem.sortComparator.raw, used)
    if (elem.mapPreamble) extractIdentifiers(elem.mapPreamble, used)
    // Extract from reactive attributes in loop children
    for (const attr of elem.childReactiveAttrs) {
      extractIdentifiers(attr.expression, used)
    }
  }

  for (const signal of ctx.signals) {
    extractIdentifiers(signal.initialValue, used)
  }

  for (const memo of ctx.memos) {
    extractIdentifiers(memo.computation, used)
  }

  for (const effect of ctx.effects) {
    extractIdentifiers(effect.body, used)
  }

  for (const onMount of ctx.onMounts) {
    extractIdentifiers(onMount.body, used)
  }

  for (const elem of ctx.refElements) {
    extractIdentifiers(elem.callback, used)
  }

  for (const elem of ctx.conditionalElements) {
    for (const ref of elem.whenTrueRefs) {
      extractIdentifiers(ref.callback, used)
    }
    for (const ref of elem.whenFalseRefs) {
      extractIdentifiers(ref.callback, used)
    }
  }

  for (const elem of ctx.clientOnlyConditionals) {
    for (const ref of elem.whenTrueRefs) {
      extractIdentifiers(ref.callback, used)
    }
    for (const ref of elem.whenFalseRefs) {
      extractIdentifiers(ref.callback, used)
    }
  }

  for (const fn of ctx.localFunctions) {
    extractIdentifiers(fn.body, used)
  }

  for (const constant of ctx.localConstants) {
    if (constant.value) extractIdentifiers(constant.value, used)
  }

  for (const child of ctx.childInits) {
    extractIdentifiers(child.propsExpr, used)
  }

  for (const attr of ctx.reactiveAttrs) {
    extractIdentifiers(attr.expression, used)
  }

  for (const provider of ctx.providerSetups) {
    extractIdentifiers(provider.contextName, used)
    extractIdentifiers(provider.valueExpr, used)
  }

  return used
}

/**
 * Extract identifiers from an expression string.
 */
export function extractIdentifiers(expr: string, set: Set<string>): void {
  const matches = expr.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g)
  if (matches) {
    for (const id of matches) {
      if (!isKeywordOrGlobal(id)) {
        set.add(id)
      }
    }
  }
}

/**
 * Extract identifiers from template literal expressions.
 * Finds ${...} patterns and extracts identifiers from inside.
 */
export function extractTemplateIdentifiers(template: string, set: Set<string>): void {
  const templatePattern = /\$\{([^}]+)\}/g
  let match
  while ((match = templatePattern.exec(template)) !== null) {
    extractIdentifiers(match[1], set)
  }
}

/**
 * Check if an identifier is a JavaScript keyword or common global.
 */
export function isKeywordOrGlobal(id: string): boolean {
  return KEYWORDS_AND_GLOBALS.has(id)
}

/**
 * Recursively walk an IR tree and extract ALL identifiers from every expression.
 * This is the comprehensive fallback that catches identifiers in ANY context —
 * nested component props, loop children, conditional branches, etc.
 *
 * Unlike the context-specific extraction in collectUsedIdentifiers() which may
 * miss identifiers in new/unexpected locations, this covers the entire tree.
 */
export function collectIdentifiersFromIRTree(node: IRNode, set: Set<string>): void {
  switch (node.type) {
    case 'element':
      for (const attr of node.attrs) {
        if (attr.dynamic && attr.value) {
          const v = typeof attr.value === 'string' ? attr.value : attrValueToString(attr.value)
          if (v) extractIdentifiers(v, set)
        }
      }
      for (const event of node.events) extractIdentifiers(event.handler, set)
      for (const child of node.children) collectIdentifiersFromIRTree(child, set)
      break

    case 'component':
      for (const prop of node.props) {
        if (prop.dynamic) extractIdentifiers(prop.value, set)
        if (prop.jsxChildren) {
          for (const child of prop.jsxChildren) collectIdentifiersFromIRTree(child, set)
        }
      }
      for (const child of node.children) collectIdentifiersFromIRTree(child, set)
      break

    case 'expression':
      extractIdentifiers(node.expr, set)
      break

    case 'conditional':
      extractIdentifiers(node.condition, set)
      collectIdentifiersFromIRTree(node.whenTrue, set)
      collectIdentifiersFromIRTree(node.whenFalse, set)
      break

    case 'if-statement':
      extractIdentifiers(node.condition, set)
      for (const sv of node.scopeVariables) extractIdentifiers(sv.initializer, set)
      collectIdentifiersFromIRTree(node.consequent, set)
      if (node.alternate) collectIdentifiersFromIRTree(node.alternate, set)
      break

    case 'loop':
      extractIdentifiers(node.array, set)
      if (node.filterPredicate) extractIdentifiers(node.filterPredicate.raw, set)
      if (node.sortComparator) extractIdentifiers(node.sortComparator.raw, set)
      if (node.mapPreamble) extractIdentifiers(node.mapPreamble, set)
      for (const child of node.children) collectIdentifiersFromIRTree(child, set)
      if (node.childComponent) collectIdentifiersFromChildComponent(node.childComponent, set)
      if (node.nestedComponents) {
        for (const comp of node.nestedComponents) collectIdentifiersFromChildComponent(comp, set)
      }
      break

    case 'fragment':
      for (const child of node.children) collectIdentifiersFromIRTree(child, set)
      break

    case 'provider':
      extractIdentifiers(node.contextName, set)
      if (node.valueProp.dynamic) extractIdentifiers(node.valueProp.value, set)
      for (const child of node.children) collectIdentifiersFromIRTree(child, set)
      break

    case 'async':
      for (const child of node.children) collectIdentifiersFromIRTree(child, set)
      break

    case 'slot':
      break
  }
}

function collectIdentifiersFromChildComponent(comp: IRLoopChildComponent, set: Set<string>): void {
  for (const prop of comp.props) extractIdentifiers(prop.value, set)
  for (const child of comp.children) collectIdentifiersFromIRTree(child, set)
}

/**
 * Walk the IR tree and extract identifiers ONLY from loop subtrees.
 * Loop children are rendered as client JS (reconcileElements/createComponent)
 * and their nested identifiers must be in usedIdentifiers for constant inclusion.
 *
 * Non-loop contexts are correctly handled by collectUsedIdentifiers() from
 * the flattened ClientJsContext — walking them would break constant inlining.
 */
export function addLoopSubtreeIdentifiers(node: IRNode, set: Set<string>): void {
  switch (node.type) {
    case 'loop':
      // Found a loop — walk its ENTIRE subtree deeply
      collectIdentifiersFromIRTree(node, set)
      break
    case 'element':
    case 'fragment':
      for (const child of node.children) addLoopSubtreeIdentifiers(child, set)
      break
    case 'component':
      for (const child of node.children) addLoopSubtreeIdentifiers(child, set)
      for (const prop of node.props) {
        if (prop.jsxChildren) {
          for (const child of prop.jsxChildren) addLoopSubtreeIdentifiers(child, set)
        }
      }
      break
    case 'conditional':
      addLoopSubtreeIdentifiers(node.whenTrue, set)
      addLoopSubtreeIdentifiers(node.whenFalse, set)
      break
    case 'if-statement':
      addLoopSubtreeIdentifiers(node.consequent, set)
      if (node.alternate) addLoopSubtreeIdentifiers(node.alternate, set)
      break
    case 'provider':
    case 'async':
      for (const child of node.children) addLoopSubtreeIdentifiers(child, set)
      break
  }
}
