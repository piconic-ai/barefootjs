import { createFixture } from '../src/types'

/**
 * A child prop passed `typeof` of a prop in place (#3981):
 * `<Kid v={typeof props.x} />`. The DSL adapters refused it already; Go's
 * constructor left the field it cannot compute out, so the child rendered
 * `undefined` where Hono renders `string`. Every template adapter refuses it
 * (BF101). A component renders on the server whatever directive its prop
 * carries, so there is no `/* @client *\/` escape.
 */
export const fixture = createFixture({
  id: 'child-prop-typeof',
  description: 'A child prop passed typeof of a prop in place renders the type name (#3981)',
  source: `
function Kid(props: { v: unknown }) {
  return <i>{String(props.v)}</i>
}

export function ChildPropTypeof(props: { x: string }) {
  return <div><Kid v={typeof props.x} /></div>
}
`,
  props: { x: 'q' },
  expectedHtml: `
    <div bf-s="test"><i bf-s="test_s0" bf="s1"><!--bf:s0-->string<!--/--></i></div>
  `,
})
