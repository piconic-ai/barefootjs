/**
 * Internal type definitions for client JS generation.
 */

import type {
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
export interface ReactiveChildProp {
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
}

export interface LoopChildEvent {
  eventName: string // 'click', 'submit', etc.
  childSlotId: string // bf slot ID of the element with the event
  handler: string // Handler expression (may reference loop param)
}

export interface LoopChildReactiveAttr {
  childSlotId: string // bf slot ID of the element with reactive attr
  attrName: string // 'className', 'disabled', etc.
  expression: string // Expression that reads signals
  presenceOrUndefined?: boolean
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
  childComponent?: IRLoopChildComponent // For createComponent-based rendering
  nestedComponents?: IRLoopChildComponent[] // For nested components in static arrays
  isStaticArray: boolean // True if array is a static prop (not a signal)
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

export interface ReactiveAttribute {
  slotId: string
  attrName: string
  expression: string
  presenceOrUndefined?: boolean
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
}

export interface RestAttrElement {
  slotId: string
  /** The spread source expression (e.g., 'rest', 'props') */
  source: string
  /** Attribute names already statically set on the element (exclude from applyRestAttrs) */
  excludeKeys: string[]
}
