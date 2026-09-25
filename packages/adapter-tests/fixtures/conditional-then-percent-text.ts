import { createFixture } from '../src/types'

/**
 * `%` twin of `conditional-then-colon-text`: a prop-driven ternary followed
 * by static text whose first non-space character is `%`
 * (`{on ? 'on' : 'off'} %y`). The text renders verbatim after the chosen
 * branch (`off %y`).
 */
export const fixture = createFixture({
  id: 'conditional-then-percent-text',
  description: 'Text starting with a percent sign right after a ternary renders verbatim',
  source: `
export function ConditionalThenPercentText(props: { on?: boolean }) {
  return <p>{props.on ? 'on' : 'off'} %y</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0-->off<!--bf-cond-end:s0--> %y</p>
  `,
})
