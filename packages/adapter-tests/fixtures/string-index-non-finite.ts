import { createFixture } from '../src/types'

/**
 * Non-finite string positions (#3613). JS reads an index or position with
 * `ToIntegerOrInfinity`: `NaN` is 0, so `'abc'.at(NaN)` is `'a'`;
 * `±Infinity` is out of range for `.at` and clamps for `.startsWith` /
 * `.endsWith`. The values are computed from finite props
 * (`zero / zero`, `±1 / zero`), so a runtime that coerces the index with
 * a plain integer cast either throws or reads `Infinity` as 0.
 */
export const fixture = createFixture({
  id: 'string-index-non-finite',
  description: 'String .at / .startsWith / .endsWith read NaN as 0 and ±Infinity as out of range or clamped',
  source: `
export function StringIndexNonFinite(props: { word: string; zero: number }) {
  return (
    <p>
      {props.word.at(props.zero / props.zero)}|{props.word.at(1 / props.zero)}|{props.word.at(-1 / props.zero)}|
      {props.word.startsWith('a', props.zero / props.zero) ? 'y' : 'n'}|{props.word.startsWith('', 1 / props.zero) ? 'y' : 'n'}|
      {props.word.endsWith('c', props.zero / props.zero) ? 'y' : 'n'}|{props.word.endsWith('c', 1 / props.zero) ? 'y' : 'n'}
    </p>
  )
}
`,
  props: { word: 'abc', zero: 0 },
  expectedHtml: `
    <p bf-s="test" bf="s7"><!--bf:s0-->a<!--/-->|<!--bf:s1--><!--/-->|<!--bf:s2--><!--/-->|<!--bf-cond-start:s3-->y<!--bf-cond-end:s3-->|<!--bf-cond-start:s4-->y<!--bf-cond-end:s4-->|<!--bf-cond-start:s5-->n<!--bf-cond-end:s5-->|<!--bf-cond-start:s6-->y<!--bf-cond-end:s6--></p>
  `,
})
