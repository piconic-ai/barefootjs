import { createFixture } from '../src/types'

/**
 * A destructure rest spread onto a child component (#3479): `<Tag {...rest} />`
 * forwards every prop but `title`, and an omitted one (`size`) stays absent.
 */
export const fixture = createFixture({
  id: 'component-spread-rest',
  description: 'A rest spread onto a child component forwards the remaining props',
  source: `
import { Tag } from './tag'
export function SpreadRest({ title, ...rest }: { title: string; tone?: string; size?: string; label?: string }) {
  return <p title={title}><Tag {...rest} /></p>
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { tone?: string; size?: string; label?: string }) {
  return <b data-tone={props.tone} data-size={props.size}>{props.label}</b>
}
`,
  },
  props: { title: 'T', tone: 'warm', label: 'hi' },
  expectedHtml: `
    <p bf-s="test" bf="s1" title="T"><b bf-s="test_s0" bf="s1" data-tone="warm"><!--bf:s0-->hi<!--/--></b></p>
  `,
})
