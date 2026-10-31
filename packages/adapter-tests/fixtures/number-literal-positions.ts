import { createFixture } from '../src/types'

/**
 * JS number literals and unary `-` at every position that reads them
 * (#3819, #3814, #3824 step 6).
 *
 * Literals: `1e21` and `1e-7` (JS prints them in exponent form), `1e20` and
 * `100000000000000000000` (decimal, past every host's 64-bit integer),
 * `0.1`, `-0`, `-1.5`, and `9007199254740992` / `9007199254740993` (2^53 and
 * the integer above it, which is the same double). Only a safe integer may
 * be spelled as a host integer literal; every other literal goes through
 * the runtime's number parse, and `-0` through its negation.
 *
 * Unary `-` keeps the sign of zero: `-x` with `x` = `0`, `-0` (a memo), a
 * numeric string, a non-numeric string and `NaN` (computed as
 * `zero / zero`: JSON props cannot carry it). `1 / -0` is `-Infinity`,
 * while `String(-0)`, `JSON.stringify(-0)` and `-0` printed as text or an
 * attribute are `0`.
 *
 * Positions: an attribute, a text child, a template literal, a string
 * concatenation, a memo body, a loop row (text and attribute), a child prop
 * read in arithmetic, a `.filter()` predicate, and module scalar consts
 * (`const NZERO = -0`, `const BIG = 1e21`) inlined into those positions.
 */
export const fixture = createFixture({
  id: 'number-literal-positions',
  description: 'number literals and unary minus print and compute as JS does at every position',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

const NZERO = -0
const BIG = 1e21
const TINY = 1e-7
const HUGE = 100000000000000000000

function Probe(props: { label: string; v: number }) {
  return (
    <p data-label={props.label} data-v={props.v}>
      {props.v}|{1 / props.v}|{1 / props.v < 0 ? 'neg' : 'pos'}
    </p>
  )
}

export function NumberLiteralPositions({ zero, one, s, t, rows }: {
  zero: number
  one: number
  s: string
  t: string
  rows: { k: string; v: number }[]
}) {
  const big = createMemo(() => one * 1e21)
  const tiny = createMemo(() => one * 1e-7)
  const huge = createMemo(() => one * 100000000000000000000)
  const negZero = createMemo(() => -zero)
  const nan = createMemo(() => zero / zero)
  const inv = createMemo(() => 1 / -zero)
  return (
    <div
      data-e21={1e21}
      data-e7={1e-7}
      data-e20={1e20}
      data-tenth={0.1}
      data-nz={-0}
      data-neg={-1.5}
      data-p53={9007199254740992}
      data-p53b={9007199254740993}
      data-inv={1 / -0}
      data-negx={1 / -zero}
      data-sum={one + 1e21}
      data-tpl={\`\${1e21}|\${1e-7}|\${-0}\`}
    >
      <span>{1e21}|{1e-7}|{1e20}|{100000000000000000000}|{0.1}|{-0}|{-1.5}|{9007199254740992}|{9007199254740993}</span>
      <span>{one * 1e21}|{one * 1e-7}|{one * 1e20}|{one * 0.1}|{one * -1.5}|{one * 9007199254740993}</span>
      <span>{1 / -0}|{1 / -0 < 0 ? 'neg' : 'pos'}|{String(-0)}|{JSON.stringify(-0)}|{JSON.stringify([-0, 1e21, 1e-7])}</span>
      <span>{-zero}|{1 / -zero}|{-negZero()}|{1 / -negZero()}|{1 / negZero()}|{-s}|{-t}|{-nan()}</span>
      <span>{\`\${1e21}|\${1e-7}|\${1e20}|\${-0}|\${-zero}|\${1 / -zero}|\${one * 1e21}\`}</span>
      <span>{'c=' + 1e21 + '|' + 1e-7 + '|' + 0.1 + '|' + -0 + '|' + -zero + '|' + (1 / -0)}</span>
      <span>{big()}|{tiny()}|{huge()}|{negZero()}|{nan()}|{inv()}</span>
      <ul>{rows.map(r => <li key={r.k} data-v={r.v * 1e21}>{r.v * 1e-7}|{-r.v}|{1 / -r.v}</li>)}</ul>
      <ol>{rows.filter(r => 1 / -r.v < 0).map(r => <li key={r.k}>{r.k}</li>)}</ol>
      <b>{rows.filter(r => r.v * 1e21 > 1e20).length}</b>
      <i data-big={BIG} data-tiny={TINY}>{NZERO}|{1 / NZERO}|{1 / NZERO < 0 ? 'neg' : 'pos'}|{BIG}|{TINY}|{HUGE}|{one * BIG}|{one * HUGE}|{'c=' + BIG + '|' + TINY}</i>
      <Probe label="nz" v={-0} />
      <Probe label="neg-zero" v={-zero} />
      <Probe label="big" v={1e21} />
      <Probe label="tiny" v={1e-7} />
      <Probe label="neg" v={-1.5} />
    </div>
  )
}
`,
  props: {
    zero: 0,
    one: 1,
    s: '5',
    t: 'abc',
    rows: [
      { k: 'zero', v: 0 },
      { k: 'two', v: 2 },
      { k: 'minus', v: -3 },
    ],
  },
  expectedHtml: `
    <div bf-s="test" bf="s47" data-e20="100000000000000000000" data-e21="1e+21" data-e7="1e-7" data-inv="-Infinity" data-neg="-1.5" data-negx="-Infinity" data-nz="0" data-p53="9007199254740992" data-p53b="9007199254740992" data-sum="1e+21" data-tenth="0.1" data-tpl="1e+21|1e-7|0">
      <span>1e+21|1e-7|100000000000000000000|100000000000000000000|0.1|0|-1.5|9007199254740992|9007199254740992</span>
      <span bf="s6"><!--bf:s0-->1e+21<!--/-->|<!--bf:s1-->1e-7<!--/-->|<!--bf:s2-->100000000000000000000<!--/-->|<!--bf:s3-->0.1<!--/-->|<!--bf:s4-->-1.5<!--/-->|<!--bf:s5-->9007199254740992<!--/--></span>
      <span>-Infinity|neg|<!--bf:s7-->0<!--/-->|<!--bf:s8-->0<!--/-->|<!--bf:s9-->[0,1e+21,1e-7]<!--/--></span>
      <span bf="s18"><!--bf:s10-->0<!--/-->|<!--bf:s11-->-Infinity<!--/-->|<!--bf:s12-->0<!--/-->|<!--bf:s13-->Infinity<!--/-->|<!--bf:s14-->-Infinity<!--/-->|<!--bf:s15-->-5<!--/-->|<!--bf:s16-->NaN<!--/-->|<!--bf:s17-->NaN<!--/--></span>
      <span bf="s20"><!--bf:s19-->1e+21|1e-7|100000000000000000000|0|0|-Infinity|1e+21<!--/--></span>
      <span bf="s22"><!--bf:s21-->c=1e+21|1e-7|0.1|0|0|-Infinity<!--/--></span>
      <span bf="s29"><!--bf:s23-->1e+21<!--/-->|<!--bf:s24-->1e-7<!--/-->|<!--bf:s25-->100000000000000000000<!--/-->|<!--bf:s26-->0<!--/-->|<!--bf:s27-->NaN<!--/-->|<!--bf:s28-->-Infinity<!--/--></span>
      <ul bf="s34">
        <li bf="s33" data-key="zero" data-v="0"><!--bf:s30-->0<!--/-->|<!--bf:s31-->0<!--/-->|<!--bf:s32-->-Infinity<!--/--></li>
        <li bf="s33" data-key="two" data-v="2e+21"><!--bf:s30-->2e-7<!--/-->|<!--bf:s31-->-2<!--/-->|<!--bf:s32-->-0.5<!--/--></li>
        <li bf="s33" data-key="minus" data-v="-3e+21"><!--bf:s30-->-3e-7<!--/-->|<!--bf:s31-->3<!--/-->|<!--bf:s32-->0.3333333333333333<!--/--></li>
      </ul>
      <ol bf="s36">
        <li data-key="zero"><!--bf:s35-->zero<!--/--></li>
        <li data-key="two"><!--bf:s35-->two<!--/--></li>
      </ol>
      <b bf="s38"><!--bf:s37-->1<!--/--></b>
      <i bf="s41" data-big="1e+21" data-tiny="1e-7">0|-Infinity|neg|1e+21|1e-7|100000000000000000000|<!--bf:s39-->1e+21<!--/-->|<!--bf:s40-->100000000000000000000<!--/-->|c=1e+21|1e-7</i>
      <p bf-s="test_s42" bf="s3" data-label="nz" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf:s1-->-Infinity<!--/-->|<!--bf-cond-start:s2-->neg<!--bf-cond-end:s2--></p>
      <p bf-s="test_s43" bf="s3" data-label="neg-zero" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf:s1-->-Infinity<!--/-->|<!--bf-cond-start:s2-->neg<!--bf-cond-end:s2--></p>
      <p bf-s="test_s44" bf="s3" data-label="big" data-v="1e+21"><!--bf:s0-->1e+21<!--/-->|<!--bf:s1-->1e-21<!--/-->|<!--bf-cond-start:s2-->pos<!--bf-cond-end:s2--></p>
      <p bf-s="test_s45" bf="s3" data-label="tiny" data-v="1e-7"><!--bf:s0-->1e-7<!--/-->|<!--bf:s1-->10000000<!--/-->|<!--bf-cond-start:s2-->pos<!--bf-cond-end:s2--></p>
      <p bf-s="test_s46" bf="s3" data-label="neg" data-v="-1.5"><!--bf:s0-->-1.5<!--/-->|<!--bf:s1-->-0.6666666666666666<!--/-->|<!--bf-cond-start:s2-->neg<!--bf-cond-end:s2--></p>
    </div>
  `,
})
