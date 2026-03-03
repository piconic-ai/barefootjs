export {
  BF_SCOPE,
  BF_SLOT,
  BF_PROPS,
  BF_COND,
  BF_PORTAL_OWNER,
  BF_PORTAL_ID,
  BF_PORTAL_PLACEHOLDER,
  BF_ITEM,
  BF_CHILD_PREFIX,
  BF_SCOPE_COMMENT_PREFIX,
} from './attrs'

export {
  createSignal,
  createEffect,
  createMemo,
  onCleanup,
  onMount,
  untrack,
  type Reactive,
  type Signal,
  type Memo,
  type CleanupFn,
  type EffectFn,
} from './reactive'

export {
  createPortal,
  isSSRPortal,
  cleanupPortalPlaceholder,
  type Portal,
  type PortalOptions,
  type Renderable,
  type PortalChildren,
} from './portal'

export { reconcileList, type RenderItemFn } from './list'
export { reconcileElements } from './reconcile-elements'
export { reconcileTemplates } from './reconcile-templates'

export { createContext, useContext, provideContext, type Context } from './context'

// Template registry for client-side component creation
export { registerTemplate, getTemplate, hasTemplate, type TemplateFn } from './template'

// Component creation for dynamic rendering
export { createComponent, renderChild, getPropsUpdateFn, getComponentProps } from './component'

// Props utilities
export { splitProps } from './split-props'

// Spread props helpers (internal, for compiler-generated code)
export { forwardProps } from './forward-props'
export { applyRestAttrs } from './apply-rest-attrs'
export { spreadAttrs } from './spread-attrs'

// Runtime helpers (internal, for compiler-generated code)
export { findScope, find, $, $c, $t } from './query'
export { hydrate } from './hydrate'
export { registerComponent, getComponentInit, initChild } from './registry'
export { insert, type BranchConfig } from './insert'
export { unwrap } from './unwrap'
export { updateClientMarker } from './client-marker'

// Hydration state
export { hydratedScopes } from './hydration-state'

// CSR entry point
export { render } from './render'

// Core types
export type { InitFn, ComponentDef } from './types'
