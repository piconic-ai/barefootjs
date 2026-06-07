/**
 * @barefootjs/test — IR-based component testing without a browser.
 */

export { renderToTest } from './render.ts'
export type { TestResult } from './render.ts'

export { TestNode } from './test-node.ts'
export type { TestNodeData, TestNodeQuery, EventHandler } from './test-node.ts'

export { toStructure } from './structure.ts'

export { resolveConstants } from './resolve-constants.ts'
