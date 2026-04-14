/**
 * Pure helper functions for client JS generation.
 * No dependencies on ClientJsContext or other internal modules.
 */

import type { IRTemplateLiteral } from '../types'
import type { LoopElement } from './types'
import {
  BF_KEY as DATA_KEY,
  BF_KEY_PREFIX as DATA_KEY_PREFIX,
  BF_PLACEHOLDER as DATA_BF_PH,
  BF_LOOP_START,
  BF_LOOP_END,
} from '@barefootjs/shared'

export { DATA_KEY, DATA_KEY_PREFIX, DATA_BF_PH, BF_LOOP_START, BF_LOOP_END }

/**
 * Parameter name for the props object in generated init/template functions.
 * Short name to minimize client JS bundle size.
 */
export const PROPS_PARAM = '_p'

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
export function attrValueToString(value: string | IRTemplateLiteral | null, opts?: { useTemplate?: boolean }): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value

  let result = '`'
  for (const part of value.parts) {
    if (part.type === 'string') {
      result += (opts?.useTemplate && part.templateValue) ? part.templateValue : part.value
    } else if (part.type === 'ternary') {
      const cond = (opts?.useTemplate && part.templateCondition) ? part.templateCondition : part.condition
      result += `\${${cond} ? '${part.whenTrue}' : '${part.whenFalse}'}`
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
    if (exprReferencesIdent(body, name)) return true
  }
  return false
}

/**
 * Check if a JS expression string references a given identifier.
 * Uses word-boundary matching with proper regex escaping.
 */
export function exprReferencesIdent(expr: string, ident: string): boolean {
  return new RegExp(`\\b${escapeRegExp(ident)}\\b`).test(expr)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Transform loop param references to signal accessor calls in an expression.
 * e.g., "item.text" → "item().text", "item" → "item()"
 * Does not double-wrap: "item().text" stays "item().text"
 *
 * String-context aware: skips replacements inside string literals and template
 * literal string parts (e.g., CSS class name "preview-field" stays unchanged
 * when paramName is "field"). Handles arbitrarily nested template literals.
 */
export function wrapLoopParamAsAccessor(expr: string, paramName: string): string {
  const re = new RegExp(`\\b${escapeRegExp(paramName)}\\b(?!\\s*\\()(?!-)`, 'g')
  return _replaceInExprContexts(expr, re, `${paramName}()`)
}

/** Replace `re` with `replacement` only in expression contexts (not in string literals). */
function _replaceInExprContexts(code: string, re: RegExp, replacement: string): string {
  let result = ''
  let i = 0
  let exprStart = 0

  const flushExpr = (end: number) => {
    if (end > exprStart) {
      re.lastIndex = 0
      result += code.slice(exprStart, end).replace(re, replacement)
    }
    exprStart = end
  }

  while (i < code.length) {
    const ch = code[i]
    if (ch === "'" || ch === '"') {
      flushExpr(i)
      i = _skipQuotedString(code, i)
      result += code.slice(exprStart, i)
      exprStart = i
    } else if (ch === '`') {
      flushExpr(i)
      const [tplResult, nextI] = _processTemplateLiteral(code, i, re, replacement)
      result += tplResult
      i = nextI
      exprStart = i
    } else {
      i++
    }
  }
  flushExpr(i)
  return result
}

function _skipQuotedString(code: string, start: number): number {
  const quote = code[start]
  let i = start + 1
  while (i < code.length) {
    if (code[i] === '\\') { i += 2; continue }
    if (code[i] === quote) return i + 1
    i++
  }
  return i
}

/** Process a template literal from the opening backtick. Returns [result, nextIndex]. */
function _processTemplateLiteral(code: string, start: number, re: RegExp, replacement: string): [string, number] {
  let result = '`'
  let i = start + 1
  while (i < code.length) {
    if (code[i] === '\\') {
      result += code[i] + (code[i + 1] ?? '')
      i += 2
    } else if (code[i] === '`') {
      result += '`'
      i++
      return [result, i]
    } else if (code[i] === '$' && code[i + 1] === '{') {
      result += '${'
      i += 2
      const [innerResult, nextI] = _processInterpolation(code, i, re, replacement)
      result += innerResult + '}'
      i = nextI
    } else {
      // String part of template literal: copy verbatim, no replacement
      result += code[i]
      i++
    }
  }
  return [result, i]
}

/** Process inside ${...}. Returns [content without closing }, nextIndex after }]. */
function _processInterpolation(code: string, start: number, re: RegExp, replacement: string): [string, number] {
  let i = start
  let depth = 1
  let exprStart = i
  let result = ''

  const flushExpr = (end: number) => {
    if (end > exprStart) {
      re.lastIndex = 0
      result += code.slice(exprStart, end).replace(re, replacement)
    }
    exprStart = end
  }

  while (i < code.length) {
    const ch = code[i]
    if (ch === "'" || ch === '"') {
      flushExpr(i)
      i = _skipQuotedString(code, i)
      result += code.slice(exprStart, i)
      exprStart = i
    } else if (ch === '`') {
      flushExpr(i)
      const [tplResult, nextI] = _processTemplateLiteral(code, i, re, replacement)
      result += tplResult
      i = nextI
      exprStart = i
    } else if (ch === '{') {
      depth++
      i++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        flushExpr(i)
        i++
        return [result, i]
      }
      i++
    } else {
      i++
    }
  }
  flushExpr(i)
  return [result, i]
}

/**
 * Apply wrapLoopParamAsAccessor for multiple loop params.
 * Used during template generation to wrap expression values at IR level,
 * avoiding post-hoc regex replacement on full template strings.
 */
export function wrapExprWithLoopParams(expr: string, loopParams?: string[]): string {
  if (!loopParams) return expr
  let result = expr
  for (const p of loopParams) result = wrapLoopParamAsAccessor(result, p)
  return result
}

