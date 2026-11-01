import { createFixture } from '../src/types'

/**
 * The rewrite of `omitted-optional-nullable-number-relational`: a prop typed
 * only optional (`missing?: number`) reads its nil as `undefined`, which
 * ToNumber turns into `NaN`, so both comparisons are false: an attribute
 * ternary and a text ternary (#3824 step 3).
 */
export const fixture = createFixture({
  id: 'omitted-optional-number-relational',
  description: 'A comparison over an omitted optional number prop is false (undefined → NaN)',
  source: `
export function OmittedOptionalNumberRelational(props: { missing?: number }) {
  return (
    <p data-lt={props.missing < 1 ? 'T' : 'F'}>
      <span>{props.missing >= 1 ? 'T' : 'F'}</span>
    </p>
  )
}
`,
  props: {},
  expectedHtml: `
    <p bf-s="test" bf="s2" data-lt="F"><span bf="s1"><!--bf-cond-start:s0-->F<!--bf-cond-end:s0--></span></p>
  `,
})
