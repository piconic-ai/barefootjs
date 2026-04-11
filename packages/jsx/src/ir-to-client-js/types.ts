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
  localFunctions: FunctionInfo[]
  localConstants: ConstantInfo[]
  propsParams: ParamInfo[]
  propsObjectName: string | null
  restPropsName: string | null

  // Collected elements
  interactiveElements: InteractiveElement[]
  dynamicElements: DynamicElement[]
  conditionalElements: ConditionalElement[]
  loopElements: LoopElement[]
  refElements: RefElement[]
  childInits: ChildInit[]
  reactiveProps: ReactiveComponentProp[]
  reactiveChildProps: ReactiveChildProp[]
  reactiveAttrs: ReactiveAttribute[]
  clientOnlyElements: ClientOnlyElement[]
  clientOnlyConditionals: ClientOnlyConditional[]
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

/** Loop info extracted from a conditional branch for reactive reconciliation. */
export interface ConditionalBranchLoop {
  array: string       // Array expression (e.g., 'items()')
  param: string       // Loop parameter name (e.g., 'item')
  index: string | null // Index parameter (e.g., 'i')
  key: string | null   // Key expression (e.g., 'item.id')
  template: string     // HTML template for each item
  containerSlotId: string // bf slot ID of the container element (e.g., 's1' for <ul bf="s1">)
  mapPreamble: string | null
  childEvents: LoopChildEvent[]
  // Composite loop fields (loops whose body contains child components)
  nestedComponents?: IRLoopChildComponent[]
  childReactiveTexts?: LoopChildReactiveText[]
  childReactiveAttrs?: LoopChildReactiveAttr[]
  childConditionals?: LoopChildConditional[]
  innerLoops?: NestedLoopInfo[]
  useElementReconciliation?: boolean
}

export interface ConditionalElement {
  slotId: string
  condition: string
  whenTrueHtml: string
  whenFalseHtml: string
  whenTrueEvents: ConditionalBranchEvent[]
  whenFalseEvents: ConditionalBranchEvent[]
  whenTrueRefs: ConditionalBranchRef[]
  whenFalseRefs: ConditionalBranchRef[]
  whenTrueChildComponents: ConditionalBranchChildComponent[]
  whenFalseChildComponents: ConditionalBranchChildComponent[]
  whenTrueTextEffects: ConditionalBranchTextEffect[]
  whenFalseTextEffects: ConditionalBranchTextEffect[]
  whenTrueLoops: ConditionalBranchLoop[]
  whenFalseLoops: ConditionalBranchLoop[]
  whenTrueConditionals: ConditionalBranchConditional[]
  whenFalseConditionals: ConditionalBranchConditional[]
}

/**
 * Nested conditional info extracted from a branch.
 * Emitted as insert() inside the parent's bindEvents (not top-level)
 * so that the inner conditional is set up when the parent branch activates.
 */
export type ConditionalBranchConditional = ConditionalElement

export interface NestedLoopInfo {
  depth: number    // 1 for first nesting level, 2 for second, etc.
  array: string    // Inner loop array expression (e.g., 'col.tasks')
  param: string    // Inner loop parameter name (e.g., 'task')
  key: string      // Inner loop key expression (e.g., 'task.id')
  containerSlotId: string | null // Slot ID of the parent element containing the loop (for hydration)
  /** HTML template for a single inner loop item (for mapArray CSR rendering) */
  itemTemplate?: string
  /** Whether the inner array references the outer loop param (needs reactive mapArray) */
  refsOuterParam?: boolean
  /** Reactive text expressions inside inner loop items (slotId → expression) */
  reactiveTexts?: Array<{ slotId: string; expression: string }>
  /** Child components inside inner loop items (for initChild/createComponent) */
  childComponents?: import('../types').IRLoopChildComponent[]
  /** Event handlers inside inner loop items */
  childEvents?: LoopChildEvent[]
  /** True when this loop is inside a conditional branch (handled by insert() bindEvents instead) */
  insideConditional?: boolean
}

export interface LoopChildEvent {
  eventName: string // 'click', 'submit', etc.
  childSlotId: string // bf slot ID of the element with the event
  handler: string // Handler expression (may reference loop param)
  /** Nesting info for events inside nested inner loops. Empty = direct child. */
  nestedLoops: NestedLoopInfo[]
}

export interface LoopChildReactiveAttr extends AttrMeta {
  childSlotId: string // bf slot ID of the element with reactive attr
  attrName: string // 'className', 'disabled', etc.
  expression: string // Expression that reads signals
}

export interface LoopChildReactiveText {
  slotId: string // bf comment marker slot ID (e.g., 's7' → <!--bf:s7-->)
  expression: string // Expression that reads signals
}

export interface LoopChildConditional {
  slotId: string       // bf-c slot ID for insert() targeting
  condition: string    // Reactive condition expression
  whenTrueHtml: string // HTML template for true branch
  whenFalseHtml: string // HTML template for false branch (usually comment markers)
  whenTrueComponents: Array<{ name: string; slotId: string | null; props: import('../types').IRProp[]; children: import('../types').IRNode[] }>
  whenFalseComponents: Array<{ name: string; slotId: string | null; props: import('../types').IRProp[]; children: import('../types').IRNode[] }>
  /** Inner loops inside whenTrue branch that need mapArray setup */
  whenTrueInnerLoops?: NestedLoopInfo[]
  /** Inner loops inside whenFalse branch that need mapArray setup */
  whenFalseInnerLoops?: NestedLoopInfo[]
}

export interface LoopElement {
  slotId: string
  array: string
  param: string
  index: string | null
  key: string | null
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
  innerLoops?: NestedLoopInfo[]
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

export interface ClientOnlyConditional {
  slotId: string
  condition: string
  whenTrueHtml: string
  whenFalseHtml: string
  whenTrueEvents: ConditionalBranchEvent[]
  whenFalseEvents: ConditionalBranchEvent[]
  whenTrueRefs: ConditionalBranchRef[]
  whenFalseRefs: ConditionalBranchRef[]
  whenTrueChildComponents: ConditionalBranchChildComponent[]
  whenFalseChildComponents: ConditionalBranchChildComponent[]
  whenTrueTextEffects: ConditionalBranchTextEffect[]
  whenFalseTextEffects: ConditionalBranchTextEffect[]
  whenTrueLoops: ConditionalBranchLoop[]
  whenFalseLoops: ConditionalBranchLoop[]
  whenTrueConditionals: ConditionalBranchConditional[]
  whenFalseConditionals: ConditionalBranchConditional[]
}

export interface RestAttrElement {
  slotId: string
  /** The spread source expression (e.g., 'rest', 'props') */
  source: string
  /** Attribute names already statically set on the element (exclude from applyRestAttrs) */
  excludeKeys: string[]
}
