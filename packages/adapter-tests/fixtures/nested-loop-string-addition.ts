import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'nested-loop-string-addition',
  description: 'String addition of outer and inner row bindings preserves both values in attributes and conditions',
  source: `
export function Pair(props: { groups: string[]; choices: string[] }) {
  return <div>{props.groups.map(group => <div key={group}>
    {props.choices.map(choice => <span key={choice} data-pair={group + choice}>
      {group + choice === 'a1' ? 'on' : 'off'}
    </span>)}
  </div>)}</div>
`,
  props: { groups: ['a', 'b'], choices: ['1', '2'] },
  expectedHtml: `
    <div bf-s="test" bf="s3">
      <div bf="s2" data-key="a">
        <span bf="s1" data-key-1="1" data-pair="a1"><!--bf-cond-start:s0-->on<!--bf-cond-end:s0--></span>
        <span bf="s1" data-key-1="2" data-pair="a2"><!--bf-cond-start:s0-->off<!--bf-cond-end:s0--></span>
      </div>
      <div bf="s2" data-key="b">
        <span bf="s1" data-key-1="1" data-pair="b1"><!--bf-cond-start:s0-->off<!--bf-cond-end:s0--></span>
        <span bf="s1" data-key-1="2" data-pair="b2"><!--bf-cond-start:s0-->off<!--bf-cond-end:s0--></span>
      </div>
    </div>
  `,
})
