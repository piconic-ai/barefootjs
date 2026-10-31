import { createFixture } from '../src/types'

/**
 * JS ToBoolean at every position that tests a value (#3823, #3824 step 1):
 * `false`, `0`, `-0`, `NaN`, `""` and `null` / an omitted prop are falsy;
 * every other value is truthy, including the string `"0"`, a single space,
 * `[]` and `{}`. Perl reads `"0"` as false and NaN as true, Go and Python
 * read an empty array as false, PHP reads `"0"` and `[]` as false, Ruby
 * reads `0` and `""` as true.
 *
 * Covered: an attribute and a text ternary, `!`, a JSX conditional, `&&` and
 * `||` in value position (an attribute prints the operand JS yields, so
 * `0 && 'and'` is `"0"` and `null && 'and'` omits the attribute; a text
 * `a && b` child is a conditional, which prints nothing for a falsy `a`), a `.filter()` predicate (`.length` of the identity filter
 * and a row filter), a memo body, a loop row, and a child prop read through
 * `function Probe(props)` while the parent destructures its props. `-0` and
 * `NaN` are computed (`zero * -1`, `zero / zero`): JSON props cannot carry
 * them. A `boolean` or object value is only tested, never printed (a bare
 * `false` text child and an object's text are out of scope here).
 */
export const fixture = createFixture({
  id: 'truthiness-positions',
  description: 'Every ToBoolean position gives the JS answer for "0", "", " ", 0, -0, NaN, [], {}, null and booleans',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

type V = string | number | boolean | null | number[] | { k?: number }

function Probe(props: { label: string; v?: V }) {
  return (
    <p data-label={props.label} data-t={props.v ? 'y' : 'n'}>
      {props.v ? <b>y</b> : <i>n</i>}
      <s>{!props.v ? 'not' : 'is'}</s>
      <u>{props.v && props.label ? 'and' : 'nand'}</u>
      <q>{props.v || props.label ? 'or' : 'nor'}</q>
    </p>
  )
}

export function TruthinessPositions({ zeroStr, empty, space, zero, arr, obj, yes, no, nil, items, rows }: {
  zeroStr: string
  empty: string
  space: string
  zero: number
  arr: number[]
  obj: { k?: number }
  yes: boolean
  no: boolean
  nil?: string | null
  items: V[]
  rows: { k: string; v?: V }[]
}) {
  const verdict = createMemo(() => (zeroStr ? 'memo-y' : 'memo-n'))
  const negated = createMemo(() => (!empty ? 'memo-not' : 'memo-is'))
  return (
    <div data-zero-str={zeroStr ? 'y' : 'n'} data-arr={arr ? 'y' : 'n'} data-nan={zero / zero ? 'y' : 'n'}>
      <span>{zeroStr ? 'y' : 'n'}|{empty ? 'y' : 'n'}|{space ? 'y' : 'n'}|{zero ? 'y' : 'n'}|{zero * -1 ? 'y' : 'n'}|{zero / zero ? 'y' : 'n'}|{arr ? 'y' : 'n'}|{obj ? 'y' : 'n'}|{yes ? 'y' : 'n'}|{no ? 'y' : 'n'}|{nil ? 'y' : 'n'}</span>
      <span>{!zeroStr ? 'not' : 'is'}|{!empty ? 'not' : 'is'}|{!zero ? 'not' : 'is'}|{!(zero / zero) ? 'not' : 'is'}|{!arr ? 'not' : 'is'}|{!obj ? 'not' : 'is'}|{!nil ? 'not' : 'is'}</span>
      <span>[{zeroStr && 'and'}][{empty && 'and'}][{space && 'and'}][{zero && 'and'}][{zero * -1 && 'and'}][{zero / zero && 'and'}][{nil && 'and'}]</span>
      <span>[{zeroStr || 'or'}][{empty || 'or'}][{space || 'or'}][{zero || 'or'}][{zero * -1 || 'or'}][{zero / zero || 'or'}][{nil || 'or'}]</span>
      <span data-and={zeroStr && 'and'} data-or={empty || 'or'}>{arr && 'arr-and'}|{obj && 'obj-and'}|{yes && 'yes-and'}|{no || 'no-or'}</span>
      <i data-zero-str={zeroStr && 'and'} data-empty={empty && 'and'} data-space={space && 'and'} data-zero={zero && 'and'} data-neg-zero={zero * -1 && 'and'} data-nan={zero / zero && 'and'} data-nil={nil && 'and'} />
      <i data-zero-str={zeroStr || 'or'} data-empty={empty || 'or'} data-space={space || 'or'} data-zero={zero || 'or'} data-neg-zero={zero * -1 || 'or'} data-nan={zero / zero || 'or'} data-nil={nil || 'or'} />
      {zeroStr ? <b>cond-zero-str</b> : <i>cond-no-zero-str</i>}
      {arr ? <b>cond-arr</b> : <i>cond-no-arr</i>}
      {zero / zero ? <b>cond-nan</b> : <i>cond-no-nan</i>}
      {zeroStr && arr ? <b>cond-both</b> : <i>cond-not-both</i>}
      {empty || zero ? <b>cond-either</b> : <i>cond-neither</i>}
      <span>{verdict()}|{negated()}</span>
      <span>{items.filter(x => x).length}</span>
      <ul>{rows.filter(r => r.v).map(r => <li key={r.k}>{r.k}</li>)}</ul>
      <ol>{rows.map(r => <li key={r.k}>{r.v ? 'y' : 'n'}</li>)}</ol>
      <Probe label="zero-str" v={zeroStr} />
      <Probe label="empty" v={empty} />
      <Probe label="space" v={space} />
      <Probe label="zero" v={zero} />
      <Probe label="nan" v={zero / zero} />
      <Probe label="arr" v={arr} />
      <Probe label="obj" v={obj} />
      <Probe label="yes" v={yes} />
      <Probe label="no" v={no} />
      <Probe label="nil" v={nil} />
      <Probe label="omitted" />
    </div>
  )
}
`,
  props: {
    zeroStr: '0',
    empty: '',
    space: ' ',
    zero: 0,
    arr: [],
    obj: {},
    yes: true,
    no: false,
    nil: null,
    items: ['0', '', ' ', 0, null, [], {}, true, false, 1, 'a'],
    rows: [
      { k: 'zero-str', v: '0' },
      { k: 'empty', v: '' },
      { k: 'space', v: ' ' },
      { k: 'zero', v: 0 },
      { k: 'arr', v: [] },
      { k: 'obj', v: {} },
      { k: 'yes', v: true },
      { k: 'no', v: false },
      { k: 'nil', v: null },
      { k: 'omitted' },
    ],
  },
  expectedHtml: `
    <div bf-s="test" bf="s71" data-arr="y" data-nan="n" data-zero-str="y">
      <span bf="s11"><!--bf-cond-start:s0-->y<!--bf-cond-end:s0-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1-->|<!--bf-cond-start:s2-->y<!--bf-cond-end:s2-->|<!--bf-cond-start:s3-->n<!--bf-cond-end:s3-->|<!--bf-cond-start:s4-->n<!--bf-cond-end:s4-->|<!--bf-cond-start:s5-->n<!--bf-cond-end:s5-->|<!--bf-cond-start:s6-->y<!--bf-cond-end:s6-->|<!--bf-cond-start:s7-->y<!--bf-cond-end:s7-->|<!--bf-cond-start:s8-->y<!--bf-cond-end:s8-->|<!--bf-cond-start:s9-->n<!--bf-cond-end:s9-->|<!--bf-cond-start:s10-->n<!--bf-cond-end:s10--></span>
      <span bf="s19"><!--bf-cond-start:s12-->is<!--bf-cond-end:s12-->|<!--bf-cond-start:s13-->not<!--bf-cond-end:s13-->|<!--bf-cond-start:s14-->not<!--bf-cond-end:s14-->|<!--bf-cond-start:s15-->not<!--bf-cond-end:s15-->|<!--bf-cond-start:s16-->is<!--bf-cond-end:s16-->|<!--bf-cond-start:s17-->is<!--bf-cond-end:s17-->|<!--bf-cond-start:s18-->not<!--bf-cond-end:s18--></span>
      <span bf="s27">[<!--bf-cond-start:s20-->and<!--bf-cond-end:s20-->][<!--bf-cond-start:s21--><!--bf-cond-end:s21-->][<!--bf-cond-start:s22-->and<!--bf-cond-end:s22-->][<!--bf-cond-start:s23--><!--bf-cond-end:s23-->][<!--bf-cond-start:s24--><!--bf-cond-end:s24-->][<!--bf-cond-start:s25--><!--bf-cond-end:s25-->][<!--bf-cond-start:s26--><!--bf-cond-end:s26-->]</span>
      <span bf="s35">[<!--bf:s28-->0<!--/-->][<!--bf:s29-->or<!--/-->][<!--bf:s30--><!--/-->][<!--bf:s31-->or<!--/-->][<!--bf:s32-->or<!--/-->][<!--bf:s33-->or<!--/-->][<!--bf:s34-->or<!--/-->]</span>
      <span bf="s43" data-and="and" data-or="or"><!--bf-cond-start:s36--><!--bf:s37-->arr-and<!--/--><!--bf-cond-end:s36-->|<!--bf-cond-start:s38--><!--bf:s39-->obj-and<!--/--><!--bf-cond-end:s38-->|<!--bf-cond-start:s40--><!--bf:s41-->yes-and<!--/--><!--bf-cond-end:s40-->|<!--bf:s42-->no-or<!--/--></span>
      <i bf="s44" data-empty="" data-nan="NaN" data-neg-zero="0" data-space="and" data-zero-str="and" data-zero="0"></i>
      <i bf="s45" data-empty="or" data-nan="or" data-neg-zero="or" data-nil="or" data-space=" " data-zero-str="0" data-zero="or"></i>
      <b bf-c="s46">cond-zero-str</b>
      <b bf-c="s47">cond-arr</b>
      <i bf-c="s48">cond-no-nan</i>
      <b bf-c="s49">cond-both</b>
      <i bf-c="s50">cond-neither</i>
      <span bf="s53"><!--bf:s51-->memo-y<!--/-->|<!--bf:s52-->memo-not<!--/--></span>
      <span bf="s55"><!--bf:s54-->7<!--/--></span>
      <ul bf="s57">
        <li data-key="zero-str"><!--bf:s56-->zero-str<!--/--></li>
        <li data-key="space"><!--bf:s56-->space<!--/--></li>
        <li data-key="arr"><!--bf:s56-->arr<!--/--></li>
        <li data-key="obj"><!--bf:s56-->obj<!--/--></li>
        <li data-key="yes"><!--bf:s56-->yes<!--/--></li>
      </ul>
      <ol bf="s59">
        <li data-key="zero-str"><!--bf-cond-start:s58-->y<!--bf-cond-end:s58--></li>
        <li data-key="empty"><!--bf-cond-start:s58-->n<!--bf-cond-end:s58--></li>
        <li data-key="space"><!--bf-cond-start:s58-->y<!--bf-cond-end:s58--></li>
        <li data-key="zero"><!--bf-cond-start:s58-->n<!--bf-cond-end:s58--></li>
        <li data-key="arr"><!--bf-cond-start:s58-->y<!--bf-cond-end:s58--></li>
        <li data-key="obj"><!--bf-cond-start:s58-->y<!--bf-cond-end:s58--></li>
        <li data-key="yes"><!--bf-cond-start:s58-->y<!--bf-cond-end:s58--></li>
        <li data-key="no"><!--bf-cond-start:s58-->n<!--bf-cond-end:s58--></li>
        <li data-key="nil"><!--bf-cond-start:s58-->n<!--bf-cond-end:s58--></li>
        <li data-key="omitted"><!--bf-cond-start:s58-->n<!--bf-cond-end:s58--></li>
      </ol>
      <p bf-s="test_s60" bf="s7" data-label="zero-str" data-t="y">
        <b bf-c="s0">y</b>
        <s bf="s2"><!--bf-cond-start:s1-->is<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->and<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s61" bf="s7" data-label="empty" data-t="n">
        <i bf-c="s0">n</i>
        <s bf="s2"><!--bf-cond-start:s1-->not<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->nand<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s62" bf="s7" data-label="space" data-t="y">
        <b bf-c="s0">y</b>
        <s bf="s2"><!--bf-cond-start:s1-->is<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->and<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s63" bf="s7" data-label="zero" data-t="n">
        <i bf-c="s0">n</i>
        <s bf="s2"><!--bf-cond-start:s1-->not<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->nand<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s64" bf="s7" data-label="nan" data-t="n">
        <i bf-c="s0">n</i>
        <s bf="s2"><!--bf-cond-start:s1-->not<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->nand<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s65" bf="s7" data-label="arr" data-t="y">
        <b bf-c="s0">y</b>
        <s bf="s2"><!--bf-cond-start:s1-->is<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->and<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s66" bf="s7" data-label="obj" data-t="y">
        <b bf-c="s0">y</b>
        <s bf="s2"><!--bf-cond-start:s1-->is<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->and<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s67" bf="s7" data-label="yes" data-t="y">
        <b bf-c="s0">y</b>
        <s bf="s2"><!--bf-cond-start:s1-->is<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->and<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s68" bf="s7" data-label="no" data-t="n">
        <i bf-c="s0">n</i>
        <s bf="s2"><!--bf-cond-start:s1-->not<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->nand<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s69" bf="s7" data-label="nil" data-t="n">
        <i bf-c="s0">n</i>
        <s bf="s2"><!--bf-cond-start:s1-->not<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->nand<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
      <p bf-s="test_s70" bf="s7" data-label="omitted" data-t="n">
        <i bf-c="s0">n</i>
        <s bf="s2"><!--bf-cond-start:s1-->not<!--bf-cond-end:s1--></s>
        <u bf="s4"><!--bf-cond-start:s3-->nand<!--bf-cond-end:s3--></u>
        <q bf="s6"><!--bf-cond-start:s5-->or<!--bf-cond-end:s5--></q>
      </p>
    </div>
  `,
})
