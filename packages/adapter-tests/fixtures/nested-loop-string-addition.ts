import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'nested-loop-string-addition',
  description: 'String addition of outer and inner row bindings preserves both values in attributes and conditions',
  source: `
export function Pair(props: { groups: string[]; choices: string[] }) {
  return <div>{props.groups.map(group => <div key={group}>
    {props.choices.map(choice => <span key={choice} data-pair={group + choice}>
      {group + choice === 'a1' ? 'on' : 'off'}
      <b>{group + choice}</b><i>{\`pair=\${group + choice}\`}</i>
    </span>)}
  </div>)}</div>
`,
  props: { groups: ['a', 'b'], choices: ['1', '2'] },
  dataPoints: [
    { name: 'numeric-strings', props: { groups: ['1', '2'], choices: ['3', '4'] } },
    { name: 'escaped-and-multibyte', props: { groups: ['<a>', 'é'], choices: ['&', '猫'] } },
  ],
  expectedHtml: `
    <div bf-s="test" bf="s5">
      <div bf="s4" data-key="a">
        <span bf="s3" data-key-1="1" data-pair="a1">
          <!--bf-cond-start:s0-->on<!--bf-cond-end:s0-->
          <b><!--bf:s1-->a1<!--/--></b>
          <i><!--bf:s2-->pair=a1<!--/--></i>
        </span>
        <span bf="s3" data-key-1="2" data-pair="a2">
          <!--bf-cond-start:s0-->off<!--bf-cond-end:s0-->
          <b><!--bf:s1-->a2<!--/--></b>
          <i><!--bf:s2-->pair=a2<!--/--></i>
        </span>
      </div>
      <div bf="s4" data-key="b">
        <span bf="s3" data-key-1="1" data-pair="b1">
          <!--bf-cond-start:s0-->off<!--bf-cond-end:s0-->
          <b><!--bf:s1-->b1<!--/--></b>
          <i><!--bf:s2-->pair=b1<!--/--></i>
        </span>
        <span bf="s3" data-key-1="2" data-pair="b2">
          <!--bf-cond-start:s0-->off<!--bf-cond-end:s0-->
          <b><!--bf:s1-->b2<!--/--></b>
          <i><!--bf:s2-->pair=b2<!--/--></i>
        </span>
      </div>
    </div>
  `,
})
