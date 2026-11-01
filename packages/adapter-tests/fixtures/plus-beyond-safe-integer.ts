import { createFixture } from '../src/types'

/**
 * A `+` over two proven numbers whose sum passes 2^53 (#3824 step 4,
 * `spec/js-primitive-semantics.md` "Decisions" (5)). JS adds doubles, so
 * `2**53 + 1` rounds back to `2**53`. Targets whose host adds integers
 * exactly there keep their native `+`: an accepted, registered gap
 * (`plus-beyond-safe-integer`).
 */
export const fixture = createFixture({
  id: 'plus-beyond-safe-integer',
  description: 'A + over two numbers whose sum passes 2^53 rounds as a double',
  source: `
export function PlusBeyondSafeInteger(props: { n: number; m: number }) {
  return <p data-sum={props.n + props.m}>{props.n + props.m}</p>
}
`,
  props: { n: 9007199254740992, m: 1 },
  expectedHtml: `
    <p bf-s="test" bf="s1" data-sum="9007199254740992"><!--bf:s0-->9007199254740992<!--/--></p>
  `,
})
