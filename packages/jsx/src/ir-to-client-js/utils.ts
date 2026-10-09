/**
 * Pure helper functions for client JS generation.
 * No dependencies on ClientJsContext or other internal modules.
 */

import ts from 'typescript'
import type { AttrValue, IRTemplatePart, LoopParamBinding, FreeReference, IRNode, IRFragment, ComponentIR } from '../types.ts'
import type { TopLevelLoop, BranchLoop, LoopOffset } from './types.ts'
import { isNonReferenceIdentifierPosition } from '../analyzer.ts'
import { BindingScope, type LoopBindingSource } from '../scope/binding-scope.ts'
import { buildLoopChainExpr } from '../loop-chain.ts'
import { templatePartsToJsExpr } from '../template-parts.ts'
import {
  iterateJsTokens,
  isIdentifierLikeToken,
  isTriviaKind,
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
  keyAttrName as sharedKeyAttrName,
  BF_PORTAL_OWNER,
} from '@barefootjs/shared'
import { RUNTIME_IMPORT_CANDIDATES } from './imports.ts'

export { DATA_KEY, DATA_KEY_PREFIX, DATA_BF_PH, BF_LOOP_START, BF_LOOP_END, loopStartMarker, loopEndMarker, loopItemMarker, toHtmlAttrName }

/**
 * Parameter name for the props object in generated init/template functions.
 * Short name to minimize client JS bundle size.
 */
export const PROPS_PARAM = '_p'

/** Every runtime helper name a generated module may import bare (#3113). */
const RESERVED_RUNTIME_NAMES = new Set<string>(RUNTIME_IMPORT_CANDIDATES)

/**
 * Name of the per-component init function (`init<Name>`), consistently
 * computed wherever it's declared, registered, called, or located for
 * source-mapping (#3113).
 *
 * The naive `` `init${name}` `` collides with the runtime's own imported
 * `initChild` whenever a component is literally named `Child` — the
 * generated module then both `import`s `initChild` from
 * `@barefootjs/client/runtime` (to dispatch INTO this or another child)
 * AND `export function initChild(...)` (THIS component's own compiled
 * init) as two top-level declarations of the same identifier, which is a
 * hard `SyntaxError` under real ES module semantics (verified against a
 * raw `<script type="module">` load — the same unbundled-ESM shape
 * `bf build` ships and `fixture-host.ts`'s `'hydrate'`/`'csr-mount'` modes
 * serve, #2481). No bundler downstream can rescue a same-module identifier
 * collision — a bundler renames colliding identifiers ACROSS merged
 * modules, but `import { initChild } from '...'` and
 * `function initChild() {}` live in the SAME module and are simply invalid
 * syntax before any bundler sees them.
 *
 * Trailing `$` (rather than a numeric/underscore suffix) guarantees the
 * disambiguated name can never itself collide with a *future*
 * `RUNTIME_IMPORT_CANDIDATES` entry — none of those are, or plausibly will
 * be, `$`-suffixed.
 */
export function initFunctionName(componentName: string): string {
  const name = `init${componentName}`
  return RESERVED_RUNTIME_NAMES.has(name) ? `${name}$` : name
}

/**
 * True when the component's rendered root is a comment-scoped proxy rather
 * than an element carrying its own `bf-s`/`bf-h` scope id directly — the
 * `comment: true` def flag's condition (`emit-registration.ts`), computed
 * here so `generate-init.ts` can decide the SAME thing before that phase
 * runs (#2910). Two shapes share this: a genuine `needsScopeComment`
 * fragment root (SSR wraps it in `<!--bf-scope:-->`) and a root that is
 * itself a single child-component call (`root.type === 'component'`, #2649)
 * — the wrapping comment marks a scope with no DOM presence of its own.
 */
export function isCommentScopedRoot(root: ComponentIR['root']): boolean {
  return isScopeCommentFragmentRoot(root) || root.type === 'component'
}

/**
 * True for a genuine `needsScopeComment` fragment root — the `fragmentRoot:
 * true` def flag's condition (#2722). SSR renders it wrapped in
 * `<!--bf-scope:-->` comments with no scope attribute on any element, so the
 * CSR runtime must be told to mirror that (`materializeComponent` /
 * `renderChild` in component.ts) instead of stamping `bf-s` onto the first
 * rendered element.
 */
export function isScopeCommentFragmentRoot(root: ComponentIR['root']): boolean {
  return root.type === 'fragment' && !!(root as IRFragment).needsScopeComment
}

/**
 * The scope-shape flags (`comment: true` / `fragmentRoot: true`) a
 * component's `hydrate()` def declares — the ONE answer both registration
 * emitters read: `emitRegistrationAndHydration` (emit-registration.ts, a
 * component with an init body) and `generateTemplateOnlyMount` (index.ts, a
 * stateless component registered for `renderChild()` only). The template-
 * only emitter used to re-derive the def by hand and declared neither flag,
 * so a fragment-rooted stateless child rendered by CSR got `bf-s` stamped on
 * its first element while SSR (and so hydration) scoped it with a comment
 * pair — a hydrated-vs-csr-mount divergence.
 *
 * A component-call root (#2649) never reaches the template-only emitter:
 * its root child call always pushes a `childInits` entry
 * (collect-elements.ts), so `needsClientJs` routes it to the init-bearing
 * path. Both paths therefore share one answer here.
 */
export function componentDefScopeFlags(root: ComponentIR['root']): string[] {
  const flags: string[] = []
  if (isCommentScopedRoot(root)) flags.push('comment: true')
  if (isScopeCommentFragmentRoot(root)) flags.push('fragmentRoot: true')
  return flags
}

/**
 * Get the data-key attribute name for a given loop depth.
 * Outer loop (depth 0): 'data-key'
 * Nested loops (depth N): 'data-key-N'
 *
 * Re-exported from `@barefootjs/shared` (the single source of truth also
 * used by `jsx-to-ir.ts`'s `IRElement.keyAttr` resolution) so existing
 * imports of this module keep working.
 */
export const keyAttrName = sharedKeyAttrName

/**
 * Build the trailing `, <bfId>, <keyAttrName>` arguments for a NESTED
 * (`loopDepth > 0`) `mapArray(...)` call — `inner-loop.ts` / `loop-child-arm.ts`,
 * the only two stringify sites whose loop can be nested (#2753 Shape B: the
 * runtime otherwise has no way to know it isn't the outermost loop, and
 * always stamped the plain `data-key` name).
 *
 * A depth-0 (or unkeyed) loop needs no change at all: `mapArray`'s own
 * default (`BF_KEY`, `'data-key'`) is already correct there, and an unkeyed
 * loop's runtime never stamps a key attribute regardless of the name — so
 * this returns `bfIdArg` UNCHANGED, keeping every other call site (and every
 * existing depth-0 call here) byte-identical.
 *
 * `bfIdArg` is the existing profiling-id suffix (e.g. `profileBindingId(...)`,
 * either `''` or `, "<id>"`) already threaded through these two call sites —
 * an empty one is widened to an explicit `, undefined` placeholder so the
 * name lands in the right positional slot (`mapArray`'s 6th parameter is
 * `bfId`, not `keyAttrName`).
 */
export function mapArrayKeyArgs(bfIdArg: string, keyed: boolean, loopDepth: number): string {
  if (!keyed || loopDepth <= 0) return bfIdArg
  const bfIdSlot = bfIdArg || ', undefined'
  return `${bfIdSlot}, ${JSON.stringify(keyAttrName(loopDepth))}`
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
 *
 * A `'?'` slotId (an inner loop whose container element carries no `bf` slot
 * marker) is NOT emittable: `buildIdIndex` keys on real `domBinding` slotIds, so
 * `#binding:?` could never resolve and would be a guaranteed coverage gap. The
 * analyzer likewise emits no `domBinding` for a slot-less loop, so suppressing
 * the id here keeps both sides silent and consistent.
 */
export function profileBindingId(componentName: string | undefined, slotId: string): string {
  if (!componentName || slotId === '?') return ''
  return `, ${JSON.stringify(`${componentName}#binding:${slotId}`)}`
}

/**
 * Convert a `template` variant's parts into a JS template-literal string.
 * Shared by both `attrValueToString` and any consumer that wants to flatten
 * a structured template into JS-level concatenation.
 *
 * Re-exported from the single renderer in `../template-parts.ts` — the
 * client bundle is plain JS, so it never passes `typed`.
 */
export { templatePartsToJsExpr }

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
 * Reconstruct the `Object.entries/keys/values(x)` call the compiler
 * stripped off at IR-build time (`isObjectIteratorCall`, `jsx-to-ir.ts`)
 * for the CLIENT's array expression — unlike a template adapter, the
 * client runs real JS, so it just re-wraps the plain object `x` (the
 * loop's `array`) to get back the actual iterable `mapArray` needs.
 *
 * Deliberately does NOT also handle the array-only `iterationShape`
 * (`arr.entries()`/`.keys()`) — that shape's `mapArray` callback already
 * gets what it needs from `mapArray`'s own native `(value, index)`
 * signature (the compiler synthesizes `param`/`index` to match those two
 * positions directly), so wrapping the array there would double up. See
 * `IRLoop.objectIteration`'s docstring (`types.ts`) for why the two
 * fields are distinct, and `applyIterationShape` in `html-template.ts`
 * (a different consumer — the CSR template-literal's own inline `.map()`
 * — which does handle both fields, since its shape doesn't reuse
 * `mapArray`'s positional signature).
 *
 * The callback's OWN head (`__bfItem` vs a plain param name) is unrelated
 * and unaffected — that's `destructureLoopParam`'s job
 * (`control-flow/shared.ts`), driven entirely by `param`/`paramBindings`.
 */
export function applyObjectIterationWrap(
  node: { objectIteration?: 'entries' | 'keys' | 'values' },
  arrayExpr: string,
): string {
  if (node.objectIteration === 'entries') return `Object.entries(${arrayExpr})`
  if (node.objectIteration === 'keys') return `Object.keys(${arrayExpr})`
  if (node.objectIteration === 'values') return `Object.values(${arrayExpr})`
  return arrayExpr
}

/**
 * Build the chained array expression for mapArray/mapArrayAnchored. Thin
 * adapter over `buildLoopChainExpr` that unpacks the collected
 * `TopLevelLoop` / `BranchLoop` shape into the primitive inputs.
 * Branch loops carry the same `filterPredicate` / `sortComparator`
 * / `chainOrder` fields so a chained `.map()` inside a conditional
 * branch preserves the chain (#1434).
 */
export function buildChainedArrayExpr(elem: TopLevelLoop | BranchLoop): string {
  const chained = buildLoopChainExpr({
    base: elem.array,
    sortComparator: elem.sortComparator,
    filterPredicate: elem.filterPredicate,
    chainOrder: elem.chainOrder,
  })
  return applyObjectIterationWrap(elem, chained)
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
 * Non-bubbling events that require `addEventListener` with capture for
 * delegation. Shared between the delegation stringifier and the own-handler
 * collision check (#2930) so both agree on which events a container's own
 * bubble-phase handler can never collide with in the first place — a
 * container's own non-capturing `onFocus`, say, only fires when the
 * container itself is the target, never for a descendant row.
 */
export const NON_BUBBLING_EVENTS = new Set([
  'blur', 'focus', 'load', 'unload',
  'mouseenter', 'mouseleave',
  'pointerenter', 'pointerleave',
])

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
 *
 * `ssrPortalOwner` (the element's `IRElement.ssrPortalOwnerScope`, #3059):
 * every SSR adapter renders that element at its portal outlet with
 * `bf-po="<this component's scope id>"` — the owner marker hydration's
 * portal-aware slot lookup finds it by, and which hydration keeps as-is.
 * The CSR mirror stamps the same owner right AFTER the ref callback ran (not
 * in the template: a `bf-po` present before the callback makes its
 * `!isSSRPortal(el)` guard skip the move). Without it the owner came only
 * from the callback's own `createPortal(el, …, { ownerScope })`, which
 * derives it from `el.closest('[bf-s]')` — this component's root for an
 * element root, but nothing (or an unrelated outer scope) for a
 * `needsScopeComment` fragment root, whose scope id lives on a comment, so
 * a CSR mount diverged from SSR/hydration on the attribute.
 */
export function emitRefCall(callback: string, elementVar: string, ssrPortalOwner = false): string {
  const trimmed = callback.trim()
  const isBareIdent = /^[a-zA-Z_$][\w$]*$/.test(trimmed)
  // Wrap non-identifier expressions in parens so `?.()` binds to the whole
  // expression (e.g. `(_p.onMount)?.(_s0)` not `_p.onMount?.(_s0)` — both
  // parse the same here, but the parens preserve the legacy emit shape's
  // intent and stay safe for arbitrary callback expressions).
  const call = isBareIdent ? `(${callback})(${elementVar})` : `(${callback})?.(${elementVar})`
  if (!ssrPortalOwner) return call
  return `{ ${call}; if (__scopeId) ${elementVar}.setAttribute('${BF_PORTAL_OWNER}', __scopeId) }`
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
 * The plain-param branch (`rewriteIdentifierAsAccessor`) walks the real AST,
 * so it is inherently string/template-literal-context aware (a CSS class
 * name like "preview-field" never surfaces as an `Identifier` node when
 * `paramName` is "field") AND skips object-literal keys, shorthand
 * properties, and member/property names — tokens that spell `paramName`
 * without referencing it (#3239).
 *
 * When `bindings` is supplied (destructured `.map()` callback, #951), each
 * binding name is rewritten to `__bfItem()${path}` instead of wrapping the
 * raw pattern text. `paramName` is ignored in that case — destructured
 * callbacks never expose the pattern itself as a local.
 *
 * `indexParam` (#2859): the same `.map()` callback's index parameter
 * (`(item, i) => ...`'s `i`), when the loop declares one. `mapArray`/
 * `mapArrayAnchored` hand `renderItem` an INDEX ACCESSOR (mirroring the item
 * accessor) precisely so a same-key reorder — which never re-invokes
 * `renderItem`, only pushes fresh values through the item/index signals —
 * can keep a row's index-derived output live. A bare reference to
 * `indexParam` is therefore rewritten the same way as the item param; a
 * caller that never threads an index through (e.g. no second callback
 * param) simply omits it and behavior is unchanged. Rewritten as a SEPARATE
 * pass after the item/bindings rewrite so an index name that happens to
 * collide with a destructured binding name is a no-op here (the binding
 * rewrite already consumed it; `!== paramName` below only guards the plain,
 * non-destructured case, since `bindings` and `paramName` are mutually
 * exclusive inputs to the item rewrite above).
 */
export function wrapLoopParamAsAccessor(
  expr: string,
  paramName: string,
  bindings?: readonly LoopParamBinding[],
  indexParam?: string | null,
  shadowed?: ReadonlySet<string>,
): string {
  // `shadowed`: names a nearer row rebinds (`rowBoundNames`), so inside that
  // row they mean the nearer binding and keep their plain spelling (#3394).
  const destructured = !!bindings && bindings.length > 0
  const liveBindings = destructured && shadowed ? bindings.filter(b => !shadowed.has(b.name)) : bindings
  const liveIndex = indexParam && shadowed?.has(indexParam) ? null : indexParam
  let result: string
  if (destructured) {
    result = liveBindings && liveBindings.length > 0 ? rewriteLoopBindingRefs(expr, liveBindings, '__bfItem()') : expr
  } else {
    result = shadowed?.has(paramName) ? expr : rewriteIdentifierAsAccessor(expr, paramName)
  }
  if (liveIndex && liveIndex !== paramName) {
    result = wrapIndexParamAsAccessor(result, liveIndex)
  }
  return result
}

/**
 * Every name the row of `loop` binds — its item (or destructure bindings),
 * index and preamble locals — via `BindingScope.enterLoopRow`. Inside that
 * row an enclosing loop's accessor rewrite must skip these names, or an
 * inner `const name = …` that shadows an outer destructure binding becomes
 * `const __bfItem().name = …` (#3394).
 */
export function rowBoundNames(loop: LoopBindingSource): ReadonlySet<string> {
  return BindingScope.EMPTY.enterLoopRow(loop).boundNames()
}

/**
 * The index-only half of `wrapLoopParamAsAccessor` — same AST-aware
 * identifier rewrite (`rewriteIdentifierAsAccessor`), own identifier.
 * Factored out so `wrapLoopParamAsAccessor` can run it as a second pass
 * regardless of which item-rewrite branch (bindings vs. plain param) ran
 * first (#2859).
 *
 * Also exported standalone for `build-loop.ts`/`build-branch-loop.ts`: a
 * plain loop's `template`/`mapPreambleWrapped` are built ONCE, before lazy
 * eligibility is known, because the lazy row plan reuses them verbatim when
 * this loop turns out to be lazy-eligible (`mapArrayLazy`'s `createRow`
 * still hands the row a plain index NUMBER, never an accessor). So those two
 * builders wrap item references up front (safe either way) and apply this
 * index-only pass afterward, ONLY once `buildLazyRowPlan` confirms the loop
 * is NOT going lazy.
 */
export function wrapIndexParamAsAccessor(expr: string, indexParam: string): string {
  return rewriteIdentifierAsAccessor(expr, indexParam)
}

/**
 * AST-aware engine behind `wrapLoopParamAsAccessor`'s plain-param branch and
 * `wrapIndexParamAsAccessor`: rewrite every genuine value reference to
 * `name` in `expr` into `${name}()`, while leaving alone every token that
 * merely SPELLS `name` without referencing it — an object-literal key
 * (`{ name: 1 }`), a shorthand property (`{ name }`, expanded to
 * `{ name: name() }` in one edit — the same transformation #1244 gave the
 * destructured-binding path), and a member/property name (`obj.name`,
 * `obj?.name`). The walk itself is `rewriteIdentifierReferences`, shared
 * with that destructured-binding path (#3260).
 *
 * The previous implementation was a `\bname\b`-style regex
 * (`ID_BOUNDARY_BEFORE`/`AFTER` only know about identifier-character
 * boundaries, not JS grammar), so it matched those non-reference tokens too:
 * a key or shorthand rewrite produces invalid JS (`{ name(): 1 }`,
 * `{ name() }`) that fails at parse time; a member-name rewrite produces
 * valid-but-wrong JS (`obj.name()`) that throws `TypeError: obj.name is not
 * a function` at row-creation time (#3239). Parsing the real AST makes each
 * of those positions a type of AST node this function can name and skip,
 * instead of a regex guessing from surrounding characters.
 *
 * A nested declaration that re-binds `name` (a parameter, a `const`/`let`,
 * or a destructured local) is deliberately NOT skipped, unlike
 * `analyzer.ts`'s rename `classify()`: this rewrite has no scope tracking,
 * so it cannot tell a reference to the shadowing local from a reference to
 * the outer loop param past that point, and silently wrapping only the
 * OUTER-scope references while leaving the shadowed ones alone (or vice
 * versa) would just move the #3239 bug rather than fix it. Wrapping the
 * shadowing declaration's own name is always a syntax break at the
 * declaration site itself (`const name = 1` → `const name() = 1`, `(name)
 * => …` → `(name()) => …` — a call can't legally appear where a binding
 * name is expected), so the module fails to parse instead of silently
 * running with the wrong value — the same loud, build-time failure the old
 * regex produced for this shape (it had no shadow-awareness either).
 *
 * A NAMED function expression is the one shadowing shape this function
 * skips wholesale rather than leaving loud: `(function name() { ... })`'s
 * own name is scoped to exactly that expression's body and nowhere else, so
 * `visit` never descends into it at all once it sees the self-shadowing
 * name — no reference inside can possibly mean the outer `name`. A
 * `function`/`class` DECLARATION's name is different: its binding reaches
 * into the surrounding scope too (a function declaration's name is hoisted
 * above it; a class declaration's own static/instance members can
 * self-reference it), so the same whole-subtree skip isn't sound here —
 * a self-reference to a `function`/`class` declaration whose name happens
 * to match `name` is still silently misrewritten, an accepted
 * pre-existing-shaped gap the old regex had too (the "followed by `(`"
 * exclusion below only protects the declaration's OWN name token, not
 * references reachable from within or after it).
 */
function rewriteIdentifierAsAccessor(expr: string, name: string): string {
  return rewriteIdentifierReferences(expr, new Map([[name, `${name}()`]]), { skipCallee: true })
}

/**
 * The AST walk shared by `rewriteIdentifierAsAccessor` (one name → `name()`)
 * and `rewriteLoopBindingRefs` (each destructured binding → its
 * `renderLoopBindingAccess` form): replace every genuine value reference to
 * a name in `replacements` with its replacement text, in one pass. See
 * `rewriteIdentifierAsAccessor`'s docstring for which positions count as a
 * reference and why; both callers answer that question here, so they cannot
 * drift apart (#3260).
 *
 * `skipCallee` leaves `name()` / `new name()` and a `function name()`
 * declaration's own name alone. It is the accessor rewrite's no-double-wrap
 * rule (#2592): there `name()` already IS the accessor call, and the old
 * regex's "followed by (" lookahead skipped all three. A destructured
 * binding has no such shape — `handler()` with `({ handler })` calls the
 * item's field, so it must become `__bfItem().handler()` — and its caller
 * passes `false`, which also leaves a shadowing function declaration to
 * fail loudly, as it did under the old destructured regex.
 *
 * One pass over the AST, so a replacement is never re-scanned: a binding
 * `a` with path `.a` cannot cascade into `__bfItem().__bfItem().a`.
 */
function rewriteIdentifierReferences(
  expr: string,
  replacements: ReadonlyMap<string, string>,
  opts: { skipCallee: boolean },
): string {
  // Fast path: no name occurs in the text at all → nothing to rewrite. A
  // cheap substring check only ever causes an unnecessary parse below
  // (e.g. a name occurs only as part of a longer identifier), never a wrong
  // answer, since the AST walk re-checks the exact identifier text.
  let any = false
  for (const name of replacements.keys()) {
    if (expr.includes(name)) { any = true; break }
  }
  if (!any) return expr

  const wrapped = `(${expr})`
  const sf = ts.createSourceFile('__bf_expr.ts', wrapped, ts.ScriptTarget.Latest, /* setParentNodes */ true)
  const edits: Array<{ start: number; end: number; replacement: string }> = []

  const visit = (node: ts.Node, active: ReadonlyMap<string, string>): void => {
    // A named function expression's own name is scoped to exactly its own
    // body, so nothing reachable inside it can refer to the outer binding of
    // that name — drop it for the whole subtree instead of only its
    // declaration-name identifier (see `rewriteIdentifierAsAccessor`'s
    // docstring for why a `function`/`class` DECLARATION can't get the same
    // treatment this cheaply). Other names stay active inside.
    if (ts.isFunctionExpression(node) && node.name && active.has(node.name.text)) {
      const inner = new Map(active)
      inner.delete(node.name.text)
      if (inner.size === 0) return
      ts.forEachChild(node, child => visit(child, inner))
      return
    }

    if (ts.isIdentifier(node)) {
      const replacement = active.get(node.text)
      if (replacement === undefined) return
      const p = node.parent
      // Pure-key / non-reference positions — never rewrite. Shared with
      // `analyzer.ts`'s factory-rename `classify()`, which answers the same
      // "is this identifier actually a value reference" question.
      if (isNonReferenceIdentifierPosition(node)) return
      // A function declaration's own name is always followed by `(` in
      // valid source, which is exactly the shape the old
      // `\bname\b(?!\s*\()`-style regex used to recognize and skip. Leaving
      // it unwrapped (rather than declining loudly, as the shadowing
      // declarations below do) matches the old behavior instead of
      // regressing code that used to compile. A `class name {}`
      // declaration's name is followed by `{`/`extends`, not `(`, so the
      // old regex did NOT protect it either — wrapping it is a pre-existing
      // syntax break, not a regression, so it's left to the shadowing-decl
      // path below like any other declaration name.
      //
      // Accessor mode only: the old destructured-binding regex had no such
      // exemption, so there a shadowing `function color() {}` broke the
      // declaration loudly. Skipping its name here would keep the local
      // function while rewriting its calls to `__bfItem().color()` — valid
      // JS that calls the wrong value (#3260 review).
      if (opts.skipCallee) {
        if (ts.isFunctionDeclaration(p) && p.name === node) return
        if (ts.isCallExpression(p) && p.expression === node) return // already `name()` — no double-wrap (#2592)
        if (ts.isNewExpression(p) && p.expression === node) return // `new name()` — same "followed by (" shape as a call
      }

      // Shorthand property (`{ name }`) expands key + rewrites value in one
      // edit (#1244). Every other reachable position here is a genuine
      // value reference — OR a shadowing declaration name (nested
      // parameter/`const`/`let`/destructured local): both get rewritten,
      // per `rewriteIdentifierAsAccessor`'s docstring on why a shadow is
      // left to fail loudly rather than silently misrewritten.
      const isShorthand = ts.isShorthandPropertyAssignment(p) && p.name === node
      const start = node.getStart(sf) - 1
      const end = node.getEnd() - 1
      edits.push({ start, end, replacement: isShorthand ? `${node.text}: ${replacement}` : replacement })
      return
    }
    ts.forEachChild(node, child => visit(child, active))
  }
  visit(sf, replacements)

  if (edits.length === 0) return expr
  // Apply right-to-left so earlier offsets stay valid as later ones grow.
  edits.sort((a, b) => b.start - a.start)
  let out = expr
  for (const e of edits) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end)
  }
  return out
}

/**
 * Rewrite each reference to a destructured loop-param binding in
 * `expr` to the corresponding `${accessor}${path}` form
 * (`renderLoopBindingAccess`).
 *
 * Shares `rewriteIdentifierReferences`'s AST walk with the plain-param
 * accessor rewrite, so an object-literal key (`{ color: 1 }`) or a member
 * name (`obj.color`) that merely spells a binding name stays as written
 * (#3260), and a shorthand property (`{ color }`) becomes
 * `{ color: __bfItem().color }` (#1244).
 */
function rewriteLoopBindingRefs(
  expr: string,
  bindings: readonly LoopParamBinding[],
  accessor: string,
): string {
  const replacements = new Map<string, string>()
  for (const b of bindings) replacements.set(b.name, renderLoopBindingAccess(b, accessor))
  return rewriteIdentifierReferences(expr, replacements, { skipCallee: false })
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
  /** This loop's index parameter name, when it declares one (#2859). */
  index?: string | null
  /** Names a nearer row rebinds, left as written (#3394). */
  shadowed?: ReadonlySet<string>
}

/**
 * Apply wrapLoopParamAsAccessor for multiple loop params.
 * Used during template generation to wrap expression values at IR level,
 * avoiding post-hoc regex replacement on full template strings.
 *
 * Accepts either a bare param name or a spec carrying destructure bindings.
 *
 * #2482: this `loopParams` parameter (and the same-named param on
 * `irToHtmlTemplate` / `irToPlaceholderTemplate` in `html-template.ts`,
 * threaded through `collect-elements.ts` / `build-event-delegation.ts`) is
 * NOT one of the ratchet's tracked ad-hoc scope devices, even though the
 * ledger's textual pattern happens to match its spelling. `BindingScope`
 * answers EXISTENCE/kind/depth queries about bound names; this ordered
 * `ReadonlyArray<string | LoopParamSpec>` instead carries the ACCESSOR-
 * REWRITE payload for outermost-to-innermost text substitution
 * (`item` → `__bfItem().path`) — a rendering/codegen concern `BindingScope`
 * has no field for by design, the client-JS-emitter twin of the Go
 * adapter's `loopBindingStack` (see that field's docstring on
 * `GoTemplateAdapter`). Order matters here (each nesting level's wrap
 * composes over the previous), which is exactly what a scope EXISTENCE
 * stack does not model.
 */
export function wrapExprWithLoopParams(expr: string, loopParams?: ReadonlyArray<string | LoopParamSpec>): string {
  if (!loopParams) return expr
  let result = expr
  for (const p of loopParams) {
    const spec = typeof p === 'string' ? { param: p } : p
    result = wrapLoopParamAsAccessor(result, spec.param, spec.bindings, spec.index, spec.shadowed)
  }
  return result
}

/**
 * Enclosing loop specs as seen inside the row of `loop`: each spec also
 * skips the names that row rebinds (`rowBoundNames`, #3394).
 */
export function specsInsideRow(
  specs: ReadonlyArray<string | LoopParamSpec> | undefined,
  loop: LoopBindingSource,
): ReadonlyArray<string | LoopParamSpec> | undefined {
  if (!specs) return specs
  const names = rowBoundNames(loop)
  if (names.size === 0) return specs
  return specs.map(p => {
    const spec = typeof p === 'string' ? { param: p } : p
    const shadowed = spec.shadowed ? new Set([...spec.shadowed, ...names]) : names
    return { ...spec, shadowed }
  })
}
