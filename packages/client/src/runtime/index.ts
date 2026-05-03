// Re-export all user-facing @barefootjs/client APIs so compiler-generated
// code can use a single import source.
//
// The reactive runtime has module-local state (`Listener`, `Owner`, the
// pending-effect queue) and MUST NOT be duplicated across bundles —
// otherwise a signal created via one copy is invisible to an effect
// registered via the other. Both `@barefootjs/client` (main) and this
// `/runtime` entry pull the reactive primitives from the shared
// `@barefootjs/client/reactive` subpath so downstream bundlers see a
// single physical module.
export {
  createSignal,
  createEffect,
  createDisposableEffect,
  createMemo,
  createRoot,
  onCleanup,
  onMount,
  untrack,
  batch,
  type Reactive,
  type Signal,
  type Memo,
  type CleanupFn,
  type EffectFn,
} from '@barefootjs/client/reactive'

export { splitProps } from '../split-props'
export { __slot, type SlotMarker } from '../slot'
export { forwardProps } from '../forward-props'
export { unwrap } from '../unwrap'

// Context API (real DOM-bound implementations; `createContext` is the
// same pure function re-exported from `../context`).
export {
  createContext,
  useContext,
  provideContext,
  setCurrentScope,
  type Context,
} from './context'

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
export {
  createComponent,
  renderChild,
  getPropsUpdateFn,
  getComponentProps,
  parseHTML,
} from './component'

// Spread props helpers
export { applyRestAttrs } from './apply-rest-attrs'
export { spreadAttrs } from './spread-attrs'
export { styleToCss } from './style'

// Runtime helpers
export { findScope, find, $, $c, $t, qsa } from './query'
export { hydrate, rehydrateAll, flushHydration } from './hydrate'
export { registerComponent, getComponentInit, initChild, upsertChild } from './registry'
export { insert, type BranchConfig } from './insert'
export { updateClientMarker } from './client-marker'

// Hydration state
export { hydratedScopes } from './hydration-state'

// CSR entry point
export { render } from './render'

// Streaming (Out-of-Order SSR)
export { __bf_swap, setupStreaming } from './streaming'

// Core types
export type { InitFn, ComponentDef } from './types'
