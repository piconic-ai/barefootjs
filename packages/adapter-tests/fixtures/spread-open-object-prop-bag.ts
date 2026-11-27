import { createFixture } from '../src/types'

/**
 * A destructured prop typed as an object type with an index signature
 * (`{ title: string; [key: string]: string }`), spread onto an element. The
 * element renders every entry the caller passes, the undeclared `data-k`
 * included. Sibling: `spread-record-prop-bag` (a record or a closed object
 * type).
 */
export const fixture = createFixture({
  id: 'spread-open-object-prop-bag',
  description: 'A destructured object prop with an index signature spread onto an element renders every entry',
  source: `
type P = { bag: { title: string; [key: string]: string } }
export function SpreadOpenObjectPropBag({ bag }: P) {
  return <p {...bag}>a</p>
}
`,
  props: { bag: { title: 't', 'data-k': 'v' } },
  expectedHtml: `
    <p bf-s="test" bf="s0" data-k="v" title="t">a</p>
  `,
})
