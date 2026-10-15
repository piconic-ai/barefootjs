import { createFixture } from '../src/types'

/**
 * An explicit prop followed by `{...props}` onto a child component (#3479):
 * the spread comes last, so its `tone` wins; `size`, absent from the
 * spread, keeps the explicit value.
 */
export const fixture = createFixture({
  id: 'component-spread-explicit-then-props',
  description: 'An explicit prop, then a props spread onto a child component that overrides it',
  source: `
import { Tag } from './tag'
export function ExplicitThenSpread(props: { tone?: string; size?: string; label?: string }) {
  return <p><Tag tone="first" size="s" {...props} /></p>
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
    <p bf-s="test"><b bf-s="test_s0" bf="s1" data-size="s" data-tone="warm"><!--bf:s0-->hi<!--/--></b></p>
  `,
})
