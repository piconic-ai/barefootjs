import { createContext } from '@barefootjs/dom'
import type { FlowStore } from './types'

/**
 * Context for sharing the flow store across child components.
 * Provided by initFlow, consumed by child init functions (e.g., handles, custom nodes).
 */
export const FlowContext = createContext<FlowStore>()
