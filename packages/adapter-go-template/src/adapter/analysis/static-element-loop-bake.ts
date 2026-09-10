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
 *     `expression`, `conditional`, or (#2893) a nested `loop` — a
 *     `component`, `slot`, `fragment`, `if-statement`, `provider`, or
 *     `async` bails the WHOLE loop (no partial unroll; a loud refusal beats
 *     silently wrong output).
 *   - A nested `loop` node (#2893, e.g. `item.children.map(child => ...)`)
 *     is foldable only when it independently satisfies every one of THIS
 *     module's own gates (`isBakeableLoopShape` — no child component, not
 *     `.flatMap()`, plain non-destructured param, no index param, no
 *     filter/sort, not multi-root/whole-item-conditional) AND its own body
 *     is foldable by this same recursive walk. Its array need not be a
 *     named const — `item.children` (a member read off the OUTER item) also
 *     resolves, via `evaluateStaticLiteral` against the accumulating
 *     outer→inner bindings map (`resolveBakedLoopSource`) rather than
 *     `resolveStaticLoopSource`'s named-const-only path. Arbitrarily deep
 *     nesting composes for free: each level's per-item pass adds its own
 *     param to the SAME bindings map before recursing into the next.
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
  | 'clientOnly'
>

type BakeOpts = { isNameShadowed?: (name: string) => boolean; bindings?: ReadonlyMap<string, unknown> }

const EMPTY_BINDINGS: ReadonlyMap<string, unknown> = new Map()

/**
 * The 9 shape gates every bakeable loop (outer or nested, #2893) must pass,
 * independent of whether its own body/array happen to resolve. Split out
 * from `analyzeBakeableStaticElementLoop` so a nested `loop` node can be
 * gated the SAME way as the outer one, by the same code.
 */
function isBakeableLoopShape(loop: LoopShape): boolean {
  if (loop.childComponent) return false // #2208's own path handles this shape.
  // `.flatMap()`: an item can fold to 0+ elements, and a complex callback
  // carries its body out-of-band (`flatMapCallback`, `children` left empty)
  // rather than in `children` — either way this pass's per-item, single-
  // element-tree model doesn't apply. Out of scope.
  if (loop.method === 'flatMap' || loop.flatMapCallback) return false
  if (!loop.param || /^[{[]/.test(loop.param)) return false
  if (loop.index && loop.index !== '_') return false
  if (loop.paramBindings && loop.paramBindings.length > 0) return false
  if (loop.filterPredicate || loop.sortComparator) return false
  if (loop.iterationShape || loop.objectIteration) return false
  if (loop.bodyIsMultiRoot || loop.bodyIsItemConditional) return false
  return true
}

/**
 * Analyze a `.map()` loop with a plain-element (non-component) body for
 * static unrolling. Returns the resolved item values (ready for the caller
 * to render the body once per item) or `null` when the shape isn't (yet)
 * bakeable this way — see the acceptance criteria in the module docstring.
 * `opts.bindings` carries an already-baked OUTER item (#2893, recursing
 * into a nested loop) — absent/empty at the top-level call.
 */
export function analyzeBakeableStaticElementLoop(
  loop: LoopShape,
  localConstants: ReadonlyArray<ConstantInfo>,
  opts?: BakeOpts,
): BakedStaticElementLoop | null {
  if (!isBakeableLoopShape(loop)) return null
  if (!isFoldableTree(loop.children)) return null

  const outerBindings = opts?.bindings ?? EMPTY_BINDINGS
  const items = resolveBakedLoopSource(loop.arrayParsed, localConstants, outerBindings, opts)
  if (items === null) return null

  for (const item of items) {
    const bindings = new Map(outerBindings)
    bindings.set(loop.param, item)
    if (!allExpressionsFoldFor(loop.children, bindings, localConstants, opts)) return null
  }
  return { items }
}

/**
 * Resolve a loop's array source against the accumulated outer-item
 * bindings (#2893). A bare identifier NOT already bound to an outer item
 * (the top-level loop's own array, or an inner loop whose array happens to
 * be a plain name) goes through `resolveStaticLoopSource`'s named
 * function/module-scope-const resolution, unchanged from before. Anything
 * else — a member/index-access read off a bound outer item
 * (`item.children`), or any other foldable expression shape — resolves via
 * `evaluateStaticLiteral` against the SAME bindings map the per-item fold
 * check uses, so the two can never disagree about what an inner loop's
 * array evaluates to.
 *
 * The bound-name check reads `arrayParsed`'s free identifiers, not just a
 * bare-identifier `arrayParsed` itself, so a shadowing loop param (an outer
 * `const item = ...` shadowed by an inner `.map(item => ...)`) always
 * resolves against the loop binding, never a same-named const — regardless
 * of whether a future `resolveStaticLoopSource` learns to resolve member
 * reads off consts.
 */
function resolveBakedLoopSource(
  arrayParsed: ParsedExpr | undefined,
  localConstants: ReadonlyArray<ConstantInfo>,
  bindings: ReadonlyMap<string, unknown>,
  opts?: { isNameShadowed?: (name: string) => boolean },
): unknown[] | null {
  if (!arrayParsed) return null
  const free = freeIdentifiers(arrayParsed)
  const referencesBoundName = free !== null && [...free].some((name) => bindings.has(name))
  if (!referencesBoundName) {
    const resolved = resolveStaticLoopSource(arrayParsed, localConstants, opts)
    if (resolved !== null) return resolved
  }
  const evaluated = evaluateStaticLiteral(arrayParsed, bindings)
  return Array.isArray(evaluated?.value) ? evaluated.value : null
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
      case 'loop':
        // #2893: a nested loop's per-item resolvability (its array against
        // the OUTER item, its own body against ITS item) is checked later in
        // `allExpressionsFoldFor`, where the accumulating bindings map is
        // available — here just the structural (item-independent) shape.
        //
        // A clientOnly nested loop bails here (unlike the clientOnly
        // conditional case above, whose `cond.slotId` markers are proven
        // safe to repeat once per unrolled row): `renderLoop`'s clientOnly
        // branch emits ONE `{{bfComment "loop:<markerId>"}}` pair per call
        // site, and repeating that same markerId once per unrolled outer
        // row is untested against the client's per-row insertion targeting
        // — refuse loudly (#2918) rather than admit an unverified shape.
        if (node.clientOnly) return false
        if (!isBakeableLoopShape(node) || !isFoldableTree(node.children)) return false
        continue
      default:
        // 'component' | 'slot' | 'fragment' | 'if-statement' | 'provider' |
        // 'async' — none foldable per-item.
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
function allExpressionsFoldFor(
  nodes: readonly IRNode[],
  bindings: ReadonlyMap<string, unknown>,
  localConstants: ReadonlyArray<ConstantInfo>,
  opts?: BakeOpts,
): boolean {
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
      if (!allExpressionsFoldFor(node.children, bindings, localConstants, opts)) return false
      continue
    }
    if (node.type === 'conditional') {
      if (node.clientOnly) continue // renderClientOnlyConditional: item-independent comment markers.
      const parsedCondition = node.parsedCondition ?? parseExpression(node.condition.trim())
      if (classifyBakedCondition(parsedCondition, bindings) === null) return false
      const branchFolds = (branch: IRNode) => isNullishBranch(branch) || allExpressionsFoldFor([branch], bindings, localConstants, opts)
      if (!branchFolds(node.whenTrue) || !branchFolds(node.whenFalse)) return false
      continue
    }
    if (node.type === 'loop') {
      // #2893: recurse the WHOLE analysis (shape gates + structural fold +
      // per-item fold) for the nested loop, seeded with the bindings
      // accumulated so far — `analyzeBakeableStaticElementLoop` adds its own
      // param on top before checking ITS body, so a third level nests the
      // same way a second one does. A clientOnly nested loop never reaches
      // here — `isFoldableTree`'s structural pass already bailed it.
      if (analyzeBakeableStaticElementLoop(node, localConstants, { ...opts, bindings }) === null) return false
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
