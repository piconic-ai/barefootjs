import { createFixture } from '../src/types'

/**
 * A `style` object property whose value is `null` or `undefined` is
 * dropped, leaving `style=""` (`spec/js-undefined-value.md` §1, "Where
 * they do not diverge"); a present value renders. Sources: a child
 * receiving an explicit `null` prop and an omitted prop forwarded, a
 * literal `null`, a literal `undefined`, an omitted prop at the call, and a
 * present value.
 */
export const fixture = createFixture({
  id: 'style-object-nil-property',
  description: 'A null or undefined style object property is dropped',
  source: `
import { Box } from './box'
export function StyleObjectNilProperty(props: { n?: string | null; u?: string | null }) {
  return (
    <div>
      <Box c={props.n} />
      <Box c={props.u} />
      <Box c={null} />
      <Box c={undefined} />
      <Box />
      <Box c="red" />
    </div>
  )
}
`,
  components: {
    './box.tsx': `
export function Box(props: { c?: string | null }) {
  return <i style={{ color: props.c }}>x</i>
}
`,
  },
  props: { n: null },
  expectedHtml: `
    <div bf-s="test">
      <i bf-s="test_s0" bf="s0" style="">x</i>
      <i bf-s="test_s1" bf="s0" style="">x</i>
      <i bf-s="test_s2" bf="s0" style="">x</i>
      <i bf-s="test_s3" bf="s0" style="">x</i>
      <i bf-s="test_s4" bf="s0" style="">x</i>
      <i bf-s="test_s5" bf="s0" style="color:red">x</i>
    </div>
  `,
})
