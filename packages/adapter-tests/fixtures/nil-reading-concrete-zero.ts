import { createFixture } from '../src/types'

/**
 * An optional value the nil-reading rewrite reads (#3824 step 4), supplied
 * as a falsy value and omitted, in the shapes where a backend that types an
 * absent value as a concrete zero must still tell the two apart: a prop read
 * only behind a local constant (`const v = props.s + '!'`) and an optional
 * literal union (`size?: '' | 'large'`). A supplied `''` concatenates as
 * `!`; an omitted value is `undefined!`. An optional row field is
 * `nil-reading-concrete-zero-row-field`.
 */
export const fixture = createFixture({
  id: 'nil-reading-concrete-zero',
  description: 'An optional prop supplied as a falsy value and omitted, read behind a local constant and as a literal union',
  source: `
export function NilReadingConcreteZero(props: { s?: string; t?: string; size?: '' | 'large' }) {
  const v = props.s + '!'
  const w = props.t + '!'
  return (
    <p>{v}|{w}|{props.size + '!'}</p>
  )
}
`,
  props: { s: '', size: '' },
  expectedHtml: `
    <p bf-s="test" bf="s3"><!--bf:s0-->!<!--/-->|<!--bf:s1-->undefined!<!--/-->|<!--bf:s2-->!<!--/--></p>
  `,
})
