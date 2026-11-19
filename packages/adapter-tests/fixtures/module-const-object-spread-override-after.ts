import { createFixture } from '../src/types'

/**
 * #3944: a key an entry lists after every spread the literal cannot expand is
 * that entry's value whatever the spread brings (the last entry of a key
 * wins), so the read has a compile-time value and renders on every adapter.
 * A key listed only before the spread, or not at all, may come from the
 * spread and is refused (`module-const-object-spread-unresolved-*`).
 */
export const fixture = createFixture({
  id: 'module-const-object-spread-override-after',
  description: 'a key listed after a spread of a call is that entry\'s value, rendered without computing the spread (#3944)',
  source: `
const B = { k: 'first', ...JSON.parse('{"k":"spread","z":"spread"}'), z: 'v' }
const L = { ...JSON.parse('{"k":"spread","z":"spread"}'), n: 1 }
export function ModuleConstObjectSpreadOverrideAfter() {
  return <p>{B.z}-{L.n}</p>
}
`,
  expectedHtml: `
    <p bf-s="test">v-1</p>
  `,
})
