/**
 * Pairwise feature grammar (#2481 step 5, "Pairwise generator (t=2 floor)").
 *
 * Five orthogonal axes, each a small closed value set, lifted verbatim from
 * #2481's "Feature grammar" section. `covering-array.ts` builds a
 * constrained t=2 covering array over these values; `compose.ts` turns one
 * chosen tuple into a compiled TSX case.
 *
 * Value sets are exact — do not add/remove/rename a value without updating
 * the issue's grammar and the constraint table in `covering-array.ts`
 * (some incompatible pairs are keyed off the literal value strings below).
 */

export const STATE_VALUES = [
  'signal',
  'memo',
  'prop',
  'prop-shadowing-signal',
  'getter-elided-signal',
] as const
export type StateValue = (typeof STATE_VALUES)[number]

export const STRUCTURE_VALUES = [
  'keyed-loop',
  'unkeyed-loop',
  'static-array-loop',
  'signal-array-loop',
  'nested-loop-depth-2',
  'component-row-root-loop',
  'fragment-row-loop',
  'preamble-builder-body',
  'conditional-ternary',
  'early-return',
  'child-component',
  'fragment',
] as const
export type StructureValue = (typeof STRUCTURE_VALUES)[number]

export const BINDING_VALUES = [
  'text',
  'attr',
  'class',
  'style',
  'controlled-input',
  'controlled-select',
  'controlled-textarea',
  'boolean-attr',
] as const
export type BindingValue = (typeof BINDING_VALUES)[number]

export const EVENT_VALUES = [
  'direct-handler',
  'delegated-handler-in-row',
  'handler-reading-loop-param',
  'handler-reading-outer-signal',
  'ref-callback',
] as const
export type EventValue = (typeof EVENT_VALUES)[number]

export const CALLBACK_VALUES = [
  'inline-arrow',
  'function-reference',
  'sort-comparator',
  'filter-predicate',
  'flatmap-callback',
] as const
export type CallbackValue = (typeof CALLBACK_VALUES)[number]

export interface AxisCombo {
  state: StateValue
  structure: StructureValue
  binding: BindingValue
  event: EventValue
  callback: CallbackValue
}

export const AXIS_NAMES = ['state', 'structure', 'binding', 'event', 'callback'] as const
export type AxisName = (typeof AXIS_NAMES)[number]

export const AXIS_VALUES: { readonly [K in AxisName]: readonly AxisCombo[K][] } = {
  state: STATE_VALUES,
  structure: STRUCTURE_VALUES,
  binding: BINDING_VALUES,
  event: EVENT_VALUES,
  callback: CALLBACK_VALUES,
}

/**
 * The eight `structure` values whose row body sits inside a `.map()` (or
 * `.flatMap()`) call over an array. The remaining four (`conditional-ternary`,
 * `early-return`, `child-component`, `fragment`) have no per-row iteration —
 * `event`/`callback` values that only make sense against iteration (see the
 * constraint table in `covering-array.ts`) are gated on this predicate.
 */
export function isLoopStructure(structure: StructureValue): boolean {
  return (
    structure === 'keyed-loop' ||
    structure === 'unkeyed-loop' ||
    structure === 'static-array-loop' ||
    structure === 'signal-array-loop' ||
    structure === 'nested-loop-depth-2' ||
    structure === 'component-row-root-loop' ||
    structure === 'fragment-row-loop' ||
    structure === 'preamble-builder-body'
  )
}
