export { startRouter, navigate } from './router.ts'
export type { RouterOptions, NavigateOptions, Router } from './types.ts'

// Re-exported so server-side helpers can reference the swappable-region marker.
export { BF_REGION } from '@barefootjs/shared'
