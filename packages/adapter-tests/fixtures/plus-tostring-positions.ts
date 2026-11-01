import { createFixture } from '../src/types'

/**
 * JS binary `+` and ToString at every position that reads them (#3740,
 * #3824 step 4). `+` concatenates when either operand is a string (after
 * ToPrimitive: an array joins with `,`) and adds as doubles otherwise;
 * ToString spells a number with `Number::toString` (`-0` is `"0"`, `1e21`
 * keeps its exponent, `NaN`), a boolean as `"true"`, `null` as `"null"`.
 * An omitted optional prop reads `undefined`: `"undefined!"` against a
 * string, `NaN` against a number, `"undefined"` in a template literal.
 *
 * Covered: an attribute, text, a template literal (attribute and text),
 * a memo body, a loop row, a `.filter()` predicate and a child prop.
 */
export const fixture = createFixture({
  id: 'plus-tostring-positions',
  description: 'Every + and ToString position gives the JS answer for numbers, strings, booleans, arrays, null and omitted props',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

function Show(props: { label: string; value: string }) {
  return <b data-label={props.label}>{props.value}</b>
}

type Row = { id: string; n: number }

export function PlusTostringPositions(props: {
  n: number
  m: number
  s: string
  yes: boolean
  nums: number[]
  nul: string | null
  ms?: string
  mn?: number
  big: number
  zero: number
  rows: Row[]
}) {
  const sum = createMemo(() => props.n + props.m)
  const label = createMemo(() => props.s + props.n)
  const omitted = createMemo(() => props.ms + '!')
  const spelled = createMemo(() => \`\${props.mn}|\${props.big}\`)
  return (
    <div data-nn={props.n + props.m} data-sn={props.s + props.n} data-ns={props.n + props.s} data-bs={props.yes + props.s} data-as={props.nums + ''} data-null={props.nul + props.s} data-ms={props.ms + '!'} data-mn={props.mn + 1}>
      <span>{props.n + props.m}|{props.s + props.n}|{props.n + props.s}|{props.yes + props.s}|{props.nums + ''}|{props.nul + props.s}|{props.ms + '!'}|{props.mn + 1}</span>
      <span title={\`\${-props.zero}|\${props.big}|\${0 / 0}|\${props.yes}|\${props.nums}|\${props.nul}|\${props.ms}|\${props.mn}\`}>{\`\${-props.zero}|\${props.big}|\${0 / 0}|\${props.ms}|\${props.mn}\`}</span>
      <span>{sum()}|{label()}|{omitted()}|{spelled()}</span>
      <ul>{props.rows.map(r => <li key={r.id} data-v={r.id + r.n}>{r.n + props.n}|{r.id + props.ms}|{\`\${r.n}\${props.mn}\`}</li>)}</ul>
      <ol>{props.rows.filter(r => ((r.id + r.n) === 'a1')).map(r => <li key={r.id}>{r.id}</li>)}</ol>
      <ol>{props.rows.filter(r => ((props.ms + '-' + r.id) === 'undefined-a')).map(r => <li key={r.id}>{r.id}</li>)}</ol>
      <Show label="sn" value={props.s + props.n} />
      <Show label="ms" value={props.ms + '!'} />
      <Show label="tl" value={\`\${props.mn}\`} />
    </div>
  )
}
`,
  props: {
    n: 1,
    m: 2,
    s: 'x',
    yes: true,
    nums: [1, 2],
    nul: null,
    big: 1e21,
    zero: 0,
    rows: [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
    ],
  },
  expectedHtml: `
    <div bf-s="test" bf="s28" data-as="1,2" data-bs="truex" data-mn="NaN" data-ms="undefined!" data-nn="3" data-ns="1x" data-null="nullx" data-sn="x1">
      <span bf="s8"><!--bf:s0-->3<!--/-->|<!--bf:s1-->x1<!--/-->|<!--bf:s2-->1x<!--/-->|<!--bf:s3-->truex<!--/-->|<!--bf:s4-->1,2<!--/-->|<!--bf:s5-->nullx<!--/-->|<!--bf:s6-->undefined!<!--/-->|<!--bf:s7-->NaN<!--/--></span>
      <span bf="s10" title="0|1e+21|NaN|true|1,2|null|undefined|undefined"><!--bf:s9-->0|1e+21|NaN|undefined|undefined<!--/--></span>
      <span bf="s15"><!--bf:s11-->3<!--/-->|<!--bf:s12-->x1<!--/-->|<!--bf:s13-->undefined!<!--/-->|<!--bf:s14-->undefined|1e+21<!--/--></span>
      <ul bf="s20">
        <li bf="s19" data-key="a" data-v="a1"><!--bf:s16-->2<!--/-->|<!--bf:s17-->aundefined<!--/-->|<!--bf:s18-->1undefined<!--/--></li>
        <li bf="s19" data-key="b" data-v="b2"><!--bf:s16-->3<!--/-->|<!--bf:s17-->bundefined<!--/-->|<!--bf:s18-->2undefined<!--/--></li>
      </ul>
      <ol bf="s22"><li data-key="a"><!--bf:s21-->a<!--/--></li></ol>
      <ol bf="s24"><li data-key="a"><!--bf:s23-->a<!--/--></li></ol>
      <b bf-s="test_s25" bf="s1" data-label="sn"><!--bf:s0-->x1<!--/--></b>
      <b bf-s="test_s26" bf="s1" data-label="ms"><!--bf:s0-->undefined!<!--/--></b>
      <b bf-s="test_s27" bf="s1" data-label="tl"><!--bf:s0-->undefined<!--/--></b>
    </div>
  `,
})
