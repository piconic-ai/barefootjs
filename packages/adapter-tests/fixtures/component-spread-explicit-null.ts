import { createFixture } from '../src/types'

/**
 * An explicit `null` reaching a child through a props spread after an
 * explicit prop of the same key: the spread carries the key, so the `null`
 * overrides `"first"` and the child's `??` falls back.
 */
export const fixture = createFixture({
  id: 'component-spread-explicit-null',
  description: 'A props spread whose explicit null overrides an earlier explicit prop',
  source: `
import { Tag } from './tag'
export function SpreadExplicitNull(props: { label?: string | null }) {
  return <p><Tag label="first" {...props} /></p>
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { label?: string | null }) {
  return <b>{props.label ?? 'fallback'}</b>
}
`,
  },
  props: { label: null },
  expectedHtml: `
    <p bf-s="test"><b bf-s="test_s0" bf="s1"><!--bf:s0-->fallback<!--/--></b></p>
  `,
})
