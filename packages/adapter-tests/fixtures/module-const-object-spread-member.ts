import { createFixture } from '../src/types'

/**
 * #3944: a spread of a literal object a literal const holds (`...R.sub`,
 * `...R['sub']`) contributes that object's keys, as the spread of a literal
 * const itself does (#3916); a nested spread inside the member expands too.
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-member',
  description: 'a module const spreading a literal member of a literal const (`...R.sub`) renders the keys of that member (#3944)',
  source: `
const Base = { z: 'z' }
const R = { sub: { ...Base, k: 'v' }, other: { k: 'o' } }
const B = { ...R.sub, n: 1 }
const C = { ...R['other'], ...R.sub }
export function ModuleConstObjectSpreadMember() {
  return <p>{B.k}-{B.z}-{B.n}-{C.k}-{C.z}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v-z-1-v-z</p>
  `,
})
