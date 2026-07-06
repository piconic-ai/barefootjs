/**
 * Internal type definitions for client JS generation.
 */

import type {
  TemplatePrimitiveRegistry,
  TemplateCallAcceptor,
} from '../adapters/interface.ts'
import type {
  AttrMeta,
  IREvent,
  IRLoopChildComponent,
  SignalInfo,
  MemoInfo,
  EffectInfo,
  OnMountInfo,
  InitStatementInfo,
  FunctionInfo,
  ConstantInfo,
  ParamInfo,
  CompilerError,
  ImportInfo,
} from '../types.ts'
import type { CsrInlinabilityMap } from './csr-substitute.ts'

export interface ClientJsContext {
  componentName: string
  /**
   * Stable 8-char hash for the source file (e.g., from `entryPath`).
   * Combined with a component's name, it disambiguates same-name
   * non-exported helpers across files in the global runtime registry.
   * Empty string when no file scope was supplied (single-file unit
   * tests, legacy callers).
   */
  fileScope: string
  /**
   * Names of components defined in the SAME source file that are NOT
   * exported. Their `hydrate(...)` registration and every cross-call
   * (`renderChild`, `initChild`, `createComponent`, …) inside this file
   * is rewritten to `${name}__${fileScope}` so private helpers cannot
   * collide with same-named exports from other modules.
   */
  nonExportedSiblings: Set<string>
  /**
   * Profile mode (#1690, SR3). When true, emit IR-aligned `__bfId` args at
   * reactive creation sites. Off by default → byte-identical output (SR8).
   */
  profile: boolean
  signals: SignalInfo[]
  memos: MemoInfo[]
  effects: EffectInfo[]
  onMounts: OnMountInfo[]
  /** Top-level imperative statements preserved from the component body (#930). */
  initStatements: InitStatementInfo[]
  localFunctions: FunctionInfo[]
  localConstants: ConstantInfo[]
  /**
   * Component-file import list, threaded through so `buildEnvFromCtx`'s
   * reconstructed `IRMetadata`-shaped object carries REAL imports (#2069)
   * — `prepareLoweringMatchers` needs the real list to resolve a
   * `LoweringPlugin`'s local import names (e.g. `queryHrefLocalNames`);
   * an empty `imports: []` would silently disable every import-aware
   * plugin for the client-JS inline-safety gate.
   */
  imports: ImportInfo[]
  propsParams: ParamInfo[]
  propsObjectName: string | null
  restPropsName: string | null

  // Collected elements
  interactiveElements: InteractiveElement[]
  dynamicElements: DynamicElement[]
  conditionalElements: ConditionalElement[]
  loopElements: TopLevelLoop[]
  refElements: RefElement[]
  childInits: ChildInit[]
  /**
   * Slot ids of direct child components whose render is DEFERRED to init
   * (dropped-prop fix). For these, the CSR registration template emits a
   * `data-bf-ph` placeholder instead of `renderChild(...)`, and the init
   * body uses `upsertChild` (→ `createComponent` with full getter props)
   * instead of `initChild`. Computed in `generateInitFunction` once
   * `unsafeLocalNames` is known, then read by the child-init phase and the
   * registration-template emit so both agree on which children defer.
   */
  deferredChildSlots: Set<string>
  reactiveProps: ReactiveComponentProp[]
  reactiveChildProps: ReactiveChildProp[]
  reactiveAttrs: ReactiveAttribute[]
  clientOnlyElements: ClientOnlyElement[]
  clientOnlyConditionals: ConditionalElement[]
  providerSetups: Array<{ contextName: string; valueExpr: string }>
  /** HTML elements with unresolved spread attrs (open types, need applyRestAttrs at runtime) */
  restAttrElements: RestAttrElement[]
  /** Warnings collected during client JS generation */
  warnings: CompilerError[]
  /**
   * Adapter-supplied registry of pure JS callees that can be safely
   * rendered in template scope (#1187). Threaded through to relocate's
   * `isInlinableInTemplate` so registered calls bypass the bridged-arg
   * / zero-arg shape rejections. Undefined when the adapter doesn't
   * declare any — same behaviour as pre-#1187.
   */
  templatePrimitives?: TemplatePrimitiveRegistry
  /**
   * Broad-acceptance predicate from the adapter (Hono / CSR with full
   * JS runtimes). Consulted when a callee isn't in `templatePrimitives`.
   */
  acceptsTemplateCall?: TemplateCallAcceptor
  /**
   * CSR-only: per-constant inlinability resolved by `populateCsrInlinable`
   * during Stage 2 of `compute-inlinability`. The map is keyed by the
   * constant's name; the value is `null` when the const can't be safely
   * inlined into CSR template scope (placeholder-let, arrow-literal,
   * system-construct, jsx-inline, or a substituted form that fails
   * `isInlinableInTemplate`), otherwise the `{ rewrittenValue,
   * freeIdentifiers }` pair the emitter splices in.
   *
   * Lives on the context — not on `ConstantInfo` — so the CSR-specific
   * substitution result doesn't leak into the cross-adapter IR (#1277).
   * SSR adapters (Hono, Go, Mojo) don't substitute signals at template
   * time, so they have no use for this data.
   */
  csrInlinable: CsrInlinabilityMap
}

export interface InteractiveElement {
  slotId: string
  events: IREvent[]
}

export interface ReactiveComponentProp {
  slotId: string
  propName: string
  expression: string
  componentName: string
}

/**
 * Reactive prop for a child component.
 * These are props that depend on parent's props and need
 * createEffect to update the child component's DOM attributes.
 */
export interface ReactiveChildProp extends AttrMeta {
  componentName: string
  slotId: string | null
  propName: string // The prop name (e.g., 'className')
  attrName: string // The DOM attribute name (e.g., 'class')
  expression: string // The expanded expression (with props.xxx references)
}

export interface DynamicElement {
  slotId: string
  expression: string
  insideConditional?: boolean // true if element is inside a conditional branch
}

export interface ConditionalBranchEvent {
  slotId: string
  eventName: string
  handler: string
}

export interface ConditionalBranchRef {
  slotId: string
  callback: string
}

export interface ConditionalBranchChildComponent {
  name: string
  slotId: string | null
  propsExpr: string
}

export interface ConditionalBranchTextEffect {
  slotId: string
  expression: string
}

/**
 * Reactive attribute binding scoped to a single conditional branch (#1071).
 * Each becomes a `createDisposableEffect` inside the branch's
 * `bindEvents(__branchScope)` so the binding re-resolves its target on
 * every DOM swap done by `insert()`. Attributes on the branch's root
 * element or any descendant of it are routed here; init-level
 * `ctx.reactiveAttrs` only carries non-branch attrs.
 */
export interface ConditionalBranchReactiveAttr extends AttrMeta {
  slotId: string
  attrName: string
  expression: string
}

/**
 * How many element children precede a loop's items in its container — the
 * offset applied to `container.children[idx]` so each item resolves to the
 * right element during hydration.
 *
 * Two contributions, kept distinct because they codegen differently:
 *   - `staticCount`: siblings of statically-known element count, folded to a
 *     compile-time integer (`+ 1`).
 *   - `dynamicTerms`: one JS expression per sibling whose element count is
 *     only known at runtime — a preceding `.map()` (`(arr).length`) or a
 *     preceding conditional (`(cond ? 1 : 0)`) — each added as `+ <term>`.
 *
 * Carried as one value object end-to-end (collect → IR loop → plan → codegen)
 * so a future offset contributor is added in one place, not threaded as a new
 * field through every layer (#1693).
 */
export interface LoopOffset {
  /** Folded element count of statically-sized preceding siblings. `0` = none. */
  staticCount: number
  /** Runtime element-count expressions of dynamic preceding siblings; `[]` = none. */
  dynamicTerms: readonly string[]
}

/**
 * Fields shared by every flavour of collected loop (top-level, branch-scoped, nested).
 * The three loop-info variants (`TopLevelLoop`, `BranchLoop`, `NestedLoop`) each extend
 * this base and add a `kind` discriminator so callers can narrow exhaustively.
 */
export interface LoopCore {
  /** Array expression — e.g. `items()`, `col.tasks`. */
  array: string
  /** Loop parameter name — e.g. `item`, `task`. */
  param: string
  /** Key expression — e.g. `item.id`. `null` when the loop has no explicit key. */
  key: string | null
  /**
   * Destructured-binding accessor paths when `param` is an array/object
   * binding pattern (#951). The client-JS emitter rewrites each binding
   * name to `__bfItem().path` so fine-grained effects read the per-item
   * signal accessor instead of a once-captured local. Absent for
   * simple-name callbacks.
   */
  paramBindings?: readonly import('../types.ts').LoopParamBinding[]
  /**
   * Unique id for this loop's `<!--bf-loop:<id>--> ... <!--bf-/loop:<id>-->`
   * marker pair, threaded from `IRLoop.markerId`. Each `mapArray()` /
   * `reconcileElements()` call passes this id so sibling loops under the
   * same parent reconcile their own range (#1087).
   */
  markerId: string
  /**
   * True when the loop body's top-level shape is a multi-root Fragment
   * (e.g. `<><path/><path/></>`). Drives per-item `<!--bf-loop-i-->`
   * marker emission and the multi-root template-clone code path so each
   * key tracks all of its DOM nodes (#1212).
   */
  bodyIsMultiRoot?: boolean
  /**
   * True when the loop body is a single whole-item conditional whose at
   * least one branch renders no element (#1665). Routes the loop through
   * the anchored emission path (`mapArrayAnchored` + per-item
   * `<!--bf-loop-i:KEY-->` anchors) so 0-or-1-element items reconcile.
   */
  bodyIsItemConditional?: boolean
  /**
   * Pre-computed free identifiers referenced by the `array` expression
   * (#1267). Populated during IR build from the originating AST node so
   * downstream callers can ask `arrayFreeIdentifiers.has(name)` instead of
   * running word-boundary regex against `array`.
   */
  arrayFreeIdentifiers?: ReadonlySet<string>
  /**
   * Per-item bindings collected from the loop body — the union of every
   * reactive / imperative concept that must re-attach on each renderItem
   * invocation (#1244 §B). Required (defaults to empty arrays) so adding
   * a new per-item concept becomes a compile-time fan-out: every
   * `LoopCore`-extending type and every consumer is forced through one
   * code path.
   *
   * Replaces the pre-#1244 parallel fields `childEvents` /
   * `childReactiveAttrs` / `childReactiveTexts` / `childConditionals`
   * that lived on TopLevelLoop, BranchLoop and NestedLoop with diverging
   * required-vs-optional shapes — the exact pattern that issue #1244 §B
   * names as a recurring source of "forgotten variant" defects.
   */
  bindings: LoopChildBindings

  /**
   * Iteration shape from `.entries()` / `.keys()` / `.values()` chain
   * (#1448 Tier B). Threaded from `IRLoop.iterationShape`.
   */
  iterationShape?: 'entries' | 'keys'
}

/**
 * Per-item bindings collected from a loop body (#1244). Every loop variant
 * (top-level / branch / nested) carries one of these on `LoopCore.bindings`.
 *
 * Adding a new per-item concept means extending this struct and updating one
 * collector (`collectLoopChildBindings`) — forgetting a variant becomes a
 * compile error because the field is required.
 */
export interface LoopChildBindings {
  /** Event handlers on elements inside the loop body. */
  events: LoopChildEvent[]
  /** Reactive attribute bindings on elements inside the loop body. */
  reactiveAttrs: LoopChildReactiveAttr[]
  /** Reactive text interpolations inside the loop body. */
  reactiveTexts: LoopChildReactiveText[]
  /** Imperative ref callbacks on elements inside the loop body. */
  refs: LoopChildRef[]
  /** Reactive conditionals inside the loop body. */
  conditionals: LoopChildConditional[]
}

/**
 * Imperative ref callback on an element inside a loop body (#1244 catalog:
 * "ref callback re-invocation on remount under the same key"). Emitted
 * inside the per-item factory so every renderItem invocation — initial
 * mount, SSR hydration, and same-key remount after unmount — re-runs the
 * callback with the just-built (or just-hydrated) DOM element.
 *
 * Mirrors `ConditionalBranchRef` but keyed on `childSlotId` so it matches
 * the rest of the per-item collectors (`LoopChildEvent`,
 * `LoopChildReactiveAttr`, `LoopChildReactiveText`).
 */
export interface LoopChildRef {
  /** bf slot ID of the element bearing the ref. */
  childSlotId: string
  /** Ref callback expression. May reference the loop param. */
  callback: string
}

/** Loop info extracted from a conditional branch for reactive reconciliation. */
export interface BranchLoop extends LoopCore {
  kind: 'branch'
  index: string | null // Index parameter (e.g., 'i')
  template: string     // HTML template for each item
  containerSlotId: string // bf slot ID of the container element (e.g., 's1' for <ul bf="s1">)
  mapPreamble: string | null
  // Composite loop fields (loops whose body contains child components)
  nestedComponents?: IRLoopChildComponent[]
  innerLoops?: NestedLoop[]
  useElementReconciliation?: boolean
  // Filter / sort chain metadata — must be carried so the mapArray call
  // emitted inside the branch keeps the `.filter()` / `.toSorted()` chain
  // and tracks signals read by the predicate / comparator (#1434).
  filterPredicate?: {
    param: string
    raw: string
  }
  sortComparator?: {
    paramA: string
    paramB: string
    raw: string
  }
  chainOrder?: 'filter-sort' | 'sort-filter'
  // Per-item bindings (events / reactiveAttrs / reactiveTexts / refs / conditionals)
  // now live on `LoopCore.bindings` — see issue #1244 §B.
}

/**
 * All reactive entities collected from one branch of a reactive conditional
 * — events, refs, child components, text effects, nested loops, and nested
 * conditionals. Replaces the six parallel `whenTrueXxx` / `whenFalseXxx`
 * field pairs that used to live directly on `ConditionalElement` and
 * `ConditionalElement` (pre-Phase 3 shape; `ClientOnlyConditional` was a
 * structurally-identical sibling type, now replaced by `ConditionalElement`).
 */
export interface BranchSummary {
  events: ConditionalBranchEvent[]
  refs: ConditionalBranchRef[]
  childComponents: ConditionalBranchChildComponent[]
  textEffects: ConditionalBranchTextEffect[]
  /**
   * Reactive attribute bindings on the branch's root element or descendants.
   * Emitted inside `insert()` bindEvents so they re-attach when `insert()`
   * swaps in a fresh element on the rising edge of the condition (#1071).
   */
  reactiveAttrs: ConditionalBranchReactiveAttr[]
  loops: BranchLoop[]
  conditionals: ConditionalElement[]
}

export interface ConditionalElement {
  slotId: string
  condition: string
  whenTrueHtml: string
  whenFalseHtml: string
  whenTrue: BranchSummary
  whenFalse: BranchSummary
}

/**
 * Nested conditional info extracted from a branch.
 * Emitted as insert() inside the parent's bindEvents (not top-level)
 * so that the inner conditional is set up when the parent branch activates.
 */
export type ConditionalBranchConditional = ConditionalElement

export interface NestedLoop extends LoopCore {
  kind: 'nested'
  depth: number    // 1 for first nesting level, 2 for second, etc.
  containerSlotId: string | null // Slot ID of the parent element containing the loop (for hydration)
  /** HTML template for a single inner loop item (for mapArray CSR rendering) */
  template?: string
  /**
   * Raw JS of pre-return statements in the inner `.map()` callback's block
   * body. The reactive emitter re-emits this (with loop-param references
   * rewritten to signal-accessor form) at the top of the `mapArray`
   * `renderItem` callback so locals referenced by the cloned-template IIFE
   * (and any subsequent reads) are in scope (#1052).
   */
  mapPreamble?: string
  /** Whether the inner array references the outer loop param (needs reactive mapArray) */
  refsOuterParam?: boolean
  /** Child components inside inner loop items (for initChild/createComponent) */
  childComponents?: import('../types.ts').IRLoopChildComponent[]
  /** True when this loop is inside a conditional branch (handled by insert() bindEvents instead) */
  insideConditional?: boolean
  /** Offset of this loop's items past its preceding container siblings (#1693). */
  offset?: LoopOffset
  // Per-item bindings (events / reactiveAttrs / reactiveTexts / refs / conditionals)
  // now live on `LoopCore.bindings` — see issue #1244 §B.
}

export interface LoopChildEvent {
  eventName: string // 'click', 'submit', etc.
  childSlotId: string // bf slot ID of the element with the event
  handler: string // Handler expression (may reference loop param)
  /** Nesting info for events inside nested inner loops. Empty = direct child. */
  nestedLoops: NestedLoop[]
  /** DOM nesting depth (0 = loop body root). Deepest-first sorting for event delegation (#774). */
  domDepth: number
}

export interface LoopChildReactiveAttr extends AttrMeta {
  childSlotId: string // bf slot ID of the element with reactive attr
  attrName: string // 'className', 'disabled', etc.
  expression: string // Expression that reads signals
}

export interface LoopChildReactiveText {
  slotId: string // bf comment marker slot ID (e.g., 's7' → <!--bf:s7-->)
  expression: string // Expression that reads signals
  insideConditional?: boolean // true if text node is inside a conditional branch (insert() may replace it)
  /**
   * Pre-computed free identifiers referenced by `expression` (#1267).
   * For expressions produced via `expandConstantForReactivity`, this is the
   * union of the original AST node's free identifiers and the substituted
   * constants' own `freeIdentifiers`.
   */
  freeIdentifiers?: ReadonlySet<string>
}

/**
 * All reactive entities collected from one branch of a `LoopChildConditional`
 * — child components, inner loops, nested conditionals, and events.
 *
 * Mirrors the top-level `BranchSummary` refactor (#1009): replaces the eight
 * parallel `whenTrueXxx` / `whenFalseXxx` fields that used to live directly
 * on `LoopChildConditional` with a single bundle per branch.
 *
 * Differs from `BranchSummary` by carrying loop-scoped types —
 * `NestedLoop` instead of `BranchLoop`, recursive `LoopChildConditional`
 * instead of `ConditionalElement`, raw component data instead of
 * pre-built `propsExpr` strings — because these structs are consumed
 * inside a loop item's `mapArray` callback, not at the top-level init.
 */
export interface LoopChildBranchSummary {
  /**
   * Raw child components inside the branch (for initChild / createComponent).
   * Unlike `BranchSummary.childComponents` (pre-built `propsExpr`), these
   * carry raw `props` + `children` — `propsExpr` is built by the emitter
   * inside the loop's mapArray callback where the loop param is in scope.
   */
  childComponents: Array<{ name: string; slotId: string | null; props: import('../types.ts').IRProp[]; children: import('../types.ts').IRNode[] }>
  /** Inner loops inside the branch that need mapArray setup. */
  innerLoops?: NestedLoop[]
  /** Nested conditionals inside the branch (recursive — Path A, #830). */
  conditionals?: LoopChildConditional[]
  /** Events on elements inside the branch — attached via insert() bindEvents (#839). */
  events?: ConditionalBranchEvent[]
}

export interface LoopChildConditional {
  slotId: string       // bf-c slot ID for insert() targeting
  condition: string    // Reactive condition expression
  whenTrueHtml: string // HTML template for true branch
  whenFalseHtml: string // HTML template for false branch (usually comment markers)
  whenTrue: LoopChildBranchSummary
  whenFalse: LoopChildBranchSummary
  /**
   * Pre-computed free identifiers referenced by `condition` (#1267).
   * For conditions produced via `expandConstantForReactivity`, this is the
   * union of the original AST node's free identifiers and the substituted
   * constants' own `freeIdentifiers`.
   */
  conditionFreeIdentifiers?: ReadonlySet<string>
}

export interface TopLevelLoop extends LoopCore {
  kind: 'top-level'
  slotId: string
  index: string | null
  template: string
  /**
   * Per-iteration HTML template for static-array loops that need to
   * self-heal on CSR mount (#1247). Unlike `template`, this variant skips
   * the `__bfItem()` / `param()` loop-param accessor wrapping so the
   * destructured `forEach((param, idx) => ...)` body can clone items
   * directly. Populated only when `isStaticArray` is true and the array
   * expression references an init-scope local (i.e. `Object.entries(props.x).filter(...)`)
   * that becomes `[]` in the CSR template substitution.
   */
  staticItemTemplate?: string
  /**
   * Shared once-per-loop skeleton template (perf), built by
   * `buildLoopSkeletonTemplate` when the loop body is a statically-analyzable
   * single-root element tree whose only dynamic parts are text/attribute
   * slots already covered by a loop-child `createEffect`. Present only for
   * dynamic (`mapArray`) top-level loops that pass the safety predicate in
   * `collect-elements.ts`'s `loop` visitor — `undefined` means "fall back to
   * the per-row interpolated `template` above" (conditionals, spread attrs,
   * multi-root bodies, nested components/loops, or any dynamic attr/text not
   * proven covered by an effect).
   */
  skeletonTemplate?: string
  childEventHandlers: string[] // Bare-identifier event handler names (for the reachability graph)
  childComponent?: IRLoopChildComponent // For createComponent-based rendering
  nestedComponents?: IRLoopChildComponent[] // For nested components in loop bodies
  // Per-item bindings (events / reactiveAttrs / reactiveTexts / refs / conditionals)
  // now live on `LoopCore.bindings` — see issue #1244 §B.
  isStaticArray: boolean // True if array is a static prop (not a signal)
  useElementReconciliation?: boolean // True: reconcileElements + composite rendering (native root with child components)
  /** Inner loop metadata for composite element reconciliation (array, param, key, container) */
  innerLoops?: NestedLoop[]
  /** Offset of this loop's items past its preceding container siblings (#1693). */
  offset?: LoopOffset
  filterPredicate?: {
    param: string
    raw: string  // Original filter predicate expression or block body
  }
  sortComparator?: {
    paramA: string
    paramB: string
    raw: string  // Full comparator body for client JS
  }
  chainOrder?: 'filter-sort' | 'sort-filter'
  mapPreamble?: string
}

/**
 * Discriminated union over every collected loop flavour. Narrow on `kind`
 * to get exhaustive handling — adding a new flavour becomes a typed,
 * compile-time fan-out instead of a silent structural match.
 */
export type CollectedLoop = TopLevelLoop | BranchLoop | NestedLoop

export interface RefElement {
  slotId: string
  callback: string
}

export interface ChildInit {
  name: string
  slotId: string | null
  propsExpr: string // e.g., "{ onAdd: handleAdd }"
}

export interface ReactiveAttribute extends AttrMeta {
  slotId: string
  attrName: string
  expression: string
}

export interface ClientOnlyElement {
  slotId: string
  expression: string
}


export interface RestAttrElement {
  slotId: string
  /** The spread source expression (e.g., 'rest', 'props') */
  source: string
  /**
   * Prop SOURCE KEYS already consumed by the component (exclude from
   * applyRestAttrs). For the destructured `...rest` form this is the
   * destructured param names (the JS rest-exclusion set) unioned with any
   * statically-set attr names; applyRestAttrs filters `source[key]` by these
   * so it neither re-binds separately-wired events nor re-emits consumed
   * props under their raw key. See collect-elements.ts for the rationale.
   */
  excludeKeys: string[]
}
