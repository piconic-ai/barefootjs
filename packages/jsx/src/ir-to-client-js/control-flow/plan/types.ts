/**
 * Barrel re-export for Plan types.
 *
 * The actual type definitions live in dedicated files alongside the
 * builders / stringifiers that produce / consume them:
 *
 *   common.ts            — `ScopeRef`
 *   reactive-effects.ts  — `ReactiveEffectsPlan`, `ReactiveAttrSlot`,
 *                          `ReactiveAttrEffect`, `ReactiveTextEffect`,
 *                          `NestedConditionalPlan`
 *   insert.ts            — `InsertPlan` family (arms, bindings)
 *   loop.ts              — `LoopPlan` (discriminated union), variant
 *                          aliases (`PlainLoopPlan`, `ComponentLoopPlan`,
 *                          `CompositeLoopPlan`, `StaticLoopPlan`),
 *                          `NestedComponentInit`
 *   event-delegation.ts  — `EventDelegationPlan`, `ItemLookup` family
 *
 * This file lets callers continue to write
 * `import type { ... } from '../plan/types.ts'` without caring which file
 * a particular Plan type lives in.
 */

export type { ScopeRef } from './common.ts'
export type {
  ReactiveEffectsPlan,
  ReactiveAttrSlot,
  ReactiveAttrEffect,
  ReactiveTextEffect,
  NestedConditionalPlan,
} from './reactive-effects.ts'
export type {
  InsertPlan,
  InsertArm,
  ArmBody,
  ArmEventBind,
  ArmRefBind,
  ArmChildComponentInit,
  ArmTextEffect,
} from './insert.ts'
export type {
  LoopPlan,
  PlainLoopPlan,
  ComponentLoopPlan,
  CompositeLoopPlan,
  StaticLoopPlan,
  StaticLoopMaterializePlan,
  NestedComponentInit,
  LoopChildRefBinding,
} from './loop.ts'
export type {
  EventDelegationPlan,
  ItemLookup,
  KeyedItemLookup,
  DynamicIndexItemLookup,
  StaticIndexItemLookup,
} from './event-delegation.ts'

// Re-export legacy types referenced from Plan-level code paths.
export type {
  ConditionalElement,
  LoopChildConditional,
  BranchLoop,
  LoopChildEvent,
} from '../../types.ts'
