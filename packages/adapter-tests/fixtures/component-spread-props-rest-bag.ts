import { createFixture } from '../src/types'

/**
 * A props spread onto a child with a rest bag: the keys the child doesn't
 * declare land in its rest, and an omitted one (`own`) stays absent from it.
 */
export const fixture = createFixture({
  id: 'component-spread-props-rest-bag',
  description: "A props spread onto a child whose rest bag takes the keys it doesn't declare",
  source: `
import { Tag } from './tag'
export function SpreadRestBag(props: { label?: string; title?: string; own?: string }) {
  return <p><Tag {...props} /></p>
}
`,
  components: {
    './tag.tsx': `
export function Tag({ label, ...rest }: { label?: string; [key: string]: any }) {
  return <b {...rest}>{label}</b>
}
`,
  },
  props: { label: 'hi', title: 'T' },
  expectedHtml: `
    <p bf-s="test"><b bf-s="test_s0" bf="s1" title="T"><!--bf:s0-->hi<!--/--></b></p>
  `,
})
