import { createFixture } from '../src/types'

/**
 * Sibling of `conditional-then-colon-text` / `conditional-then-percent-text`:
 * a ternary whose BRANCH text starts with `%` or `:` (each branch lands on
 * its own template line inside a line-statement `if`), and an element child
 * whose text starts with a sigil after a conditional sibling. Every one
 * renders verbatim.
 */
export const fixture = createFixture({
  id: 'conditional-branch-sigil-text',
  description: 'Ternary branch text and element text starting with % or : render verbatim',
  source: `
export function ConditionalBranchSigilText(props: { on?: boolean }) {
  return (
    <p>
      {props.on ? '%on' : ':off'}
      <b>{props.on ? ':yes' : '%no'}</b>
      <i>%: tail</i>
    </p>
  )
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s4">
      <!--bf-cond-start:s0-->:off<!--bf-cond-end:s0-->
      <b bf="s3"><!--bf-cond-start:s2-->%no<!--bf-cond-end:s2--></b>
      <i>%: tail</i>
    </p>
  `,
})
