import { createFixture } from '../src/types'

/**
 * A prop a parent passes with an `undefined` value (a prop its own caller
 * left out), then spread after an explicit prop of the same key: the
 * parent passed the key, so the spread carries it and its `undefined`
 * overrides `"first"`.
 */
export const fixture = createFixture({
  id: 'component-spread-explicit-undefined-prop',
  description: 'A props spread carrying a key its caller passed as undefined overrides an earlier explicit prop',
  source: `
import { Mid } from './mid'
export function SpreadExplicitUndefinedProp(props: { other?: string | null }) {
  return <div><Mid label={props.other} /></div>
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
  props: {},
  expectedHtml: `
    <div bf-s="test"><p bf-s="test_s0"><b bf-s="test_s0_s0" bf="s1"><!--bf:s0-->fallback<!--/--></b></p></div>
  `,
})
