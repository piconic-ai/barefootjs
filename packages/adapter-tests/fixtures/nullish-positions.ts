import { createFixture } from '../src/types'

/**
 * JS `??` at every position that reads its value (#3789, #3824 step 7): only
 * `null` and an omitted prop (`undefined`) fall through to the right operand;
 * `false`, `0`, `''` and `NaN` are kept. Go's `or` tests truthiness, so it
 * replaced every falsy left operand.
 *
 * Left operands: `false`, `0`, `''`, `NaN` (computed as `zero / zero`: JSON
 * props cannot carry it), `null`, an omitted prop, a comparison that yields
 * `false`, and a `&&` that yields it. Positions: an attribute, a text child,
 * a ternary test, a memo body, a loop row (text and attribute), a child prop
 * read through `function Probe(props)` while the parent destructures its
 * props, and a `.filter()` predicate. Chains `a ?? b ?? c` run through
 * several nils and stop at a falsy operand.
 *
 * Omitted props: one read only as the right operand of a chain, one read
 * only as `?? null` (the attribute is omitted) and an optional alias-typed
 * one take the fallback. An attribute bound to `x && 'y'` with an omitted
 * `x` is omitted too, including an optional `boolean` read nowhere else.
 * The optional fields of a typed loop row are `nullish-optional-row-field`.
 *
 * A text child proven a boolean prints nothing, as JSX does; a value that
 * may be a boolean among other types is printed through a template literal,
 * in a text child and an attribute alike.
 */
export const fixture = createFixture({
  id: 'nullish-positions',
  description: 'Every ?? position keeps false, 0, "" and NaN and falls through only for null and an omitted prop',
  source: `
'use client'
import { createMemo } from '@barefootjs/client'

type V = string | number | boolean | null
type Tone = 'warm' | 'cool'

function Probe(props: { label: string; v?: V }) {
  return (
    <p data-label={props.label} data-v={\`\${props.v ?? 'fb'}\`}>
      {\`\${props.v ?? 'fb'}\`}|{(props.v ?? 'fb') ? 'y' : 'n'}
    </p>
  )
}

export function NullishPositions({ no, zero, empty, nil, omitted, chained, absent, tone, flag, n, s, items, rows }: {
  no: boolean
  zero: number
  empty: string
  nil?: string | null
  omitted?: string
  chained?: string
  absent?: string
  tone?: Tone
  flag?: boolean
  n: number
  s: string
  items: (number | null)[]
  rows: { k: string; v?: V }[]
}) {
  const memoNo = createMemo(() => \`\${no ?? 'memo-fb'}\`)
  const memoZero = createMemo(() => zero ?? 5)
  const memoNil = createMemo(() => nil ?? 'memo-fb')
  const memoChain = createMemo(() => nil ?? omitted ?? empty ?? 'memo-fb')
  return (
    <div
      data-no={no ?? 'fb'}
      data-zero={zero ?? 'fb'}
      data-empty={empty ?? 'fb'}
      data-nan={zero / zero ?? 'fb'}
      data-nil={nil ?? 'fb'}
      data-omitted={omitted ?? 'fb'}
      data-cmp={(n > 0) ?? 'fb'}
      data-and={(n > 0 && 'y') ?? 'fb'}
      data-chain={nil ?? omitted ?? 'c'}
      data-chain-zero={nil ?? zero ?? 'c'}
      data-chain-no={omitted ?? no ?? 'c'}
      data-chained={nil ?? chained ?? 'c'}
      data-absent={absent ?? null}
      data-tone={tone ?? 'tone-fb'}
      data-omitted-and={omitted && 'y'}
      data-flag-and={flag && 'y'}
      data-nil-and={nil && 'y'}
    >
      <span>[{no ?? 'fb'}][{zero ?? 'fb'}][{empty ?? 'fb'}][{zero / zero ?? 'fb'}][{nil ?? 'fb'}][{omitted ?? 'fb'}][{(n > 0 && 'y') ?? 'fb'}]</span>
      <span>[{nil ?? omitted ?? 'c'}][{nil ?? zero ?? 'c'}][{omitted ?? empty ?? 'c'}][{nil ?? omitted ?? s ?? 'c'}]</span>
      <span>{(no ?? true) ? 'y' : 'n'}|{(zero ?? 1) ? 'y' : 'n'}|{(empty ?? 'x') ? 'y' : 'n'}|{(zero / zero ?? 1) ? 'y' : 'n'}|{(nil ?? 1) ? 'y' : 'n'}|{(omitted ?? 1) ? 'y' : 'n'}|{((n > 0) ?? true) ? 'y' : 'n'}</span>
      {(zero ?? 1) ? <b>cond-zero</b> : <i>cond-no-zero</i>}
      {(nil ?? 1) ? <b>cond-nil</b> : <i>cond-no-nil</i>}
      <span>{memoNo()}|{memoZero()}|{memoNil()}|{memoChain()}</span>
      <span>{items.filter(x => x ?? 1).length}|{items.filter(x => (x ?? -1) >= 0).length}</span>
      <ul>{rows.filter(r => (r.v ?? 'fb') === 'fb').map(r => <li key={r.k}>{r.k}</li>)}</ul>
      <ol>{rows.map(r => <li key={r.k} data-v={\`\${r.v ?? 'fb'}\`}>{\`\${r.v ?? 'fb'}\`}|{(r.v ?? 'fb') ? 'y' : 'n'}</li>)}</ol>
      <Probe label="no" v={no} />
      <Probe label="zero" v={zero} />
      <Probe label="empty" v={empty} />
      <Probe label="nan" v={zero / zero} />
      <Probe label="nil" v={nil} />
      <Probe label="omitted" />
      <Probe label="parent-zero" v={zero ?? 7} />
      <Probe label="parent-nil" v={nil ?? 7} />
      <Probe label="parent-cmp" v={(n > 0) ?? 7} />
    </div>
  )
}
`,
  props: {
    no: false,
    zero: 0,
    empty: '',
    nil: null,
    n: 0,
    s: 's',
    items: [0, null, 3, -2],
    rows: [
      { k: 'no', v: false },
      { k: 'zero', v: 0 },
      { k: 'empty', v: '' },
      { k: 'nil', v: null },
      { k: 'omitted' },
      { k: 's', v: 's' },
    ],
  },
  expectedHtml: `
    <div bf-s="test" bf="s54" data-and="false" data-chain-no="false" data-chain-zero="0" data-chain="c" data-chained="c" data-cmp="false" data-empty="" data-nan="NaN" data-nil="fb" data-no="false" data-omitted="fb" data-tone="tone-fb" data-zero="0">
      <span bf="s7">[<!--bf:s0--><!--/-->][<!--bf:s1-->0<!--/-->][<!--bf:s2--><!--/-->][<!--bf:s3-->NaN<!--/-->][<!--bf:s4-->fb<!--/-->][<!--bf:s5-->fb<!--/-->][<!--bf:s6--><!--/-->]</span>
      <span bf="s12">[<!--bf:s8-->c<!--/-->][<!--bf:s9-->0<!--/-->][<!--bf:s10--><!--/-->][<!--bf:s11-->s<!--/-->]</span>
      <span bf="s27"><!--bf-cond-start:s13--><!--bf:s14-->n<!--/--><!--bf-cond-end:s13-->|<!--bf-cond-start:s15--><!--bf:s16-->n<!--/--><!--bf-cond-end:s15-->|<!--bf-cond-start:s17--><!--bf:s18-->n<!--/--><!--bf-cond-end:s17-->|<!--bf-cond-start:s19--><!--bf:s20-->n<!--/--><!--bf-cond-end:s19-->|<!--bf-cond-start:s21-->y<!--bf-cond-end:s21-->|<!--bf-cond-start:s23-->y<!--bf-cond-end:s23-->|<!--bf-cond-start:s25--><!--bf:s26-->n<!--/--><!--bf-cond-end:s25--></span>
      <i bf-c="s28">cond-no-zero</i>
      <b bf-c="s29">cond-nil</b>
      <span bf="s34"><!--bf:s30-->false<!--/-->|<!--bf:s31-->0<!--/-->|<!--bf:s32-->memo-fb<!--/-->|<!--bf:s33--><!--/--></span>
      <span bf="s37"><!--bf:s35-->3<!--/-->|<!--bf:s36-->2<!--/--></span>
      <ul bf="s39">
        <li data-key="nil"><!--bf:s38-->nil<!--/--></li>
        <li data-key="omitted"><!--bf:s38-->omitted<!--/--></li>
      </ul>
      <ol bf="s44">
        <li bf="s43" data-key="no" data-v="false"><!--bf:s40-->false<!--/-->|<!--bf-cond-start:s41--><!--bf:s42-->n<!--/--><!--bf-cond-end:s41--></li>
        <li bf="s43" data-key="zero" data-v="0"><!--bf:s40-->0<!--/-->|<!--bf-cond-start:s41--><!--bf:s42-->n<!--/--><!--bf-cond-end:s41--></li>
        <li bf="s43" data-key="empty" data-v=""><!--bf:s40--><!--/-->|<!--bf-cond-start:s41--><!--bf:s42-->n<!--/--><!--bf-cond-end:s41--></li>
        <li bf="s43" data-key="nil" data-v="fb"><!--bf:s40-->fb<!--/-->|<!--bf-cond-start:s41-->y<!--bf-cond-end:s41--></li>
        <li bf="s43" data-key="omitted" data-v="fb"><!--bf:s40-->fb<!--/-->|<!--bf-cond-start:s41-->y<!--bf-cond-end:s41--></li>
        <li bf="s43" data-key="s" data-v="s"><!--bf:s40-->s<!--/-->|<!--bf-cond-start:s41-->y<!--bf-cond-end:s41--></li>
      </ol>
      <p bf-s="test_s45" bf="s2" data-label="no" data-v="false"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></p>
      <p bf-s="test_s46" bf="s2" data-label="zero" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></p>
      <p bf-s="test_s47" bf="s2" data-label="empty" data-v=""><!--bf:s0--><!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></p>
      <p bf-s="test_s48" bf="s2" data-label="nan" data-v="NaN"><!--bf:s0-->NaN<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></p>
      <p bf-s="test_s49" bf="s2" data-label="nil" data-v="fb"><!--bf:s0-->fb<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1--></p>
      <p bf-s="test_s50" bf="s2" data-label="omitted" data-v="fb"><!--bf:s0-->fb<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1--></p>
      <p bf-s="test_s51" bf="s2" data-label="parent-zero" data-v="0"><!--bf:s0-->0<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></p>
      <p bf-s="test_s52" bf="s2" data-label="parent-nil" data-v="7"><!--bf:s0-->7<!--/-->|<!--bf-cond-start:s1-->y<!--bf-cond-end:s1--></p>
      <p bf-s="test_s53" bf="s2" data-label="parent-cmp" data-v="false"><!--bf:s0-->false<!--/-->|<!--bf-cond-start:s1-->n<!--bf-cond-end:s1--></p>
    </div>
  `,
})
