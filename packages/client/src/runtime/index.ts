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
  createSelector,
  createRoot,
  onCleanup,
  onMount,
  untrack,
  batch,
  setProfilerSink,
  beginTurn,
  endTurn,
  __bfReportOutput,
  // Request-scoped env signal (router v0.5). The compiler emits island client JS
  // that imports `createSearchParams` from `@barefootjs/client/runtime`;
  // re-exporting it from the shared reactive module (same as the signal
  // primitives above) means this entry and the main `@barefootjs/client` entry
  // resolve to ONE signal instance — no second copy to disconnect from router
  // pushes.
  createSearchParams,
  type SearchParamsInit,
  __bfSetServerEnvReader,
  type Reactive,
  type Signal,
  type Memo,
  type CleanupFn,
  type EffectFn,
  type ProfilerEventSink,
  type SubscriberKind,
} from '@barefootjs/client/reactive'

export {
  createRecordingSink,
  type ProfilerEvent,
  type ProfilerEventType,
  type RecordingSink,
} from '../profiler-events.ts'

export { splitProps } from '../split-props.ts'
export { __slot, type SlotMarker } from '../slot.ts'
export { forwardProps } from '../forward-props.ts'
export { unwrap } from '../unwrap.ts'
export { queryHref, type QueryParams, type QueryParamValue } from '../query-href.ts'

// Context API (real DOM-bound implementations; `createContext` is the
// same pure function re-exported from `../context`).
export {
  createContext,
  useContext,
  provideContext,
  setCurrentScope,
  type Context,
} from './context.ts'

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
} from './portal.ts'

// List reconciliation
export { reconcileList, type RenderItemFn } from './list.ts'
export { reconcileElements, getLoopChildren, getLoopNodes } from './reconcile-elements.ts'
export { qsaItem, upsertChildItem } from './qsa-item.ts'
export { mapArray, mapArrayAnchored } from './map-array.ts'

// Template registry
export { registerTemplate, getTemplate, hasTemplate, type TemplateFn } from './template.ts'

// Component creation
export {
  createComponent,
  renderChild,
  getPropsUpdateFn,
  getComponentProps,
  parseHTML,
  escapeAttr,
  escapeText,
} from './component.ts'

// Spread props helpers
export { applyRestAttrs } from './apply-rest-attrs.ts'
export { spreadAttrs } from './spread-attrs.ts'
export { styleToCss } from './style.ts'

// Runtime helpers
export { findScope, find, $, $c, $t, qsa, qsaChildScope, qsaChildScopes, cssEscape, tAfter } from './query.ts'
export { hydrate, rehydrateAll, rehydrateScope, disposeScope, flushHydration, getRegisteredDef } from './hydrate.ts'
export { registerComponent, getComponentInit, initChild, upsertChild } from './registry.ts'
export { insert, type BranchConfig, type BranchTemplateResult } from './insert.ts'
export { __bfSlot } from './branch-slot.ts'
export { __bfText } from './dynamic-text.ts'
export { updateClientMarker } from './client-marker.ts'

// Hydration state
export { hydratedScopes } from './hydration-state.ts'

// CSR entry point
export { render } from './render.ts'

// Streaming (Out-of-Order SSR)
export { __bf_swap, setupStreaming } from './streaming.ts'

// Core types
export type { InitFn, ComponentDef } from './types.ts'
