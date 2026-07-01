export { startRouter, navigate } from './router.ts'
export type { RouterOptions, NavigateOptions, Router } from './types.ts'

// Pure query-URL builder (#2042, relocated from `@barefootjs/client` in #2057).
// A routing concern; the compiler's SSR lowering is wired by the side-effect
// subpath `@barefootjs/router/register`.
export { queryHref, type QueryParams, type QueryParamValue } from './query-href.ts'

// Re-exported so server-side helpers can reference the swappable-region marker.
export { BF_REGION } from '@barefootjs/shared'
