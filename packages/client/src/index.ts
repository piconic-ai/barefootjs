// Reactive primitives live at the shared `@barefootjs/client/reactive`
// subpath so main and the `/runtime` entry point reference a single
// physical module — see src/runtime/index.ts for the rationale.
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

export { splitProps } from './split-props'

export { __slot, type SlotMarker } from './slot'

export { forwardProps } from './forward-props'

export { unwrap } from './unwrap'

export { createContext, type Context } from './context'

export {
  useContext,
  provideContext,
  createPortal,
  isSSRPortal,
  findSiblingSlot,
  cleanupPortalPlaceholder,
  type Portal,
  type PortalChildren,
  type PortalOptions,
  type Renderable,
} from './shims'
