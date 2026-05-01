/**
 * Pure helper functions for client JS generation.
 * No dependencies on ClientJsContext or other internal modules.
 */

import type { IRTemplateLiteral, LoopParamBinding } from '../types'
import type { TopLevelLoop } from './types'
import {
  BF_KEY as DATA_KEY,
  BF_KEY_PREFIX as DATA_KEY_PREFIX,
  BF_PLACEHOLDER as DATA_BF_PH,
  BF_LOOP_START,
  BF_LOOP_END,
  loopStartMarker,
  loopEndMarker,
} from '@barefootjs/shared'

export { DATA_KEY, DATA_KEY_PREFIX, DATA_BF_PH, BF_LOOP_START, BF_LOOP_END, loopStartMarker, loopEndMarker }

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
export function buildChainedArrayExpr(elem: TopLevelLoop): string {
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
 * SVG presentation attribute names that are written camelCase in JSX
 * (React-compatible spelling) and must be emitted as kebab-case at the
 * DOM/HTML layer.
 *
 * Why this exists: SSR template output and client-side reactive
 * `setAttribute` both flow through `toHtmlAttrName`. If they disagree on
 * the spelling, SSR emits `stroke-width="1.5"` while hydration writes
 * `setAttribute('strokeWidth', '2.5')`, leaving both attributes on the
 * DOM. The SVG renderer reads the kebab-case form, so reactive updates
 * become invisible. This map keeps both paths in sync. Surfaced by the
 * Graph/DAG Editor block (#135) where edge selection failed to thicken
 * the stroke even though `selectedEdgeId()` updated correctly.
 *
 * Listed names are SVG-only — none of them collide with HTML attributes.
 */
const SVG_CAMEL_TO_KEBAB: Record<string, string> = {
  // stroke
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity',
  // fill
  fillOpacity: 'fill-opacity',
  fillRule: 'fill-rule',
  // gradient stops
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  // text presentation
  textAnchor: 'text-anchor',
  dominantBaseline: 'dominant-baseline',
  alignmentBaseline: 'alignment-baseline',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  fontStyle: 'font-style',
  letterSpacing: 'letter-spacing',
  wordSpacing: 'word-spacing',
  // common presentation / interaction
  pointerEvents: 'pointer-events',
  vectorEffect: 'vector-effect',
  colorInterpolation: 'color-interpolation',
  clipPath: 'clip-path',
  clipRule: 'clip-rule',
  // marker references
  markerStart: 'marker-start',
  markerMid: 'marker-mid',
  markerEnd: 'marker-end',
}

/**
 * Convert JSX attribute name to HTML attribute name.
 * Handles React-style naming conventions (e.g., className → class) and
 * SVG presentation attributes (e.g., strokeWidth → stroke-width).
 */
export function toHtmlAttrName(jsxAttrName: string): string {
  if (jsxAttrName === 'className') return 'class'
  const svgKebab = SVG_CAMEL_TO_KEBAB[jsxAttrName]
  if (svgKebab !== undefined) return svgKebab
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

/**
 * Emit a ref-binding call `(callback)(elementVar)`, optionally guarded so the
 * call no-ops when the callback is undefined.
 *
 * Background: `<el ref={props.onMount} />` where `onMount?:` is optional in the
 * prop type compiles to `(_p.onMount)(_s0)`. Consumers that omit the prop pass
 * `undefined` and the call throws `TypeError: _p.onMount is not a function`
 * (#1161). Local-bound callbacks like `<el ref={attachPane} />` are always
 * defined — `attachPane` is a `const` in the component body — so they keep the
 * unguarded call.
 *
 * Heuristic: a single bare identifier (e.g. `attachPane`) is a local binding;
 * anything else (member access, call, arrow, …) is treated as a possibly-
 * undefined source and emitted with optional-call (`?.()`).
 */
export function emitRefCall(callback: string, elementVar: string): string {
  const trimmed = callback.trim()
  const isBareIdent = /^[a-zA-Z_$][\w$]*$/.test(trimmed)
  if (isBareIdent) {
    return `(${callback})(${elementVar})`
  }
  // Wrap non-identifier expressions in parens so `?.()` binds to the whole
  // expression (e.g. `(_p.onMount)?.(_s0)` not `_p.onMount?.(_s0)` — both
  // parse the same here, but the parens preserve the legacy emit shape's
  // intent and stay safe for arbitrary callback expressions).
  return `(${callback})?.(${elementVar})`
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
 *
 * When `bindings` is supplied (destructured `.map()` callback, #951), each
 * binding name is rewritten to `__bfItem()${path}` instead of wrapping the
 * raw pattern text. `paramName` is ignored in that case — destructured
 * callbacks never expose the pattern itself as a local.
 */
export function wrapLoopParamAsAccessor(expr: string, paramName: string, bindings?: readonly LoopParamBinding[]): string {
  if (bindings && bindings.length > 0) {
    // Build a single alternation regex so rewriting is a one-pass operation.
    // Iterating per-binding risks re-matching the replacement text (e.g. a
    // binding named `a` with path `.a` would cascade into `__bfItem().a`
    // then back into `__bfItem().__bfItem().a`).
    const byName = new Map<string, string>()
    for (const b of bindings) byName.set(b.name, b.path)
    const alt = bindings.map(b => escapeRegExp(b.name)).join('|')
    const re = new RegExp(`\\b(${alt})\\b`, 'g')
    return _replaceInExprContexts(expr, re, (_m: string, name: string) => `__bfItem()${byName.get(name)!}`)
  }
  const re = new RegExp(`\\b${escapeRegExp(paramName)}\\b(?!\\s*\\()(?!-)`, 'g')
  return _replaceInExprContexts(expr, re, `${paramName}()`)
}

/**
 * Rewrite each destructured binding reference to `${accessor}${path}` in
 * `expr`, reusing the string-context-aware replacement that keeps literal
 * text untouched (#951).
 *
 * Used by the event-delegation emitter, which resolves the current item
 * via `arr.find(item => ...)` at click time and therefore wants `item`
 * as the accessor prefix instead of `__bfItem()`.
 */
export function substituteLoopBindings(
  expr: string,
  bindings: readonly LoopParamBinding[],
  accessor: string,
): string {
  if (!bindings || bindings.length === 0) return expr
  const byName = new Map<string, string>()
  for (const b of bindings) byName.set(b.name, b.path)
  const alt = bindings.map(b => escapeRegExp(b.name)).join('|')
  const re = new RegExp(`\\b(${alt})\\b`, 'g')
  return _replaceInExprContexts(expr, re, (_m: string, name: string) => `${accessor}${byName.get(name)!}`)
}

// Matches the JS `String.prototype.replace` replacer signature. The lib's
// own type uses `any[]` for the rest args because regex capture groups and
// offsets have heterogeneous types; narrow them at the callback instead.
type Replacement = string | ((substring: string, ...args: any[]) => string)

/** Replace `re` with `replacement` only in expression contexts (not in string literals). */
function _replaceInExprContexts(code: string, re: RegExp, replacement: Replacement): string {
  let result = ''
  let i = 0
  let exprStart = 0

  const flushExpr = (end: number) => {
    if (end > exprStart) {
      re.lastIndex = 0
      const slice = code.slice(exprStart, end)
      result += typeof replacement === 'string'
        ? slice.replace(re, replacement)
        : slice.replace(re, replacement as (substring: string, ...args: any[]) => string)
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
function _processTemplateLiteral(code: string, start: number, re: RegExp, replacement: Replacement): [string, number] {
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
function _processInterpolation(code: string, start: number, re: RegExp, replacement: Replacement): [string, number] {
  let i = start
  let depth = 1
  let exprStart = i
  let result = ''

  const flushExpr = (end: number) => {
    if (end > exprStart) {
      re.lastIndex = 0
      const slice = code.slice(exprStart, end)
      result += typeof replacement === 'string'
        ? slice.replace(re, replacement)
        : slice.replace(re, replacement as (substring: string, ...args: any[]) => string)
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
 * A loop parameter binding spec for template-time rewriting. Either a plain
 * parameter name (simple-identifier callback) or the pattern text plus the
 * destructured bindings whose references should be rewritten to
 * `__bfItem().path` (#951).
 */
export interface LoopParamSpec {
  param: string
  bindings?: readonly LoopParamBinding[]
}

/**
 * Apply wrapLoopParamAsAccessor for multiple loop params.
 * Used during template generation to wrap expression values at IR level,
 * avoiding post-hoc regex replacement on full template strings.
 *
 * Accepts either a bare param name or a spec carrying destructure bindings.
 */
export function wrapExprWithLoopParams(expr: string, loopParams?: ReadonlyArray<string | LoopParamSpec>): string {
  if (!loopParams) return expr
  let result = expr
  for (const p of loopParams) {
    const spec = typeof p === 'string' ? { param: p } : p
    result = wrapLoopParamAsAccessor(result, spec.param, spec.bindings)
  }
  return result
}

