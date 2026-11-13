import { createFixture } from '../src/types'

/**
 * `component-spread-forwarded-absent` with the sibling files listed the
 * other way round: `mid.tsx`, which forwards `{...props}` to `<Tag>`, comes
 * before `tag.tsx`. A harness that compiles the siblings in the order
 * listed must not let that order decide what `mid.tsx` knows of `<Tag>`;
 * the Go adapter used to refuse this order with BF101 and compile the
 * other one.
 */
export const fixture = createFixture({
  id: 'component-spread-forwarded-reversed-order',
  description: 'A props spread forwarded to a sibling that is listed after the forwarding sibling compiles as in the other order',
  source: `
import { Mid } from './mid'
export function SpreadForwardedReversed(props: { label?: string | null; tone?: string }) {
  return <div><Mid {...props} /></div>
}
`,
  components: {
    './mid.tsx': `
import { Tag } from './tag'
export function Mid(props: { label?: string | null; tone?: string }) {
  return <p><Tag label="first" {...props} /></p>
}
`,
    './tag.tsx': `
export function Tag(props: { label?: string | null; tone?: string }) {
  return <b data-tone={props.tone}>{props.label ?? 'fallback'}</b>
}
`,
  },
  props: { tone: 'warm' },
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s0"><b bf-s="test_s0_s0" bf="s1" data-tone="warm"><!--bf:s0-->first<!--/--></b></p></div>
  `,
})
