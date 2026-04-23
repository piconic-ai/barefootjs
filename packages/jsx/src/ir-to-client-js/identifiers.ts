/**
 * Used identifier extraction and keyword filtering.
 */

import type { IRNode, IRLoopChildComponent } from '../types'
import { attrValueToString } from './utils'
import type { ClientJsContext } from './types'
import { walkIR } from './walker'

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
    for (const event of elem.whenTrue.events) {
      extractIdentifiers(event.handler, used)
    }
    for (const event of elem.whenFalse.events) {
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
    for (const ref of elem.whenTrue.refs) {
      extractIdentifiers(ref.callback, used)
    }
    for (const ref of elem.whenFalse.refs) {
      extractIdentifiers(ref.callback, used)
    }
  }

  for (const elem of ctx.clientOnlyConditionals) {
    for (const ref of elem.whenTrue.refs) {
      extractIdentifiers(ref.callback, used)
    }
    for (const ref of elem.whenFalse.refs) {
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
  walkIR(node, null, {
    element: ({ node: el, descend }) => {
      for (const attr of el.attrs) {
        if (attr.dynamic && attr.value) {
          const v = typeof attr.value === 'string' ? attr.value : attrValueToString(attr.value)
          if (v) extractIdentifiers(v, set)
        }
      }
      for (const event of el.events) extractIdentifiers(event.handler, set)
      descend()
    },
    component: ({ node: c, descend, descendJsxChildren }) => {
      for (const prop of c.props) {
        if (prop.dynamic) extractIdentifiers(prop.value, set)
      }
      descend()
      descendJsxChildren()
    },
    expression: ({ node: ex }) => {
      extractIdentifiers(ex.expr, set)
    },
    conditional: ({ node: c, descend }) => {
      extractIdentifiers(c.condition, set)
      descend()
    },
    ifStatement: ({ node: i, descend }) => {
      extractIdentifiers(i.condition, set)
      for (const sv of i.scopeVariables) extractIdentifiers(sv.initializer, set)
      descend()
    },
    loop: ({ node: l, descend }) => {
      extractIdentifiers(l.array, set)
      if (l.filterPredicate) extractIdentifiers(l.filterPredicate.raw, set)
      if (l.sortComparator) extractIdentifiers(l.sortComparator.raw, set)
      if (l.mapPreamble) extractIdentifiers(l.mapPreamble, set)
      descend()
      if (l.childComponent) collectIdentifiersFromChildComponent(l.childComponent, set)
      if (l.nestedComponents) {
        for (const comp of l.nestedComponents) collectIdentifiersFromChildComponent(comp, set)
      }
    },
    provider: ({ node: p, descend }) => {
      extractIdentifiers(p.contextName, set)
      if (p.valueProp.dynamic) extractIdentifiers(p.valueProp.value, set)
      descend()
    },
    // fragment / async use the walker's default auto-descent; slot is a leaf.
  })
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
  walkIR(node, null, {
    loop: ({ node: l }) => {
      // Found a loop — walk its ENTIRE subtree deeply via the identifier-extraction pass.
      collectIdentifiersFromIRTree(l, set)
    },
    component: ({ descend, descendJsxChildren }) => {
      descend()
      descendJsxChildren()
    },
    // element / fragment / conditional / if-statement / provider / async rely
    // on walkIR's default descent until they hit a loop subtree.
  })
}
