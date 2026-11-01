import { createFixture } from '../src/types'

/**
 * Comparisons over string and boolean props that may only be absent
 * (#3824 step 3). JS reads an omitted prop as `undefined`, which a
 * comparison converts to `NaN` unless both sides are strings; `undefined`
 * is not a string, so every comparison over it is false, whatever the other
 * side is. A `null` reading would make `missing < 1`, `missing >= ''` and
 * `flag <= 0` true (`0`). A present string still compares as a string (`'b' > 'a'`),
 * so the nil reading must not convert it. The rewrite of
 * `omitted-optional-nullable-string-relational`.
 */
export const fixture = createFixture({
  id: 'omitted-optional-string-relational',
  description: 'A comparison over an omitted optional string or boolean prop is false (undefined → NaN)',
  source: `
export function OmittedOptionalStringRelational(props: { missing?: string; flag?: boolean; present?: string }) {
  return (
    <p data-lt={props.missing < 1 ? 'T' : 'F'} data-flag={props.flag < 1 ? 'T' : 'F'}>
      <span>{props.missing >= '' ? 'T' : 'F'}</span>
      <span>{props.flag <= 0 ? 'T' : 'F'}</span>
      <span>{props.present > 'a' ? 'T' : 'F'}</span>
    </p>
  )
}
`,
  props: { present: 'b' },
  expectedHtml: `
    <p bf-s="test" bf="s6" data-flag="F" data-lt="F">
      <span bf="s1"><!--bf-cond-start:s0-->F<!--bf-cond-end:s0--></span>
      <span bf="s3"><!--bf-cond-start:s2-->F<!--bf-cond-end:s2--></span>
      <span bf="s5"><!--bf-cond-start:s4-->T<!--bf-cond-end:s4--></span>
    </p>
  `,
})
