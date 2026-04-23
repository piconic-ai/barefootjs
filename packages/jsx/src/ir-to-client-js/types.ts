/**
 * Internal type definitions for client JS generation.
 */

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
} from '../types'

export interface ClientJsContext {
  componentName: string
  signals: SignalInfo[]
  memos: MemoInfo[]
  effects: EffectInfo[]
  onMounts: OnMountInfo[]
  /** Top-level imperative statements preserved from the component body (#930). */
  initStatements: InitStatementInfo[]
  localFunctions: FunctionInfo[]
  localConstants: ConstantInfo[]
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
}

/** Loop info extracted from a conditional branch for reactive reconciliation. */
export interface BranchLoop extends LoopCore {
  kind: 'branch'
  index: string | null // Index parameter (e.g., 'i')
  template: string     // HTML template for each item
  containerSlotId: string // bf slot ID of the container element (e.g., 's1' for <ul bf="s1">)
  mapPreamble: string | null
  childEvents: LoopChildEvent[]
  // Composite loop fields (loops whose body contains child components)
  nestedComponents?: IRLoopChildComponent[]
  childReactiveTexts?: LoopChildReactiveText[]
  childReactiveAttrs?: LoopChildReactiveAttr[]
  childConditionals?: LoopChildConditional[]
  innerLoops?: NestedLoop[]
  useElementReconciliation?: boolean
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
  /** Whether the inner array references the outer loop param (needs reactive mapArray) */
  refsOuterParam?: boolean
  /** Reactive text expressions inside inner loop items (slotId → expression) */
  childReactiveTexts?: LoopChildReactiveText[]
  /** Child components inside inner loop items (for initChild/createComponent) */
  childComponents?: import('../types').IRLoopChildComponent[]
  /** Event handlers inside inner loop items */
  childEvents?: LoopChildEvent[]
  /** Reactive conditionals inside inner loop items (Path B, #830) */
  childConditionals?: LoopChildConditional[]
  /** True when this loop is inside a conditional branch (handled by insert() bindEvents instead) */
  insideConditional?: boolean
  /** Number of non-loop DOM siblings before this loop in its container element */
  siblingOffset?: number
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
  childComponents: Array<{ name: string; slotId: string | null; props: import('../types').IRProp[]; children: import('../types').IRNode[] }>
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
}

export interface TopLevelLoop extends LoopCore {
  kind: 'top-level'
  slotId: string
  index: string | null
  template: string
  childEventHandlers: string[] // Event handlers from child elements (for identifier extraction)
  childEvents: LoopChildEvent[] // Detailed event info for delegation
  childReactiveAttrs: LoopChildReactiveAttr[] // Reactive attributes in loop children
  childReactiveTexts: LoopChildReactiveText[] // Reactive text interpolations in loop children
  childConditionals?: LoopChildConditional[] // Reactive conditionals in loop children
  childComponent?: IRLoopChildComponent // For createComponent-based rendering
  nestedComponents?: IRLoopChildComponent[] // For nested components in loop bodies
  isStaticArray: boolean // True if array is a static prop (not a signal)
  useElementReconciliation?: boolean // True: reconcileElements + composite rendering (native root with child components)
  /** Inner loop metadata for composite element reconciliation (array, param, key, container) */
  innerLoops?: NestedLoop[]
  /** Number of non-loop DOM siblings before this loop in its parent element. Used to offset children[idx] access. */
  siblingOffset?: number
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
  /** Attribute names already statically set on the element (exclude from applyRestAttrs) */
  excludeKeys: string[]
}
