/**
 * Pure helper functions for client JS generation.
 * No dependencies on ClientJsContext or other internal modules.
 */

import type { IRTemplateLiteral } from '../types'
import type { LoopElement } from './types'

/**
 * Parameter name for the props object in generated init/template functions.
 * Short name to minimize client JS bundle size.
 */
export const PROPS_PARAM = '_p'

/**
 * HTML attribute constants for compiler-generated code.
 * These are the same values as the runtime constants in packages/dom/src/attrs.ts
 * (BF_KEY, BF_KEY_PREFIX, BF_PLACEHOLDER). Duplicated here because the compiler
 * package cannot depend on the runtime package.
 *
 * @see packages/dom/src/attrs.ts — runtime-side definitions
 */
export const DATA_KEY = 'data-key'
export const DATA_KEY_PREFIX = 'data-key-'
export const DATA_BF_PH = 'data-bf-ph'

/**
 * Loop boundary comment markers.
 * @see packages/dom/src/attrs.ts — BF_LOOP_START, BF_LOOP_END (runtime-side mirror)
 */
export const BF_LOOP_START = 'bf-loop'
export const BF_LOOP_END = '/bf-loop'

/**
 * Get the data-key attribute name for a given loop depth.
 * Outer loop (depth 0): 'data-key'
 * Nested loops (depth N): 'data-key-N'
 */
export function keyAttrName(loopDepth: number): string {
  return loopDepth > 0 ? `${DATA_KEY_PREFIX}${loopDepth}` : DATA_KEY
}

/**
 * Strip ^ prefix from slot ID for use as JavaScript variable name.
 * `^s3` → `s3` (since `_^s3` is not a valid identifier)
 */
export function varSlotId(slotId: string): string {
  return slotId.startsWith('^') ? slotId.slice(1) : slotId
}

/**
 * Convert an attribute value to a string expression.
 * Handles both string values and IRTemplateLiteral.
 */
export function attrValueToString(value: string | IRTemplateLiteral | null): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value

  let result = '`'
  for (const part of value.parts) {
    if (part.type === 'string') {
      result += part.value
    } else if (part.type === 'ternary') {
      result += `\${${part.condition} ? '${part.whenTrue}' : '${part.whenFalse}'}`
    }
  }
  result += '`'
  return result
}

/**
 * Build the chained array expression for reconcileList.
 * Chains .toSorted() and .filter() in the correct order based on chainOrder.
 * Always uses .toSorted() (non-mutating) regardless of source method.
 */
export function buildChainedArrayExpr(elem: LoopElement): string {
  const sortExpr = elem.sortComparator
    ? `.toSorted((${elem.sortComparator.paramA}, ${elem.sortComparator.paramB}) => ${elem.sortComparator.raw})`
    : ''
  const filterExpr = elem.filterPredicate
    ? `.filter(${elem.filterPredicate.param} => ${elem.filterPredicate.raw})`
    : ''

  if (!sortExpr && !filterExpr) return elem.array

  if (elem.chainOrder === 'filter-sort') {
    return `${elem.array}${filterExpr}${sortExpr}`
  }
  return `${elem.array}${sortExpr}${filterExpr}`
}

/**
 * Map of JSX event names to DOM event property names.
 * JSX uses React-style naming (e.g., onDoubleClick) which gets converted to
 * lowercase (doubleclick), but some DOM events have different names (dblclick).
 */
export const jsxToDomEventMap: Record<string, string> = {
  doubleclick: 'dblclick',
}

/**
 * Convert JSX-derived event name to DOM event name for addEventListener.
 * Example: 'doubleclick' → 'dblclick'
 */
export function toDomEventName(eventName: string): string {
  return jsxToDomEventMap[eventName] ?? eventName
}

/**
 * Quote a prop name if it is not a valid JS identifier.
 * Returns the name as-is for valid identifiers (e.g., "checked"),
 * or JSON-quoted for names with hyphens etc. (e.g., '"aria-label"').
 */
export function quotePropName(name: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
    return name
  }
  return JSON.stringify(name)
}

/**
 * Convert JSX attribute name to HTML attribute name.
 * Handles React-style naming conventions (e.g., className → class).
 */
export function toHtmlAttrName(jsxAttrName: string): string {
  if (jsxAttrName === 'className') return 'class'
  return jsxAttrName
}

/**
 * Wrap arrow function handler in block to prevent accidental return false.
 * Returning false from a DOM event handler prevents default behavior.
 *
 * Example:
 *   Input:  (e) => e.key === 'Enter' && handleAdd()
 *   Output: (e) => { e.key === 'Enter' && handleAdd() }
 */
export function wrapHandlerInBlock(handler: string): string {
  const trimmed = handler.trim()

  if (trimmed.startsWith('(') && trimmed.includes('=>')) {
    const arrowIndex = trimmed.indexOf('=>')
    const params = trimmed.substring(0, arrowIndex + 2)
    const body = trimmed.substring(arrowIndex + 2).trim()

    if (!body.startsWith('{')) {
      return `${params} { ${body} }`
    }
  }

  return trimmed
}

/** Infer a sensible JS default value literal from a type descriptor. */
export function inferDefaultValue(type: { kind: string; primitive?: string }): string {
  if (type.kind === 'primitive') {
    switch (type.primitive) {
      case 'number':
        return '0'
      case 'boolean':
        return 'false'
      case 'string':
        return "''"
    }
  }
  if (type.kind === 'array') return '[]'
  if (type.kind === 'object') return '{}'
  return 'undefined'
}

/**
 * Check if a function body references any identifiers from the given scope.
 * Used to determine if a module-level function can be emitted outside the
 * component init function, or if it must stay inside due to scope dependencies.
 */
export function bodyReferencesComponentScope(body: string, scopeNames: Set<string>): boolean {
  for (const name of scopeNames) {
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(body)) return true
  }
  return false
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

