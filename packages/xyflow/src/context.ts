import { createContext } from '@barefootjs/client'
import type { FlowStore } from './types.ts'

/**
 * Context for sharing the flow store across child components.
 * Provided by initFlow, consumed by child init functions (e.g., handles, custom nodes).
 */
export const FlowContext = createContext<FlowStore>()
