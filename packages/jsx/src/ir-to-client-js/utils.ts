/**
 * Pure helper functions for client JS generation.
 * No dependencies on ClientJsContext or other internal modules.
 */

import type { IRTemplateLiteral, LoopParamBinding, FreeReference, IRNode } from '../types'
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
    } else if (part.type === 'lookup') {
      // `${MAP[KEY]}` was structurally captured at IR time so SSR
      // adapters could emit a switch. For client-side JS we rebuild
      // the equivalent runtime indexed lookup against the resolved
      // cases — keeps the JSX runtime path semantically identical to
      // the original `${variantClasses[variant]}` source.
      const key = (opts?.useTemplate && part.templateKey) ? part.templateKey : part.key
      const obj = '{' + Object.entries(part.cases).map(
        ([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`
      ).join(', ') + '}'
      result += `\${(${obj})[${key}]}`
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Flatten an `OriginInfo.freeRefs` list to a plain `Set<string>` of free
 * identifier names (#1267). Skips `kind: 'reactive-brand'` entries whose
 * `name` is a full property-access path (e.g. `props.form.isSubmitting`) —
 * the root identifier of such paths is already reported separately under
 * its own kind, so consumers checking `has(<bareIdent>)` get a clean view.
 */
export function freeIdsFromRefs(refs: readonly FreeReference[] | undefined): Set<string> {
  const out = new Set<string>()
  if (!refs) return out
  for (const ref of refs) {
    if (ref.kind === 'reactive-brand') continue
    out.add(ref.name)
  }
  return out
}

/**
 * Walk an IR child subtree and return the union of free identifiers
 * referenced by every expression-bearing node within it (#1267). Used by
 * the synthesised-children check in component-loop / event-setup builders
 * where the children string is reconstituted from IR via
 * `irChildrenToJsExpr` and has no single AST node.
 *
 * Visits: IRExpression / IRConditional / IRElement (attrs only —
 * children recurse) / IRComponent (attrs + children) / IRFragment /
 * IRIfStatement / IRProvider / IRSlot. Skips IRText (no expr) and
 * IRLoop (its body has its own param scope).
 */
export function irChildrenFreeIds(children: readonly IRNode[]): Set<string> {
  const out = new Set<string>()
  for (const child of children) {
    collectIrFreeIds(child, out)
  }
  return out
}

function collectIrFreeIds(node: IRNode, out: Set<string>): void {
  switch (node.type) {
    case 'text':
      return
    case 'expression': {
      addRefsToSet(node.origin?.freeRefs, out)
      return
    }
    case 'conditional': {
      addRefsToSet(node.origin?.freeRefs, out)
      collectIrFreeIds(node.whenTrue, out)
      collectIrFreeIds(node.whenFalse, out)
      return
    }
    case 'element': {
      for (const attr of node.attrs) {
        if (attr.freeIdentifiers) {
          for (const name of attr.freeIdentifiers) out.add(name)
        }
      }
      for (const child of node.children) collectIrFreeIds(child, out)
      return
    }
    case 'fragment':
    case 'provider':
    case 'async':
    case 'if-statement': {
      const anyNode = node as { children?: IRNode[] }
      if (anyNode.children) {
        for (const child of anyNode.children) collectIrFreeIds(child, out)
      }
      return
    }
    case 'component': {
      for (const prop of node.props) {
        // IRProp shares AttrMeta — pick up freeIdentifiers when present.
        const p = prop as { freeIdentifiers?: ReadonlySet<string> }
        if (p.freeIdentifiers) {
          for (const name of p.freeIdentifiers) out.add(name)
        }
      }
      for (const child of node.children) collectIrFreeIds(child, out)
      return
    }
    case 'loop':
    case 'slot':
      // Loops introduce their own param scope; the parent-context's free
      // identifiers don't propagate through. Slots resolve at the host.
      return
  }
}

function addRefsToSet(refs: readonly FreeReference[] | undefined, out: Set<string>): void {
  if (!refs) return
  for (const ref of refs) {
    if (ref.kind === 'reactive-brand') continue
    out.add(ref.name)
  }
}

/**
 * Set-intersection check that short-circuits on the first overlap.
 * Iterates the smaller side for efficiency.
 */
export function setIntersects(a: ReadonlySet<string> | undefined, b: ReadonlySet<string> | undefined): boolean {
  if (!a || !b || a.size === 0 || b.size === 0) return false
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const name of small) {
    if (large.has(name)) return true
  }
  return false
}

/**
 * Lexer-aware fallback for "does this expression reference an identifier?"
 *
 * Reserved for the call sites that operate on **synthesised** expression
 * strings with no originating AST node (post-constant-chain resolution,
 * post-substitution CSR templates). All other callers should read
 * `node.freeIdentifiers` populated during IR build — see #1267.
 *
 * Skips matches that occur inside:
 * - string literals (`'...'`, `"..."`)
 * - template literal text parts (between `` ` `` and `${`)
 * - line comments (`// ...`)
 * - block comments (`/* ... *\/`)
 * - member-access tail names (identifier preceded by `.`)
 *
 * Matches inside template-literal `${ ... }` expression substitutions are
 * still considered identifier references.
 */
export function tokenContainsIdent(expr: string, ident: string): boolean {
  return scanForIdentifiers(expr, (token) => token === ident)
}

/**
 * Lexer-aware variant of {@link tokenContainsIdent} that returns true on the
 * first occurrence of *any* name in `names`. Short-circuits.
 */
export function tokenContainsAny(expr: string, names: Iterable<string>): boolean {
  const set = names instanceof Set ? (names as Set<string>) : new Set(names)
  if (set.size === 0) return false
  return scanForIdentifiers(expr, (token) => set.has(token))
}

const IDENT_START_RE = /[A-Za-z_$]/
const IDENT_PART_RE = /[A-Za-z0-9_$]/

/**
 * Single-pass scanner over a JS-like expression string. Walks character by
 * character through a small state machine and invokes `predicate` on every
 * identifier-like token it finds in a position where bare identifiers are
 * semantically possible (i.e. not inside a string/comment, not the property
 * name in a member-access expression). Returns true on the first hit.
 */
function scanForIdentifiers(expr: string, predicate: (token: string) => boolean): boolean {
  const n = expr.length
  let i = 0
  // 0 = code, 1 = single-quote string, 2 = double-quote string,
  // 3 = template literal text, 4 = template literal expression,
  // 5 = line comment, 6 = block comment.
  type State = 0 | 1 | 2 | 3 | 4 | 5 | 6
  let state: State = 0
  // For nested template expressions: stack of brace depths at each `${` push.
  const tmplExprStack: number[] = []
  // Brace depth tracked only inside template-expression state to detect when
  // we close back to the surrounding template-literal text.
  let braceDepth = 0

  while (i < n) {
    const ch = expr[i]

    switch (state) {
      case 0: // code
      case 4: { // template expression — same lexing rules as code
        // String / template literal openers
        if (ch === "'") { state = 1; i++; continue }
        if (ch === '"') { state = 2; i++; continue }
        if (ch === '`') { state = 3; i++; continue }
        // Comment openers
        if (ch === '/' && i + 1 < n) {
          const next = expr[i + 1]
          if (next === '/') { state = 5; i += 2; continue }
          if (next === '*') { state = 6; i += 2; continue }
        }
        // Track braces only inside template-expression state, so we know when
        // we leave `${ ... }` back to the surrounding template text.
        if (state === 4) {
          if (ch === '{') { braceDepth++; i++; continue }
          if (ch === '}') {
            if (braceDepth === 0) {
              // Closing `}` of `${ ... }` — pop back to enclosing tmpl state.
              const restored = tmplExprStack.pop()
              braceDepth = restored ?? 0
              state = 3
              i++
              continue
            }
            braceDepth--
            i++
            continue
          }
        }
        // Identifier start
        if (IDENT_START_RE.test(ch)) {
          let j = i + 1
          while (j < n && IDENT_PART_RE.test(expr[j])) j++
          const token = expr.slice(i, j)
          // Skip member-access tail: identifier preceded by `.` (ignoring
          // whitespace).
          let prev = i - 1
          while (prev >= 0 && (expr[prev] === ' ' || expr[prev] === '\t' || expr[prev] === '\n' || expr[prev] === '\r')) prev--
          const isMemberTail = prev >= 0 && expr[prev] === '.' && (prev === 0 || expr[prev - 1] !== '.') // not `..` (spread)
          if (!isMemberTail && predicate(token)) return true
          i = j
          continue
        }
        i++
        continue
      }
      case 1: { // single-quote string
        if (ch === '\\' && i + 1 < n) { i += 2; continue }
        if (ch === "'") { state = 0; i++; continue }
        i++
        continue
      }
      case 2: { // double-quote string
        if (ch === '\\' && i + 1 < n) { i += 2; continue }
        if (ch === '"') { state = 0; i++; continue }
        i++
        continue
      }
      case 3: { // template literal text
        if (ch === '\\' && i + 1 < n) { i += 2; continue }
        if (ch === '`') {
          // Closing the template literal; return to whatever code state we
          // came from (either top-level code or an outer template expression).
          state = tmplExprStack.length > 0 ? 4 : 0
          i++
          continue
        }
        if (ch === '$' && i + 1 < n && expr[i + 1] === '{') {
          // Entering `${ ... }`: save current outer brace depth, reset for new.
          tmplExprStack.push(braceDepth)
          braceDepth = 0
          state = 4
          i += 2
          continue
        }
        i++
        continue
      }
      case 5: { // line comment
        if (ch === '\n' || ch === '\r') { state = 0; i++; continue }
        i++
        continue
      }
      case 6: { // block comment
        if (ch === '*' && i + 1 < n && expr[i + 1] === '/') { state = 0; i += 2; continue }
        i++
        continue
      }
    }
  }
  return false
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

/** Replace `re` with `replacement` only in expression contexts (not in
 *  string literals or JS comments).
 *
 *  Comment-skipping is required for prop values that survive into the
 *  emitted client JS verbatim (e.g. object-literal `style={{…}}` props
 *  with a `// ...` inline note). Apostrophes in such a comment (e.g.
 *  `// they're "holding"`) would otherwise be mistaken for a string
 *  start, swallowing the rest of the expression up to the next single
 *  quote and skipping every loop-param reference in between — the
 *  symptom of #135 board demo's silent failure to wrap `task.id` to
 *  `task().id` inside the inner-loop reactive style effect. */
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
    } else if (ch === '/' && code[i + 1] === '/') {
      flushExpr(i)
      i = _skipLineComment(code, i)
      result += code.slice(exprStart, i)
      exprStart = i
    } else if (ch === '/' && code[i + 1] === '*') {
      flushExpr(i)
      i = _skipBlockComment(code, i)
      result += code.slice(exprStart, i)
      exprStart = i
    } else {
      i++
    }
  }
  flushExpr(i)
  return result
}

function _skipLineComment(code: string, start: number): number {
  let i = start + 2
  while (i < code.length && code[i] !== '\n') i++
  return i
}

function _skipBlockComment(code: string, start: number): number {
  let i = start + 2
  while (i < code.length - 1) {
    if (code[i] === '*' && code[i + 1] === '/') return i + 2
    i++
  }
  return code.length
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
    } else if (ch === '/' && code[i + 1] === '/') {
      flushExpr(i)
      i = _skipLineComment(code, i)
      result += code.slice(exprStart, i)
      exprStart = i
    } else if (ch === '/' && code[i + 1] === '*') {
      flushExpr(i)
      i = _skipBlockComment(code, i)
      result += code.slice(exprStart, i)
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

