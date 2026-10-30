import { createFixture } from '../src/types'

/**
 * A component-local array-literal const read with a literal index
 * (`QS[0]`, `QS['1']`) is the element and `QS.length` its element count,
 * and a component-local record-literal const read with a literal key
 * (`REC.k`, `REC['n']`) is the value — the same as the module consts of
 * those shapes. The template receives the props, not the component's
 * consts, so a backend that reads `QS` as a template variable renders the
 * element empty.
 *
 * Positions: attribute, text, ternary, `&&` and `===`/`>` conditions,
 * concatenation, template literal, a loop row, child props into a
 * destructured child (also inside the loop row) and a `function C(props)`
 * child, and the same reads inside both children's own local consts.
 * Elements: strings holding a quote and a newline escape, and numbers
 * spelled `1e3`, `0x10`, `.5` and `-0`. A loop row named `QS` and a loop
 * row destructure binding `REC` shadow the local consts of those names; a
 * destructured prop named `PS` is never resolved as a const. The two
 * children share a file and declare `CS` / `CR` with different values, so
 * each one must read its own declaration.
 */
export const fixture = createFixture({
  id: 'local-const-literal-index',
  description: 'a component-local array or record const read with a literal key renders the value in every position',
  source: `
import { LocalIdxChild, LocalIdxPropsChild } from './local-idx-child'
export function LocalConstLiteralIndex({ on = true, PS, RS }: { on?: boolean; PS: string[]; RS: Array<{ id: string; REC: { k: string } }> }) {
  const QS = ['a1', 'b"c', 'l1\\nl2']
  const NS = [1e3, 0x10, .5, -0]
  const REC = { k: 'v', n: 3, 'q-k': 'qv' }
  return (
    <div data-q={QS[0]} data-s={QS['1']} data-r={REC['k']} data-t={\`\${QS[1]}|\${NS[0]}\`} data-c={'pre ' + QS[2]} data-len={QS.length}>
      <p>{QS[1]}</p>
      <p>{REC.k}|{REC['q-k']}</p>
      <p data-p={PS[1]}>{PS[0]}</p>
      <p>{NS[0]}|{NS[1]}|{NS[2]}|{NS[3]}</p>
      <p>{on ? QS[1] : QS[0]}</p>
      {on && <s data-s={QS[2]}>and</s>}
      {QS[0] === 'a1' && <b>eq</b>}
      {NS[1] > 5 ? <i>big</i> : <i>small</i>}
      {QS.length > 2 && <a>len</a>}
      {REC.k === 'v' && <u>rec</u>}
      {REC['n'] > 2 ? <em>rn</em> : <em>no</em>}
      <ul>
        {['x', 'y'].map(r => (
          <li key={r} data-q={QS[1]} data-r={REC.k}>
            {r}
            {QS[0]}
            <LocalIdxChild v={QS[0]} n={NS[0]} />
          </li>
        ))}
      </ul>
      <ol>
        {[['row']].map(QS => (
          <li key={QS[0]}>{QS[0]}</li>
        ))}
      </ol>
      <ol>
        {RS.map(({ id, REC }) => (
          <li key={id}>{REC.k}</li>
        ))}
      </ol>
      <LocalIdxChild v={QS[1]} n={NS[2]} />
      <LocalIdxPropsChild v={REC.k} n={REC.n} />
    </div>
  )
}
`,
  components: {
    './local-idx-child.tsx': `
export function LocalIdxChild({ v, n }: { v: string; n: number }) {
  const CS = ['c0', 'c"1']
  const CR = { k: 'cr' }
  return (
    <b title={v} data-c={CS[1]} data-r={CR.k}>
      {v}
      {n}
      {CS[0]}
    </b>
  )
}
export function LocalIdxPropsChild(props: { v: string; n: number }) {
  const CS = ['d0', 'd"1']
  const CR = { k: 'dr' }
  return (
    <span title={props.v} data-c={CS[1]} data-r={CR['k']}>
      {props.n}
      {props.v === CS[0] ? 'same' : CS[0]}
    </span>
  )
}
`,
  },
  props: { PS: ['p0', 'p"1'], RS: [{ id: 'z', REC: { k: 'row-rec' } }] },
  expectedHtml: `
    <div bf-s="test" bf="s14" data-c="pre l1 l2" data-len="3" data-q="a1" data-r="v" data-s="b&quot;c" data-t="b&quot;c|1000">
      <p>b&quot;c</p>
      <p>v|qv</p>
      <p bf="s1" data-p="p&quot;1"><!--bf:s0-->p0<!--/--></p>
      <p>1000|16|0.5|0</p>
      <p bf="s3"><!--bf-cond-start:s2-->b&quot;c<!--bf-cond-end:s2--></p>
      <s bf-c="s4" data-s="l1 l2">and</s>
      <b>eq</b>
      <i>big</i>
      <a>len</a>
      <u>rec</u>
      <em>rn</em>
      <ul bf="s7">
        <li data-key="x" data-q="b&quot;c" data-r="v"><!--bf:s5-->x<!--/-->a1<b bf-s="test_s6" bf="s2" data-c="c&quot;1" data-r="cr" title="a1"><!--bf:s0-->a1<!--/--><!--bf:s1-->1000<!--/-->c0</b></li>
        <li data-key="y" data-q="b&quot;c" data-r="v"><!--bf:s5-->y<!--/-->a1<b bf-s="test_s6" bf="s2" data-c="c&quot;1" data-r="cr" title="a1"><!--bf:s0-->a1<!--/--><!--bf:s1-->1000<!--/-->c0</b></li>
      </ul>
      <ol bf="s9"><li data-key="row"><!--bf:s8-->row<!--/--></li></ol>
      <ol bf="s11"><li data-key="z"><!--bf:s10-->row-rec<!--/--></li></ol>
      <b bf-s="test_s12" bf="s2" data-c="c&quot;1" data-r="cr" title="b&quot;c"><!--bf:s0-->b&quot;c<!--/--><!--bf:s1-->0.5<!--/-->c0</b>
      <span bf-s="test_s13" bf="s2" data-c="d&quot;1" data-r="dr" title="v"><!--bf:s0-->3<!--/--><!--bf-cond-start:s1-->d0<!--bf-cond-end:s1--></span>
    </div>
  `,
})
