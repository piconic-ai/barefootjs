/**
 * Pure helper functions for client JS generation.
 * No dependencies on ClientJsContext or other internal modules.
 */

import ts from 'typescript'
import type { AttrValue, IRTemplatePart, LoopParamBinding, FreeReference, IRNode } from '../types.ts'
import type { TopLevelLoop, BranchLoop, LoopOffset } from './types.ts'
import { buildLoopChainExpr } from '../loop-chain.ts'
import {
  iterateJsTokens,
  isIdentifierLikeToken,
  isTriviaKind,
  replaceInExprContexts,
} from '../scanner/js-scanner.ts'
import {
  BF_KEY as DATA_KEY,
  BF_KEY_PREFIX as DATA_KEY_PREFIX,
  BF_PLACEHOLDER as DATA_BF_PH,
  BF_LOOP_START,
  BF_LOOP_END,
  loopStartMarker,
  loopEndMarker,
  loopItemMarker,
  toHTMLAttrName as toHtmlAttrName,
} from '@barefootjs/shared'

export { DATA_KEY, DATA_KEY_PREFIX, DATA_BF_PH, BF_LOOP_START, BF_LOOP_END, loopStartMarker, loopEndMarker, loopItemMarker, toHtmlAttrName }

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
 * Profile-mode DOM-binding id suffix (#1690, SR4). Returns the trailing
 * `, "<Component>#binding:<slotId>"` argument for a binding effect's
 * `createEffect` / `createDisposableEffect` / `insert` / `mapArray` call when
 * `componentName` is set (profile on), else `''` so the emitted code stays
 * byte-identical (SR8). Centralised so every binding emit site — top-level,
 * conditional branch, loop child, inner loop — uses one id convention.
 */
export function profileBindingId(componentName: string | undefined, slotId: string): string {
  return componentName ? `, ${JSON.stringify(`${componentName}#binding:${slotId}`)}` : ''
}

/**
 * Convert a `template` variant's parts into a JS template-literal string.
 * Shared by both `attrValueToString` and any consumer that wants to flatten
 * a structured template into JS-level concatenation.
 */
export function templatePartsToJsExpr(parts: readonly IRTemplatePart[], opts?: { useTemplate?: boolean }): string {
  let result = '`'
  for (const part of parts) {
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
 * Flatten an `AttrValue` to its raw string form, suitable for HTML attribute
 * body insertion (literal) or for raw JS expression substitution (expression
 * / template / spread).
 *
 * Returns `null` for variants that have no string projection (`boolean-attr`,
 * `boolean-shorthand`, `jsx-children`) — callers must branch on `value.kind`
 * before reaching them.
 *
 * When `opts.useTemplate` is set, prefers `templateExpr` / `templateValue` /
 * `templateCondition` / `templateKey` (the prop-rewritten variant) over the
 * raw source form, for use in SSR template-literal interpolation.
 */
export function attrValueToString(value: AttrValue, opts?: { useTemplate?: boolean }): string | null {
  switch (value.kind) {
    case 'literal':
      return value.value
    case 'expression':
      return opts?.useTemplate ? (value.templateExpr ?? value.expr) : value.expr
    case 'spread':
      return opts?.useTemplate ? (value.templateExpr ?? value.expr) : value.expr
    case 'template':
      return templatePartsToJsExpr(value.parts, opts)
    case 'boolean-attr':
    case 'boolean-shorthand':
    case 'jsx-children':
      return null
  }
}

/**
 * True when the value is fully resolvable at compile time (a string literal
 * or a bare boolean attribute). The remaining variants depend on runtime
 * values and must be inlined as `${...}` rather than embedded verbatim.
 */
export function isStaticAttrValue(value: AttrValue): boolean {
  return value.kind === 'literal' || value.kind === 'boolean-attr' || value.kind === 'boolean-shorthand'
}

/**
 * Exhaustiveness sentinel for `switch (value.kind)` blocks. If a future
 * variant lands without a corresponding `case`, the parameter type
 * collapses to `never` and the call site fails to type-check.
 */
export function exhaustiveAttrValue(value: never): never {
  throw new Error(`Unhandled AttrValue kind: ${JSON.stringify(value)}`)
}

/**
 * Build the chained array expression for reconcileList. Thin
 * adapter over `buildLoopChainExpr` that unpacks the collected
 * `TopLevelLoop` / `BranchLoop` shape into the primitive inputs.
 * Branch loops carry the same `filterPredicate` / `sortComparator`
 * / `chainOrder` fields so a chained `.map()` inside a conditional
 * branch preserves the chain (#1434).
 */
export function buildChainedArrayExpr(elem: TopLevelLoop | BranchLoop): string {
  return buildLoopChainExpr({
    base: elem.array,
    sortComparator: elem.sortComparator,
    filterPredicate: elem.filterPredicate,
    chainOrder: elem.chainOrder,
  })
}

/**
 * The single source of truth for what contributes to a loop's child-index
 * offset: the static sibling count (a folded integer) followed by one
 * `(arr).length` term per preceding sibling loop. The additive and
 * subtractive forms below are thin projections over this list, so they can
 * never drift in which terms they include, and a new offset contributor is
 * added here once rather than in every consumer (#1693).
 */
function loopOffsetTerms(offset: LoopOffset | undefined): string[] {
  if (!offset) return []
  const terms: string[] = []
  if (offset.staticCount) terms.push(String(offset.staticCount))
  terms.push(...offset.dynamicTerms)
  return terms
}

/**
 * Build the additive `children[idx]` access expression for a loop's items —
 * `indexParam` plus every offset term.
 *
 * Examples:
 *   - no offset                  → `__idx`
 *   - one static sibling         → `__idx + 1`
 *   - one preceding `.map()`     → `__idx + (arr).length`
 *   - static sibling + 2 `.map()`→ `__idx + 1 + (a).length + (b).length`
 */
export function buildLoopChildIndexExpr(indexParam: string, offset: LoopOffset | undefined): string {
  return [indexParam, ...loopOffsetTerms(offset)].join(' + ')
}

/**
 * Build the subtractive counterpart of `buildLoopChildIndexExpr` — used by
 * event delegation to recover a loop item's array index from its DOM child
 * index. Returns the trailing `` - <static> - (arr).length …`` suffix (empty
 * when there is no offset) appended after `…indexOf(__el)`.
 */
export function buildLoopChildIndexSubtraction(offset: LoopOffset | undefined): string {
  return loopOffsetTerms(offset).map(term => ` - ${term}`).join('')
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

// toHtmlAttrName is now re-exported from @barefootjs/shared (classifyDOMProp's
// toHTMLAttrName), keeping the same public name for downstream consumers.

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
 * Profile mode (#1690, SR3): wrap an event handler so a profiling run can
 * attribute the reactive work it triggers to one turn. The original handler
 * expression (arrow or identifier) is invoked verbatim with the forwarded
 * args, bracketed by `beginTurn`/`endTurn`:
 *
 *   (...__bfa) => { beginTurn("Comp#handler:slot:click"); try { return (HANDLER)(...__bfa) } finally { endTurn() } }
 *
 * Measurement-only: the handler's behavior and the synchronous `set()`
 * semantics are unchanged — the markers just stamp a turn id onto the events
 * emitted while it runs. Used at every handler emit site in profile mode so
 * no path is left unattributed.
 */
export function wrapHandlerForTurn(handler: string, handlerId: string, loc?: string): string {
  const idArg = loc ? `${JSON.stringify(handlerId)}, ${JSON.stringify(loc)}` : JSON.stringify(handlerId)
  return `(...__bfa) => { beginTurn(${idArg}); try { return (${handler.trim()})(...__bfa) } finally { endTurn() } }`
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
 * Walk a JS-like expression string via the shared `ts.createScanner`-based
 * lexer and invoke `predicate` on every identifier-like token found in a
 * position where bare identifiers are semantically possible — i.e. not
 * inside a string / template-string body / comment / regex literal, and
 * not the property name of a member-access expression. Returns true on the
 * first hit.
 *
 * Delegating to `iterateJsTokens` (rather than a hand-rolled char-by-char
 * state machine) means regex literals are recognised: `/it's/.test(foo)`
 * no longer reads the apostrophe as a string opener, and an identifier
 * inside a regex body (`/className/`) is correctly treated as opaque (#1370).
 */
function scanForIdentifiers(expr: string, predicate: (token: string) => boolean): boolean {
  // Previous *significant* (non-trivia) token kind, used to skip the tail
  // of a member access (`a.foo`, `a?.foo`) while still treating the head
  // (`foo.bar`) and spread targets (`...foo`) as real references.
  let prevSignificant: ts.SyntaxKind | undefined
  for (const tok of iterateJsTokens(expr)) {
    if (isTriviaKind(tok.kind)) continue
    if (isIdentifierLikeToken(tok.kind)) {
      const isMemberTail =
        prevSignificant === ts.SyntaxKind.DotToken
        || prevSignificant === ts.SyntaxKind.QuestionDotToken
      if (!isMemberTail && predicate(expr.slice(tok.pos, tok.end))) return true
    }
    prevSignificant = tok.kind
  }
  return false
}

/**
 * Render a single destructured `.map()` binding as the JS expression that
 * yields its value, given the accessor for the loop item.
 *
 * - Fixed bindings → `${base}${path}` (e.g. `__bfItem().foo`).
 * - Object rest → an IIFE that destructures the parent and returns the
 *   residual, so `({ id, title, ...rest })` lowers each reference to `rest`
 *   into `(({ id: __bfR0, title: __bfR1, ...__bfRest }) => __bfRest)(__bfItem())`.
 *   The synthesized `__bfR${i}` / `__bfRest` locals live in the
 *   barefoot-reserved `__bf*` namespace so they cannot collide with user
 *   bindings. Identifier-vs-string-literal classification of each excluded
 *   key is precomputed at IR-build time (`RestExcludeKey.isIdent`), so this
 *   emitter is pure formatting — no identifier regex runs here.
 * - Array rest → `${base}${path}.slice(${from})`, falling through to the
 *   native array method (no runtime helper required).
 */
function renderLoopBindingAccess(b: LoopParamBinding, base: string): string {
  const parent = `${base}${b.path}`
  if (b.rest?.kind === 'object') {
    if (b.rest.exclude.length === 0) {
      // No sibling keys to omit. A fresh shallow clone — not a direct alias
      // to `parent` — is what the user-visible `rest` semantics require:
      // mutations against the residual (e.g. `delete rest.foo`) must not
      // leak back into the underlying item accessor's value.
      return `({...${parent}})`
    }
    const parts = b.rest.exclude.map((e, i) => {
      return e.isIdent
        ? `${e.key}: __bfR${i}`
        : `${JSON.stringify(e.key)}: __bfR${i}`
    }).join(', ')
    return `(({ ${parts}, ...__bfRest }) => __bfRest)(${parent})`
  }
  if (b.rest?.kind === 'array') {
    return `${parent}.slice(${b.rest.from})`
  }
  return parent
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
    return rewriteLoopBindingRefs(expr, bindings, '__bfItem()')
  }
  const re = new RegExp(`\\b${escapeRegExp(paramName)}\\b(?!\\s*\\()(?!-)`, 'g')
  return replaceInExprContexts(expr, re, `${paramName}()`)
}

/**
 * Rewrite each reference to a destructured loop-param binding in
 * `expr` to the corresponding `${accessor}${path}` form.
 *
 * Single alternation regex so rewriting is one-pass — iterating per
 * binding risks re-matching the replacement text (a binding named
 * `a` with path `.a` would cascade into `__bfItem().a` then back
 * into `__bfItem().__bfItem().a`).
 *
 * `expandShorthandBindings` runs first so object-literal shorthand
 * references (`{ name }`) are lifted to a string-key form before
 * the identifier regex hits them — otherwise the rewrite would land
 * `${accessor}` in a position JS reserves for bare identifiers
 * (`{ __bfItem().name }` ⇒ SyntaxError). (#1244)
 */
function rewriteLoopBindingRefs(
  expr: string,
  bindings: readonly LoopParamBinding[],
  accessor: string,
): string {
  const byName = new Map<string, LoopParamBinding>()
  for (const b of bindings) byName.set(b.name, b)
  const preprocessed = expandShorthandBindings(expr, new Set(byName.keys()))
  const alt = bindings.map(b => escapeRegExp(b.name)).join('|')
  const re = new RegExp(`\\b(${alt})\\b`, 'g')
  return replaceInExprContexts(preprocessed, re, (_m: string, name: string) =>
    renderLoopBindingAccess(byName.get(name)!, accessor),
  )
}

/**
 * Expand object-literal shorthand properties whose name matches a
 * destructured loop-param binding into the equivalent
 * `"name": name` form (string-literal key + identifier value).
 *
 * Why: JS only accepts a bare identifier as a shorthand property
 * name, so the downstream `${accessor}` rewrite of `{ color }` would
 * produce `{ __bfItem().color }` — a SyntaxError that takes down the
 * whole compiled component at module load time, before any runtime
 * code runs. (#1244)
 *
 * Why string-literal key (not `name: name`): the subsequent
 * identifier-replacement regex (`replaceInExprContexts`) skips string
 * literal contents, so the key stays as the literal `"color"` while
 * the value-position `color` gets rewritten to `__bfItem().color`.
 * The alternative `name: name` would have the regex match BOTH
 * occurrences and produce `{ __bfItem().color: __bfItem().color }`
 * — same SyntaxError, just one indirection deeper.
 *
 * AST-based detection (TS `ShorthandPropertyAssignment`) is
 * intentionally chosen over character-by-character lookbehind on the
 * raw expression text — the codebase's recurring "hand-rolled JS
 * source scanners" pattern (#1244 §D) explicitly flags that approach
 * as drift-prone (computed keys, comments, nested template literals
 * all need separate handling). The TS scanner already knows what a
 * shorthand prop is.
 *
 * The `(${expr})` wrap forces TS to parse a bare object literal as
 * an expression — otherwise `{ color }` would be a block statement
 * containing an expression statement, with no `ShorthandPropertyAssignment`
 * node to find.
 */
function expandShorthandBindings(expr: string, bindingNames: ReadonlySet<string>): string {
  // Fast path: no `{` means no object literal means no shorthand to
  // expand. Skip the parser cost on the common case.
  if (!expr.includes('{')) return expr
  const wrapped = `(${expr})`
  const sf = ts.createSourceFile('__bf_expr.ts', wrapped, ts.ScriptTarget.Latest, /* setParentNodes */ true)
  const edits: Array<{ start: number; end: number; replacement: string }> = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isShorthandPropertyAssignment(node)
      && ts.isIdentifier(node.name)
      && bindingNames.has(node.name.text)
    ) {
      // `node` spans just the bare identifier on the shorthand entry.
      // Position offsets are in `wrapped`; subtract the leading `(`
      // to map back to `expr`.
      const start = node.getStart(sf) - 1
      const end = node.getEnd() - 1
      const name = node.name.text
      edits.push({ start, end, replacement: `${JSON.stringify(name)}: ${name}` })
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  if (edits.length === 0) return expr
  // Apply right-to-left so earlier offsets stay valid as later ones
  // grow.
  edits.sort((a, b) => b.start - a.start)
  let out = expr
  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  }
  return out
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
  return rewriteLoopBindingRefs(expr, bindings, accessor)
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

