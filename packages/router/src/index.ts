export { startRouter, navigate } from './router.ts'
export type { RouterOptions, NavigateOptions, Router } from './router.ts'

// Re-exported for server-side helpers that produce outlet-aware responses.
export { BF_OUTLET, BF_NAVIGATE_HEADER } from '@barefootjs/shared'
