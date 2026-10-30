import { createFixture } from '../src/types'

/**
 * A module array-literal const read with a literal index (`QS[0]`,
 * `QS['1']`) is the element and `QS.length` its element count, as a module
 * record read with a literal key (`REC.lf`) is the value. The template
 * receives the props, not the module's consts, so a backend that reads `QS`
 * as a template variable renders the element empty or fails the render.
 *
 * Positions: attribute, text, ternary, `&&` and `===`/`>` conditions,
 * concatenation, template literal, a loop row, child props into a
 * destructured child (also inside the loop row) and a `function C(props)`
 * child, and a module array read inside both children. Elements: strings
 * holding a quote, a newline escape and a multiline template literal, and
 * numbers spelled `1e3`, `0x10`, `.5` and `-0`. A loop row named `QS` and a
 * destructured prop named `PS` shadow the module consts of those names.
 */
export const fixture = createFixture({
  id: 'module-const-array-literal-index',
  description: 'a module array const read with a literal index renders the element in every position',
  source: `
import { IdxChild, IdxPropsChild } from './idx-child'
const QS = ['a1', 'b"c', 'l1\\nl2', \`m1
m2\`]
const NS = [1e3, 0x10, .5, -0]
const REC = { lf: 'r1', n: 3 }
const PS = ['mod0', 'mod1']
export function ModuleConstArrayLiteralIndex({ on = true, PS }: { on?: boolean; PS: string[] }) {
  return (
    <div data-q={QS[0]} data-s={QS['1']} data-t={\`\${QS[1]}|\${NS[0]}\`} data-c={'pre ' + QS[2]} data-len={QS.length}>
      <p>{QS[0]}</p>
      <p data-p={PS[1]}>{PS[0]}</p>
      <p>{QS[3]}</p>
      <p>{NS[0]}|{NS[1]}|{NS[2]}|{NS[3]}</p>
      <p>{on ? QS[1] : QS[0]}</p>
      {on && <s data-s={QS[2]}>and</s>}
      {QS[0] === 'a1' && <b>eq</b>}
      {NS[1] > 5 ? <i>big</i> : <i>small</i>}
      {QS.length > 3 && <a>len</a>}
      {REC.lf === 'r1' && <u>rec</u>}
      {REC['n'] > 2 ? <em>rn</em> : <em>no</em>}
      <ul>
        {['x', 'y'].map(r => (
          <li key={r} data-q={QS[1]}>
            {r}
            {QS[0]}
            <IdxChild v={QS[0]} n={NS[0]} />
          </li>
        ))}
      </ul>
      <ol>
        {[['row']].map(QS => (
          <li key={QS[0]}>{QS[0]}</li>
        ))}
      </ol>
      <IdxChild v={QS[1]} n={NS[2]} />
      <IdxPropsChild v={QS[2]} n={REC.n} />
    </div>
  )
}
`,
  components: {
    './idx-child.tsx': `
const CS = ['c0', 'c"1']
export function IdxChild({ v, n }: { v: string; n: number }) {
  return (
    <b title={v} data-c={CS[1]}>
      {v}
      {n}
      {CS[0]}
    </b>
  )
}
export function IdxPropsChild(props: { v: string; n: number }) {
  return (
    <span title={props.v} data-c={CS[1]}>
      {props.n}
      {props.v === CS[0] ? 'same' : CS[0]}
    </span>
  )
}
`,
  },
  props: { PS: ['p0', 'p"1'] },
  expectedHtml: `
    <div bf-s="test" bf="s12" data-c="pre l1 l2" data-len="4" data-q="a1" data-s="b&quot;c" data-t="b&quot;c|1000">
      <p>a1</p>
      <p bf="s1" data-p="p&quot;1"><!--bf:s0-->p0<!--/--></p>
      <p>m1 m2</p>
      <p>1000|16|0.5|0</p>
      <p bf="s3"><!--bf-cond-start:s2-->b&quot;c<!--bf-cond-end:s2--></p>
      <s bf-c="s4" data-s="l1 l2">and</s>
      <b>eq</b>
      <i>big</i>
      <a>len</a>
      <u>rec</u>
      <em>rn</em>
      <ul bf="s7">
        <li data-key="x" data-q="b&quot;c"><!--bf:s5-->x<!--/-->a1<b bf-s="test_s6" bf="s2" data-c="c&quot;1" title="a1"><!--bf:s0-->a1<!--/--><!--bf:s1-->1000<!--/-->c0</b></li>
        <li data-key="y" data-q="b&quot;c"><!--bf:s5-->y<!--/-->a1<b bf-s="test_s6" bf="s2" data-c="c&quot;1" title="a1"><!--bf:s0-->a1<!--/--><!--bf:s1-->1000<!--/-->c0</b></li>
      </ul>
      <ol bf="s9"><li data-key="row"><!--bf:s8-->row<!--/--></li></ol>
      <b bf-s="test_s10" bf="s2" data-c="c&quot;1" title="b&quot;c"><!--bf:s0-->b&quot;c<!--/--><!--bf:s1-->0.5<!--/-->c0</b>
      <span bf-s="test_s11" bf="s2" data-c="c&quot;1" title="l1 l2"><!--bf:s0-->3<!--/--><!--bf-cond-start:s1-->c0<!--bf-cond-end:s1--></span>
    </div>
  `,
})
