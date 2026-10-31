import { createFixture } from '../src/types'

/**
 * JS ToPropertyKey and the index read `recv[key]` at every position that
 * reads a value (#3802, #3795, #3824 step 2). An array is read only through
 * a canonical array index: `1`, `'1'` and `-0` (`zero * -1`; JSON props
 * cannot carry it) read an element, while `'01'`, `'1e0'`, `'-0'`, `1.1`,
 * `-1` and an index past the end read `undefined`. A string reads one UTF-16
 * code unit (`'a😀b'[3]` is `'b'`). An object reads its own key, a
 * non-identifier literal key (`obj['a.b']`, `obj['*']`) included, and a
 * missing key reads `undefined`.
 *
 * Covered: an attribute (omitted for `undefined`), text, a ternary test,
 * `&&`, concatenation and a template literal, a JSX conditional, a memo
 * body, a `.filter()` predicate (its `.length`, and a filtered loop in a
 * child reading `props.row[k]`), a loop
 * row read by the row index (`row[i]`, the one read a template may spell
 * natively) and by a row field (`lookup[r.k]`), and a child that reads
 * through `props.row[props.k]` while the parent destructures its props,
 * plus an index read passed as a child prop. `?? '-'` marks a read that is
 * `undefined` in text positions.
 */
export const fixture = createFixture({
  id: 'index-read-positions',
  description: 'Every index-read position gives the JS answer for canonical and non-canonical keys, string receivers and literal keys',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

function Pick(props: { label: string; row: string[]; k: string }) {
  return <b data-label={props.label} data-v={props.row[props.k]}>{props.row[props.k] ?? '-'}</b>
}

function Show(props: { v?: string }) {
  return <i>{props.v ?? '-'}</i>
}

function Kept(props: { row: string[]; keys: string[] }) {
  return <ul>{props.keys.filter(k => props.row[k]).map(k => <li key={k}>{k}</li>)}</ul>
}

export function IndexReadPositions({ row, word, emoji, obj, lookup, one, padded, exp, negZeroStr, num, zero, frac, neg, keys, rows }: {
  row: string[]
  word: string
  emoji: string
  obj: Record<string, string>
  lookup: Record<string, string>
  one: string
  padded: string
  exp: string
  negZeroStr: string
  num: number
  zero: number
  frac: number
  neg: number
  keys: string[]
  rows: { id: string; k: string }[]
}) {
  const picked = createMemo(() => row[one] ?? '-')
  const paddedPick = createMemo(() => row[padded] ?? '-')
  return (
    <div data-one={row[one]} data-padded={row[padded]} data-neg-zero={row[zero * -1]} data-frac={row[frac]} data-dot={obj['a.b']}>
      <span>{row[one] ?? '-'}|{row[padded] ?? '-'}|{row[exp] ?? '-'}|{row[negZeroStr] ?? '-'}|{row[num] ?? '-'}|{row[zero * -1] ?? '-'}|{row[frac] ?? '-'}|{row[neg] ?? '-'}</span>
      <span>{row[1] ?? '-'}|{row['1'] ?? '-'}|{row['01'] ?? '-'}|{row['1e0'] ?? '-'}|{row[1.1] ?? '-'}|{row[-1] ?? '-'}|{row[2] ?? '-'}</span>
      <span>{word[one] ?? '-'}|{word[padded] ?? '-'}|{emoji[3] ?? '-'}|{word[5] ?? '-'}</span>
      <span>{obj['a.b'] ?? '-'}|{obj['*'] ?? '-'}|{obj['missing'] ?? '-'}|{obj[one] ?? '-'}</span>
      <span>{row[one] ? 'y' : 'n'}|{row[padded] ? 'y' : 'n'}|{row[zero * -1] ? 'y' : 'n'}|{row[frac] ? 'y' : 'n'}</span>
      <span>[{row[one] && 'and'}][{row[exp] && 'and'}]</span>
      <span>{'c=' + (row[one] ?? '-') + (row[padded] ?? '-')}</span>
      <span>{\`t=\${row[one] ?? '-'}\${row[neg] ?? '-'}\${obj['a.b'] ?? '-'}\`}</span>
      {row[one] ? <b>cond-one</b> : <i>cond-no-one</i>}
      {row[exp] ? <b>cond-exp</b> : <i>cond-no-exp</i>}
      <span>{picked()}|{paddedPick()}</span>
      <span>{keys.filter(k => row[k]).length}</span>
      <Kept row={row} keys={keys} />
      <ol>{rows.map((r, i) => <li key={r.id} data-k={lookup[r.k]}>{row[i] ?? '-'}|{lookup[r.k] ?? '-'}</li>)}</ol>
      <Pick label="one" row={row} k={one} />
      <Pick label="padded" row={row} k={padded} />
      <Pick label="exp" row={row} k={exp} />
      <Show v={row[one]} />
      <Show v={row[padded]} />
      <Show v={obj['a.b']} />
    </div>
  )
}
`,
  props: {
    row: ['a', 'b'],
    word: 'héllo',
    emoji: 'a😀b',
    obj: { 'a.b': 'dot', '*': 'star', '1': 'obj-one' },
    lookup: { '1': 'one', 'a.b': 'dot' },
    one: '1',
    padded: '01',
    exp: '1e0',
    negZeroStr: '-0',
    num: 1,
    zero: 0,
    frac: 1.1,
    neg: -1,
    keys: ['1', '01', '1e0', '-0', '0'],
    rows: [
      { id: 'r0', k: '1' },
      { id: 'r1', k: 'a.b' },
      { id: 'r2', k: '01' },
    ],
  },
  expectedHtml: `
    <div bf-s="test" bf="s57" data-dot="dot" data-neg-zero="a" data-one="b">
      <span bf="s8"><!--bf:s0-->b<!--/-->|<!--bf:s1-->-<!--/-->|<!--bf:s2-->-<!--/-->|<!--bf:s3-->-<!--/-->|<!--bf:s4-->b<!--/-->|<!--bf:s5-->a<!--/-->|<!--bf:s6-->-<!--/-->|<!--bf:s7-->-<!--/--></span>
      <span bf="s16"><!--bf:s9-->b<!--/-->|<!--bf:s10-->b<!--/-->|<!--bf:s11-->-<!--/-->|<!--bf:s12-->-<!--/-->|<!--bf:s13-->-<!--/-->|<!--bf:s14-->-<!--/-->|<!--bf:s15-->-<!--/--></span>
      <span bf="s21"><!--bf:s17-->é<!--/-->|<!--bf:s18-->-<!--/-->|<!--bf:s19-->b<!--/-->|<!--bf:s20-->-<!--/--></span>
      <span bf="s26"><!--bf:s22-->dot<!--/-->|<!--bf:s23-->star<!--/-->|<!--bf:s24-->-<!--/-->|<!--bf:s25-->obj-one<!--/--></span>
      <span bf="s31"><!--bf-cond-start:s27-->y<!--bf-cond-end:s27-->|<!--bf-cond-start:s28-->n<!--bf-cond-end:s28-->|<!--bf-cond-start:s29-->y<!--bf-cond-end:s29-->|<!--bf-cond-start:s30-->n<!--bf-cond-end:s30--></span>
      <span bf="s34">[<!--bf-cond-start:s32-->and<!--bf-cond-end:s32-->][<!--bf-cond-start:s33--><!--bf-cond-end:s33-->]</span>
      <span bf="s36"><!--bf:s35-->c=b-<!--/--></span>
      <span bf="s38"><!--bf:s37-->t=b-dot<!--/--></span>
      <b bf-c="s39">cond-one</b>
      <i bf-c="s40">cond-no-exp</i>
      <span bf="s43"><!--bf:s41-->b<!--/-->|<!--bf:s42-->-<!--/--></span>
      <span bf="s45"><!--bf:s44-->2<!--/--></span>
      <ul bf-s="test_s46" bf="s1">
        <li data-key="1"><!--bf:s0-->1<!--/--></li>
        <li data-key="0"><!--bf:s0-->0<!--/--></li>
      </ul>
      <ol bf="s50">
        <li bf="s49" data-k="one" data-key="r0"><!--bf:s47-->a<!--/-->|<!--bf:s48-->one<!--/--></li>
        <li bf="s49" data-k="dot" data-key="r1"><!--bf:s47-->b<!--/-->|<!--bf:s48-->dot<!--/--></li>
        <li bf="s49" data-key="r2"><!--bf:s47-->-<!--/-->|<!--bf:s48-->-<!--/--></li>
      </ol>
      <b bf-s="test_s51" bf="s1" data-label="one" data-v="b"><!--bf:s0-->b<!--/--></b>
      <b bf-s="test_s52" bf="s1" data-label="padded"><!--bf:s0-->-<!--/--></b>
      <b bf-s="test_s53" bf="s1" data-label="exp"><!--bf:s0-->-<!--/--></b>
      <i bf-s="test_s54" bf="s1"><!--bf:s0-->b<!--/--></i>
      <i bf-s="test_s55" bf="s1"><!--bf:s0-->-<!--/--></i>
      <i bf-s="test_s56" bf="s1"><!--bf:s0-->dot<!--/--></i>
    </div>
  `,
})
