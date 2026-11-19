import { createFixture } from '../src/types'

/**
 * #3916: spreads chain (`B` spreads `Q`, which spreads `R`), a later entry
 * overrides an earlier one on either side of a spread, a key no entry lists
 * reads as missing, and a component-local const spreading a module const reads
 * the same way.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-chain-override',
  description: 'chained and overriding object spreads of literal consts, module and component scope, render the last entry of each key (#3916)',
  source: `
const R = { k: 'v', z: 1 }
const Q = { ...R, z: 2 }
const B = { k: 'a', ...Q, w: 'w' }
export function ModuleConstObjectSpreadChainOverride() {
  const L = { ...B, w: 'l' }
  return <p>{B.k}-{B.z}-{B.w}-{L.k}-{L.w}-{B.nope ?? 'none'}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v-2-w-v-l-none</p>
  `,
})
