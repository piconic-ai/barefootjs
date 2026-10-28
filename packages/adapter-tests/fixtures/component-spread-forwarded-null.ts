import { createFixture } from '../src/types'

/**
 * An explicit `null` forwarded through two `{...props}` spreads: the first
 * spread carries the key, so the second overrides the explicit `"first"`
 * before it and the child's `??` falls back.
 */
export const fixture = createFixture({
  id: 'component-spread-forwarded-null',
  description: 'An explicit null forwarded through two props spreads overrides the earlier explicit prop',
  source: `
import { Mid } from './mid'
export function SpreadForwardedNull(props: { label?: string | null }) {
  return <div><Mid {...props} /></div>
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { label?: string | null }) {
  return <b>{props.label ?? 'fallback'}</b>
}
`,
    './mid.tsx': `
import { Tag } from './tag'
export function Mid(props: { label?: string | null }) {
  return <p><Tag label="first" {...props} /></p>
}
`,
  },
  props: { label: null },
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s0"><b bf-s="test_s0_s0" bf="s1"><!--bf:s0-->fallback<!--/--></b></p></div>
  `,
})
