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
  setProfilerSink,
  beginTurn,
  endTurn,
  __bfReportOutput,
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
} from './profiler-events.ts'

export { splitProps } from './split-props.ts'

export { __slot, type SlotMarker } from './slot.ts'

export { forwardProps } from './forward-props.ts'

export { unwrap } from './unwrap.ts'

export { createContext, type Context } from './context.ts'

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
} from './shims.ts'
