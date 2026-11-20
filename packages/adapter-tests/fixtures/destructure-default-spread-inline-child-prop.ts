import { createFixture } from '../src/types'

/**
 * A child prop spreading a defaulted body-destructured prop in place (#3954):
 * `<Kid n={[...b, 'z'].length} />`. The DSL adapters refused it already; Go's
 * constructor left the field it cannot compute out, so the child rendered
 * empty where Hono renders `2`. Every template adapter refuses it (BF101). A
 * component renders on the server whatever directive its prop carries, so
 * there is no `/* @client *\/` escape.
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-inline-child-prop',
  description: 'A child prop spreading a defaulted destructured array prop in place renders the length (#3954)',
  source: `
function Kid(props: { n: number }) {
  return <i>{props.n}</i>
}

export function DestructureDefaultSpreadInlineChildProp(props: { b?: string[] }) {
  const { b = ['y'] } = props
  return <div><Kid n={[...b, 'z'].length} /></div>
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test"><i bf-s="test_s0" bf="s1"><!--bf:s0-->2<!--/--></i></div>
  `,
})
