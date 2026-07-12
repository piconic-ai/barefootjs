/**
 * Compile-time UNROLL for a static-array `.map()` loop whose body is a
 * PLAIN ELEMENT TREE (no child component) — go-only follow-up to #2208
 * (#2224 shape 1). `html/template` has no slice/map literal syntax, so
 * unlike the other 7 template adapters (which splice a serialized literal
 * straight into the loop header — #2208), Go can't bind a compile-time-only
 * array as a `{{range}}` source at all. Rather than synthesizing a Go struct
 * type for the item shape (a materially bigger lift — see the #2224 issue
 * body's "suggested fix direction"), this module verifies the loop body is
 * fully foldable against every item and lets the caller
 * (`go-template-adapter.ts`'s `renderLoop`) render the body once PER ITEM
 * with every item-derived value substituted as a compile-time-known Go
 * literal — no `{{range}}`, no struct, no field lookup, so no hidden runtime
 * failure mode either (`html/template` resolves struct fields at EXECUTE
 * time, not Go compile time).
 *
 * ACCEPTANCE CRITERIA — `analyzeBakeableStaticElementLoop` returns `null`
 * (caller keeps today's BF101 refusal) unless ALL of the following hold:
 *
 *   - The loop has no child component (that shape is #2208's own baking
 *     path — `analyzeBakeableStaticChildLoop`).
 *   - Not a `.flatMap()` (`method: 'flatMap'` / `flatMapCallback` set) — an
 *     item can fold to 0+ elements there, and a complex callback carries its
 *     body out-of-band rather than in `children`; out of scope.
 *   - The loop array resolves via `resolveStaticLoopSource` (a fully-static
 *     array literal, inline or a named function-scope const;
 *     `isNameShadowed`-checked — the SAME resolution #2208 already trusts
 *     for the child-component shape).
 *   - The callback param is a simple identifier (no array/object destructure
 *     pattern).
 *   - The callback does NOT bind an index parameter (`.map((item, i) =>
 *     ...)`, or `.entries()`/`.keys()`/`Object.entries()`-style pre-map
 *     iteration) — deliberately excluded from the evaluator surface even
 *     though the index value is technically knowable at unroll time, to
 *     keep the per-item binding set identical to #2208's (item-only).
 *   - No `.filter()` / `.sort()` chained onto the `.map()` — out of scope.
 *   - The body is neither multi-root (`bodyIsMultiRoot`) nor a whole-item
 *     conditional (`bodyIsItemConditional`) — those need anchor-marker
 *     machinery this pass doesn't attempt to reproduce per item.
 *   - Every node anywhere in the body's IR tree is an `element`, `text`, or
 *     `expression` — a nested `loop`, `conditional`, `component`, `slot`,
 *     `fragment`, `if-statement`, `provider`, or `async` bails the WHOLE
 *     loop (no partial unroll; a loud refusal beats silently wrong output).
 *   - Every element attribute is `literal` / `boolean-attr` /
 *     `boolean-shorthand`, or a plain `expression` whose parsed kind is one
 *     of `identifier` / `member` / `index-access` / `literal`. An attribute
 *     `template-literal` or `conditional` bypasses the Go adapter's normal
 *     `convertExpressionToGo` emission path in its own attribute emitter
 *     (it calls `renderParsedExpr` directly and splices the result assuming
 *     adapter-specific self-wrapping conventions) — baking those would need
 *     separate handling, deferred. `spread` / `jsx-children` attrs bail.
 *   - Every dynamic text `expression` node (any parsed kind, INCLUDING
 *     `template-literal` — text always funnels through
 *     `convertExpressionToGo` uniformly, no bypass) resolves via
 *     `evaluateStaticLiteral(expr.parsed, itemBindings)` to a scalar
 *     (string/number/boolean) for EVERY item. A signal/memo call, a
 *     reference to any non-item-static local (props, outer consts, an
 *     enclosing loop's own param), an unresolvable nested method chain, or
 *     a non-scalar (array/object) result bails the whole loop.
 *
 * Analysis only (mirrors `static-child-loop-bake.ts`): this module never
 * emits Go syntax. `go-template-adapter.ts`'s `renderLoop` re-runs the SAME
 * `evaluateStaticLiteral` call per item through its own
 * `convertExpressionToGo` override once this analysis has cleared the whole
 * loop, so the two passes can never disagree — this pass is pure validation,
 * with no adapter-state side effects to roll back if it can't clear a loop.
 */

import {
  evaluateStaticLiteral,
  resolveStaticLoopSource,
  type ConstantInfo,
  type IRElement,
  type IRLoop,
  type IRNode,
  type ParsedExpr,
} from '@barefootjs/jsx'
import { scalarToGoLiteral } from './static-child-loop-bake.ts'

export interface BakedStaticElementLoop {
  items: unknown[]
}

const ALLOWED_ATTR_EXPRESSION_KINDS: ReadonlySet<ParsedExpr['kind']> = new Set([
  'identifier',
  'member',
  'index-access',
  'literal',
])

type LoopShape = Pick<
  IRLoop,
  | 'childComponent'
  | 'param'
  | 'index'
  | 'arrayParsed'
  | 'children'
  | 'filterPredicate'
  | 'sortComparator'
  | 'bodyIsMultiRoot'
  | 'bodyIsItemConditional'
  | 'paramBindings'
  | 'iterationShape'
  | 'objectIteration'
  | 'method'
  | 'flatMapCallback'
>

/**
 * Analyze a `.map()` loop with a plain-element (non-component) body for
 * static unrolling. Returns the resolved item values (ready for the caller
 * to render the body once per item) or `null` when the shape isn't (yet)
 * bakeable this way — see the acceptance criteria in the module docstring.
 */
export function analyzeBakeableStaticElementLoop(
  loop: LoopShape,
  localConstants: ReadonlyArray<ConstantInfo>,
  opts?: { isNameShadowed?: (name: string) => boolean },
): BakedStaticElementLoop | null {
  if (loop.childComponent) return null // #2208's own path handles this shape.
  // `.flatMap()`: an item can fold to 0+ elements, and a complex callback
  // carries its body out-of-band (`flatMapCallback`, `children` left empty)
  // rather than in `children` — either way this pass's per-item, single-
  // element-tree model doesn't apply. Out of scope.
  if (loop.method === 'flatMap' || loop.flatMapCallback) return null
  if (!loop.param || /^[{[]/.test(loop.param)) return null
  if (loop.index && loop.index !== '_') return null
  if (loop.paramBindings && loop.paramBindings.length > 0) return null
  if (loop.filterPredicate || loop.sortComparator) return null
  if (loop.iterationShape || loop.objectIteration) return null
  if (loop.bodyIsMultiRoot || loop.bodyIsItemConditional) return null
  if (!isFoldableTree(loop.children)) return null

  const items = resolveStaticLoopSource(loop.arrayParsed, localConstants, opts)
  if (items === null) return null

  for (const item of items) {
    const bindings = new Map<string, unknown>([[loop.param, item]])
    if (!allExpressionsFoldFor(loop.children, bindings)) return null
  }
  return { items }
}

/**
 * Structural (item-independent) pass: every node kind in the subtree must be
 * one this module knows how to fold, and every attribute value must be a
 * shape `convertExpressionToGo`'s normal (non-bypassing) path handles.
 */
function isFoldableTree(nodes: readonly IRNode[]): boolean {
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'expression':
        continue // resolvability is checked per-item in `allExpressionsFoldFor`.
      case 'element':
        if (!isFoldableAttrs(node)) return false
        if (!isFoldableTree(node.children)) return false
        continue
      default:
        // 'conditional' | 'loop' | 'component' | 'slot' | 'fragment' |
        // 'if-statement' | 'provider' | 'async' — none foldable per-item.
        return false
    }
  }
  return true
}

function isFoldableAttrs(element: IRElement): boolean {
  for (const attr of element.attrs) {
    if (attr.clientOnly) continue // omitted from SSR emission entirely.
    switch (attr.value.kind) {
      case 'literal':
      case 'boolean-attr':
      case 'boolean-shorthand':
        continue
      case 'expression':
        if (!attr.value.parsed || !ALLOWED_ATTR_EXPRESSION_KINDS.has(attr.value.parsed.kind)) return false
        continue
      default:
        // 'template' / 'spread' / 'jsx-children'
        return false
    }
  }
  return true
}

/** Per-item pass: every expression actually resolves to a bakeable scalar. */
function allExpressionsFoldFor(nodes: readonly IRNode[], bindings: ReadonlyMap<string, unknown>): boolean {
  for (const node of nodes) {
    if (node.type === 'expression') {
      if (node.clientOnly) continue // renders as an item-independent marker.
      if (!node.parsed || !resolvesToScalar(node.parsed, bindings)) return false
      continue
    }
    if (node.type === 'element') {
      for (const attr of node.attrs) {
        if (attr.clientOnly) continue
        if (attr.value.kind !== 'expression') continue
        if (!attr.value.parsed || !resolvesToScalar(attr.value.parsed, bindings)) return false
      }
      if (!allExpressionsFoldFor(node.children, bindings)) return false
    }
  }
  return true
}

function resolvesToScalar(expr: ParsedExpr, bindings: ReadonlyMap<string, unknown>): boolean {
  const resolved = evaluateStaticLiteral(expr, bindings)
  if (resolved === null) return false
  return scalarToGoLiteral(resolved.value) !== null
}
