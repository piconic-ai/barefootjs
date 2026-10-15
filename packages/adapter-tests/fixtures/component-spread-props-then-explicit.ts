import { createFixture } from '../src/types'

/**
 * `{...props}` onto a child component followed by an explicit prop (#3479):
 * the explicit `tone` comes last, so it wins over the spread's.
 */
export const fixture = createFixture({
  id: 'component-spread-props-then-explicit',
  description: 'A props spread onto a child component, then an explicit prop that overrides it',
  source: `
import { Tag } from './tag'
export function SpreadThenExplicit(props: { tone?: string; size?: string; label?: string }) {
  return <p><Tag {...props} tone="explicit" /></p>
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { tone?: string; size?: string; label?: string }) {
  return <b data-tone={props.tone} data-size={props.size}>{props.label}</b>
}
`,
  },
  props: { tone: 'warm', label: 'hi' },
  expectedHtml: `
    <p bf-s="test"><b bf-s="test_s0" bf="s1" data-tone="explicit"><!--bf:s0-->hi<!--/--></b></p>
  `,
})
