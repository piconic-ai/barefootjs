import { createFixture } from '../src/types'

/**
 * A prop-driven ternary followed by static text whose first non-space
 * character is `:` (`{on ? 'on' : 'off'} :y`). The text renders verbatim
 * after the chosen branch (`off :y`). The space before `:` keeps the
 * fixture clear of `conditional-then-text`'s adjacency whitespace question:
 * a template that emits the text at the start of its own line after the
 * conditional block must not let the template engine read that line as a
 * statement. `conditional-then-percent-text` is the same shape with `%`.
 */
export const fixture = createFixture({
  id: 'conditional-then-colon-text',
  description: 'Text starting with a colon right after a ternary renders verbatim',
  source: `
export function ConditionalThenColonText(props: { on?: boolean }) {
  return <p>{props.on ? 'on' : 'off'} :y</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2"><!--bf-cond-start:s0-->off<!--bf-cond-end:s0--> :y</p>
  `,
})
