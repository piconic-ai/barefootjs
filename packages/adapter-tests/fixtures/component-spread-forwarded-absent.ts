import { createFixture } from '../src/types'

/**
 * A prop the root's caller left out, forwarded through two `{...props}`
 * spreads: the first spread carries no `label` key, so the second keeps the
 * explicit `"first"` before it. A backend that forwards the omitted prop as
 * a nil key would make the second spread override `"first"` with it.
 */
export const fixture = createFixture({
  id: 'component-spread-forwarded-absent',
  description: 'An omitted prop forwarded through two props spreads keeps the earlier explicit prop',
  source: `
import { Mid } from './mid'
export function SpreadForwardedAbsent(props: { label?: string | null; tone?: string }) {
  return <div><Mid {...props} /></div>
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { label?: string | null; tone?: string }) {
  return <b data-tone={props.tone}>{props.label ?? 'fallback'}</b>
}
`,
    './mid.tsx': `
import { Tag } from './tag'
export function Mid(props: { label?: string | null; tone?: string }) {
  return <p><Tag label="first" {...props} /></p>
}
`,
  },
  props: { tone: 'warm' },
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s0"><b bf-s="test_s0_s0" bf="s1" data-tone="warm"><!--bf:s0-->first<!--/--></b></p></div>
  `,
})
