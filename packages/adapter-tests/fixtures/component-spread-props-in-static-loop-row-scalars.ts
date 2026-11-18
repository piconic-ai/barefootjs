import { createFixture } from '../src/types'

/**
 * `{...props}` onto a child component in a row of a `.map()` over an inline
 * literal array of numbers (#3713), beside a number and a boolean prop the
 * row bakes. `count` comes after the spread, so the row's own value wins;
 * `flag` comes before it, so the caller's value wins when it passes one.
 */
export const fixture = createFixture({
  id: 'component-spread-props-in-static-loop-row-scalars',
  description: 'A props spread onto a child in an inline static-array loop row, with number and boolean row props',
  source: `
import { Cell } from './cell'
export function Cells(props: { tone?: string; flag?: boolean; count?: number }) {
  return <ul>{[1, 2].map((n) => <Cell key={n} flag={false} {...props} count={n} />)}</ul>
}
`,
  components: {
    './cell.tsx': `
export function Cell(props: { tone?: string; flag?: boolean; count?: number }) {
  return <li data-tone={props.tone}>{props.count}:{props.flag ? 'on' : 'off'}</li>
}
`,
  },
  props: { tone: 'warm', flag: true, count: 99 },
  expectedHtml: `
    <ul bf-s="test" bf="s1">
      <li bf-s="Cell_*" bf="s2" data-key="1" data-tone="warm"><!--bf:s0-->1<!--/-->:<!--bf-cond-start:s1-->on<!--bf-cond-end:s1--></li>
      <li bf-s="Cell_*" bf="s2" data-key="2" data-tone="warm"><!--bf:s0-->2<!--/-->:<!--bf-cond-start:s1-->on<!--bf-cond-end:s1--></li>
    </ul>
  `,
})
