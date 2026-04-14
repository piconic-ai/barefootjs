// Re-export all @barefootjs/client APIs so compiler-generated code
// can use a single import source.
export {
  createSignal,
  createEffect,
  createDisposableEffect,
  createMemo,
  createRoot,
  onCleanup,
  onMount,
  untrack,
  type Reactive,
  type Signal,
  type Memo,
  type CleanupFn,
  type EffectFn,
  splitProps,
  __slot,
  type SlotMarker,
  forwardProps,
  unwrap,
} from '@barefootjs/client'


// Context API
export { createContext, useContext, provideContext, setCurrentScope, type Context } from './context'

// Portal system
export {
  createPortal,
  isSSRPortal,
  findSiblingSlot,
  cleanupPortalPlaceholder,
  type Portal,
  type PortalOptions,
  type Renderable,
  type PortalChildren,
} from './portal'

// List reconciliation
export { reconcileList, type RenderItemFn } from './list'
export { reconcileElements, getLoopChildren } from './reconcile-elements'
export { mapArray } from './map-array'

// Template registry
export { registerTemplate, getTemplate, hasTemplate, type TemplateFn } from './template'

// Component creation
export { createComponent, renderChild, getPropsUpdateFn, getComponentProps, parseHTML } from './component'

// Spread props helpers
export { applyRestAttrs } from './apply-rest-attrs'
export { spreadAttrs } from './spread-attrs'
export { styleToCss } from './style'

// Runtime helpers
export { findScope, find, $, $c, $t, qsa } from './query'
export { hydrate } from './hydrate'
export { registerComponent, getComponentInit, initChild } from './registry'
export { insert, type BranchConfig } from './insert'
export { updateClientMarker } from './client-marker'

// Hydration state
export { hydratedScopes } from './hydration-state'

// CSR entry point
export { render } from './render'

// Core types
export type { InitFn, ComponentDef } from './types'
