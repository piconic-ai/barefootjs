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
 *   - Every node anywhere in the body's IR tree is an `element`, `text`,
 *     `expression`, or `conditional` — a nested `loop`, `component`, `slot`,
 *     `fragment`, `if-statement`, `provider`, or `async` bails the WHOLE
 *     loop (no partial unroll; a loud refusal beats silently wrong output).
 *   - A `conditional` node (#2898) is foldable only when both `whenTrue` and
 *     `whenFalse` are themselves nullish (a `null`/`undefined` expression
 *     branch, matching `renderConditional`'s own empty-branch test) or
 *     foldable per this same walk, AND its condition classifies via
 *     `classifyBakedCondition` as item-literal (bakes to a Go literal
 *     condition per item) or item-INDEPENDENT (falls through to the normal
 *     reactive lowering unmodified — see that function's own docstring for
 *     why each is safe). A condition that mixes item-bound and
 *     item-independent names, or that can't be classified at all, bails the
 *     whole loop — baking one branch per item while leaving the other's
 *     markers/content out would desync from `renderConditional`'s
 *     slot-marker pairing.
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
  freeIdentifiers,
  parseExpression,
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
      case 'conditional':
        if (node.clientOnly) continue // renderClientOnlyConditional: item-independent comment markers.
        if (!isFoldableBranch(node.whenTrue) || !isFoldableBranch(node.whenFalse)) return false
        continue
      default:
        // 'loop' | 'component' | 'slot' | 'fragment' | 'if-statement' |
        // 'provider' | 'async' — none foldable per-item.
        return false
    }
  }
  return true
}

/** A conditional branch is foldable if it's a nullish (`null`/`undefined`) expression — `renderConditional` special-cases a nullish `whenFalse` with empty markers, and a nullish `whenTrue` renders as an empty string via the normal expression path — or itself a foldable tree. */
function isFoldableBranch(node: IRNode): boolean {
  if (isNullishBranch(node)) return true
  return isFoldableTree([node])
}

function isNullishBranch(node: IRNode): boolean {
  return node.type === 'expression' && (node.expr === 'null' || node.expr === 'undefined')
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
      continue
    }
    if (node.type === 'conditional') {
      if (node.clientOnly) continue // renderClientOnlyConditional: item-independent comment markers.
      const parsedCondition = node.parsedCondition ?? parseExpression(node.condition.trim())
      if (classifyBakedCondition(parsedCondition, bindings) === null) return false
      const branchFolds = (branch: IRNode) => isNullishBranch(branch) || allExpressionsFoldFor([branch], bindings)
      if (!branchFolds(node.whenTrue) || !branchFolds(node.whenFalse)) return false
      continue
    }
  }
  return true
}

function resolvesToScalar(expr: ParsedExpr, bindings: ReadonlyMap<string, unknown>): boolean {
  const resolved = evaluateStaticLiteral(expr, bindings)
  if (resolved === null) return false
  return scalarToGoLiteral(resolved.value) !== null
}

/**
 * A conditional's condition, classified for per-item baking (#2898):
 *   - `literal`: fully resolves via `evaluateStaticLiteral` against the item
 *     bindings — the SAME value for this one item on every render, so the
 *     caller substitutes the Go literal directly (`{{if true}}`) instead of
 *     the runtime-evaluated condition.
 *   - `independent`: references none of the item's bound names at all (a
 *     signal call, an outer const, ...) — safe to fall through to the
 *     adapter's normal `renderConditionExpr` lowering unmodified, since that
 *     path never depends on the unrolled body's missing `{{range}}` dot
 *     context in the first place.
 *   - `null` (unclassifiable): the condition mixes item-bound and
 *     item-independent names, `freeIdentifiers` can't analyze its shape, OR
 *     it's item-bound but not literal-resolvable (e.g. `item.count > 0`,
 *     `binary`/`logical` shapes `evaluateStaticLiteral` doesn't evaluate) —
 *     the caller must bail (loud refusal, not a guess) rather than guess a
 *     value. Not tracked as a separate capability gap: it's the same
 *     `evaluateStaticLiteral` coverage boundary every other item-literal
 *     bake in this module already accepts (`resolvesToScalar`, above).
 */
export type BakedCondition = { kind: 'literal'; go: string } | { kind: 'independent' }

export function classifyBakedCondition(
  expr: ParsedExpr,
  bindings: ReadonlyMap<string, unknown>,
): BakedCondition | null {
  const resolved = evaluateStaticLiteral(expr, bindings)
  if (resolved !== null) {
    // A condition only needs its JS truthiness, not a printable value — so
    // (unlike `resolvesToScalar`, used for text/attrs) a non-scalar or
    // nullish resolved value still classifies, via the same truthiness Go's
    // `{{if}}` and JS's `? :` already agree on for every other value kind.
    return { kind: 'literal', go: resolved.value ? 'true' : 'false' }
  }
  const free = freeIdentifiers(expr)
  if (free === null) return null
  for (const name of bindings.keys()) {
    if (free.has(name)) return null
  }
  return { kind: 'independent' }
}
