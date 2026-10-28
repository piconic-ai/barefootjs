import { createFixture } from '../src/types'

/**
 * A child prop written as the literal `undefined`, then spread after an
 * explicit prop of the same key: the parent passed the key, so the spread
 * carries it and its `undefined` overrides `"first"`.
 */
export const fixture = createFixture({
  id: 'component-prop-undefined-literal-spread',
  description: 'A child prop written as the literal undefined still passes its key to a props spread',
  source: `
import { Mid } from './mid'
export function PropUndefinedLiteralSpread(props: { other?: string }) {
  return <div data-other={props.other}><Mid label={undefined} /></div>
}
`,
  components: {
    './tag.tsx': `
export function Tag(props: { label?: string }) {
  return <b>{props.label ?? 'fallback'}</b>
}
`,
    './mid.tsx': `
import { Tag } from './tag'
export function Mid(props: { label?: string }) {
  return <p><Tag label="first" {...props} /></p>
}
`,
  },
  props: {},
  expectedHtml: `
    <div bf-s="test" bf="s1"><p bf-s="test_s0"><b bf-s="test_s0_s0" bf="s1"><!--bf:s0-->fallback<!--/--></b></p></div>
  `,
})
