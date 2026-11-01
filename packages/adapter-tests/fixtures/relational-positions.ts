import { createFixture } from '../src/types'

/**
 * JS Abstract Relational Comparison (`<` `<=` `>` `>=`) at every position
 * that reads a comparison (#3805, #3824 step 3). Two strings compare by
 * UTF-16 code unit: `'10' < '9'`, `'a' < 'b'`, and `'😀' < '｡'` (U+1F600's
 * leading surrogate 0xD83D sorts below U+FF61, where code point order says
 * the opposite). Any other pair goes through ToNumber: `'10' < 9` is false,
 * `' 3 ' < 4` is true, `true < 2` is true, a `null` reads as `0` (`nul < 1`
 * is true), an omitted optional number reads as `undefined` (`NaN`, so every
 * comparison is false), and a `NaN` operand makes every comparison false.
 *
 * Covered: an attribute (a boolean value, and a ternary over a comparison),
 * text (`JSON.stringify` of comparison values), a ternary test, a JSX
 * conditional, a memo body, a loop row, a `.filter()` predicate (string ×
 * string and number × string), a `.sort()` comparator, and a comparison
 * passed as a child prop. An omitted optional number in a memo body is
 * `relational-omitted-number-memo`.
 */
export const fixture = createFixture({
  id: 'relational-positions',
  description: 'Every relational-operator position gives the JS answer for string, number, mixed, nil and NaN operands',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

function Flag(props: { label: string; on: boolean }) {
  return <b data-label={props.label}>{props.on ? 'T' : 'F'}</b>
}

export function RelationalPositions(props: {
  n: number
  m: number
  s10: string
  s9: string
  a: string
  b: string
  astral: string
  bmp: string
  padded: string
  nine: number
  four: number
  nul: number | null
  maybe?: number
  yes: boolean
  items: string[]
  nums: number[]
}) {
  const strLt = createMemo(() => props.s10 < props.s9)
  const mixedGt = createMemo(() => props.s10 > props.nine)
  return (
    <div data-ss={props.s10 < props.s9} data-sn={props.s10 < props.nine} data-astral={props.astral < props.bmp ? 'utf16' : 'codepoint'} data-num={props.n <= props.m ? 'le' : 'gt'}>
      <span>{JSON.stringify([props.n < props.m, props.s10 < props.s9, props.a < props.b, props.astral < props.bmp, props.bmp > props.astral])}</span>
      <span>{JSON.stringify([props.s10 < props.nine, props.s10 >= props.nine, props.padded < props.four, props.yes < props.m, props.yes >= props.n])}</span>
      <span>{JSON.stringify([props.nul < props.n, props.nul >= props.n, props.maybe < props.n, props.maybe >= props.n, Number(props.a) < props.n, Number(props.a) >= props.n])}</span>
      <span>{props.s10 < props.s9 ? 'T' : 'F'}|{props.astral <= props.bmp ? 'T' : 'F'}|{props.s10 > props.nine ? 'T' : 'F'}|{props.nul <= props.n ? 'T' : 'F'}|{props.maybe > props.n ? 'T' : 'F'}|{props.yes > props.n ? 'T' : 'F'}</span>
      {props.s10 < props.s9 ? <b>if-strings</b> : <i>if-not-strings</i>}
      {props.s10 < props.nine ? <b>if-mixed</b> : <i>if-not-mixed</i>}
      {props.astral < props.bmp ? <b>if-utf16</b> : <i>if-codepoint</i>}
      <span>{strLt() ? 'T' : 'F'}|{mixedGt() ? 'T' : 'F'}</span>
      <ul>{props.items.map(it => <li key={it} data-lt={it < props.s9 ? 'y' : 'n'}>{it}:{it < props.b ? 'lt' : 'ge'}:{it > props.nine ? 'gt' : 'le'}</li>)}</ul>
      <ol>{props.items.filter(it => it < props.s9).map(it => <li key={it}>{it}</li>)}</ol>
      <ol>{props.nums.filter(x => x < props.s10).map(x => <li key={x}>{x}</li>)}</ol>
      <ol>{props.items.slice().sort((x, y) => (x < y ? -1 : 1)).map(it => <li key={it}>{it}</li>)}</ol>
      <Flag label="strings" on={props.s10 < props.s9} />
      <Flag label="mixed" on={props.s10 < props.nine} />
      <Flag label="utf16" on={props.astral < props.bmp} />
    </div>
  )
}
`,
  props: {
    n: 1,
    m: 2,
    s10: '10',
    s9: '9',
    a: 'a',
    b: 'b',
    astral: '😀',
    bmp: '｡',
    padded: ' 3 ',
    nine: 9,
    four: 4,
    nul: null,
    yes: true,
    items: ['10', '9', 'a', '😀', '｡', '20'],
    nums: [5, 10, 20],
  },
  expectedHtml: `
    <div bf-s="test" bf="s33" data-astral="utf16" data-num="le" data-sn="false" data-ss="true">
      <span bf="s1"><!--bf:s0-->[true,true,true,true,true]<!--/--></span>
      <span bf="s3"><!--bf:s2-->[false,true,true,true,true]<!--/--></span>
      <span bf="s5"><!--bf:s4-->[true,false,false,false,false,false]<!--/--></span>
      <span bf="s12"><!--bf-cond-start:s6-->T<!--bf-cond-end:s6-->|<!--bf-cond-start:s7-->T<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->T<!--bf-cond-end:s8-->|<!--bf-cond-start:s9-->T<!--bf-cond-end:s9-->|<!--bf-cond-start:s10-->F<!--bf-cond-end:s10-->|<!--bf-cond-start:s11-->F<!--bf-cond-end:s11--></span>
      <b bf-c="s13">if-strings</b>
      <i bf-c="s14">if-not-mixed</i>
      <b bf-c="s15">if-utf16</b>
      <span bf="s18"><!--bf-cond-start:s16-->T<!--bf-cond-end:s16-->|<!--bf-cond-start:s17-->T<!--bf-cond-end:s17--></span>
      <ul bf="s23">
        <li bf="s22" data-key="10" data-lt="y"><!--bf:s19-->10<!--/-->:<!--bf-cond-start:s20-->lt<!--bf-cond-end:s20-->:<!--bf-cond-start:s21-->gt<!--bf-cond-end:s21--></li>
        <li bf="s22" data-key="9" data-lt="n"><!--bf:s19-->9<!--/-->:<!--bf-cond-start:s20-->lt<!--bf-cond-end:s20-->:<!--bf-cond-start:s21-->le<!--bf-cond-end:s21--></li>
        <li bf="s22" data-key="a" data-lt="n"><!--bf:s19-->a<!--/-->:<!--bf-cond-start:s20-->lt<!--bf-cond-end:s20-->:<!--bf-cond-start:s21-->le<!--bf-cond-end:s21--></li>
        <li bf="s22" data-key="😀" data-lt="n"><!--bf:s19-->😀<!--/-->:<!--bf-cond-start:s20-->ge<!--bf-cond-end:s20-->:<!--bf-cond-start:s21-->le<!--bf-cond-end:s21--></li>
        <li bf="s22" data-key="｡" data-lt="n"><!--bf:s19-->｡<!--/-->:<!--bf-cond-start:s20-->ge<!--bf-cond-end:s20-->:<!--bf-cond-start:s21-->le<!--bf-cond-end:s21--></li>
        <li bf="s22" data-key="20" data-lt="y"><!--bf:s19-->20<!--/-->:<!--bf-cond-start:s20-->lt<!--bf-cond-end:s20-->:<!--bf-cond-start:s21-->gt<!--bf-cond-end:s21--></li>
      </ul>
      <ol bf="s25">
        <li data-key="10"><!--bf:s24-->10<!--/--></li>
        <li data-key="20"><!--bf:s24-->20<!--/--></li>
      </ol>
      <ol bf="s27"><li data-key="5"><!--bf:s26-->5<!--/--></li></ol>
      <ol bf="s29">
        <li data-key="10"><!--bf:s28-->10<!--/--></li>
        <li data-key="20"><!--bf:s28-->20<!--/--></li>
        <li data-key="9"><!--bf:s28-->9<!--/--></li>
        <li data-key="a"><!--bf:s28-->a<!--/--></li>
        <li data-key="😀"><!--bf:s28-->😀<!--/--></li>
        <li data-key="｡"><!--bf:s28-->｡<!--/--></li>
      </ol>
      <b bf-s="test_s30" bf="s1" data-label="strings"><!--bf-cond-start:s0-->T<!--bf-cond-end:s0--></b>
      <b bf-s="test_s31" bf="s1" data-label="mixed"><!--bf-cond-start:s0-->F<!--bf-cond-end:s0--></b>
      <b bf-s="test_s32" bf="s1" data-label="utf16"><!--bf-cond-start:s0-->T<!--bf-cond-end:s0--></b>
    </div>
  `,
})
