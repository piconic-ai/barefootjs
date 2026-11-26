import { createFixture } from '../src/types'

/**
 * A closed rest whose props type declares one attribute in two letter cases
 * (`tabIndex`, `tabindex`), then an explicit `tabindex="1"`. JSX keeps the
 * last write, so the element renders one `tabindex`, the literal's, whichever
 * spelling the caller passes.
 *
 * `expectedHtml` is hand-authored (`SKIP_AUTO_UPDATE`): the reference
 * replaces only the rest key spelled like the literal and renders the other
 * spelling first, so a browser keeps the rest's value (limitation
 * `closed-rest-both-cases-later-write`).
 */
export const fixture = createFixture({
  id: 'spread-closed-rest-both-cases-later-write',
  description: 'A literal after a closed rest declaring tabIndex and tabindex renders once, the literal',
  source: `
import { BothThenLiteral } from './both'
export function SpreadClosedRestBothCasesLaterWrite() {
  return <div><BothThenLiteral tabIndex={2} /></div>
}
`,
  components: {
    './both.tsx': `
export function BothThenLiteral({ ...rest }: { tabIndex?: number; tabindex?: number }) {
  return <p {...rest} tabindex="1">d</p>
}
`,
  },
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s0" tabindex="1">d</p></div>
  `,
})
