import { createFixture } from '../src/types'

/**
 * Server-only twin of `text-then-conditional`: the ternary reads a prop
 * instead of a signal, so no client JS is involved. Same contract — the
 * text and the chosen branch abut (`x:off`).
 */
export const fixture = createFixture({
  id: 'text-then-conditional-static',
  description: 'Text directly followed by a prop-driven ternary renders with no whitespace between them',
  source: `
export function TextThenConditionalStatic(props: { on?: boolean }) {
  return <p>x:{props.on ? 'on' : 'off'}</p>
}
`,
  expectedHtml: `
    <p bf-s="test" bf="s2">x:<!--bf-cond-start:s0-->off<!--bf-cond-end:s0--></p>
  `,
})
