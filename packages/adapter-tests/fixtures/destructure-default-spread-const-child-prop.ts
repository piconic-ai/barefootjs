import { createFixture } from '../src/types'

/**
 * A child prop reading a const spreading a defaulted body-destructured prop
 * (#3954): `<Kid n={local.length} />`. Go's constructor left the field it
 * cannot compute out, so the child rendered `0` where Hono renders `2`; every
 * template adapter refuses it (BF101). A component renders on the server
 * whatever directive its prop carries, so there is no `/* @client *\/` escape.
 */
export const fixture = createFixture({
  id: 'destructure-default-spread-const-child-prop',
  description: 'A child prop reading a const spreading a defaulted destructured array prop renders the length (#3954)',
  source: `
function Kid(props: { n: number }) {
  return <i>{props.n}</i>
}

export function DestructureDefaultSpreadConstChildProp(props: { b?: string[] }) {
  const { b = ['y'] } = props
  const local = [...b, 'z']
  return <div><Kid n={local.length} /></div>
}
`,
  props: {},
  expectedHtml: `
    <div bf-s="test"><i bf-s="test_s0" bf="s1"><!--bf:s0-->2<!--/--></i></div>
  `,
})
