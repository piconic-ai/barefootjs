/**
 * BarefootJS Compiler - Pure IR Types
 *
 * JSX-independent intermediate representation for multi-backend support.
 */

import type { ParsedExpr, ParsedStatement } from './expression-parser.ts'
import type { SsrSeedPlan } from './ssr-seed-plan.ts'

/**
 * Loop-hoisted sort comparator for the `.sort().map()` / `.toSorted().map()`
 * pattern (#2018 P5). Carries the generic comparator `arrow` (params + body)
 * that the SSR adapter serializes to the runtime evaluator (eval-first) or, for
 * a `localeCompare` comparator the evaluator can't model, recovers a structured
 * comparator from via `sortComparatorFromArrow`. The `paramA` / `paramB` / `raw`
 * fields round-trip the comparator to native JS for the client / CSR path
 * (`(paramA, paramB) => raw`), so the client is untouched.
 */
export type IRLoopSort = {
  // Always the comparator arrow itself — narrowed so consumers read
  // `.params` / `.body` without a defensive `kind` check or non-null assertion.
  arrow: Extract<ParsedExpr, { kind: 'arrow' }>
  paramA: string
  paramB: string
  raw: string
}

// =============================================================================
// Source Location (for Error Reporting)
// =============================================================================

export interface Position {
  line: number // 1-indexed
  column: number // 0-indexed
}

export interface SourceLocation {
  file: string
  start: Position
  end: Position
}

// =============================================================================
// Type Information
// =============================================================================

export type TypeKind =
  | 'primitive'
  | 'object'
  | 'array'
  | 'union'
  | 'function'
  | 'interface'
  | 'unknown'

export interface TypeInfo {
  kind: TypeKind
  raw: string // Original TypeScript type string

  // For primitives
  primitive?: 'string' | 'number' | 'boolean' | 'null' | 'undefined'

  /** Set when the type is a LITERAL of its primitive family (`'a'`, `42`,
   *  `true`) — the literal's source value. `typeNodeToTypeInfo` lowers a
   *  literal type to `kind: 'primitive'` + this field, so family-only
   *  consumers need no special case and value consumers never re-parse
   *  `raw`. */
  literalValue?: string

  // For objects/interfaces
  properties?: PropertyInfo[]

  // For arrays
  elementType?: TypeInfo

  // For unions
  unionTypes?: TypeInfo[]

  // For functions
  params?: ParamInfo[]
  returnType?: TypeInfo
}

export interface PropertyInfo {
  name: string
  type: TypeInfo
  optional: boolean
  readonly: boolean
}

export interface ParamInfo {
  name: string
  type: TypeInfo
  optional: boolean
  defaultValue?: string
  /**
   * `defaultValue` parsed into a structured tree, mirroring `SignalInfo.parsed`
   * (Roadmap A). Attached best-effort by the analyzer (`tsNodeToParsedExpr` on
   * the binding element's own `initializer` node — no re-parse of the
   * `defaultValue` text) so adapters can classify a destructure default's
   * literal shape (`{ count = 3 }`, `{ ratio = 1.5 }`) from structure instead
   * of regexing `defaultValue`. Absent when the shape isn't supported;
   * consumers fall back to text-matching `defaultValue`.
   */
  parsed?: ParsedExpr
  /** When true, the default value contains an arrow function or function expression (computed from AST). */
  defaultContainsArrow?: boolean
  /** When true, the parameter is a rest spread (`...args`) — emit must prepend `...`. */
  isRest?: boolean
  /**
   * Source property name for an aliased destructured prop (`{ createdAt: c }`
   * → name: 'c', sourceName: 'createdAt'). Set ONLY when the binding renames —
   * an un-aliased binding leaves it unset so existing IR shapes/snapshots are
   * untouched. Consumers keying into `propsType.properties` must use
   * `sourceName ?? name` (the param's own `type` degrades to `unknown` for
   * non-primitive props — `collectMemberTypes`' primitives-only gate).
   */
  sourceName?: string
}

// =============================================================================
// Staged-IR primitives: Phase / Scope / Effect (#1138)
// =============================================================================

/**
 * **Phase** — *when* a piece of code runs.
 *
 * BarefootJS compiles a single .tsx into code that executes across multiple
 * temporal stages. Each IR node that carries an expression can be tagged
 * with the phase its expression belongs to. The relocate pass (P3 of the
 * staged-IR refactor) consults `phase` when deciding what rewrites are
 * required to move an expression between stages.
 *
 * | Phase     | When                              | Visible bindings                        |
 * |-----------|-----------------------------------|------------------------------------------|
 * | `compile` | `bun build` time                  | `ts.Node`, IR, types                     |
 * | `ssr`     | request time (server)             | props, server-side imports               |
 * | `hydrate` | client first render (template)    | `_p`, module imports — NOT init-locals  |
 * | `tick`    | signal change (effects)           | signal getters, `_p`, init-locals        |
 * | `event`   | DOM event handler invoked         | event arg, signal setters, init-locals   |
 *
 * A `compile`-phase value is fully resolvable at build time (literal,
 * static const). `hydrate`-phase values can read `_p` and module imports
 * but cannot reach init-scope locals — that's the boundary that
 * historically produced the #1127 / #1128 / #1132 / #1137 family of bugs.
 */
export type Phase = 'compile' | 'ssr' | 'hydrate' | 'tick' | 'event'

/**
 * **Scope** — *where* a piece of code lives in the emitted module.
 *
 * Distinct from Phase: two pieces of code can share a Phase but live in
 * different Scopes (e.g., the init function body and an event handler
 * both run at `tick`/`event` Phase but belong to different lexical
 * scopes). `relocate(expr, fromScope, toScope, env)` is the single
 * function that knows how to bridge the two.
 *
 * | Scope          | Lexical container                                |
 * |----------------|---------------------------------------------------|
 * | `module`       | top-level of the emitted .client.js              |
 * | `init`         | inside `function init<Comp>(__scope, _p) { ... }`|
 * | `template`     | inside `template: (_p) => \`...\``               |
 * | `sub-init`     | nested arrow / function-expression in `init`     |
 * | `render-item`  | mapArray callback                                 |
 *
 * Visibility rules are documented in spec/compiler.md (added in P7).
 */
export type Scope = 'module' | 'init' | 'template' | 'sub-init' | 'render-item'

/**
 * **Effect** — what the expression does to the surrounding world.
 *
 * Used by relocate() to decide inlining safety. A `pure` expression can
 * be freely duplicated across phases. `signal-read` cannot be evaluated
 * at `hydrate` Phase (signals don't have a value yet). `signal-write`
 * and `dom` mutations cannot be moved or duplicated at all.
 */
export type Effect = 'pure' | 'signal-read' | 'signal-write' | 'dom' | 'io'

/**
 * **OriginInfo** — the staged-IR tuple attached to expression-bearing
 * IR nodes. All fields are optional during the migration period so
 * pre-staged-IR producers continue to work; the relocate() pass
 * gracefully degrades to the legacy `templateValue` / `templateExpr`
 * fallback when `origin` is absent.
 *
 * Once P2–P4 of the refactor land, every expression-bearing node will
 * carry this and the legacy `template*` fields become emit-time
 * derivations rather than analyzer outputs.
 */
export interface OriginInfo {
  /** Phase this expression was authored in. */
  phase: Phase
  /** Scope this expression was authored in. */
  scope: Scope
  /** Effect class — drives inline / lift / reject decisions in relocate(). */
  effect: Effect
  /**
   * Free identifiers used by this expression, classified by where they
   * resolve. Populated by the analyzer; consumed by relocate() to
   * decide rewrite shape per identifier without re-walking the AST.
   */
  freeRefs?: FreeReference[]
}

/**
 * A single free identifier used by an expression, resolved against the
 * authoring scope's binding environment.
 */
export interface FreeReference {
  /**
   * Identifier text. For every kind except `'reactive-brand'` this is a
   * bare identifier (`count`, `props`, …) and downstream rewriters can
   * treat it as a word-boundary token. For `'reactive-brand'` it is the
   * full property-access expression text (e.g. `props.form.isSubmitting`)
   * because the brand lives on the access expression as a whole — the
   * root identifier of that access is reported separately under its own
   * kind. `relocate()` rewrites identifier refs by name, so consumers
   * that touch `reactive-brand` entries must consult `kind` before
   * matching.
   */
  name: string
  /** Where the binding for this name lives. */
  bindingScope: Scope
  /**
   * Kind of binding. Drives relocate() — e.g. `prop` lifts to `_p.X`,
   * `signal-getter` cannot relocate to `template`, `module-import`
   * needs the import preserved by emit.
   */
  kind: BindingKind
}

export type BindingKind =
  | 'prop'            // destructured-from-props or props.X
  | 'signal-getter'   // [count, setCount] = createSignal(...) → count
  | 'signal-setter'   // → setCount
  | 'memo-getter'     // createMemo(...)
  | 'reactive-brand'  // identifier carrying Reactive<T> brand from a library
                      // (e.g. form.isSubmitting, username.error) — reactivity
                      // comes from the type, not from a local declaration
  | 'init-local'      // const x = ... in init body (not a memo/signal)
  | 'sub-init-local'  // declared inside a nested arrow / function
  | 'render-item'     // .map() callback param
  | 'module-import'   // from an import declaration
  | 'module-local'    // module-level const/function (not imported)
  | 'global'          // not declared anywhere we tracked → assume global

/**
 * Static visibility table — kinds NOT directly emittable as a bare
 * identifier in a given Scope. "Bare" is the key word: a `prop` at
 * `template` IS reachable, but only via `_p.X` — the bare identifier
 * `X` resolves to nothing in template scope. relocate() consults this
 * to decide whether a rewrite is required (out-of-table = bare-emittable).
 */
const SCOPE_FORBIDDEN: Record<Scope, ReadonlySet<BindingKind>> = {
  module: new Set([
    'prop',
    'signal-getter',
    'signal-setter',
    'memo-getter',
    'reactive-brand',
    'init-local',
    'sub-init-local',
    'render-item',
  ]),
  init: new Set([]),
  template: new Set([
    // `prop` is reachable but requires the `_p.X` rewrite — not bare-emittable.
    'prop',
    'signal-getter',
    'signal-setter',
    'memo-getter',
    // A library getter (`form.isSubmitting()`) must be re-evaluated inside
    // an effect to subscribe — not bare-emittable in template scope.
    'reactive-brand',
    'init-local',
    'sub-init-local',
    'render-item',
  ]),
  'sub-init': new Set([]),
  'render-item': new Set([]),
}

/**
 * Returns true when a binding of the given kind can be emitted as a
 * bare identifier inside `scope` (no rewrite required). When this
 * returns false, relocate() rewrites the reference (lift to `_p.X`,
 * inline, or fallback) according to the §2.2 decision matrix.
 */
export function isVisibleIn(scope: Scope, kind: BindingKind): boolean {
  return !SCOPE_FORBIDDEN[scope].has(kind)
}

/**
 * BindingKinds that contribute reactivity to an enclosing expression.
 * Used by `isReactiveOrigin()` and any future single-channel classifier
 * derived from `OriginInfo.freeRefs`.
 *
 * `init-local` is intentionally excluded here — a local constant is only
 * reactive if its initializer itself contains a reactive reference, and
 * that taint should already be flattened into the consuming expression's
 * `freeRefs` by the analyzer (transitive resolution). Listing it here
 * would over-wrap any expression that references any local.
 */
export const REACTIVE_BINDING_KINDS: ReadonlySet<BindingKind> = new Set<BindingKind>([
  'prop',
  'signal-getter',
  'memo-getter',
  'reactive-brand',
])

/**
 * Single source of truth for "is this expression reactive?" once
 * `OriginInfo.freeRefs` is populated uniformly (issue #1248 + #1251).
 *
 * Until that migration is complete, callers must handle the absence of
 * `origin` themselves — this helper deliberately requires a non-optional
 * `OriginInfo` so the type system flags un-migrated sites.
 */
export function isReactiveOrigin(origin: OriginInfo): boolean {
  return origin.freeRefs?.some(r => REACTIVE_BINDING_KINDS.has(r.kind)) ?? false
}

// =============================================================================
// IR Node Types
// =============================================================================

export type IRNode =
  | IRElement
  | IRText
  | IRExpression
  | IRConditional
  | IRLoop
  | IRComponent
  | IRSlot
  | IRFragment
  | IRIfStatement
  | IRProvider
  | IRAsync

export interface IRElement {
  type: 'element'
  tag: string
  attrs: IRAttribute[]
  events: IREvent[]
  ref: string | null
  children: IRNode[]
  slotId: string | null
  needsScope: boolean
  /**
   * Page-lifecycle boundary id for an element lowered from `<Region>`
   * (spec/router.md). Set only on region host elements; adapters emit it as
   * `bf-region="<id>"`. Deterministic (`<file scope>:<index>`) so a layout's
   * shared partial carries the same id across every page that composes it.
   */
  regionId?: string
  loc: SourceLocation
}

export interface IRText {
  type: 'text'
  value: string
  loc: SourceLocation
}

export interface IRExpression {
  type: 'expression'
  expr: string
  /** Pre-transformed expr with destructured prop refs rewritten to _p.xxx (for client JS templates). */
  templateExpr?: string
  /**
   * Structured parse of `expr` (`parseExpression(expr.trim())`), attached once
   * during IR construction so SSR adapters emit from the tree instead of each
   * re-parsing the string at emit time (and so a multi-adapter build parses it
   * once, not per adapter). Plain serializable data.
   *
   * OPTIONAL by design — consumers MUST fall back to parsing `expr` when it is
   * missing. It is absent for an empty/whitespace `expr`, and may also be
   * absent for a node the IR-build walk doesn't reach (the walk is best-effort;
   * under-coverage is a missed optimization, never a behavioural change). When
   * present, an unparsable expression is a `{ kind: 'unsupported' }` node (the
   * adapter's own support gate handles it).
   */
  parsed?: ParsedExpr
  typeInfo: TypeInfo | null
  reactive: boolean
  slotId: string | null
  loc: SourceLocation
  /** When true, expression should be evaluated on client side only */
  clientOnly?: boolean
  /**
   * Stage 3 / D4 (spec/callback-fidelity.md) — this expression child references
   * an array built by an arbitrary `.map()` preamble (`return <tr>{out}</tr>`
   * where `out` is `push`-populated with element strings). Phase-2 string-
   * template emission must join it (`Array.isArray(out) ? out.join('') : …`)
   * rather than `String([])`-comma-collapse it. JSX SSR adapters ignore the
   * flag (their JSX runtime renders an array child natively).
   */
  joinArrayChild?: boolean
  /**
   * True when this expression was classified as a loop's preamble-patched
   * region (#2389 — see `IRLoop.preambleRegions`): its free identifiers
   * intersect the enclosing loop's `preamble.declaredNames`. Excludes the
   * node from `collectLoopChildReactiveTexts` (which patches via
   * `.textContent`, wrong for markup) regardless of `reactive` / `slotId` —
   * the region-patch effect (a claimed 'markup' slot writer, slot
   * unification A3) is its only wiring.
   */
  preambleRegion?: boolean
  /** When true, expression calls signal getters or memos (has reactive `foo()` pattern). */
  callsReactiveGetters?: boolean
  /** When true, expression contains function call(s) — any `identifier()` pattern (computed from AST). */
  hasFunctionCalls?: boolean
  /**
   * Staged-IR origin info (#1138). Mandatory as of #1248: every
   * expression-bearing IR node carries `origin` and downstream emit
   * passes (relocate, decideWrapFromAstFlags) read it as the single
   * source of truth for free-reference / reactivity classification.
   */
  origin: OriginInfo
  /**
   * Slot unification Step B (`spec/slot-unification.md` §3(b), §5 Step B):
   * true when this slot's `<!--bf:sN-->…<!--/-->` marker pair can be safely
   * omitted from BOTH SSR and CSR output, because `elidedPath` already gives
   * every claimer a real compile-time DOM path to the slot's position.
   * Decided EXACTLY ONCE, by `client-only-elision.ts`, before either
   * `adapter.generate()` (SSR) or `generateClientJs()` (CSR) run — every one
   * of the nine SSR adapters' `renderExpression` and the CSR template
   * emitters (`html-template.ts`) read this single flag and must never
   * re-derive their own elision decision. Unset/false is always safe
   * (keeps markers, today's behavior); only the compiler pass above may
   * ever set it true.
   */
  markerless?: boolean
  /**
   * Root-relative child-index path to this slot's position (parent index
   * chain, LAST element = the index of the slot itself within its parent's
   * `childNodes`). Valid, and required, only when `markerless` is true —
   * see `SlotSpec.markerless` in `@barefootjs/client/runtime/claim-slots.ts`
   * for the claim-time resolve-or-create semantics this path feeds.
   */
  elidedPath?: readonly number[]
}

export interface IRConditional {
  type: 'conditional'
  condition: string
  /** Pre-transformed condition with destructured prop refs rewritten to _p.xxx. */
  templateCondition?: string
  /**
   * Structured parse of `condition` (`parseExpression(condition.trim())`),
   * attached during IR construction so adapters lower the condition from the
   * tree instead of re-parsing the string. Optional/best-effort — see
   * `IRExpression.parsed`; consumers fall back to parsing `condition`.
   */
  parsedCondition?: ParsedExpr
  conditionType: TypeInfo | null
  reactive: boolean
  whenTrue: IRNode
  whenFalse: IRNode
  slotId: string | null
  loc: SourceLocation
  /** When true, condition should be evaluated on client side only */
  clientOnly?: boolean
  /** When true, condition calls signal getters or memos (has reactive `foo()` pattern). */
  callsReactiveGetters?: boolean
  /** When true, condition contains function call(s) — any `identifier()` pattern (computed from AST). */
  hasFunctionCalls?: boolean
  /**
   * Staged-IR origin info — same semantics as `IRExpression.origin`,
   * mandatory as of #1248. The condition expression's classification
   * and free-reference resolution live here; consumers
   * (`isReactiveOrigin`, relocate) read from here instead of running
   * their own walks.
   */
  origin: OriginInfo
}

/**
 * Child component info for loop rendering with createComponent()
 */
export interface IRLoopChildComponent {
  name: string
  slotId: string | null // Slot ID for querySelector targeting
  props: Array<{
    name: string
    value: AttrValue
    isEventHandler: boolean
  }>
  children: IRNode[] // Child nodes for nested component rendering
  loopDepth?: number // 0 = direct child of outer loop, 1+ = inside nested inner loops
  innerLoopArray?: string // Array expression of the innermost enclosing loop (for disambiguation)
  // True when this component sits inside a `conditional` / `if-statement` branch
  // below the enclosing loop body. Such components are initialized by the
  // conditional's `insert()` bindEvents at runtime; emitting them again from
  // the outer initializer would double-wire event handlers (#929).
  insideConditional?: boolean
}

export interface IRLoop {
  type: 'loop'
  /**
   * Array iteration method. Defaults to `'map'`. When `'flatMap'`, emitters
   * use `.flatMap()` instead of `.map()` and children may represent the
   * per-element fragments of the flattened result.
   *
   * For complex flatMap callbacks (block bodies with conditional returns,
   * variable-assigned JSX, etc.) that can't be decomposed into `children`,
   * `flatMapCallback` carries the full callback body with JSX compiled
   * inline via placeholder substitution — see `FlatMapCallback`.
   */
  method?: 'flatMap'
  array: string
  /**
   * Structured parse of `array` (`parseExpression(array.trim())`), attached
   * during IR construction so adapters lower the loop's array from the tree
   * instead of re-parsing the string (e.g. the Go adapter's scalar-literal
   * loop typing). Optional/best-effort — mirrors `IRExpression.parsed`;
   * consumers fall back to parsing `array`.
   */
  arrayParsed?: ParsedExpr
  /** Pre-transformed array expr with destructured prop refs rewritten to _p.xxx. */
  templateArray?: string
  arrayType: TypeInfo | null
  itemType: TypeInfo | null
  param: string
  index: string | null
  key: string | null
  children: IRNode[]
  slotId: string | null
  /**
   * Unique id for this loop's `<!--bf-loop:<id>--> ... <!--bf-/loop:<id>-->`
   * marker pair (#1087). Lets sibling `.map()` calls under the same parent
   * disambiguate their reconciliation range — without this, `findLoopMarkers`
   * returned the last pair to every consumer, so the second loop overwrote
   * the first into the same DOM range.
   */
  markerId: string
  loc: SourceLocation

  /**
   * True when the array needs no reconciliation (literal arrays, local consts
   * without prop/signal origin). False for signal arrays, function-call arrays,
   * and direct prop arrays — all of which compile to mapArray.
   */
  isStaticArray: boolean

  /**
   * True when the array is a direct prop reference promoted to mapArray (#1586).
   * Adapters use this to include the array in JSON serialization (bf-p)
   * even though isStaticArray is false — the client's mapArray needs the
   * initial data for hydration, unlike signal-backed arrays.
   */
  isPropDerivedArray?: boolean

  /**
   * When true, array expression calls signal getters or memos (computed from AST).
   * Derived Phase 1 so debug tooling (#944) can classify the wrap decision
   * without re-deriving reactivity from the expression string.
   */
  callsReactiveGetters?: boolean
  /**
   * When true, array expression contains any `identifier()` pattern (computed from AST).
   * Combined with `callsReactiveGetters` this distinguishes reactive loops
   * (`items().map(...)` where `items` is a signal) from fallback-wrapped loops
   * (`getItems().map(...)` where `getItems` is an opaque call).
   */
  hasFunctionCalls?: boolean

  /**
   * When the loop body is a single component, store its info here
   * for createComponent-based rendering instead of template strings.
   * This enables proper parent-to-child prop passing (including event handlers).
   */
  childComponent?: IRLoopChildComponent

  /**
   * When the loop body contains nested components (wrapped in elements),
   * store their info here for static array hydration.
   * This enables initializing components that are not direct children of the loop.
   */
  nestedComponents?: IRLoopChildComponent[]

  /**
   * Filter predicate for filter().map() pattern.
   * When present, the loop renders with an if-condition wrapping each iteration.
   * Example: todos.filter(t => !t.done).map(...) stores { param: 't', predicate: ParsedExpr, raw: '!t.done' }
   *
   * Block-body filters like
   *   filter(t => { const f = filter(); if (f === 'active') return !t.done; return true })
   * are normalized to a single boolean `predicate` expression at IR-build time
   * (#2040, `foldBlockToExpr` + `predicateTernaryToLogical` in `jsx-to-ir`), so
   * adapters only ever see the unified expression form — there is no separate
   * block-statement shape to lower.
   */
  filterPredicate?: {
    param: string
    predicate?: ParsedExpr        // Boolean predicate expression (folded from any block body)
    raw: string  // Original string for error messages
  }

  /**
   * Sort comparator for sort().map() / toSorted().map() pattern.
   * When present, the loop array is sorted before iteration.
   * Example: todos.sort((a, b) => a.priority - b.priority).map(...)
   *
   * The {@link IRLoopSort} struct carries the generic comparator `arrow`
   * (params + body) the SSR adapter serializes to the runtime evaluator
   * (eval-first; `sortComparatorFromArrow` fallback for `localeCompare`), plus
   * the param names + raw body for the client JS round-trip. Lifted off the
   * `.sort()` callback during `jsx-to-ir.ts` chain detection — see
   * `extractSortComparator`. (#2018 P5)
   */
  sortComparator?: IRLoopSort

  /**
   * When both filter and sort are chained, indicates the order of operations.
   * 'filter-sort': filter first, then sort (e.g., filter().sort().map())
   * 'sort-filter': sort first, then filter (e.g., sort().filter().map())
   */
  chainOrder?: 'filter-sort' | 'sort-filter'

  /**
   * Pre-`.map()` iteration shape (#1448 Tier B).
   *
   * When the user writes `arr.entries().map(([i, v]) => ...)`,
   * `arr.keys().map(i => ...)`, or `arr.values().map(v => ...)`,
   * the chain-detection in `transformMapCall` strips the iterator
   * method and records the shape here so adapters can emit the
   * right loop variable bindings:
   *
   *   - `'entries'` → both index and value are bound
   *     (Go: `$i, $v`; Mojo: `$i` + `$v = $arr->[$i]`)
   *   - `'keys'` → only the index is bound
   *     (Go: `$i, $_ :=`; Mojo: `$i` with no per-item lookup)
   *   - `undefined` / `'values'` → standard iteration (value only)
   *
   * The chain detection also synthesises proper `param` / `index`
   * from the `.entries()` destructure pattern so the BF104
   * destructure-param refusal doesn't fire.
   */
  iterationShape?: 'entries' | 'keys'

  /**
   * Pre-`.map()` object iteration (#2168 object-entries-map). Distinct
   * from {@link iterationShape}, which is scoped ENTIRELY to an array's
   * own zero-arg `.entries()`/`.keys()`/`.values()` methods — those
   * synthesize a real numeric index off the array's position, and every
   * adapter's consumption of `iterationShape` assumes an actual
   * array/slice underneath.
   *
   * `objectIteration` instead records the STATIC `Object.entries(x)` /
   * `Object.keys(x)` / `Object.values(x)` call form, where `x` is a
   * plain object/Record (not an array): the "index" bound for `'entries'`
   * is a STRING KEY, not a numeric position, and the collection an
   * adapter must iterate is its native map/dict/hash type, not an
   * array/slice. `transformMapCall` strips the `Object.<method>(...)`
   * wrapper the same way it strips `arr.entries()` — `array`/`arrayParsed`
   * end up holding just `x` — and records the shape here so each
   * adapter's loop renderer picks the right native construct:
   *
   *   - `'entries'` → both `index` (bound to the KEY) and `param` (bound
   *     to the VALUE), synthesized from the 2-element destructure the
   *     same way `iterationShape: 'entries'` is (see `jsx-to-ir.ts`'s
   *     `transformMapCall`) — e.g. Jinja `for k, v in x.items()`.
   *   - `'keys'` → `param` bound to the key only — e.g. Jinja
   *     `for k in x.keys()`.
   *   - `'values'` → `param` bound to the value only — e.g. Jinja
   *     `for v in x.values()`. Unlike the array case, `'values'` is NOT
   *     a no-op here: `Object.values(x)` genuinely differs from
   *     iterating `x` itself (`x` isn't iterable at all as a plain
   *     object), so it must be recorded.
   *
   * Iteration ORDER is native-map-dependent: Python `dict`/PHP
   * array-object/Ruby `Hash` preserve the source object's insertion
   * order (matching JS `Object.entries()` semantics exactly), so Jinja,
   * Twig, Blade, and ERB lower directly to their native map/dict/hash
   * iteration. Go's `map[string]T`, Rust's `BTreeMap` (deliberate design,
   * see `num.rs`), and Perl's hash (Xslate/Mojolicious) have NO
   * order-preserving native map type, so those four instead lower to a
   * DETERMINISTIC SORTED-BY-KEY iteration — Go's `{{range}}` (the
   * stdlib's own `fmtsort`), minijinja's `BTreeMap` (already sorted),
   * Kolon's `.kv()`/`.keys()`/`.values()` (verified empirically sorted),
   * and Mojolicious's explicit `sort keys %$hash` (mirroring the
   * existing `spread_attrs`/`_style_to_css` convention in
   * `BarefootJS.pm`). This is a documented, permanent known limitation
   * relative to JS's insertion-order guarantee (not a follow-up TODO) —
   * true insertion order is physically unrecoverable from those
   * languages' native map types once constructed, so sorted order is the
   * best available deterministic approximation, not an interim refusal.
   *
   * Only the OUTERMOST, unchained `Object.<method>(x).map(cb)` shape is
   * recognized — mirroring `iterationShape`'s own scope, chaining
   * (`Object.entries(x).filter(pred).map(cb)`) is not (yet) recognized
   * either, same as the array case.
   */
  objectIteration?: 'entries' | 'keys' | 'values'

  /**
   * Count of enclosing `.map()` loops (0 = outermost, 1 = nested one
   * level deep, ...). Adapters use this to derive the loop body's
   * `key`/`data-key` attribute suffix — `depth > 0 ? 'data-key-' +
   * depth : 'data-key'` — matching `keyAttrName()` in
   * `ir-to-client-js/utils.ts`, which the CSR path and the Hono SSR
   * adapter each already derive independently (a recursion counter and
   * a push/pop stack respectively). Before this field, the 8 template
   * (non-JS) adapters had no depth awareness at all and always emitted
   * plain `data-key` on nested-loop items (#2168 nested-loop-outer-binding).
   */
  depth: number

  /**
   * When true, loop should be evaluated on client side only.
   * SSR adapters should skip rendering and output placeholder markers.
   */
  clientOnly?: boolean

  /**
   * True when the loop body's top-level shape is a JSX Fragment carrying
   * two or more sibling elements (or any non-fragment children whose count
   * exceeds one). Drives per-item marker emission and multi-root template
   * cloning in the client JS / SSR (#1212). Single-root bodies set this to
   * false (the common case) and keep their existing emission verbatim.
   */
  bodyIsMultiRoot?: boolean

  /**
   * True when the loop body is a single whole-item conditional whose at
   * least one branch renders no element (`arr.map(t => cond && <li/>)` or
   * `cond ? <li/> : null`), so an item renders 0-or-1 element per pass
   * (#1665). Drives anchored emission: per-item `<!--bf-loop-i:KEY-->`
   * anchors in the template and a `mapArrayAnchored` call whose renderItem
   * lets `insert()` own the (possibly empty) content. Single-element bodies
   * and both-branch-element ternaries set this false and keep the legacy
   * `mapArray` emission.
   */
  bodyIsItemConditional?: boolean

  /** Type annotation for loop param (e.g., 'Desk'), preserved for .tsx output */
  paramType?: string
  /** Type annotation for loop index param (e.g., 'number'), preserved for .tsx output */
  indexType?: string
  /**
   * Structured pre-return statements of a block-body `.map()` callback
   * (Stage 3 root cure, spec/callback-fidelity.md). Replaces the former
   * `mapPreamble` / `templateMapPreamble` / `typedMapPreamble` string carriers
   * and `preambleFragments`: mixed content (JS text + JSX leaves) is carried as
   * a segment list, never as a sentinel-bearing string, so an emitter that
   * lacks preamble support cannot accidentally interpolate it — rendering goes
   * through `renderPreamble()` (html-template.ts) or not at all.
   */
  preamble?: MapCallbackPreamble

  /**
   * Expression children of the loop body whose free identifiers intersect
   * `preamble.declaredNames` (#2389, patch-on-update follow-up to the Stage 3
   * root cure) — e.g. `{cells}` in `arr.map(t => { const cells = []; ...;
   * return <tr>{cells}<td>{t.name}</td></tr> })`. `mapArray` reuses the same
   * DOM node on a same-key item update via per-item `setItem`, re-running
   * only the wired text/attr slots — a preamble-derived child has NEITHER
   * (it's a bare interpolation, `joinArrayChild` array-join or otherwise),
   * so without this it freezes at its mount-time value forever. Each entry's
   * `slotId` is emitted as the usual `<!--bf:sN-->...<!--/-->` marker pair
   * (same door as a reactive text slot — `irToHtmlTemplate` / Hono's
   * `renderExpression` key off `slotId` alone), but the CLIENT wiring is a
   * distinct claimed 'markup'-slot region-patch effect (`preambleRegions`
   * in the client-JS loop plan), NOT a `reactiveTexts` entry — patching via
   * `.textContent` would escape markup that a `joinArrayChild` region must
   * render raw. `collectLoopChildReactiveTexts` excludes any node collected
   * here (`IRExpression.preambleRegion`) so a qualifying expression is never
   * double-wired. Populated only when `preamble` is set and the loop is NOT
   * `isStaticArray` — a static array's SSR-rendered items are never
   * recreated via signals, so there is nothing to patch.
   */
  preambleRegions?: PreambleRegionSource[]

  /**
   * When `.map(callback)` destructures its item parameter (array or object
   * pattern), this captures each destructured binding's name and the
   * accessor path into the item. The client-JS emitter rewrites binding
   * references to `__bfItem().path` so fine-grained effects read the
   * per-item signal accessor instead of a once-captured local (#951).
   *
   * Example: `.map(([, cfg]) => ...)` produces `[{ name: 'cfg', path: '[1]' }]`.
   * Example: `.map(({ user: { name } }) => ...)` produces `[{ name: 'name', path: '.user.name' }]`.
   *
   * Absent when the param is a simple identifier or when the pattern
   * contains unsupported shapes (rest element, computed property key) —
   * those cases raise `BF025` at Phase 1.
   */
  paramBindings?: LoopParamBinding[]
  /**
   * Pre-computed free identifiers referenced by the `array` expression
   * (#1267). Populated during `transformMapCall` from the originating AST
   * node so downstream callers can ask `arrayFreeIdentifiers.has(name)`
   * instead of running word-boundary regex against `array`.
   */
  arrayFreeIdentifiers?: ReadonlySet<string>

  /**
   * For flatMap callbacks whose body can't be decomposed into simple
   * `children` (block bodies with conditional returns, variable-assigned
   * JSX, etc.). Carries the body as structured segments (JS text +
   * compiled JSX-leaf IR) rendered through `renderPreamble()`, plus the
   * raw TSX for JSX-runtime SSR adapters.
   *
   * When present, `children` is empty — emitters use this field instead.
   */
  flatMapCallback?: FlatMapCallback
}

/**
 * A compiled flatMap callback body, carried as structured segments (the same
 * shape as {@link MapCallbackPreamble}, rendered through the same
 * `renderPreamble()` door) — never as a sentinel-bearing string. JSX-runtime
 * SSR adapters emit `rawBody` (real TSX, branded) instead.
 */
export interface FlatMapCallback {
  /** Callback parameters text, e.g. `"(frame, i)"` */
  params: string
  /** Callback body as js-text / compiled-JSX-leaf segments. */
  segments: PreambleSegment[]
  /** Original callback body text (JSX intact) for JSX-runtime SSR adapters. */
  rawBody: TsxSourceText
}

/**
 * Raw TSX source text (types + JSX intact), branded so it is only assignable
 * where a JSX-runtime SSR adapter emits real TSX (Hono / TestAdapter). Plain
 * strings destined for the client bundle cannot satisfy this type, and this
 * type must never be spliced into plain-JS emission — the write-side twin of
 * the "never parse JS with regex" rule: raw source crossing into an emitted
 * artifact is tagged with its only legal destination.
 */
export type TsxSourceText = string & { readonly __tsxSourceBrand: unique symbol }

/** Constructor for {@link TsxSourceText} — the single place the brand is applied. */
export function tsxSourceText(raw: string): TsxSourceText {
  return raw as TsxSourceText
}

/**
 * One segment of a `.map()` callback preamble. Mixed content is structured,
 * never a sentinel-bearing string: `js` segments carry JSX-free JS source text
 * (types stripped; `templateText` set when the destructured-prop rewrite
 * differs), `jsx` segments carry the compiled IR of one JSX leaf. Segments
 * concatenate in source order with no separators (they are sub-statement
 * spans).
 */
export type PreambleSegment =
  | {
      kind: 'js'
      /** Type-stripped JS text for the client bundle. */
      text: string
      /** `text` with destructured prop refs rewritten to `_p.xxx`, when different. */
      templateText?: string
    }
  | { kind: 'jsx'; ir: IRNode }

/**
 * The structured pre-return statements of a block-body `.map()` callback
 * (Stage 3 root cure, spec/callback-fidelity.md). Client emission renders
 * `segments` via `renderPreamble()` (html-template.ts) — the only door; a
 * consumer that can't call it has no way to splice the preamble, so a missing
 * wire-up is a type error or an explicit refusal, never a silent leak.
 * JSX-runtime SSR adapters emit `ssrText` (real TSX) instead.
 */
export interface MapCallbackPreamble {
  segments: PreambleSegment[]
  /** Raw preamble source (types + JSX intact) for JSX-runtime SSR adapters. */
  ssrText: TsxSourceText
  /** const/let/function names the preamble declares (D5 key-derivability guard). */
  declaredNames: string[]
  /**
   * The whole preamble as backend-neutral value declarations — set only when
   * EVERY statement is one (#2447). This is the DSL SSR carrier: a template
   * language cannot execute `segments` (that is JS text, for the client bundle
   * and for JS-runtime SSR), but it CAN declare a per-row local, and each
   * declaration's initializer is a {@link ParsedExpr} every adapter already
   * knows how to emit in its own syntax — the same door `arrayParsed` /
   * `filterPredicate.predicate` / `sortComparator` go through.
   *
   * All-or-nothing on purpose. A preamble is a statement SEQUENCE with
   * order-dependent scope; lowering the declarable prefix and dropping the rest
   * would leave later statements' effects missing with no diagnostic — the
   * silent divergence #2447 was. So one non-declaration statement (an
   * assignment, a loop, a call for side effects) or one initializer the
   * expression subset cannot model leaves this `undefined`, and the Phase-1
   * DSL gate refuses the whole loop with `/* @client *\/` guidance.
   *
   * Declarations appear in source order and may read earlier ones; adapters
   * emit them in order, so an earlier local is in scope for a later
   * initializer, exactly as in the source.
   */
  declarations?: PreambleValueDeclaration[]
  /**
   * The subset of {@link declaredNames} that accumulate JSX leaves — the
   * `push`/`unshift` targets of a `jsx` segment and the declaration targets of
   * a leaf-bearing initializer (`const out = xs.map(x => <td/>)`). Only these
   * get the `{out}` array-join child emission; a value-only local (`{label}`)
   * keeps the plain interpolation it always had.
   */
  builderNames: string[]
  /**
   * The subset of {@link declaredNames} whose OWN initializer is itself
   * reactive — reads a signal / memo / reactive prop, directly or
   * transitively through an earlier preamble declaration (#2596). `undefined`
   * (never an empty array) when the preamble contributes no such name, or
   * when it isn't a value-only declaration sequence this analysis covers
   * (see `preambleFromValueStatements`'s caller — a JSX-building preamble
   * doesn't compute this and leaves it unset).
   *
   * Used to decide whether a loop-body CONDITIONAL whose condition
   * bare-references a preamble local should carry the IR `reactive` flag
   * (`markPreambleConditionalReactivity`, jsx-to-ir.ts). Deliberately NOT the
   * same test `collectPreambleRegions`/`markPreambleAttrSlots` use for
   * text/attr positions — those mark ANY reference to `declaredNames`
   * reactive because their region-patch effect re-runs the whole preamble
   * unconditionally on row update, and ordinary signal auto-tracking inside
   * that effect picks up genuine dependencies regardless of the IR flag. A
   * conditional instead swaps whole DOM subtrees via `insert()`, so it stays
   * unwrapped unless the local it reads is proven to depend on an actual
   * external signal — a bare `item.title`-derived local needs no such wrap.
   */
  reactiveNames?: string[]
}

/**
 * One `const`/`let` value declaration from a `.map()` callback preamble, in
 * backend-neutral form (#2447 — see {@link MapCallbackPreamble.declarations}).
 * `name` is always a simple identifier: a destructuring binding declares
 * several names from one initializer, which no adapter has a single per-row
 * local form for, so that shape refuses instead of being carried here.
 */
export interface PreambleValueDeclaration {
  /** Declared local name (simple identifier binding). */
  name: string
  /** Initializer, structured for per-adapter emission. */
  valueParsed: ParsedExpr
  /**
   * Initializer source text, for a diagnostic that needs to quote it. Never an
   * emission input — emission goes through `valueParsed`.
   */
  raw: string
}

/**
 * One loop-body expression child classified as a preamble-patched region
 * (#2389 — see `IRLoop.preambleRegions`). `expr` is the raw (unwrapped)
 * expression text, exactly as carried on the source `IRExpression` node;
 * emitters wrap it with the loop-param accessor at codegen time, matching
 * every other loop-body expression. `joinArrayChild` mirrors the
 * `IRExpression` field of the same name — the client-JS plan builder uses it
 * to decide between the array-join value expression and a plain (escaped)
 * text value, keeping the region's re-render byte-identical to the row
 * template's own `irToHtmlTemplate` rendering of the same node.
 */
export interface PreambleRegionSource {
  slotId: string
  expr: string
  joinArrayChild?: boolean
}

/**
 * The preamble's JS text (js segments only, concatenated), for read-side
 * analysis — free-identifier scans, reachability edges, rest-misuse checks.
 * JSX-leaf interiors are compiled IR and are analyzed through their own IR
 * walks, exactly as the former placeholder carrier excluded them. NEVER use
 * this for emission — emission goes through `renderPreamble()`.
 */
export function preambleAnalysisText(p: Pick<MapCallbackPreamble, 'segments'>): string {
  let out = ''
  for (const seg of p.segments) if (seg.kind === 'js') out += seg.text
  return out
}

/**
 * Template-context variant of {@link preambleAnalysisText} (destructured prop
 * refs rewritten). Read-side analysis only.
 */
export function preambleAnalysisTemplateText(p: Pick<MapCallbackPreamble, 'segments'>): string {
  let out = ''
  for (const seg of p.segments) if (seg.kind === 'js') out += seg.templateText ?? seg.text
  return out
}

/**
 * A property key destructured at a `.map()` callback's item parameter, with
 * its `IdentifierName` classification pre-computed at IR-build time. The
 * emitter uses `isIdent` to decide between unquoted (`foo: ...`) and quoted
 * (`"data-foo": ...`) destructure-pattern forms without re-running an
 * identifier regex of its own — single source of truth for the
 * classification (#1244 pattern F).
 */
export interface RestExcludeKey {
  /** Raw key text, as it appeared in the source destructure pattern. */
  key: string
  /** True when `key` parses as a JS `IdentifierName` (`ts.isIdentifierText`). */
  isIdent: boolean
}

/**
 * Structured, non-string form of a `.map()` callback destructure accessor
 * step — one entry per `.foo` / `["a-b"]` / `[0]` step folded into
 * {@link LoopParamBinding.path}. Adapters that need to build their own
 * accessor expression (rather than splice `path` in as a JS suffix) walk
 * `segments` instead of parsing `path` with a regex (repo rule: never parse
 * JS/TS syntax with regex or string matching).
 *
 * - `{ kind: 'field', key, isIdent }`: an object-property step. `isIdent`
 *   uses the same `ts.isIdentifierStart`/`isIdentifierPart` classification
 *   as {@link RestExcludeKey.isIdent} — an adapter choosing between a native
 *   `.foo` accessor and a quoted/bracketed one (`["data-priority"]`, a
 *   quoted map key, ...) reads this instead of re-deriving the identifier
 *   rule itself.
 * - `{ kind: 'index', index }`: an array-position step (`[0]`, `[1]`, ...).
 */
export type LoopBindingPathSegment =
  | { kind: 'field'; key: string; isIdent: boolean }
  | { kind: 'index'; index: number }

/**
 * Destructured binding extracted from a `.map()` callback's item parameter.
 *
 * For *fixed* bindings (plain identifier, alias, nested access), `path` is a
 * JS accessor suffix (starts with `.` or `[`) appended to the synthetic
 * `__bfItem()` call. References to the binding compile to
 * `__bfItem()${path}`.
 *
 * When `rest` is set, the binding is a rest element. `path` is the parent
 * accessor (`''` at the loop root, `.rows` etc. when nested):
 *
 * - `kind: 'object'`: references compile to an IIFE that destructures the
 *   parent and returns the residual object — `__bfItem()${path}` minus the
 *   sibling keys listed in `exclude`. Each entry is already classified as
 *   identifier-or-not by the IR builder.
 * - `kind: 'array'`: references compile to `__bfItem()${path}.slice(from)`.
 *
 * Computed property keys can't be expressed in any of these forms and still
 * raise `BF025` at Phase 1.
 */
export interface LoopParamBinding {
  name: string
  path: string
  rest?:
    | { kind: 'object'; exclude: readonly RestExcludeKey[] }
    | { kind: 'array'; from: number }
  /**
   * Structured form of `path` (see {@link LoopBindingPathSegment}).
   *
   * - Fixed bindings (`rest` unset): the full accessor from the loop item to
   *   this binding, one segment per `path` step. Always non-empty — a fixed
   *   binding always has at least one accessor step.
   * - Rest bindings (`rest` set): the structured form of the PARENT prefix
   *   (i.e. of `path`, which for rest bindings holds the parent prefix, not
   *   an accessor to the rest binding itself) — possibly empty when the
   *   rest sits at the loop root (`({ ...rest }) => …` / `([...rest]) => …`).
   *
   * Optional only so older/foreign IR (built before this field existed)
   * still type-checks; `extractLoopParamBindings` always populates it now.
   * Downstream gates (`isLowerableLoopDestructure`) treat a missing
   * `segments` as "unknown shape" and refuse conservatively rather than
   * reading it as "binding at the loop root".
   */
  segments?: readonly LoopBindingPathSegment[]
}

export interface IRComponent {
  type: 'component'
  name: string
  props: IRProp[]
  propsType: TypeInfo | null
  children: IRNode[]
  template: string // Reference to partial
  slotId: string | null // For components with event handlers
  /**
   * True when `name` is a dynamic-tag local (`const Tag = children.tag`)
   * rather than a real component reference. Such a "component" has no
   * registrable template — it is a runtime-chosen tag. Consumed ONLY by
   * the Go template adapter, which lowers it to a children passthrough so
   * the dead branch registers cleanly (Hono/CSR/Mojo ignore this flag).
   * Omitted (undefined) for ordinary components to keep IR diffs minimal.
   */
  dynamicTag?: boolean
  /**
   * True when this component is a DIRECT member of an `IRLoop.children`
   * array (the loop's row-root component, e.g. `{rows().map(r => <Row/>)}`).
   * Such a component owns its own per-row identity and gets a freshly
   * randomized `bf-s` — it does NOT derive its scope id from the parent
   * scope + mount slot the way an ordinarily-slotted child does.
   *
   * A component nested *below* the row root (e.g. `<li><Badge/></li>` where
   * `<li>` is the loop row root) is NOT marked — it derives its scope id
   * from parent scope + slot like any other slotted child. See
   * `derivesScopeFromSlot` in `./adapters/child-scope.ts`, which is the one
   * predicate every backend must consult instead of re-deriving this fact.
   */
  loopItemRoot?: boolean
  loc: SourceLocation
}

export interface IRSlot {
  type: 'slot'
  name: string
  loc: SourceLocation
}

export interface IRFragment {
  type: 'fragment'
  children: IRNode[]
  /** When true, this fragment just passes through children (Context Provider pattern) */
  transparent?: boolean
  /** When true, emit a comment-based scope marker instead of bf-s attributes on children */
  needsScopeComment?: boolean
  loc: SourceLocation
}

export interface IRProvider {
  type: 'provider'
  contextName: string   // "MenuContext" (extracted from X.Provider)
  valueProp: IRProp     // The 'value' prop expression
  children: IRNode[]
  loc: SourceLocation
}

/**
 * Async streaming boundary node for out-of-order SSR.
 *
 * Maps to `<Async fallback={...}>children</Async>` in JSX.
 * Adapters translate this to their native streaming mechanism:
 *   - Hono: `<Suspense fallback={...}>` (native streaming)
 *   - Go: `bfAsyncBoundary()` + OOS resolve chunks
 */
export interface IRAsync {
  type: 'async'
  /** Unique boundary ID (e.g., "a0", "a1") — assigned by the compiler */
  id: string
  /** Fallback content shown while loading (e.g., skeleton UI) */
  fallback: IRNode
  /** Resolved content rendered after data loads */
  children: IRNode[]
  loc: SourceLocation
}

/**
 * If statement node for component-level conditional returns.
 * Preserves if-else structure from source code (early returns).
 */
export interface IRIfStatement {
  type: 'if-statement'
  /** The condition expression (e.g., "name === 'github'") */
  condition: string
  /** Pre-transformed condition with destructured prop refs rewritten to _p.xxx. */
  templateCondition?: string
  /**
   * Structured parse of `condition` (`parseExpression(condition.trim())`),
   * attached during IR construction so adapters lower the condition from the
   * tree instead of re-parsing the string. Optional/best-effort — see
   * `IRExpression.parsed`; consumers fall back to parsing `condition`.
   */
  parsedCondition?: ParsedExpr
  /** The JSX return in the then branch */
  consequent: IRNode
  /** The else branch: either another IRIfStatement (else if) or IRNode (final else) */
  alternate: IRNode | null
  /**
   * Variables declared in the if block scope. `initializer` is the
   * de-typed JS source used by client-emit; `typedInitializer` (when
   * present) is the source-verbatim form including any `as <T>` casts —
   * preserved so SSR `.tsx` emit can keep the original type information,
   * which downstream tsc relies on for narrowing (#1453: a
   * `const Tag = children.tag as any` collapsing to `children.tag` makes
   * the JSX `<Tag/>` raise TS2604 because `unknown` has no call signature).
   */
  scopeVariables: Array<{
    name: string
    initializer: string
    templateInitializer?: string
    typedInitializer?: string
  }>
  loc: SourceLocation
}

// =============================================================================
// IR Attributes & Events
// =============================================================================

export type IRTemplatePart =
  | { type: 'string'; value: string; templateValue?: string }
  | { type: 'ternary'; condition: string; templateCondition?: string; whenTrue: string; whenFalse: string }
  /**
   * `${MAP[KEY]}` indexed lookup against a `Record<T, string>` literal
   * (e.g. `${variantClasses[variant]}` where `variantClasses` is a
   * const Record). Resolved at IR construction time:
   *   - `cases` carries the literal `{ default: '...', secondary: '...' }` body
   *   - `key` is the JS expression used as the index (typically a prop / param name)
   *   - `templateKey` is the prop-rewritten variant (e.g. `_p.variant`)
   * Adapters that don't run JS at SSR time use `cases` + `key` to emit
   * a switch/conditional. Adapters that do (Hono) can ignore the part
   * structure and re-render the original JS.
   */
  | { type: 'lookup'; cases: Record<string, string>; key: string; templateKey?: string }

/**
 * Discriminated union for attribute / component-prop values (#1264).
 *
 * Replaces the legacy `value: string | IRTemplateLiteral | null` plus
 * sibling `dynamic` / `isLiteral` boolean flags. Every adapter switches on
 * `value.kind` exhaustively, so adding a new shape becomes a type error
 * at every emit site instead of a silent fallthrough.
 *
 * Variants:
 * - `literal`  — value came from a string-literal attribute (`<X y="z" />`).
 * - `expression` — value came from a JSX expression (`<X y={e} />`).
 *   Carries the optional `templateExpr` (prop-rewritten form for SSR
 *   template inlining) and `presenceOrUndefined` (the `expr || undefined`
 *   peel result for boolean-presence attrs).
 * - `boolean-attr` — bare attribute on an intrinsic element
 *   (`<button disabled />`). Element-only.
 * - `boolean-shorthand` — bare attribute on a component (`<X disabled />`),
 *   which becomes `disabled={true}` at the call site. Component-only.
 * - `template` — structured template literal with ternaries / Record-lookups
 *   (the shape previously called `IRTemplateLiteral`). Adapters that can
 *   run JS at SSR re-emit the JS; adapters that can't (Go-template) walk
 *   the parts.
 * - `spread` — JSX spread (`<X {...rest} />`). The IR attribute / prop
 *   keeps `name === '...'` as a companion marker but `kind === 'spread'`
 *   is the authoritative discriminator.
 * - `jsx-children` — a component prop whose value is JSX
 *   (`<X header={<h1/>} />`). Component-only.
 */
export type AttrValue =
  | LiteralAttr
  | ExpressionAttr
  | BooleanAttr
  | BooleanShorthandAttr
  | TemplateAttr
  | SpreadAttr
  | JsxChildrenAttr

export interface LiteralAttr {
  kind: 'literal'
  /** Raw string from the source. Emitted unquoted into HTML attribute body,
   *  JSON.stringify'd when re-rendered as a component prop. */
  value: string
}

export interface ExpressionAttr {
  kind: 'expression'
  /** Source-level JS expression text (e.g. `count()`, `props.checked`). */
  expr: string
  /** `expr` with destructured prop refs rewritten to `_p.xxx`, for SSR
   *  template inlining. Absent when no rewrite was needed. */
  templateExpr?: string
  /**
   * Structured parse of `expr` (`parseExpression(expr.trim())`), attached
   * during IR construction so adapters lower the attribute value from the tree
   * instead of re-parsing the string (often several times per attribute).
   * Optional/best-effort — see `IRExpression.parsed`; consumers fall back to
   * parsing `expr`.
   */
  parsed?: ParsedExpr
  /** Set when the producer peeled an `expr || undefined` boolean-presence
   *  pattern; adapters fold this back into `(expr) || undefined` at emit. */
  presenceOrUndefined?: boolean
  /**
   * Carries the parsed parts when the producer collapses a structured
   * template literal back into a JS expression (component-prop path —
   * `jsx-to-ir.ts` collapses `template` → `expression` because component
   * props are runtime values). Template-based SSR adapters (Mojo, Go)
   * read this to recover the structured form and emit a per-part
   * lookup / ternary; JS-runtime adapters (Hono) ignore it and keep
   * using `expr`. This is a transitional shape until #1264-style lift
   * surfaces template parts as a first-class IR variant on component
   * props.
   */
  parts?: IRTemplatePart[]
}

export interface BooleanAttr {
  kind: 'boolean-attr'
}

export interface BooleanShorthandAttr {
  kind: 'boolean-shorthand'
}

export interface TemplateAttr {
  kind: 'template'
  parts: IRTemplatePart[]
}

export interface SpreadAttr {
  kind: 'spread'
  expr: string
  templateExpr?: string
  /**
   * Structured parse of `expr` (`parseExpression(expr.trim())`), attached
   * during IR construction so adapters lower the spread bag from the tree
   * instead of re-parsing the string with `ts.createSourceFile`. Optional /
   * best-effort — mirrors `ExpressionAttr.parsed`: it may be absent (a node the
   * attach walk misses, or an empty `expr`), and parsing may yield
   * `{ kind: 'unsupported' }`, which adapters treat as unlowerable and handle
   * via their existing non-conditional spread paths (or BF101).
   */
  parsed?: ParsedExpr
  /**
   * Component-scoped, stable slot ID assigned at IR-build time for
   * adapters that need to plumb the spread bag through a structured
   * data path (Go template's `.Spread_N`, future Mojo `$bf_spread_n`).
   * Hono ignores it. Only populated when the spread reaches the
   * bag-emitting branch — closed-type rest spreads short-circuit to
   * per-key expansion earlier and leave this unset (#1407).
   */
  slotId?: string
}

export interface JsxChildrenAttr {
  kind: 'jsx-children'
  children: IRNode[]
}

/**
 * Constructors for `AttrValue` variants. Centralised so the producer
 * (`jsx-to-ir.ts`) and any future hand-built IR fixture share the same
 * canonical shape — and so optional fields (`templateExpr`, `presenceOrUndefined`)
 * are only set when present.
 */
export const AttrValueOf = {
  literal(value: string): LiteralAttr {
    return { kind: 'literal', value }
  },
  expression(
    expr: string,
    opts?: { templateExpr?: string; presenceOrUndefined?: boolean; parts?: IRTemplatePart[] },
  ): ExpressionAttr {
    return {
      kind: 'expression',
      expr,
      ...(opts?.templateExpr !== undefined && { templateExpr: opts.templateExpr }),
      ...(opts?.presenceOrUndefined !== undefined && { presenceOrUndefined: opts.presenceOrUndefined }),
      ...(opts?.parts !== undefined && { parts: opts.parts }),
    }
  },
  booleanAttr(): BooleanAttr {
    return { kind: 'boolean-attr' }
  },
  booleanShorthand(): BooleanShorthandAttr {
    return { kind: 'boolean-shorthand' }
  },
  template(parts: IRTemplatePart[]): TemplateAttr {
    return { kind: 'template', parts }
  },
  spread(expr: string, templateExpr?: string, slotId?: string): SpreadAttr {
    return {
      kind: 'spread',
      expr,
      ...(templateExpr !== undefined && { templateExpr }),
      ...(slotId !== undefined && { slotId }),
    }
  },
  jsxChildren(children: IRNode[]): JsxChildrenAttr {
    return { kind: 'jsx-children', children }
  },
} as const

/**
 * Attribute metadata shared by `IRAttribute` / `IRProp` and the emit-time
 * collection types (`ReactiveAttribute`, `ReactiveChildProp`,
 * `LoopChildReactiveAttr`, `ConditionalBranchReactiveAttr`,
 * `ArmReactiveAttr`). Adding a field here propagates it through the entire
 * pipeline.
 *
 * Note: on `IRAttribute` / `IRProp` the `presenceOrUndefined` flag is
 * never populated directly — the canonical location is
 * `ExpressionAttr.presenceOrUndefined` on the `value` field. The field
 * is retained on `AttrMeta` so the emit-time accumulators can carry it
 * forward through their pipeline without inventing a parallel type.
 */
export interface AttrMeta {
  /** True when the producer peeled an `expr || undefined` boolean-presence
   *  pattern. Emit-time accumulators read this; on `IRAttribute` / `IRProp`
   *  consult `value.kind === 'expression' && value.presenceOrUndefined`. */
  presenceOrUndefined?: boolean
  /**
   * Pre-computed free identifiers referenced by the attribute's expression
   * (#1267). Populated during IR build by walking the originating AST node.
   * Optional so downstream IR consumers (adapters) remain compatible.
   */
  freeIdentifiers?: ReadonlySet<string>
}

/**
 * Copy all AttrMeta fields from a source object.
 * Use this at every propagation point so new fields are automatically included.
 */
export function pickAttrMeta(src: AttrMeta): AttrMeta {
  return {
    ...(src.presenceOrUndefined !== undefined && { presenceOrUndefined: src.presenceOrUndefined }),
    ...(src.freeIdentifiers !== undefined && { freeIdentifiers: src.freeIdentifiers }),
  }
}

/**
 * Pull the `AttrMeta` slice from an `IRAttribute` / `IRProp`. Unlike
 * `pickAttrMeta`, which reads from a parent extending `AttrMeta`, this
 * helper resolves `presenceOrUndefined` from the underlying `AttrValue`
 * variant (only `ExpressionAttr` carries it).
 */
export function pickAttrMetaFromIR(src: { value: AttrValue; freeIdentifiers?: ReadonlySet<string> }): AttrMeta {
  const presenceOrUndefined = src.value.kind === 'expression' ? src.value.presenceOrUndefined : undefined
  return {
    ...(presenceOrUndefined !== undefined && { presenceOrUndefined }),
    ...(src.freeIdentifiers !== undefined && { freeIdentifiers: src.freeIdentifiers }),
  }
}

export interface IRAttribute extends AttrMeta {
  name: string
  value: AttrValue
  loc: SourceLocation
  /** When true, attr expression calls signal getters or memos (computed from AST). (#940 DRY consolidation) */
  callsReactiveGetters?: boolean
  /** When true, attr expression contains any `identifier()` pattern (computed from AST). (#940 DRY consolidation) */
  hasFunctionCalls?: boolean
  /**
   * Set when the JSX initializer carries a leading `/* @client *\/`
   * comment. `html-template.ts`'s template generators omit the
   * attribute from the SSR output; `collect-elements.ts` pushes the
   * value into `reactiveAttrs` (top-level, conditional-branch, and
   * loop-child paths) so a `createEffect` binding applies it at
   * hydrate. Mirrors the existing JSX-child `clientOnly` semantic —
   * same opt-out, applied to element-attribute position.
   */
  clientOnly?: boolean
}

export interface IREvent {
  name: string // 'click', 'input', 'keydown'
  originalAttr?: string // Original JSX attribute name: 'onClick', 'onKeyDown'
  handler: string // JS expression: '() => setCount(n => n + 1)'
  loc: SourceLocation
}

export interface IRProp extends AttrMeta {
  name: string
  value: AttrValue
  loc: SourceLocation
  /** When true, prop expression calls signal getters or memos (computed from AST). (#942 DRY consolidation) */
  callsReactiveGetters?: boolean
  /** When true, prop expression contains any `identifier()` pattern (computed from AST). (#942 DRY consolidation) */
  hasFunctionCalls?: boolean
  /**
   * Set when the JSX initializer carries a leading `/* @client *\/`
   * comment. `html-template.ts`'s template generators omit the prop
   * from the `renderChild` arguments in the SSR output;
   * `initChild`'s `propsExpr` getters (built in `collect-elements.ts`)
   * still evaluate in init scope, so the value reaches the child
   * component once init runs. Mirrors the JSX-child / element-
   * attribute `clientOnly` semantic.
   */
  clientOnly?: boolean
}

// =============================================================================
// Metadata
// =============================================================================

export interface SignalInfo {
  getter: string
  setter: string | null
  initialValue: string
  /**
   * `initialValue` parsed into a structured tree (Roadmap A). Attached
   * best-effort by the analyzer so adapters can lower a literal initial value
   * (e.g. `useState(['a', 'b'])`) from structure instead of re-parsing the
   * string with `ts.createSourceFile`. Absent when the shape isn't supported;
   * consumers fall back to parsing `initialValue`.
   */
  parsed?: ParsedExpr
  /** Initial value with TypeScript type annotations preserved, for .tsx output */
  typedInitialValue?: string
  /**
   * `initialValue` with bare destructured prop references rewritten to
   * `_p.<name>` (#2265), for the CSR `template:` arrow's module-scope
   * SSR-string fallback — mirrors the `templateExpr`/`templateArray`/
   * `templateCondition` fields on other IR positions. Destructured mode
   * only (`propsObjectName === null`); undefined when no rewrite was
   * needed (no destructured prop referenced) or the component is in
   * object-props mode (there, `rewritePropsObjectRef`/`applyPropsRewrite`
   * handle `props.x` → `_p.x` on the final joined/substituted string
   * instead, since a bare `props.x` textual match works without an
   * AST-level pre-rewrite).
   */
  templateInitialValue?: string
  /**
   * True for the getter-elided declaration form `const [, setX] =
   * createSignal(...)`. `getter` then holds a synthesized internal name
   * (`__bfGet_<setter>`) that no expression ever references — it exists so
   * getter-keyed consumers (substitution env, SSR seeding) stay total.
   * Emit reproduces the source's `[, setter]` hole instead of introducing
   * the synthesized name into output.
   */
  getterElided?: boolean
  type: TypeInfo
  loc: SourceLocation
  /**
   * Free identifiers in `initialValue`, computed at analysis time. Drives
   * the CSR-substitution propagation in `ir-to-client-js` (#1277): when an
   * expression references `getter()` and the substitution expands it to
   * `(initialValue)`, the post-substitution free-id set must add these
   * names so the unsafe-name check stays exact instead of regex-scanning
   * the final string.
   */
  initialFreeIdentifiers?: ReadonlySet<string>
  /**
   * When set, this signal was declared inside an early-return `if`-block
   * and only the marked branch reaches its `createSignal(...)` call. Emit
   * picks the conditional shape:
   *
   *     let getter, setter
   *     if (<branchCondition>) [getter, setter] = createSignal(<initialValue>)
   *
   * Closures and event handlers hoisted to outer init scope close over the
   * `let` binding, so their references resolve regardless of branch. The
   * value is the raw JS condition text (already destructured-prop-aware
   * if applicable) — emitters substitute it verbatim. See #1414 cell #8.
   */
  branchCondition?: string
  /**
   * When true, declared at module level under a `/* @client *​/` directive.
   * The signal is emitted at module scope in the client bundle and skipped
   * in the SSR template. Component-body references are treated as implicit
   * `@client` expressions (placeholder at SSR, live read at hydrate).
   */
  isModule?: boolean
  /** When true, the declaration carries an `export` keyword. */
  isExported?: boolean
  /**
   * Request-scoped environment-signal key when this signal was produced by an
   * env-signal factory (`createSearchParams()` → `'search'`), rather than by
   * `createSignal`. Set structurally by the analyzer (#2057) — the getter is a
   * normal reactive getter (so it lands in the fold purity oracle for free, no
   * name allow-list), but its *value* is a request-scoped reader with methods
   * (`.get(key)`), which adapters lower to their per-request reader object
   * instead of a plain template field. This flag is how adapters recognise an
   * env signal from structure instead of matching the import name.
   */
  envReader?: string
  /**
   * For an env signal (`envReader` set), the exact callee text of its factory
   * call as written — `'createSearchParams'`, an alias (`'csp'` for
   * `import { createSearchParams as csp }`), or a namespace access
   * (`'bf.createSearchParams'`). Backends that re-emit the declaration (client
   * JS, JSX/Hono SSR) emit `<envFactory>()` so the call resolves to the binding
   * actually in scope, not a hardcoded canonical name (#2057).
   */
  envFactory?: string
}

export interface MemoInfo {
  name: string
  computation: string
  /**
   * `computation` with bare destructured-prop refs rewritten to `_p.X` —
   * the memo twin of `SignalInfo.templateInitialValue` (#2265). Consumed by
   * `buildSignalMemoEnv` when the memo body is inlined into the module-scope
   * CSR `template:` arrow, which is not a closure over init's destructured
   * extractions (#2468). Only set for destructured-arg components that
   * actually reference a prop.
   */
  templateComputation?: string
  /** Computation with TypeScript type annotations preserved, for .tsx output */
  typedComputation?: string
  /**
   * Structured parse of the memo's BODY as a single value expression, computed
   * once at analysis time. Lets adapters pattern-match the memo's shape on the
   * structured tree instead of re-parsing `computation` with their own AST walks
   * / regexes.
   *
   * Set for an expression-bodied arrow (`() => <body>`) whose body
   * `parseExpression` supports, AND — since #2040 — for a block-bodied memo
   * (`() => { … }`) whose statements `foldBlockToExpr` can normalize to one
   * expression (`let`-inline + value `if` / early `return` → ternary). A block
   * the fold refuses (imperative residue) or a shape `parseExpression` can't
   * represent leaves `parsed` undefined, so consumers must still fall back to
   * `parsedBlock` / `computation` when it's missing. NOTE: a present `parsed`
   * therefore no longer implies an expression-bodied arrow.
   */
  parsed?: ParsedExpr
  /**
   * Whether the memo's effective body is a template literal (`() => `…`` or a
   * block body whose first `return` is one), classified once at analysis time
   * from the real arrow AST. Lets the Go adapter pick the `string` field type
   * without re-parsing `computation` with `ts.createSourceFile`. A template
   * literal — including a no-substitution `` `plain` `` — folds to a plain
   * string `ParsedExpr` literal, losing the backtick distinction, so this is a
   * dedicated flag rather than a `parsed.kind` check.
   */
  bodyIsTemplateLiteral?: boolean
  /**
   * A block-bodied memo's statements, parsed best-effort (tolerant: a statement
   * the parser can't represent is omitted). Lets the Go adapter pattern-match
   * block-body memo shapes — e.g. the `const k = getter(); if (!k) return CONST`
   * guard — on the structured statements instead of re-parsing `computation`
   * with `ts.createSourceFile`. Absent for expression-bodied memos (those carry
   * `parsed` instead) and when the arrow has no block body.
   */
  parsedBlock?: ParsedStatement[]
  /**
   * Whether {@link parsedBlock} represents EVERY statement of the block (true)
   * or the tolerant parser omitted at least one it couldn't represent (false).
   * A consumer that must reason about the whole block — e.g. one that bails on
   * any statement it doesn't recognise (the template-literal memo lowering) —
   * reads this and falls back when it's `false`, since omitted statements are
   * otherwise invisible. Consumers that scan for a recognised prefix and ignore
   * the rest (the guard-and-return-const lowering) can disregard it. Only set
   * when `parsedBlock` is.
   */
  parsedBlockComplete?: boolean
  type: TypeInfo
  deps: string[]
  loc: SourceLocation
  /**
   * Free identifiers in `computation`, computed at analysis time. Same role
   * as `SignalInfo.initialFreeIdentifiers` — feeds the CSR-substitution
   * propagation in `ir-to-client-js` (#1277).
   */
  computationFreeIdentifiers?: ReadonlySet<string>
  /** Same semantics as `SignalInfo.isModule`. */
  isModule?: boolean
  /** When true, the declaration carries an `export` keyword. */
  isExported?: boolean
}

export interface EffectInfo {
  body: string
  deps: string[]
  /**
   * When set, the effect was captured as `const <captureName> = createEffect(...)`
   * (Solid-style disposer capture). Emission wraps the canonical `createEffect`
   * call in a `const` binding so user code referencing the captured name keeps
   * working.
   */
  captureName?: string
  loc: SourceLocation
}

export interface OnMountInfo {
  body: string
  loc: SourceLocation
}

/**
 * A bare imperative statement at the top level of a component body that is
 * not otherwise captured (i.e., not a signal/memo/constant declaration,
 * effect/onMount call, JSX return, or conditional return).
 *
 * Emitted verbatim inside the component's init function in source order,
 * after signal/memo/constant declarations so they can legally reference
 * component-scope names. Typical examples: a `typeof window !== 'undefined'`
 * guard that attaches a window event listener, a `console.log`, or a
 * `try/catch` around `localStorage.getItem`.
 */
export interface InitStatementInfo {
  /** Raw JS source of the statement (TypeScript types already stripped). */
  body: string
  loc: SourceLocation
  /**
   * Free identifier references used by this statement. Used by the emitter
   * to decide which module-level declarations must be preserved (#933) and
   * to flag writes to undeclared globals.
   */
  freeIdentifiers?: Set<string>
  /**
   * Identifiers this statement assigns to (LHS of `=`, compound assignments,
   * `++`, `--`). A subset of `freeIdentifiers` that must resolve to an
   * actual declaration, otherwise ESM strict mode throws a ReferenceError
   * at runtime.
   */
  assignedIdentifiers?: Set<string>
  /**
   * When true, the emitted statement must be prefixed with `;` to defeat
   * ASI fusion with the previous line. Tracked in IR rather than recovered
   * by emit-time text inspection — losing this is the failure mode behind
   * the leading-`;` ASI hazards documented in #1138.
   */
  needsLeadingSemi?: boolean
  /** Staged-IR origin info (#1138). */
  origin?: OriginInfo
}

export interface ImportInfo {
  source: string
  specifiers: ImportSpecifier[]
  isTypeOnly: boolean
  loc: SourceLocation
}

/** Module-level `export { A, B as C } [from './path']` specifier block. */
export interface NamedExportInfo {
  /** When non-null, this is `export { ... } from 'source'`. */
  source: string | null
  specifiers: NamedExportSpecifier[]
  isTypeOnly: boolean
}

export interface NamedExportSpecifier {
  /** Local binding being exported (or imported binding for `export ... from`). */
  name: string
  /** External alias if `export { name as alias }`, else null. */
  alias: string | null
  /** True for `export { type X }` per-specifier type-only. */
  isTypeOnly: boolean
}

/** One identifier occurrence in a factory body that call-site inlining may
 *  rename (#2341 BUG-1). Offsets are relative to ReactiveFactoryInfo.bodySource. */
export interface FactoryRenameSite {
  name: string
  start: number
  end: number
  /** 'shorthand' = the identifier is simultaneously a property key and a
   *  value/binding reference ({ name } literal, or { name } object-pattern
   *  element). Renaming it must EXPAND to `name: <replacement>` to preserve
   *  the key. 'plain' = ordinary reference or declaration name. */
  form: 'plain' | 'shorthand'
}

/**
 * Reactive factory helper metadata (#931). Collected when a same-file
 * function matches the factory shape: exactly one top-level `return` whose
 * argument is an array literal of identifiers, and at least one reactive
 * primitive call (`createSignal`, `createMemo`, `createEffect`, etc.) in
 * the body.
 *
 * When a component calls the factory in a tuple-destructure context, the
 * body is inlined at the call site so downstream signal/memo collection
 * sees an ordinary `createSignal(...)` declaration.
 */
export interface ReactiveFactoryInfo {
  /** Parameter names, in declaration order. */
  params: string[]
  /**
   * Raw JS source of the factory body block *without braces* and with the
   * return tuple removed. Identifiers are renamed at the call site.
   */
  bodySource: string
  /** Ordered return binding names (tuple elements or object shorthand property names). */
  returnTupleIdentifiers: string[]
  /** Return shape: `[a, b] as const` (tuple) or `{ a, b }` shorthand object (#2325). */
  returnKind: 'tuple' | 'object'
  /**
   * Names declared anywhere in the factory body (local bindings). Used by
   * the call-site inliner to apply unique-suffix renaming and keep
   * identifiers hygienic across repeat calls of the same factory.
   */
  localBindings: string[]
  loc: SourceLocation
  /**
   * Absolute path of the defining file when the factory was resolved from a
   * relative import (#2325). Undefined for same-file factories. Diagnostic
   * detail only — name-collision precedence is enforced at merge time
   * (local factories win), not by consulting this field.
   */
  sourceFilePath?: string
  /**
   * Imports to re-provision into the component file when this cross-file
   * factory is inlined (#2332). Absent/empty for same-file factories and
   * for factories whose body references no helper-file import. Entries
   * already satisfied by an identical top-level import in the component
   * file are dropped at prescan time.
   */
  requiredImports?: RequiredFactoryImport[]
  /**
   * Identifier occurrences within `bodySource` that call-site inlining may
   * rename (#2341 BUG-1) — collected by the same AST walk that produces
   * `bodySource`, so offsets stay in lockstep with the serialized text.
   * Same-file and cross-file factories both get this (both flow through
   * `detectReactiveFactory`).
   */
  renameSites: FactoryRenameSite[]
}

/**
 * An import the helper file holds that an inlined factory body references
 * (#2332, type-only refs added #2350). Not a BF112 capture: the component
 * file can import the same binding itself. Collected at prescan with the
 * specifier ALREADY rewritten relative to the component file (or unchanged
 * for bare/npm specifiers); the source rewriter injects one deduped import
 * statement per (specifier, isTypeOnly) pair.
 */
export interface RequiredFactoryImport {
  /** Local binding name as referenced inside the factory body. */
  localName: string
  /** Name exported by the target module (`import { exportedName as localName }`). */
  exportedName: string
  /** Component-file-relative specifier (`../lib/mathmod`), or the unchanged bare specifier. */
  specifier: string
  /** True when the factory body only ever references this in type position —
   *  re-provisioned as `import type { ... }` instead of a value import. */
  isTypeOnly?: boolean
}

/**
 * A helper that was recognized as a would-be reactive factory but declined
 * for inlining (#2325). Recorded so validateReactiveFactoryCalls can emit
 * the specific diagnostic (BF111 rename / BF112 module-scope capture /
 * BF113 re-provisioned-import name collision) at the call site instead of
 * the generic BF110.
 */
export interface DeclinedReactiveFactory {
  code: 'BF111' | 'BF112' | 'BF113' | 'BF114'
  /** Detail spliced into the call-site message (e.g. offending identifier list). */
  detail: string
  /** Definition site (in the helper file for cross-file declines). */
  loc: SourceLocation
}

export interface ImportSpecifier {
  name: string
  alias: string | null
  isDefault: boolean
  isNamespace: boolean
  /**
   * Per-specifier type-only import (`import { type Foo } from '...'`). Distinct
   * from `ImportInfo.isTypeOnly` (the whole `import type { ... }` statement).
   * A type-only specifier introduces no runtime/value binding, so consumers
   * enforcing a value import (e.g. the `<Async>`/`<Region>` built-ins, #1915)
   * must ignore it. Absent/false for value specifiers and for default /
   * namespace imports (which cannot be per-specifier type-only).
   */
  isTypeOnly?: boolean
}

export interface FunctionInfo {
  name: string
  params: ParamInfo[]
  body: string
  /** Body with TypeScript type annotations preserved, for .tsx output */
  typedBody?: string
  /**
   * Parameter list source text WITH type annotations, defaults, and rest
   * markers — i.e., everything between the function's `(…)` exactly as the
   * user wrote it. Preserved for `.tsx` emit so type predicates like
   * `function isValidElement(element: unknown): element is {…}` keep their
   * parameter annotations (a predicate requires its parameter to have a
   * type, otherwise tsc raises TS7006). The reconstructed
   * `formatParamWithType(params)` form strips explicit `:unknown` (because
   * it cannot distinguish it from "no annotation" — both surface as
   * `kind: 'unknown', raw: 'unknown'` in `ParamInfo`).
   */
  typedParams?: string
  /**
   * Return-type annotation source text (the JS source between `)` and `{`,
   * minus the leading `:` and surrounding whitespace). Preserved so the
   * emit can re-attach predicates like `: element is { tag: unknown; … }`.
   * The existing `returnType` field is structured for analysis; this is
   * the verbatim source for emit.
   */
  typedReturnType?: string
  returnType: TypeInfo | null
  containsJsx: boolean
  isExported?: boolean
  /** When true, the source `function` declaration carries the `async` modifier (#1130). */
  isAsync?: boolean
  /** When true, the source declaration is a generator (`function*`). */
  isGenerator?: boolean
  /**
   * Original source declaration form. Lets emit decide whether to keep
   * `function f() {}` or rewrite to `const f = () => {}` without losing
   * modifiers in the process (#1130 was the symptom of recovering this
   * from text after the rewrite). Optional during the staged-IR
   * migration; legacy emit paths default to inferring from `body`.
   */
  declarationKind?: 'function' | 'arrow' | 'function-expression'
  /** When true, declared at module level (outside the component function). */
  isModule?: boolean
  /** When true, this function returns JSX and is inlined at call sites (#569). */
  isJsxFunction?: boolean
  /**
   * When true, this is a module-level multi-return JSX helper reclassified
   * from the component path (#932). The body is preserved verbatim for the
   * SSR marked template but MUST be skipped from client-JS emission — the
   * body contains actual JSX syntax, not just JSX-like string literals.
   */
  isMultiReturnJsxHelper?: boolean
  loc: SourceLocation
}

export interface ConstantInfo {
  name: string
  value?: string
  /**
   * `value` parsed into a structured tree (Roadmap A). Attached best-effort by
   * the analyzer (parsed from the parenthesised value so a bare object literal
   * — which TS reads as a block at statement position — resolves to an
   * `object-literal` rather than failing). Lets adapters lower a constant value
   * (e.g. a module-scope record's `{ … }`) from structure instead of
   * re-parsing the string with `ts.createSourceFile`. Absent when the constant
   * has no `value` string (e.g. an inlined-JSX const) or when the analyzer
   * couldn't structure it (best-effort — consumers fall back to the string).
   */
  parsed?: ParsedExpr
  /** Value with TypeScript type annotations preserved, for .tsx output */
  typedValue?: string
  /**
   * The declaration's explicit type annotation, verbatim from source
   * (`node.type.getText()`), when the author wrote one. Distinct from
   * `type`, which is also populated by inference from the initializer —
   * emitters must only print THIS field, never an inferred type, onto a
   * declaration (#2589).
   */
  typeAnnotation?: string
  valueBranches?: string[]
  declarationKind: 'const' | 'let'
  isExported?: boolean
  /** When true, declared at module level (outside the component function). */
  isModule?: boolean
  type: TypeInfo | null
  loc: SourceLocation
  /** Pre-computed free identifier references in the value expression (computed at analysis time). */
  freeIdentifiers?: Set<string>
  /** When true, the initializer is JSX that is inlined into the IR tree at usage sites (#547). */
  isJsx?: boolean
  /** When true, the initializer is a JSX-returning function inlined at call sites (#569). */
  isJsxFunction?: boolean
  /** When true, the initializer contains an arrow function or function expression (computed from AST). */
  containsArrow?: boolean
  /** The kind of system construct, if the initializer is createContext() or new WeakMap(). */
  systemConstructKind?: 'createContext' | 'weakMap'
  /** Value with destructured prop refs rewritten to _p.propName, for template inlining. */
  templateValue?: string
  /**
   * Staged-IR origin info (#1138). For locals declared in a component
   * body, `origin.scope` is `init` (or `sub-init` for nested-arrow
   * declarations). For module-level constants, `origin.scope` is
   * `module`. Optional during the staged-IR migration.
   */
  origin?: OriginInfo
}

export interface TypeDefinition {
  kind: 'interface' | 'type'
  name: string
  definition: string // Original TypeScript definition
  /**
   * Structured fields for object/interface shapes, so adapters can consume the
   * field set (names + types) without re-parsing `definition`. Absent for
   * type aliases that aren't object types (e.g. string-literal unions).
   */
  properties?: PropertyInfo[]
  loc: SourceLocation
}

export interface IRMetadata {
  componentName: string
  hasDefaultExport: boolean
  /** Whether this component has an `export` keyword in the source */
  isExported: boolean
  /** Whether this component is from a "use client" file */
  isClientComponent: boolean
  typeDefinitions: TypeDefinition[]
  propsType: TypeInfo | null
  /**
   * The component function's own generic type parameter list, verbatim
   * from source (each `node.getText()`, joined and wrapped in `<...>`),
   * e.g. `<NodeType extends NodeBase = NodeBase, EdgeType extends
   * EdgeBase = EdgeBase>`. `null` when the component isn't generic.
   *
   * A generic function component's props type (and often its body) keeps
   * referencing these names verbatim in emitted output (e.g. `props:
   * FlowComponentProps<NodeType, EdgeType>`, `createFlowStore<NodeType,
   * EdgeType>(props)`) — without the function's own declaration also
   * carrying the type parameters, those references are unresolved names
   * in the emitted `.tsx` (TS2304). Emitters that print a `function
   * <name>(...)` signature for the component must splice this verbatim
   * between the name and the parameter list. Optional (rather than
   * required) so the many hand-built `IRMetadata` test fixtures across
   * the suite don't need updating for a field that is `null` for the
   * overwhelming majority of (non-generic) components.
   */
  typeParameters?: string | null
  propsParams: ParamInfo[]
  /** Name of the props object parameter (e.g., 'props' in `function Component(props: Props)`) */
  propsObjectName: string | null
  restPropsName: string | null
  /** Keys statically expanded from rest props via type analysis (closed type only) */
  restPropsExpandedKeys: string[]
  signals: SignalInfo[]
  memos: MemoInfo[]
  effects: EffectInfo[]
  onMounts: OnMountInfo[]
  /**
   * Bare imperative statements at the top of the component body that are
   * not one of the recognized reactive primitives or a JSX return.
   * Emitted verbatim inside init() after signal/memo declarations (#930).
   */
  initStatements: InitStatementInfo[]
  imports: ImportInfo[]
  /** Imports filtered for template use (client-side packages stripped).
   *  Computed by the compiler — adapters should use this instead of `imports`. */
  templateImports: ImportInfo[]
  /** Module-level `export { ... } [from '...']` specifier blocks. */
  namedExports: NamedExportInfo[]
  localFunctions: FunctionInfo[]
  localConstants: ConstantInfo[]
  /** Pre-computed client JS analysis for adapter use */
  clientAnalysis?: ClientAnalysis
  /**
   * Relative import sources that resolve to a file exporting `@client`
   * signals/memos. Used by `collectExternalImports` to rewrite the
   * import path from `./state` → `./state.client.js` so the browser
   * resolves the compiled module rather than the source `.tsx`.
   */
  clientSignalImportSources?: Set<string>
  /**
   * Backend-neutral SSR seed plan: per-binding derived/opaque/env-reader
   * classification in declaration order, plus the base scope, computed by
   * `computeSsrSeedPlan` from this metadata. Attached by `buildMetadata` and
   * serialized into IR JSON like the rest of the metadata; template adapters
   * consume it instead of re-deriving scope/derivability themselves (their
   * target-syntax choices — lowering, self-shadow rules, constant-emit
   * guards — stay adapter-side).
   */
  ssrSeedPlan?: SsrSeedPlan
}

// =============================================================================
// Client Analysis (references graph + derived facts)
// =============================================================================

/**
 * Where a reference appears in the emitted client JS. The emitter's rule
 * set is expressed as graph queries parameterised by this tag, so the
 * "whack-a-mole" pattern — a new rule landing as a new `if` inside
 * `generate-init.ts` — is replaced by typed edge-context matching.
 *
 * See issue #1021 for the full rationale.
 */
export type ReferenceContext =
  /**
   * Reference appears in a declaration body that runs at `init()` time:
   * signal initial value, memo body, effect body, onMount body, constant
   * initializer, function body, or any reachable transitive reference
   * from these. Default context for declaration-to-declaration edges.
   */
  | 'init-body'
  /**
   * Reference is a function name used as an event handler on a DOM
   * element (e.g. `onClick={handleAdd}`). Distinct tag so the emitter
   * can treat handler references separately from body references
   * (e.g. the handler itself is always reachable; its body is a
   * descendant init-body edge).
   */
  | 'event-handler'
  /**
   * Reference appears in a string the SSR / CSR template closure reads:
   * loop template HTML, conditional branch HTML, dynamic-text
   * expression, reactive-attribute expression, reactive prop binding.
   * These references survive into the template and therefore need
   * their referents at module scope (or safely inlined).
   */
  | 'template-closure'
  /**
   * Reference appears in a bare imperative top-of-component statement
   * (#930). Distinct from `init-body` because the statement may have
   * side effects on declarations (assignment-target edges) and because
   * `InitStatementInfo.freeIdentifiers` already isolates these from
   * ordinary declaration bodies.
   */
  | 'init-statement'
  /**
   * LHS of an assignment inside an init-statement (#933). A subset of
   * `init-statement` edges where the target must resolve to a real
   * declaration, otherwise ESM strict mode throws a ReferenceError.
   * Triggers module-scope routing for the target in Stage C.
   */
  | 'assignment-target'

/**
 * The declaration a reference edge originates from. `null` when the
 * edge is rooted at a structural position with no backing named
 * declaration (template closure, event handler body, effect body,
 * onMount body, init statement, provider setup, etc.).
 *
 * Only the four declaration kinds below are queryable by source —
 * those are the ones the sort / fixpoint / reachability queries need
 * to identify. Other structural positions share a single `null`
 * source because no query distinguishes them on read.
 */
export interface ReferenceSource {
  kind: 'constant' | 'function' | 'signal' | 'memo'
  name: string
}

export interface ReferenceEdge {
  from: ReferenceSource | null
  to: string
  context: ReferenceContext
}

/**
 * Name-level reference graph for a component. Populated once by the
 * analyzer; queried by the emitter. Replaces `collectUsedIdentifiers` /
 * `collectUsedFunctions` / `collectIdentifiersFromIRTree`, the function
 * fixpoint, and the duplicated prop-reachability loop in
 * `analyzeClientNeeds` — all of which are derivable from `edges`.
 *
 * See issue #1021 for the target shape.
 */
export interface ReferencesGraph {
  edges: ReferenceEdge[]
  /**
   * Names declared by this component — all constants, functions, signal
   * getters/setters, memos, props, and the props object (if present).
   * Edges with `to` outside this set are references to external names
   * (imports, builtins, loop params) and should not be followed during
   * reachability queries on declarations.
   */
  declaredNames: Set<string>
  /** Prop names (propsParams plus `propsObjectName` when present). */
  propNames: Set<string>
}

/**
 * Emission scope for a local declaration (constant / function). Stage C
 * of issue #1021 replaces the cascade of `if (c.systemConstructKind) ...`
 * / `if (c.isModule && assigned) ...` branches in `generate-init.ts`
 * with a single lookup keyed by this enum.
 *
 * - `module` — emitted at module level, OUTSIDE the init function.
 *   Required for `createContext()` / `new WeakMap()` (unique identity
 *   for cross-component sharing), for declarations that init-statements
 *   assign to (#933, ESM strict-mode ReferenceError avoidance), and for
 *   module-level functions whose bodies do NOT reference init-scope
 *   names.
 * - `init` — emitted INSIDE the init function body. This is the default
 *   for signals, memos, and any declaration that transitively reads
 *   reactive values or per-instance props.
 * - `skip` — not emitted at all. Covers JSX inlined at IR level (#547),
 *   JSX-returning helpers inlined at call sites (#569), multi-return
 *   JSX helpers preserved only for the SSR marked template (#932), and
 *   declarations that are simply unused by the emitted client JS.
 */
export type DeclarationScope = 'module' | 'init' | 'skip'

/**
 * How a prop identifier is accessed somewhere the emitter scans. Used
 * by `emitPropsExtraction` to pick the right default for the prop's
 * destructure: `.xxx` access needs `{}` (to avoid "cannot read
 *  properties of undefined"), `[…]` access likewise.
 */
export type PropAccessKind = 'property' | 'index'

export interface PropUsage {
  propName: string
  /** Every access kind observed across the sources the emitter scans. */
  accessKinds: ReadonlySet<PropAccessKind>
  /** True when the prop is consumed as a loop's array expression
   *  (`<loop>.array`). Triggers the `[]` default in the destructure. */
  usedAsLoopArray: boolean
}

export interface ClientAnalysis {
  needsInit: boolean
  usedProps: string[]
}

// =============================================================================
// Component IR (Complete Output)
// =============================================================================

export interface ComponentIR {
  version: '0.1'
  metadata: IRMetadata
  root: IRNode
  errors: CompilerError[]
}

// =============================================================================
// Error Types
// =============================================================================

export type ErrorSeverity = 'error' | 'warning' | 'info'

export interface CompilerError {
  code: string // 'BF001', 'BF003', etc.
  severity: ErrorSeverity
  message: string
  loc: SourceLocation
  suggestion?: ErrorSuggestion
}

export interface ErrorSuggestion {
  message: string
  replacement?: string
}

/**
 * A diagnostic an adapter intentionally emits for a shared conformance
 * fixture (packages/adapter-tests) instead of lowering it — the adapter's
 * machine-readable known-limitations declaration. Consumed by the adapter's
 * own conformance test (as `expectedDiagnostics`) and by `bf compat`
 * (issue-URL attribution). Tracked limitations carry the `known-limitation`
 * label: https://github.com/piconic-ai/barefootjs/labels/known-limitation
 */
export interface ConformancePin {
  /** Diagnostic code, e.g. 'BF101'. */
  code: string
  severity: 'error' | 'warning'
  /** Tracking issue URL (known-limitation label) for this refusal, when one exists. */
  issue?: string
  /**
   * Present when THIS adapter has no verified escape yet for this
   * refusal — the per-adapter half of #2613's "loud-or-escapable" floor
   * (`packages/compat/src/__tests__/escape-coverage.test.ts`). `issue` is
   * the tracking pointer for closing the gap (fall back to
   * https://github.com/piconic-ai/barefootjs/issues/2613 itself when no
   * more specific issue exists yet).
   *
   * Declared here, next to the refusal it qualifies, so an adapter's own
   * package is the sole place that states what it knows about its own
   * refusal — no central cross-adapter ledger to keep in sync (that was
   * the architectural defect increment 1 shipped with: a `packages/compat`
   * test hardcoding every adapter's id, which made adapters non-additive).
   *
   * Absent means the adapter believes an escape is owed here — either
   * already satisfied (the refused fixture's `escapes` twin compiles
   * clean, unpinned, non-divergent, and not CSR-skipped on THIS adapter)
   * or a pending gap the floor test won't let merge silently.
   *
   * Shrink-only, same discipline `KNOWN_HOLES` established: once a
   * working twin exists here, a lingering `unescapable` becomes a STALE
   * declaration and the floor test fails loudly on it, naming this pin.
   */
  unescapable?: { issue: string }
}
/** Keyed by shared-fixture id (`JSXFixture.id`). */
export type ConformancePins = Record<string, ReadonlyArray<ConformancePin>>

/**
 * Render-level divergences an adapter declares against the shared
 * conformance corpus (packages/adapter-tests): fixtures that COMPILE
 * clean but whose rendered output diverges from the Hono reference on
 * the adapter's real backend. The machine-readable sibling of
 * `ConformancePins` (which covers compile-time refusals): consumed by
 * the adapter's own conformance test (as its `skipJsx` set — the test
 * file derives the skip list from this object so the two can't drift)
 * and by `packages/compat` (the fixture-divergences section of
 * `ui/compat.lock.json`, rendered on the docs compatibility-matrix
 * page). Keyed by shared-fixture id; the value is a one-line
 * human-readable description of the divergence.
 */
export type RenderDivergences = Record<string, string>

// =============================================================================
// Compile Options & Results
// =============================================================================

export interface CompileOptions {
  outputIR?: boolean // Output *.ir.json
  sourceMaps?: boolean
  /** CSS layer prefix for component classes.
   * When set, static class strings and class-related constants
   * are prefixed with `layer-{value}:` for CSS cascade priority.
   * Example: 'components' → classes prefixed with 'layer-components:'
   */
  cssLayerPrefix?: string
  /** Pre-built TypeScript program for type-based reactivity detection */
  program?: import('typescript').Program
  /** Import prefixes resolved at build time, not in browser (e.g., ['@/', '@ui/']) */
  localImportPrefixes?: string[]
  /**
   * Override for the script base name baked into the adapter's
   * `Scripts.Register` calls. Defaults to the component's identifier
   * (e.g. `Button`). When the build pipeline emits client bundles
   * under a path-based filename (e.g. `ui/button/index.client.js` for
   * a nested source like `components/ui/button/index.tsx`), passing
   * that path-without-extension here keeps the registered URL in sync
   * with the actual on-disk file. Used by the go-template adapter and
   * any other adapter that bakes the URL at codegen time.
   */
  scriptBaseName?: string
  /**
   * Caller guarantees that every sibling `.tsx` file's generated
   * template will be registered on the same template instance at
   * render time. Forwarded verbatim to `adapter.generate(...,
   * { siblingTemplatesRegistered })`; see that field's docstring
   * on `AdapterGenerateOptions` for the full semantics.
   */
  siblingTemplatesRegistered?: boolean
  /**
   * Relative-import rewriter applied to every `ImportInfo.source` (and
   * matching `export … from '…'` block source) the compiler hands to
   * adapters. The CLI build pipeline supplies this so source-authored
   * paths like `'../../../types'` resolve from the on-disk emit
   * position rather than the source position (#1453). Bare specifiers
   * (`@barefootjs/jsx`, `react`) are NOT passed through — only paths
   * starting with `.`.
   */
  rewriteRelativeImport?: (importPath: string) => string
  /**
   * Profile mode (#1690, SR3). When true, the client-JS codegen emits
   * IR-aligned `__bfId` arguments at reactive creation sites
   * (`createSignal`/`createMemo`/`createEffect`) so a profiling run can join
   * runtime events to IR nodes. Off by default — the emitted code is then
   * byte-for-byte unchanged (SR8). Dev/profiling builds only.
   */
  profile?: boolean
  /**
   * Forwarded verbatim to `adapter.generate(..., { scriptAssets })` — see
   * that field's docstring on `AdapterGenerateOptions` for the full
   * precedence rules (`skipScriptRegistration` still wins; `[]` means "no
   * scripts", distinct from `undefined`'s "use the adapter-computed path").
   *
   * This is plain resolved data (an ordered URL list), not a rewrite
   * callback — the caller (chiefly `@barefootjs/vite`) has already done all
   * the resolution (bundling, hashing, manifest lookup) before calling
   * `compileJSX`; the compiler only threads the list through to the
   * adapter unchanged.
   */
  scriptAssets?: string[]
  /**
   * Forwarded verbatim to `adapter.generate(..., { preloadAssets })` — see
   * that field's docstring on `AdapterGenerateOptions` for the full
   * precedence rules (`skipScriptRegistration` still wins; `[]` means
   * "resolved, nothing to preload", distinct from `undefined`'s "no
   * preload information").
   *
   * Same plain-resolved-data contract as `scriptAssets`: the caller
   * (`@barefootjs/vite`) has already walked the manifest; the compiler
   * only threads the list through unchanged.
   */
  preloadAssets?: string[]
}

export interface FileOutput {
  path: string
  content: string
  type: 'markedTemplate' | 'clientJs' | 'ir' | 'sourceMap' | 'types' | 'ssrDefaults'
  /**
   * The exported component this file was generated for. Set on
   * `markedTemplate` / `ssrDefaults` outputs so the build pipeline can pair
   * them per component without guessing from file basenames — a
   * single-component file's template is named after the SOURCE file
   * (`index.html.ep`), not the component, so the basename alone can't
   * recover the component name (#2132).
   */
  componentName?: string
}

export interface CompileResult {
  files: FileOutput[]
  errors: CompilerError[]
}
