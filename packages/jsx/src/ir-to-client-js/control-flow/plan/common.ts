/**
 * Plan-layer types shared across multiple Plan kinds.
 *
 * `ScopeRef` discriminates which scope variable to use in the runtime call;
 * `ReactiveEffectsPassthrough` is a transitional carrier for IR fields that
 * still flow through the legacy `emitLoopChildReactiveEffects` helper. PR
 * 5+ will replace it with a structured `ReactiveEffectsPlan`.
 */

import type {
  LoopChildConditional,
  LoopChildReactiveAttr,
  LoopChildReactiveText,
  TopLevelLoop,
} from '../../types'

/**
 * The scope variable to pass as the first argument of insert(...) /
 * mapArray(...). At top-level this is `__scope`; nested inside an arm body
 * it is `__branchScope`; nested inside a loop renderItem it is the loop
 * element variable (e.g. `__el`).
 */
export type ScopeRef =
  | { kind: 'top' }                         // emits `__scope`
  | { kind: 'branchScope' }                 // emits `__branchScope`
  | { kind: 'var'; name: string }           // emits the literal variable name

/**
 * Loaned-IR carrier for emitLoopChildReactiveEffects. PR 5+ replaces this
 * with a structured ReactiveEffectsPlan that addresses O-3 (key dedup) at
 * the builder level.
 */
export interface ReactiveEffectsPassthrough {
  attrs: LoopChildReactiveAttr[]
  texts: LoopChildReactiveText[]
  conditionals: LoopChildConditional[] | undefined
  loopParam: string
  loopParamBindings: TopLevelLoop['paramBindings']
}
