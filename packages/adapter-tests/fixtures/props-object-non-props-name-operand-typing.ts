import { createFixture } from '../src/types'

/**
 * Sibling of `props-object-non-props-name`: the declared types of a props
 * object named `p` decide how an operator renders. `p.label + p.n` and
 * `p.n + p.label` concatenate a string prop with a number prop, and
 * `p.on || 'none'` yields the boolean prop itself as an attribute value.
 */
export const fixture = createFixture({
  id: 'props-object-non-props-name-operand-typing',
  description: 'A props object named p types its string, number and boolean props in +, || and attribute positions',
  source: `
export function PropsObjectNonPropsNameOperandTyping(p: { label: string; on: boolean; n: number }) {
  return (
    <div>
      <s>{p.label + p.n}</s>
      <s>{p.n + p.label}</s>
      <s data-on={p.on || 'none'}>x</s>
    </div>
  )
}
`,
  props: { label: 'L', on: true, n: 7 },
  expectedHtml: `
    <div bf-s="test">
      <s bf="s1"><!--bf:s0-->L7<!--/--></s>
      <s bf="s3"><!--bf:s2-->7L<!--/--></s>
      <s bf="s4" data-on="true">x</s>
    </div>
  `,
})
