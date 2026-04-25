/**
 * Barrel re-export for Plan types.
 *
 * The actual type definitions live in dedicated files alongside the
 * builders / stringifiers that produce / consume them:
 *
 *   common.ts            — `ScopeRef`, `ReactiveEffectsPassthrough`
 *   insert.ts            — `InsertPlan` family (arms, bindings)
 *   loop.ts              — `PlainLoopPlan`, `ComponentLoopPlan`,
 *                          `CompositeLoopPlan`, `StaticLoopPlan`,
 *                          `NestedComponentInit`
 *   event-delegation.ts  — `EventDelegationPlan`, `ItemLookup` family
 *
 * This file lets callers continue to write
 * `import type { ... } from '../plan/types'` without caring which file
 * a particular Plan type lives in.
 */

export type { ScopeRef, ReactiveEffectsPassthrough } from './common'
export type {
  InsertPlan,
  InsertArm,
  ArmBody,
  ArmEventBind,
  ArmRefBind,
  ArmChildComponentInit,
  ArmTextEffect,
} from './insert'
export type {
  PlainLoopPlan,
  ComponentLoopPlan,
  CompositeLoopPlan,
  StaticLoopPlan,
  NestedComponentInit,
} from './loop'
export type {
  EventDelegationPlan,
  ItemLookup,
  KeyedItemLookup,
  DynamicIndexItemLookup,
  StaticIndexItemLookup,
} from './event-delegation'

// Re-export legacy types referenced from Plan-level code paths.
export type {
  ConditionalElement,
  LoopChildConditional,
  BranchLoop,
  LoopChildEvent,
} from '../../types'
