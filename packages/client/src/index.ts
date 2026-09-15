// Reactive primitives live at the shared `@barefootjs/client/reactive`
// subpath so main and the `/runtime` entry point reference a single
// physical module — see src/runtime/index.ts for the rationale.
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
  // Request-scoped reactive environment signals (spec/router.md "The wedge").
  // `createSearchParams` lives in the shared reactive module too, so this entry
  // and the `/runtime` entry resolve to ONE signal instance. `createEnvSignal`
  // stays internal; `__bfSetServerEnvReader` is the keyed adapter/host hook for
  // SSR.
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
} from './profiler-events.ts'

export { splitProps } from './split-props.ts'

export { __slot, type SlotMarker } from './slot.ts'

// `forwardProps` and `unwrap` are compiler ABI: emitted into a compiled
// bundle for a `{...rest}` spread on a child component, or for a prop that
// may arrive as a getter, never written by an author (#3008). They stay on
// THIS entry rather than moving to `@barefootjs/client/runtime`, because
// unlike the portal/context shims below they are pure (no DOM), so the SSR
// path needs them too: `@barefootjs/hono`'s SSR shim
// (`packages/adapter-hono/src/client-shim.ts`) re-exports both straight
// from here for the compiler's SSR-rewritten imports. Not in the API
// reference, since no author writes them directly — see
// docs/core/advanced/api-reference.md.
export { forwardProps } from './forward-props.ts'
export { unwrap } from './unwrap.ts'

export { queryHref, type QueryParams, type QueryParamValue } from './query-href.ts'
export { formatDate } from './format-date.ts'

export { createContext, type Context } from './context.ts'

// `provideContext` is compiler ABI too, but — unlike `forwardProps`/
// `unwrap` above — DOM-only, so it does NOT need a root re-export for SSR:
// an author writes `<Ctx.Provider value={...}>`, the compiler lowers that
// to a `provideContext()` call in CLIENT JS only (SSR gets its own
// `provideContextSSR`, e.g. `@barefootjs/hono`'s bridge to Hono's context
// stack), and nobody imports the function itself (91 `.Provider` uses
// across `ui/`, `site/` and `integrations/`; zero direct imports,
// confirmed at #3008). Available from `@barefootjs/client/runtime` for the
// CSR emission path.
export {
  useContext,
  createPortal,
  isSSRPortal,
  findSiblingSlot,
  cleanupPortalPlaceholder,
  trackPosition,
  type Portal,
  type PortalChildren,
  type PortalOptions,
  type Renderable,
} from './shims.ts'

// Compiler built-ins (`<Async>` / `<Region>`) — recognised by their import
// here and compiled away. Importing them is what scopes the recognition; the
// compiler elides the import on emit. See ./builtins.ts and #1915.
export {
  Async,
  Region,
  type AsyncProps,
  type RegionProps,
} from './builtins.ts'
